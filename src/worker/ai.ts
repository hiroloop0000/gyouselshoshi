import { getAiGuardState } from "../shared/learning";
import { sha256 } from "./security";

interface AiAnswer {
  answer: string;
  sourceTier: "FAQ" | "LECTURE" | "VERIFIED_EXPLANATION" | "COMPARISON" | "CACHE" | "WORKERS_AI" | "UNSUPPORTED";
  cached: boolean;
  estimatedNeurons: number;
  sources: Array<{ title: string; url?: string }>;
}

interface FaqRow {
  answer: string;
  source_refs_json: string;
}

interface CacheRow {
  answer_text: string;
  source_refs_json: string;
}

interface ContextRow {
  title: string;
  body: string;
  source_url: string | null;
}

function normalizeQuestion(question: string): string {
  return question.normalize("NFKC").toLowerCase().replace(/[\s。、「」『』!?！？]/gu, "").slice(0, 500);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseSources(value: string): Array<{ title: string; url?: string }> {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!isRecord(item) || typeof item.title !== "string") return [];
      return [{ title: item.title, ...(typeof item.url === "string" ? { url: item.url } : {}) }];
    });
  } catch {
    return [];
  }
}

function extractAiText(value: unknown): string | null {
  if (typeof value !== "object" || value === null || !("response" in value)) return null;
  return typeof value.response === "string" ? value.response : null;
}

