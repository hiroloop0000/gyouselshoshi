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

export interface LectureSearchContext {
  title: string;
  body: string;
  objective_title: string;
  topic_name: string;
  subject_name: string;
}

interface ContextRow extends LectureSearchContext {
  source_url: string | null;
  status: "VERIFIED" | "REVIEWED";
}

function normalizeQuestion(question: string): string {
  return question.normalize("NFKC").toLowerCase().replace(/[\s。、「」『』!?！？]/gu, "").slice(0, 500);
}

function normalizeSearchText(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function buildSearchTerms(question: string): string[] {
  const simplified = question
    .normalize("NFKC")
    .toLowerCase()
    .replace(/(について|を教えてください|を教えて|教えてください|教えて|とは何|とは|ですか|ますか|でしょうか|違い)/gu, " ");
  const chunks = simplified
    .split(/[\s、。・,!?！？「」『』（）()のとはがをにでへや]/u)
    .map(normalizeSearchText)
    .filter((term) => term.length >= 2);
  const compact = normalizeSearchText(simplified);
  const trigrams: string[] = [];
  for (let index = 0; index <= compact.length - 3; index += 1) trigrams.push(compact.slice(index, index + 3));
  const stopTerms = new Set(["くださ", "ださい", "してく", "につい", "ついて", "どのよ", "のよう", "ような"]);
  return [...new Set([...chunks, ...trigrams])].filter((term) => !stopTerms.has(term));
}

export function rankLectureContexts<T extends LectureSearchContext>(question: string, contexts: T[], limit = 4): T[] {
  const terms = buildSearchTerms(question);
  const normalizedQuestion = normalizeSearchText(question);
  return contexts
    .map((context, index) => {
      const fields = {
        title: normalizeSearchText(context.title),
        objective: normalizeSearchText(context.objective_title),
        topic: normalizeSearchText(context.topic_name),
        subject: normalizeSearchText(context.subject_name),
        body: normalizeSearchText(context.body),
      };
      let score = 0;
      if (fields.title.length >= 3 && (normalizedQuestion.includes(fields.title) || fields.title.includes(normalizedQuestion))) score += 60;
      for (const term of terms) {
        const lengthWeight = Math.min(6, term.length);
        if (fields.title.includes(term)) score += 10 + lengthWeight;
        if (fields.objective.includes(term)) score += 8 + lengthWeight;
        if (fields.topic.includes(term)) score += 7 + lengthWeight;
        if (fields.subject.includes(term)) score += 4 + lengthWeight;
        if (fields.body.includes(term)) score += 2 + lengthWeight;
      }
      return { context, score, index };
    })
    .filter((item) => item.score >= 6)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, Math.max(1, limit))
    .map((item) => item.context);
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

function contextSources(contexts: ContextRow[]): Array<{ title: string; url?: string }> {
  return contexts.map((item) => ({
    title: `${item.title}（${item.status === "VERIFIED" ? "確認済み" : "レビュー済み"}）`,
    ...(item.source_url ? { url: item.source_url } : {}),
  }));
}

function groundedLectureFallback(contexts: ContextRow[], reason: string): AiAnswer {
  const primary = contexts[0];
  if (!primary) {
    return {
      answer: reason,
      sourceTier: "UNSUPPORTED",
      cached: false,
      estimatedNeurons: 0,
      sources: [],
    };
  }
  const excerpt = primary.body.length > 900 ? `${primary.body.slice(0, 900)}…` : primary.body;
  return {
    answer: `${reason}\n\n【${primary.title}】\n${excerpt}\n\n上の教材を踏まえて、具体的な要件や事例を質問するとさらに絞り込めます。`,
    sourceTier: "LECTURE",
    cached: false,
    estimatedNeurons: 0,
    sources: contextSources(contexts),
  };
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

  const allContexts = await env.DB
    .prepare(
      `SELECT l.title, l.explanation AS body, l.status, lo.title AS objective_title, t.name AS topic_name, s.name AS subject_name,
       (SELECT qs.source_url FROM questions q
        JOIN question_sources qs ON qs.question_id = q.id
        WHERE q.learning_objective_id = lo.id AND q.status IN ('VERIFIED', 'REVIEWED')
        ORDER BY CASE q.status WHEN 'VERIFIED' THEN 0 ELSE 1 END LIMIT 1) AS source_url
       FROM lectures l
       JOIN learning_objectives lo ON lo.id = l.learning_objective_id
       JOIN topics t ON t.id = lo.topic_id JOIN subjects s ON s.id = t.subject_id
       WHERE l.status IN ('VERIFIED', 'REVIEWED')
       ORDER BY CASE l.status WHEN 'VERIFIED' THEN 0 ELSE 1 END, s.content_priority, t.name, l.title
       LIMIT 100`,
    )
    .all<ContextRow>();
  const contexts = rankLectureContexts(question, allContexts.results, 4);

  if (contexts.length === 0) {
    return {
      answer: "関連する確認済み・レビュー済み教材を特定できませんでした。『審査請求の期間』『取消訴訟の執行停止』のように、制度名と知りたい点を具体的に入力してください。",
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
    return groundedLectureFallback(contexts, "AI生成枠を使わず、関連するレビュー済み教材から要点を案内します。");
  }

  const contextText = contexts.map((item, index) => `[資料${index + 1}・${item.status}] ${item.title}\n${item.body}`).join("\n\n");
  let response: unknown;
  try {
    response = await env.AI.run(env.AI_MODEL, {
    messages: [
      {
        role: "system",
        content:
          "あなたは行政書士受験指導者です。提供された確認済み・レビュー済み教材だけを根拠に、日本語で簡潔に回答してください。構成は『結論・理由・根拠条文等・関連制度・注意点』です。資料にない条文番号、判例、事実を推測してはいけません。REVIEWEDは最終確認前の教材であることを必要に応じて明記し、不足時は必ず『教材から十分な根拠を確認できません。』と答えてください。",
      },
      { role: "user", content: `${contextText}\n\n質問: ${question}` },
    ],
    temperature: 0.1,
    max_tokens: 700,
  });
  } catch {
    return groundedLectureFallback(contexts, "AI生成への接続に失敗したため、関連するレビュー済み教材から要点を案内します。");
  }
  const answer = extractAiText(response);
  if (!answer) return groundedLectureFallback(contexts, "AIの回答形式を確認できなかったため、関連するレビュー済み教材から要点を案内します。");
  const estimatedNeurons = Math.max(1, Math.ceil((contextText.length + answer.length) / 12));
  const sources = contextSources(contexts);
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