export async function answerAiQuestion(env: Env, userId: string, question: string): Promise<AiAnswer> {
  const normalized = normalizeQuestion(question);
  const faq = await env.DB
    .prepare(
      `SELECT answer, source_refs_json FROM verified_faq
       WHERE is_active = 1 AND (normalized_question = ? OR normalized_question LIKE ?)
       ORDER BY CASE WHEN normalized_question = ? THEN 0 ELSE 1 END LIMIT 1`,
    )
    .bind(normalized, `%${normalized.slice(0, 24)}%`, normalized)
    .first<FaqRow>();
  if (faq) return { answer: faq.answer, sourceTier: "FAQ", cached: false, estimatedNeurons: 0, sources: parseSources(faq.source_refs_json) };

  const cacheKey = await sha256(normalized);
  const cached = await env.DB
    .prepare("SELECT answer_text, source_refs_json FROM ai_answer_cache WHERE cache_key = ? AND verified = 1 AND expires_at > CURRENT_TIMESTAMP")
    .bind(cacheKey)
    .first<CacheRow>();
  if (cached) {
    await env.DB.prepare("UPDATE ai_answer_cache SET hit_count = hit_count + 1 WHERE cache_key = ?").bind(cacheKey).run();
    return { answer: cached.answer_text, sourceTier: "CACHE", cached: true, estimatedNeurons: 0, sources: parseSources(cached.source_refs_json) };
  }

  const searchTerm = `%${question.trim().slice(0, 30)}%`;
  const contexts = await env.DB
    .prepare(
      `SELECT l.title, l.explanation AS body, qs.source_url
       FROM lectures l
       JOIN learning_objectives lo ON lo.id = l.learning_objective_id
       LEFT JOIN questions q ON q.learning_objective_id = lo.id AND q.status = 'VERIFIED'
       LEFT JOIN question_sources qs ON qs.question_id = q.id
       WHERE l.status = 'VERIFIED' AND (l.title LIKE ? OR l.explanation LIKE ? OR lo.title LIKE ?)
       LIMIT 4`,
    )
    .bind(searchTerm, searchTerm, searchTerm)
    .all<ContextRow>();

  if (contexts.results.length === 0) {
    return {
      answer: "確認済み資料から十分な根拠を確認できません。管理者による資料確認後に回答可能になります。",
      sourceTier: "UNSUPPORTED",
      cached: false,
      estimatedNeurons: 0,
      sources: [],
    };
  }

  const [enabledSetting, budgetSetting, monthlyUsage, limitSetting, userUsage] = await Promise.all([
    env.DB.prepare("SELECT setting_value FROM app_settings WHERE setting_key = 'ai_enabled'").first<{ setting_value: string }>(),
    env.DB.prepare("SELECT setting_value FROM app_settings WHERE setting_key = 'monthly_ai_budget_jpy'").first<{ setting_value: string }>(),
    env.DB
      .prepare("SELECT COALESCE(SUM(estimated_neurons), 0) AS neurons FROM ai_usage_daily WHERE usage_date >= date('now', 'start of month')")
      .first<{ neurons: number }>(),
    env.DB.prepare("SELECT setting_value FROM app_settings WHERE setting_key = 'free_ai_questions_per_day'").first<{ setting_value: string }>(),
    env.DB
      .prepare("SELECT request_count FROM ai_usage_daily WHERE usage_date = date('now') AND user_id = ?")
      .bind(userId)
      .first<{ request_count: number }>(),
  ]);
  const aiEnabled = enabledSetting?.setting_value === "true";
  const monthlyBudget = Number(budgetSetting?.setting_value ?? 0);
  const neurons = Number(monthlyUsage?.neurons ?? 0);
  const estimatedJpy = (neurons / 1000) * 0.011 * 150;
  const dailyLimit = Number(limitSetting?.setting_value ?? 0);
  const usedToday = Number(userUsage?.request_count ?? 0);
  const guard = getAiGuardState(estimatedJpy, monthlyBudget);
  if (!aiEnabled || guard === "STOP_GENERATION" || usedToday >= dailyLimit) {
    return {
      answer: "本日のAI個別指導枠は終了しました。問題演習、復習、講義等は引き続き利用できます。",
      sourceTier: "UNSUPPORTED",
      cached: false,
      estimatedNeurons: 0,
      sources: contexts.results.map((item) => ({ title: item.title, ...(item.source_url ? { url: item.source_url } : {}) })),
    };
  }

  const contextText = contexts.results.map((item, index) => `[資料${index + 1}] ${item.title}\n${item.body}`).join("\n\n");
  const response: unknown = await env.AI.run(env.AI_MODEL, {
    messages: [
      {
        role: "system",
        content:
          "あなたは行政書士受験指導者です。提供された確認済み資料だけを根拠に、日本語で簡潔に回答してください。構成は『結論・理由・根拠条文等・関連制度・注意点』です。資料にない条文番号、判例、事実を推測してはいけません。不足時は必ず『確認済み資料から十分な根拠を確認できません。』と答えてください。",
      },
      { role: "user", content: `${contextText}\n\n質問: ${question}` },
    ],
    temperature: 0.1,
    max_tokens: 700,
  });
  const answer = extractAiText(response) ?? "確認済み資料から十分な根拠を確認できません。";
  const estimatedNeurons = Math.max(1, Math.ceil((contextText.length + answer.length) / 12));
  const sources = contexts.results.map((item) => ({ title: item.title, ...(item.source_url ? { url: item.source_url } : {}) }));
  await env.DB.batch([
    env.DB
      .prepare(
        `INSERT INTO ai_usage_daily (usage_date, user_id, request_count, estimated_neurons)
         VALUES (date('now'), ?, 1, ?)
         ON CONFLICT(usage_date, user_id) DO UPDATE SET request_count = request_count + 1,
         estimated_neurons = estimated_neurons + excluded.estimated_neurons`,
      )
      .bind(userId, estimatedNeurons),
    env.DB
      .prepare(
        `INSERT OR REPLACE INTO ai_answer_cache
         (cache_key, normalized_question, answer_text, source_refs_json, verified, expires_at)
         VALUES (?, ?, ?, ?, 0, datetime('now', '+14 days'))`,
      )
      .bind(cacheKey, normalized, answer, JSON.stringify(sources)),
  ]);
  return { answer, sourceTier: "WORKERS_AI", cached: false, estimatedNeurons, sources };
}
