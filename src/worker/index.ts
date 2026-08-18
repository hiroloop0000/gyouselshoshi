import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { z } from "zod";
import {
  buildMission,
  calculateMastery,
  calculateReadiness,
  calculateReviewPriority,
  classifyErrorDna,
  nextReviewIntervalDays,
} from "../shared/learning";
import { invitationRequiredFor, normalizeRegistrationMode } from "../shared/registration";
import { answerAiQuestion } from "./ai";
import { csrfCookie, expiredCsrfCookie } from "./cookies";
import {
  checkRateLimit,
  constantTimeEqual,
  createSession,
  expiredSessionCookie,
  getAuthenticatedUser,
  getOptionalStringBinding,
  hashPassword,
  sessionCookie,
  sha256,
  validateTurnstile,
  verifyCsrf,
  verifyPassword,
} from "./security";

const app = new Hono<{ Bindings: Env }>();

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(12).max(128),
  turnstileToken: z.string().min(1).max(2048),
});

const registerSchema = credentialsSchema.extend({
  invitationCode: z.string().trim().min(8).max(128).optional(),
});

const onboardingSchema = z.object({
  examYear: z.number().int().min(2026).max(2035),
  examExperience: z.enum(["FIRST", "RETRY", "QUALIFIED_OTHER"]),
  dailyMinutes: z.number().int().min(5).max(600),
  weekdayMinutes: z.number().int().min(0).max(600),
  weekendMinutes: z.number().int().min(0).max(900),
  strongSubjects: z.array(z.string().max(64)).max(6),
  weakSubjects: z.array(z.string().max(64)).max(6),
  goal: z.string().trim().min(1).max(300),
  preferredTime: z.enum(["MORNING", "DAYTIME", "EVENING", "NIGHT", "FLEXIBLE"]),
});

const answerSchema = z.object({
  questionId: z.string().min(1).max(100),
  selectedChoiceId: z.string().min(1).max(100).optional(),
  writtenAnswer: z.string().max(1000).optional(),
  confidence: z.enum(["EXPLAIN", "PROBABLE", "GUESS"]),
  elapsedMs: z.number().int().min(0).max(10_800_000),
  hintUsed: z.boolean(),
  reasoningNote: z.string().max(1000).optional(),
});

const aiQuestionSchema = z.object({ question: z.string().trim().min(2).max(1000) });

const invitationSchema = z.object({
  expiresAt: z.string().datetime().nullable(),
  maxUses: z.number().int().min(1).max(10_000),
});

const settingSchema = z.object({ value: z.union([z.string(), z.number(), z.boolean(), z.record(z.string(), z.unknown())]) });

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  password_salt: string;
  password_iterations: number;
  password_algorithm: string;
  role: "USER" | "ADMIN";
  exam_year: number;
  onboarding_completed_at: string | null;
}

interface QuestionRow {
  id: string;
  stem: string;
  question_type: string;
  difficulty: string;
  status: "DRAFT" | "REVIEWED" | "VERIFIED";
  correct_explanation: string;
  reveal_hint: string | null;
  judgment_point: string | null;
  topic_name: string;
  subject_name: string;
}

interface ChoiceRow {
  id: string;
  body: string;
  choice_order: number;
  is_correct: number;
  explanation: string;
}

interface ExamRow {
  exam_year: number;
  exam_date: string;
  law_reference_date: string;
  legal_question_count: number;
  knowledge_question_count: number;
  scoring_published: number;
  official_source_url: string;
}

function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? "local";
}

function appendCookies(response: Response, cookies: string[]): Response {
  for (const cookie of cookies) response.headers.append("Set-Cookie", cookie);
  return response;
}

async function parseJson(request: Request): Promise<unknown> {
  const type = request.headers.get("Content-Type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) throw new Error("JSON_REQUIRED");
  return request.json();
}

async function turnstileOk(env: Env, token: string, ip: string): Promise<boolean> {
  if (getOptionalStringBinding(env, "ENVIRONMENT") === "test") return true;
  return validateTurnstile(env, token, ip);
}

async function requireAuth(request: Request, env: Env): Promise<Awaited<ReturnType<typeof getAuthenticatedUser>>> {
  return getAuthenticatedUser(request, env.DB);
}

async function requireMutationAuth(request: Request, env: Env) {
  const user = await requireAuth(request, env);
  if (!user) return { user: null, csrfValid: false };
  return { user, csrfValid: await verifyCsrf(request, env.DB, user.sessionId) };
}
function logPasswordProtectionFailure(stage: "bootstrap" | "register" | "login", error: unknown): void {
  console.error(JSON.stringify({
    message: "password_protection_failed",
    stage,
    errorName: error instanceof Error ? error.name : "UnknownError",
    error: error instanceof Error ? error.message : "Unknown error",
  }));
}


app.use("/api/*", secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "https://challenges.cloudflare.com"],
    frameSrc: ["https://challenges.cloudflare.com"],
    connectSrc: ["'self'", "https://challenges.cloudflare.com"],
    styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    fontSrc: ["'self'", "https://fonts.gstatic.com"],
    imgSrc: ["'self'", "data:"],
  },
  referrerPolicy: "strict-origin-when-cross-origin",
}));

app.use("/api/*", async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
  c.header("X-Robots-Tag", "noindex, nofollow");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
});

app.get("/api/health", (c) => c.json({ ok: true, service: "gyosei-pass", timestamp: new Date().toISOString() }));

app.get("/api/public/config", async (c) => {
  const exam = await c.env.DB.prepare("SELECT * FROM exam_settings ORDER BY exam_year DESC LIMIT 1").first<ExamRow>();
  if (!exam) return c.json({ error: "試験設定が未登録です。" }, 503);
  const [scoring, registrationSetting] = await Promise.all([
    c.env.DB
      .prepare("SELECT category, threshold_ratio, max_points, official_status FROM exam_scoring_rules WHERE exam_year = ?")
      .bind(exam.exam_year)
      .all<{ category: string; threshold_ratio: number; max_points: number | null; official_status: string }>(),
    c.env.DB
      .prepare("SELECT setting_value FROM app_settings WHERE setting_key = 'registration_mode'")
      .first<{ setting_value: string }>(),
  ]);
  const registrationMode = normalizeRegistrationMode(registrationSetting?.setting_value);
  return c.json({
    exam: {
      examYear: exam.exam_year,
      examDate: exam.exam_date,
      lawReferenceDate: exam.law_reference_date,
      legalQuestionCount: exam.legal_question_count,
      knowledgeQuestionCount: exam.knowledge_question_count,
      scoringPublished: exam.scoring_published === 1,
      officialSourceUrl: exam.official_source_url,
      scoringRules: scoring.results.map((rule) => ({
        category: rule.category,
        thresholdRatio: rule.threshold_ratio,
        maxPoints: rule.max_points,
        officialStatus: rule.official_status,
      })),
    },
    turnstileSiteKey: c.env.TURNSTILE_SITE_KEY,
    registrationMode,
    invitationRequired: invitationRequiredFor(registrationMode),
  });
});

app.get("/api/auth/bootstrap-status", async (c) => {
  const count = await c.env.DB.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'ADMIN'").first<{ count: number }>();
  return c.json({ bootstrapRequired: Number(count?.count ?? 0) === 0 });
});

app.post("/api/auth/bootstrap", async (c) => {
  const existing = await c.env.DB.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'ADMIN'").first<{ count: number }>();
  if (Number(existing?.count ?? 0) > 0) return c.json({ error: "初期管理者は作成済みです。" }, 409);
  const expected = getOptionalStringBinding(c.env, "BOOTSTRAP_ADMIN_TOKEN");
  const provided = c.req.header("X-Bootstrap-Token") ?? "";
  if (!expected || !(await constantTimeEqual(provided, expected))) return c.json({ error: "初期設定トークンが無効です。" }, 403);
  const body = credentialsSchema.omit({ turnstileToken: true }).safeParse(await parseJson(c.req.raw));
  if (!body.success) return c.json({ error: "入力内容を確認してください。" }, 422);
  let password: Awaited<ReturnType<typeof hashPassword>>;
  try {
    password = await hashPassword(body.data.password);
  } catch (error) {
    logPasswordProtectionFailure("bootstrap", error);
    return c.json({ error: "パスワード保護処理を完了できませんでした。時間をおいて再試行してください。", code: "PASSWORD_PROTECTION_FAILED" }, 503);
  }
  const userId = crypto.randomUUID();
  await c.env.DB.batch([
    c.env.DB
      .prepare(
        `INSERT INTO users (id, email, password_hash, password_salt, password_iterations, password_algorithm, role)
         SELECT ?, ?, ?, ?, ?, ?, 'ADMIN' WHERE NOT EXISTS (SELECT 1 FROM users WHERE role = 'ADMIN')`,
      )
      .bind(userId, body.data.email, password.hash, password.salt, password.iterations, password.algorithm),
    c.env.DB.prepare("INSERT INTO user_profiles (user_id) SELECT ? WHERE EXISTS (SELECT 1 FROM users WHERE id = ?)").bind(userId, userId),
  ]);
  return c.json({ created: true }, 201);
});

app.post("/api/auth/register", async (c) => {
  const rate = await checkRateLimit(c.env.DB, `register:${clientIp(c.req.raw)}`, 5, 900);
  if (!rate.allowed) return c.json({ error: "登録試行が多すぎます。時間をおいて再試行してください。", retryAfter: rate.retryAfter }, 429);
  const parsed = registerSchema.safeParse(await parseJson(c.req.raw));
  if (!parsed.success) return c.json({ error: "メールアドレスと12文字以上のパスワードを確認してください。" }, 422);
  const [registrationSetting, maxUsers] = await Promise.all([
    c.env.DB
      .prepare("SELECT setting_value FROM app_settings WHERE setting_key = 'registration_mode'")
      .first<{ setting_value: string }>(),
    c.env.DB
      .prepare("SELECT CAST(setting_value AS INTEGER) AS value FROM app_settings WHERE setting_key = 'max_active_users'")
      .first<{ value: number }>(),
  ]);
  const registrationMode = normalizeRegistrationMode(registrationSetting?.setting_value);
  const invitationRequired = invitationRequiredFor(registrationMode);
  if (invitationRequired && !parsed.data.invitationCode) return c.json({ error: "招待コードを入力してください。" }, 422);
  if (!(await turnstileOk(c.env, parsed.data.turnstileToken, clientIp(c.req.raw)))) {
    return c.json({ error: "セキュリティ確認に失敗しました。再度お試しください。" }, 403);
  }
  const codeHash = parsed.data.invitationCode ? await sha256(parsed.data.invitationCode.normalize("NFKC").toUpperCase()) : null;
  let password: Awaited<ReturnType<typeof hashPassword>>;
  try {
    password = await hashPassword(parsed.data.password);
  } catch (error) {
    logPasswordProtectionFailure("register", error);
    return c.json({ error: "パスワード保護処理を完了できませんでした。時間をおいて再試行してください。", code: "PASSWORD_PROTECTION_FAILED" }, 503);
  }
  const userId = crypto.randomUUID();
  try {
    const results = await c.env.DB.batch([
      c.env.DB
        .prepare(
          `INSERT INTO users (id, email, password_hash, password_salt, password_iterations, password_algorithm)
           SELECT ?, ?, ?, ?, ?, ?
           WHERE (SELECT COUNT(*) FROM users WHERE is_active = 1) < ?
             AND (? = 0 OR EXISTS (
               SELECT 1 FROM invitations WHERE code_hash = ? AND is_active = 1
               AND used_count < max_uses AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
             ))`,
        )
        .bind(userId, parsed.data.email, password.hash, password.salt, password.iterations, password.algorithm, Number(maxUsers?.value ?? 100), invitationRequired ? 1 : 0, codeHash),
      c.env.DB.prepare("INSERT INTO user_profiles (user_id) SELECT ? WHERE EXISTS (SELECT 1 FROM users WHERE id = ?)").bind(userId, userId),
      c.env.DB
        .prepare(
          `UPDATE invitations SET used_count = used_count + 1
           WHERE ? = 1 AND code_hash = ? AND EXISTS (SELECT 1 FROM users WHERE id = ?)
           AND used_count < max_uses`,
        )
        .bind(invitationRequired ? 1 : 0, codeHash, userId),
    ]);
    if (Number(results[0]?.meta.changes ?? 0) !== 1) {
      return c.json({ error: invitationRequired ? "招待コードが無効、期限切れ、または定員に達しています。" : "現在、新規登録の受付上限に達しています。" }, 409);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("UNIQUE")) return c.json({ error: "このメールアドレスは登録済みです。" }, 409);
    throw error;
  }
  const session = await createSession(c.env.DB, userId);
  const response = c.json({ user: { id: userId, email: parsed.data.email, role: "USER", onboardingCompleted: false }, csrfToken: session.csrfToken }, 201);
  return appendCookies(response, [sessionCookie(session.token), csrfCookie(session.csrfToken)]);
});

app.post("/api/auth/login", async (c) => {
  const ip = clientIp(c.req.raw);
  const rate = await checkRateLimit(c.env.DB, `login:${ip}`, 8, 900);
  if (!rate.allowed) return c.json({ error: "ログイン試行が多すぎます。時間をおいて再試行してください。", retryAfter: rate.retryAfter }, 429);
  const parsed = credentialsSchema.safeParse(await parseJson(c.req.raw));
  if (!parsed.success) return c.json({ error: "ログイン情報を確認してください。" }, 422);
  if (!(await turnstileOk(c.env, parsed.data.turnstileToken, ip))) return c.json({ error: "セキュリティ確認に失敗しました。" }, 403);
  const row = await c.env.DB
    .prepare("SELECT id, email, password_hash, password_salt, password_iterations, password_algorithm, role, exam_year, onboarding_completed_at FROM users WHERE email = ? AND is_active = 1")
    .bind(parsed.data.email)
    .first<UserRow>();
  let passwordValid: boolean;
  try {
    passwordValid = row ? await verifyPassword(parsed.data.password, row.password_hash, row.password_salt, row.password_iterations, row.password_algorithm) : false;
  } catch (error) {
    logPasswordProtectionFailure("login", error);
    return c.json({ error: "パスワード確認処理を完了できませんでした。時間をおいて再試行してください。", code: "PASSWORD_PROTECTION_FAILED" }, 503);
  }
  if (!row || !passwordValid) {
    return c.json({ error: "メールアドレスまたはパスワードが違います。" }, 401);
  }
  const session = await createSession(c.env.DB, row.id);
  await c.env.DB.prepare("UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?").bind(row.id).run();
  const response = c.json({
    user: { id: row.id, email: row.email, role: row.role, examYear: row.exam_year, onboardingCompleted: row.onboarding_completed_at !== null },
    csrfToken: session.csrfToken,
  });
  return appendCookies(response, [sessionCookie(session.token), csrfCookie(session.csrfToken)]);
});

app.get("/api/auth/me", async (c) => {
  const user = await requireAuth(c.req.raw, c.env);
  if (!user) return c.json({ error: "認証が必要です。" }, 401);
  return c.json({ user: { id: user.id, email: user.email, role: user.role, examYear: user.examYear, onboardingCompleted: user.onboardingCompleted } });
});

app.post("/api/auth/logout", async (c) => {
  const auth = await requireMutationAuth(c.req.raw, c.env);
  if (!auth.user || !auth.csrfValid) return c.json({ error: "認証またはCSRF検証に失敗しました。" }, 403);
  await c.env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(auth.user.sessionId).run();
  return appendCookies(c.json({ loggedOut: true }), [expiredSessionCookie(), expiredCsrfCookie()]);
});

app.post("/api/onboarding", async (c) => {
  const auth = await requireMutationAuth(c.req.raw, c.env);
  if (!auth.user) return c.json({ error: "認証が必要です。" }, 401);
  if (!auth.csrfValid) return c.json({ error: "CSRF検証に失敗しました。" }, 403);
  const parsed = onboardingSchema.safeParse(await parseJson(c.req.raw));
  if (!parsed.success) return c.json({ error: "オンボーディング入力を確認してください。" }, 422);
  await c.env.DB.batch([
    c.env.DB
      .prepare(
        `UPDATE user_profiles SET exam_experience = ?, daily_minutes = ?, weekday_minutes = ?, weekend_minutes = ?,
         strong_subjects_json = ?, weak_subjects_json = ?, goal = ?, preferred_time = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
      )
      .bind(
        parsed.data.examExperience,
        parsed.data.dailyMinutes,
        parsed.data.weekdayMinutes,
        parsed.data.weekendMinutes,
        JSON.stringify(parsed.data.strongSubjects),
        JSON.stringify(parsed.data.weakSubjects),
        parsed.data.goal,
        parsed.data.preferredTime,
        auth.user.id,
      ),
    c.env.DB.prepare("UPDATE users SET exam_year = ?, onboarding_completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(parsed.data.examYear, auth.user.id),
    c.env.DB.prepare("INSERT INTO diagnostic_sessions (id, user_id, exam_year, question_count) VALUES (?, ?, ?, 15)").bind(crypto.randomUUID(), auth.user.id, parsed.data.examYear),
  ]);
  return c.json({ completed: true, diagnosticQuestionCount: 15 });
});

async function ensureMission(env: Env, userId: string): Promise<{ id: string; comebackMode: boolean; estimatedMinutes: number }> {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());
  const existing = await env.DB
    .prepare("SELECT id, comeback_mode, estimated_minutes FROM daily_missions WHERE user_id = ? AND mission_date = ?")
    .bind(userId, today)
    .first<{ id: string; comeback_mode: number; estimated_minutes: number }>();
  if (existing) return { id: existing.id, comebackMode: existing.comeback_mode === 1, estimatedMinutes: existing.estimated_minutes };
  const [profile, lastStudy, dueReviews, highConfidenceErrors] = await Promise.all([
    env.DB
      .prepare("SELECT COALESCE(daily_minutes, 28) AS minutes FROM user_profiles WHERE user_id = ?")
      .bind(userId)
      .first<{ minutes: number }>(),
    env.DB
      .prepare("SELECT CAST(julianday('now') - julianday(MAX(answered_at)) AS INTEGER) AS days FROM user_answers WHERE user_id = ?")
      .bind(userId)
      .first<{ days: number | null }>(),
    env.DB
      .prepare("SELECT COUNT(*) AS count FROM review_schedule WHERE user_id = ? AND status = 'DUE' AND due_at <= CURRENT_TIMESTAMP")
      .bind(userId)
      .first<{ count: number }>(),
    env.DB
      .prepare("SELECT COUNT(*) AS count FROM error_dna_events WHERE user_id = ? AND error_code = 'HIGH_CONFIDENCE_ERROR'")
      .bind(userId)
      .first<{ count: number }>(),
  ]);
  const mission = buildMission({
    availableMinutes: Number(profile?.minutes ?? 28),
    daysSinceStudy: Number(lastStudy?.days ?? 0),
    dueReviews: Number(dueReviews?.count ?? 0),
    highConfidenceErrors: Number(highConfidenceErrors?.count ?? 0),
    weakTopic: "行政法",
    writingDue: true,
  });
  const missionId = crypto.randomUUID();
  const statements: D1PreparedStatement[] = [
    env.DB
      .prepare("INSERT INTO daily_missions (id, user_id, mission_date, estimated_minutes, comeback_mode, total_items) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(missionId, userId, today, mission.estimatedMinutes, mission.comebackMode ? 1 : 0, mission.items.length),
    ...mission.items.map((item, index) =>
      env.DB
        .prepare("INSERT INTO daily_mission_items (id, mission_id, item_order, item_type, title, target_id, estimated_minutes) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), missionId, index + 1, item.type, item.title, item.targetId ?? null, item.minutes),
    ),
  ];
  await env.DB.batch(statements);
  return { id: missionId, comebackMode: mission.comebackMode, estimatedMinutes: mission.estimatedMinutes };
}

app.get("/api/dashboard", async (c) => {
  const user = await requireAuth(c.req.raw, c.env);
  if (!user) return c.json({ error: "認証が必要です。" }, 401);
  const mission = await ensureMission(c.env, user.id);
  const [items, exam, stats, mastery, content] = await Promise.all([
    c.env.DB.prepare("SELECT id, item_type, title, estimated_minutes, status FROM daily_mission_items WHERE mission_id = ? ORDER BY item_order").bind(mission.id).all(),
    c.env.DB.prepare("SELECT exam_date, law_reference_date FROM exam_settings WHERE exam_year = ?").bind(user.examYear).first<{ exam_date: string; law_reference_date: string }>(),
    c.env.DB
      .prepare(
        `SELECT COUNT(*) AS attempts, COALESCE(AVG(ua.is_correct), 0) AS accuracy,
         COALESCE(SUM(ua.elapsed_ms), 0) AS elapsed_ms,
         COALESCE(SUM(CASE WHEN ede.error_code = 'HIGH_CONFIDENCE_ERROR' THEN 1 ELSE 0 END), 0) AS high_confidence
         FROM user_answers ua JOIN questions q ON q.id = ua.question_id
         LEFT JOIN error_dna_events ede ON ede.user_answer_id = ua.id
         WHERE ua.user_id = ? AND q.status = 'VERIFIED'`,
      )
      .bind(user.id)
      .first<{ attempts: number; accuracy: number; elapsed_ms: number; high_confidence: number }>(),
    c.env.DB
      .prepare(
        `SELECT COALESCE(AVG(knowledge_retention), 0) AS knowledge, COALESCE(AVG(recall_stability), 0) AS recall,
         COALESCE(AVG(distinction_skill), 0) AS distinction, COALESCE(AVG(transfer_skill), 0) AS transfer,
         COALESCE(AVG(writing_skill), 0) AS writing, COALESCE(AVG(evidence_explanation), 0) AS explanation,
         COALESCE(AVG(answer_speed), 0) AS speed, COALESCE(AVG(exam_reproducibility), 0) AS reproducibility
         FROM user_topic_mastery WHERE user_id = ?`,
      )
      .bind(user.id)
      .first<{ knowledge: number; recall: number; distinction: number; transfer: number; writing: number; explanation: number; speed: number; reproducibility: number }>(),
    c.env.DB.prepare("SELECT status, COUNT(*) AS count FROM questions GROUP BY status").all<{ status: string; count: number }>(),
  ]);
  const metrics = {
    knowledgeRetention: Number(mastery?.knowledge ?? 0),
    recallStability: Number(mastery?.recall ?? 0),
    distinctionSkill: Number(mastery?.distinction ?? 0),
    transferSkill: Number(mastery?.transfer ?? 0),
    writingSkill: Number(mastery?.writing ?? 0),
    evidenceExplanation: Number(mastery?.explanation ?? 0),
    answerSpeed: Number(mastery?.speed ?? 0),
    examReproducibility: Number(mastery?.reproducibility ?? 0),
  };
  const examDate = exam?.exam_date ?? "2026-11-08";
  return c.json({
    mission: { ...mission, items: items.results },
    exam: { examDate, lawReferenceDate: exam?.law_reference_date, daysRemaining: Math.max(0, Math.ceil((Date.parse(examDate) - Date.now()) / 86_400_000)) },
    readiness: { score: calculateReadiness(metrics), label: "合格到達度", metrics, evidenceLevel: Number(stats?.attempts ?? 0) >= 30 ? "蓄積中" : "参考値・データ不足" },
    study: { verifiedAttempts: Number(stats?.attempts ?? 0), accuracy: Math.round(Number(stats?.accuracy ?? 0) * 100), minutes: Math.round(Number(stats?.elapsed_ms ?? 0) / 60_000), highConfidenceErrors: Number(stats?.high_confidence ?? 0) },
    content: Object.fromEntries(content.results.map((item) => [item.status, Number(item.count)])),
  });
});

app.get("/api/lectures", async (c) => {
  const user = await requireAuth(c.req.raw, c.env);
  if (!user) return c.json({ error: "認証が必要です。" }, 401);
  const includeDraft = user.role === "ADMIN" && c.req.query("includeDraft") === "true";
  const lectures = await c.env.DB
    .prepare(
      `SELECT l.id, l.title, l.explanation, l.key_points_json, l.common_mistakes_json, l.estimated_minutes, l.status,
       s.name AS subject_name, t.name AS topic_name
       FROM lectures l JOIN learning_objectives lo ON lo.id = l.learning_objective_id
       JOIN topics t ON t.id = lo.topic_id JOIN subjects s ON s.id = t.subject_id
       WHERE l.status = 'VERIFIED' OR ? = 1 ORDER BY s.content_priority, t.name, l.title LIMIT 100`,
    )
    .bind(includeDraft ? 1 : 0)
    .all();
  return c.json({ lectures: lectures.results, draftVisible: includeDraft });
});

app.get("/api/questions/next", async (c) => {
  const user = await requireAuth(c.req.raw, c.env);
  if (!user) return c.json({ error: "認証が必要です。" }, 401);
  const preview = user.role === "ADMIN" && c.req.query("preview") === "true";
  const question = await c.env.DB
    .prepare(
      `WITH answer_history AS (
         SELECT question_id, MAX(answered_at) AS last_answered_at
         FROM user_answers
         WHERE user_id = ?
         GROUP BY question_id
       )
       SELECT q.id, q.stem, q.question_type, q.difficulty, q.status, q.correct_explanation, q.reveal_hint,
       q.judgment_point, t.name AS topic_name, s.name AS subject_name
       FROM questions q JOIN learning_objectives lo ON lo.id = q.learning_objective_id
       JOIN topics t ON t.id = lo.topic_id JOIN subjects s ON s.id = t.subject_id
       LEFT JOIN answer_history ah ON ah.question_id = q.id
       LEFT JOIN review_schedule rs ON rs.question_id = q.id AND rs.user_id = ?
       WHERE (q.status IN ('VERIFIED', 'REVIEWED') OR ? = 1)
       ORDER BY CASE WHEN rs.status = 'DUE' AND rs.due_at <= CURRENT_TIMESTAMP THEN 0 ELSE 1 END,
       CASE WHEN ah.question_id IS NULL THEN 0 ELSE 1 END,
       COALESCE(rs.review_priority, q.importance) DESC,
       ah.last_answered_at ASC,
       q.created_at LIMIT 1`,
    )
    .bind(user.id, user.id, preview ? 1 : 0)
    .first<QuestionRow>();
  if (!question) return c.json({ error: "練習問題を準備中です。管理画面で教材のレビュー状況を確認してください。", code: "CONTENT_NOT_READY" }, 404);
  const choices = await c.env.DB
    .prepare("SELECT id, body, choice_order FROM question_choices WHERE question_id = ? ORDER BY choice_order")
    .bind(question.id)
    .all<{ id: string; body: string; choice_order: number }>();
  return c.json({ question: { ...question, choices: choices.results, isAssessmentEligible: question.status === "VERIFIED" } });
});

app.post("/api/answers", async (c) => {
  const auth = await requireMutationAuth(c.req.raw, c.env);
  if (!auth.user) return c.json({ error: "認証が必要です。" }, 401);
  if (!auth.csrfValid) return c.json({ error: "CSRF検証に失敗しました。" }, 403);
  const parsed = answerSchema.safeParse(await parseJson(c.req.raw));
  if (!parsed.success) return c.json({ error: "回答データを確認してください。" }, 422);
  const question = await c.env.DB.prepare("SELECT id, status, importance, correct_explanation, reveal_hint, judgment_point FROM questions WHERE id = ?").bind(parsed.data.questionId).first<{
    id: string; status: string; importance: number; correct_explanation: string; reveal_hint: string | null; judgment_point: string | null;
  }>();
  if (!question) return c.json({ error: "問題が見つかりません。" }, 404);
  const selected = parsed.data.selectedChoiceId
    ? await c.env.DB.prepare("SELECT id, is_correct, explanation FROM question_choices WHERE id = ? AND question_id = ?").bind(parsed.data.selectedChoiceId, question.id).first<ChoiceRow>()
    : null;
  if (!selected && !parsed.data.writtenAnswer) return c.json({ error: "回答を選択または入力してください。" }, 422);
  const correct = selected?.is_correct === 1;
  const history = await c.env.DB
    .prepare("SELECT COALESCE(SUM(is_correct), 0) AS correct, COALESCE(SUM(1 - is_correct), 0) AS incorrect FROM user_answers WHERE user_id = ? AND question_id = ?")
    .bind(auth.user.id, question.id)
    .first<{ correct: number; incorrect: number }>();
  const outcome = {
    isCorrect: correct,
    confidence: parsed.data.confidence,
    elapsedRatio: parsed.data.elapsedMs / 90_000,
    hintUsed: parsed.data.hintUsed,
    priorCorrect: Number(history?.correct ?? 0),
    priorIncorrect: Number(history?.incorrect ?? 0),
    transferAccuracy: 0.5,
    reverseLectureScore: 0,
    comparisonAccuracy: 0.5,
  };
  const answerId = crypto.randomUUID();
  const errorCodes = classifyErrorDna(outcome);
  const intervalDays = nextReviewIntervalDays(outcome);
  const exam = await c.env.DB.prepare("SELECT exam_date FROM exam_settings WHERE exam_year = ?").bind(auth.user.examYear).first<{ exam_date: string }>();
  const priority = calculateReviewPriority(
    {
      importance: Number(question.importance),
      forgettingRisk: correct ? 0.35 : 0.9,
      misunderstandingDepth: errorCodes.includes("HIGH_CONFIDENCE_ERROR") ? 1 : correct ? 0.1 : 0.65,
      confusionScore: errorCodes.includes("CONFUSION") ? 0.9 : 0.25,
      daysUntilExam: Math.ceil((Date.parse(exam?.exam_date ?? "2026-11-08") - Date.now()) / 86_400_000),
    },
    { importance: 1.2, forgetting: 1.4, misunderstanding: 1.6, confusion: 1.3, urgency: 1.1 },
  );
  const dueAt = new Date(Date.now() + intervalDays * 86_400_000).toISOString();
  const statements: D1PreparedStatement[] = [
    c.env.DB
      .prepare(
        `INSERT INTO user_answers (id, user_id, question_id, selected_choice_id, written_answer, is_correct, elapsed_ms, hint_used, confidence, reasoning_note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(answerId, auth.user.id, question.id, parsed.data.selectedChoiceId ?? null, parsed.data.writtenAnswer ?? null, correct ? 1 : 0, parsed.data.elapsedMs, parsed.data.hintUsed ? 1 : 0, parsed.data.confidence, parsed.data.reasoningNote ?? null),
    c.env.DB
      .prepare("INSERT INTO confidence_scores (id, user_answer_id, score, label) VALUES (?, ?, ?, ?)")
      .bind(crypto.randomUUID(), answerId, parsed.data.confidence === "EXPLAIN" ? 3 : parsed.data.confidence === "PROBABLE" ? 2 : 1, parsed.data.confidence),
    c.env.DB
      .prepare(
        `INSERT INTO review_schedule (id, user_id, question_id, due_at, interval_days, forgetting_risk, misunderstanding_depth, confusion_score, review_priority, last_answer_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, question_id) DO UPDATE SET due_at = excluded.due_at, interval_days = excluded.interval_days,
         forgetting_risk = excluded.forgetting_risk, misunderstanding_depth = excluded.misunderstanding_depth,
         confusion_score = excluded.confusion_score, review_priority = excluded.review_priority, status = 'DUE',
         last_answer_id = excluded.last_answer_id, updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(crypto.randomUUID(), auth.user.id, question.id, dueAt, intervalDays, correct ? 0.35 : 0.9, errorCodes.includes("HIGH_CONFIDENCE_ERROR") ? 1 : 0.5, errorCodes.includes("CONFUSION") ? 0.9 : 0.25, priority, answerId),
  ];
  for (const code of errorCodes) {
    statements.push(
      c.env.DB
        .prepare("INSERT INTO error_dna_events (id, user_id, user_answer_id, error_code, detected_by) VALUES (?, ?, ?, ?, 'RULE')")
        .bind(crypto.randomUUID(), auth.user.id, answerId, code),
    );
  }
  await c.env.DB.batch(statements);
  return c.json({
    correct,
    contentStatus: question.status,
    includedInReadiness: question.status === "VERIFIED",
    explanation: correct
      ? selected?.explanation ?? question.correct_explanation
      : `${selected?.explanation ?? ""} ${question.correct_explanation}`.trim(),
    reveal: question.reveal_hint,
    judgmentPoint: question.judgment_point,
    errorDna: errorCodes,
    sixR: { recall: true, rate: parsed.data.confidence, reveal: true, repair: !correct, reapplyScheduled: !correct, returnAt: dueAt },
    highConfidenceEmergency: errorCodes.includes("HIGH_CONFIDENCE_ERROR"),
  });
});

app.get("/api/progress", async (c) => {
  const user = await requireAuth(c.req.raw, c.env);
  if (!user) return c.json({ error: "認証が必要です。" }, 401);
  const [answers, dna, mastery, coverage] = await Promise.all([
    c.env.DB
      .prepare(
        `SELECT s.name AS subject, COUNT(*) AS attempts, ROUND(AVG(ua.is_correct) * 100, 1) AS accuracy
         FROM user_answers ua JOIN questions q ON q.id = ua.question_id
         JOIN learning_objectives lo ON lo.id = q.learning_objective_id JOIN topics t ON t.id = lo.topic_id
         JOIN subjects s ON s.id = t.subject_id WHERE ua.user_id = ? AND q.status = 'VERIFIED' GROUP BY s.id ORDER BY s.content_priority`,
      )
      .bind(user.id)
      .all(),
    c.env.DB
      .prepare("SELECT error_code, COUNT(*) AS count FROM error_dna_events WHERE user_id = ? GROUP BY error_code ORDER BY count DESC")
      .bind(user.id)
      .all(),
    c.env.DB.prepare("SELECT * FROM user_topic_mastery WHERE user_id = ? ORDER BY updated_at DESC LIMIT 30").bind(user.id).all(),
    c.env.DB
      .prepare(
        `SELECT s.name AS subject, COUNT(DISTINCT lo.id) AS objectives,
         COUNT(DISTINCT CASE WHEN q.status = 'VERIFIED' THEN q.learning_objective_id END) AS covered
         FROM subjects s JOIN topics t ON t.subject_id = s.id JOIN learning_objectives lo ON lo.topic_id = t.id
         LEFT JOIN questions q ON q.learning_objective_id = lo.id WHERE s.exam_year = ? GROUP BY s.id ORDER BY s.content_priority`,
      )
      .bind(user.examYear)
      .all(),
  ]);
  return c.json({ subjectPerformance: answers.results, errorDna: dna.results, mastery: mastery.results, coverage: coverage.results });
});

app.post("/api/ai/ask", async (c) => {
  const auth = await requireMutationAuth(c.req.raw, c.env);
  if (!auth.user) return c.json({ error: "認証が必要です。" }, 401);
  if (!auth.csrfValid) return c.json({ error: "CSRF検証に失敗しました。" }, 403);
  const parsed = aiQuestionSchema.safeParse(await parseJson(c.req.raw));
  if (!parsed.success) return c.json({ error: "質問は2〜1000文字で入力してください。" }, 422);
  const result = await answerAiQuestion(c.env, auth.user.id, parsed.data.question);
  await c.env.DB
    .prepare(
      `INSERT INTO ai_questions (id, user_id, normalized_question, question_text, answer_text, source_tier, model, estimated_neurons, cached)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), auth.user.id, parsed.data.question.normalize("NFKC").toLowerCase(), parsed.data.question, result.answer, result.sourceTier, result.sourceTier === "WORKERS_AI" ? c.env.AI_MODEL : null, result.estimatedNeurons, result.cached ? 1 : 0)
    .run();
  return c.json(result);
});

app.get("/api/mock-exams", async (c) => {
  const user = await requireAuth(c.req.raw, c.env);
  if (!user) return c.json({ error: "認証が必要です。" }, 401);
  const exams = await c.env.DB
    .prepare("SELECT id, title, duration_minutes, status FROM mock_exams WHERE exam_year = ? AND status = 'VERIFIED' ORDER BY created_at")
    .bind(user.examYear)
    .all();
  return c.json({ exams: exams.results, note: exams.results.length === 0 ? "VERIFIED問題で構成した模試を準備中です。" : null });
});

app.get("/api/admin/overview", async (c) => {
  const user = await requireAuth(c.req.raw, c.env);
  if (!user) return c.json({ error: "認証が必要です。" }, 401);
  if (user.role !== "ADMIN") return c.json({ error: "管理者権限が必要です。" }, 403);
  const [users, questionsByStatus, lectures, writingQuestions, dauEvents, wau, aiUsage, settings, coverage] = await Promise.all([
    c.env.DB.prepare("SELECT COUNT(*) AS total, SUM(is_active) AS active FROM users").first<{ total: number; active: number }>(),
    c.env.DB.prepare("SELECT status, COUNT(*) AS count FROM questions GROUP BY status").all<{ status: string; count: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) AS count FROM lectures").first<{ count: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) AS count FROM questions WHERE question_type = 'WRITING'").first<{ count: number }>(),
    c.env.DB
      .prepare("SELECT COUNT(*) AS count FROM learning_events WHERE occurred_at >= datetime('now', '-1 day')")
      .first<{ count: number }>(),
    c.env.DB
      .prepare("SELECT COUNT(DISTINCT user_id) AS count FROM learning_events WHERE occurred_at >= datetime('now', '-7 day')")
      .first<{ count: number }>(),
    c.env.DB
      .prepare("SELECT COALESCE(SUM(request_count), 0) AS requests, COALESCE(SUM(estimated_neurons), 0) AS neurons FROM ai_usage_daily WHERE usage_date >= date('now', 'start of month')")
      .first<{ requests: number; neurons: number }>(),
    c.env.DB
      .prepare("SELECT setting_key, setting_value, value_type, description FROM app_settings ORDER BY setting_key")
      .all<{ setting_key: string; setting_value: string; value_type: string; description: string }>(),
    c.env.DB
      .prepare("SELECT s.name AS subject, COUNT(DISTINCT lo.id) AS objectives, COUNT(DISTINCT CASE WHEN q.status = 'VERIFIED' THEN lo.id END) AS covered FROM subjects s JOIN topics t ON t.subject_id = s.id JOIN learning_objectives lo ON lo.topic_id = t.id LEFT JOIN questions q ON q.learning_objective_id = lo.id GROUP BY s.id ORDER BY s.content_priority")
      .all<{ subject: string; objectives: number; covered: number }>(),
  ]);
  return c.json({
    users,
    content: {
      questionsByStatus: questionsByStatus.results,
      lectures: lectures?.count ?? 0,
      writingQuestions: writingQuestions?.count ?? 0,
      coverage: coverage.results,
    },
    learning: { dauEvents: dauEvents?.count ?? 0, wau: wau?.count ?? 0 },
    ai: aiUsage,
    settings: settings.results,
  });
});

app.post("/api/admin/invitations", async (c) => {
  const auth = await requireMutationAuth(c.req.raw, c.env);
  if (!auth.user) return c.json({ error: "認証が必要です。" }, 401);
  if (auth.user.role !== "ADMIN") return c.json({ error: "管理者権限が必要です。" }, 403);
  if (!auth.csrfValid) return c.json({ error: "CSRF検証に失敗しました。" }, 403);
  const parsed = invitationSchema.safeParse(await parseJson(c.req.raw));
  if (!parsed.success) return c.json({ error: "招待コード設定を確認してください。" }, 422);
  const code = `GYO-${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
  await c.env.DB
    .prepare("INSERT INTO invitations (id, code_hash, code_prefix, expires_at, max_uses, created_by) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), await sha256(code), code.slice(0, 7), parsed.data.expiresAt, parsed.data.maxUses, auth.user.id)
    .run();
  return c.json({ code, note: "平文コードは再表示できません。安全な経路で共有してください。" }, 201);
});

app.patch("/api/admin/settings/:key", async (c) => {
  const auth = await requireMutationAuth(c.req.raw, c.env);
  if (!auth.user) return c.json({ error: "認証が必要です。" }, 401);
  if (auth.user.role !== "ADMIN") return c.json({ error: "管理者権限が必要です。" }, 403);
  if (!auth.csrfValid) return c.json({ error: "CSRF検証に失敗しました。" }, 403);
  const parsed = settingSchema.safeParse(await parseJson(c.req.raw));
  if (!parsed.success) return c.json({ error: "設定値を確認してください。" }, 422);
  const allowed = new Set([
    "registration_mode", "max_active_users", "ai_enabled", "free_ai_questions_per_day", "reverse_lecture_per_day", "writing_ai_review_per_day",
    "monthly_ai_budget_jpy", "review_weight_importance", "review_weight_forgetting", "review_weight_misunderstanding", "review_weight_confusion", "review_weight_urgency",
  ]);
  const key = c.req.param("key");
  if (!allowed.has(key)) return c.json({ error: "変更できない設定です。" }, 403);
  let value = typeof parsed.data.value === "object" ? JSON.stringify(parsed.data.value) : String(parsed.data.value);
  if (key === "registration_mode") {
    const requestedMode = typeof parsed.data.value === "string" ? parsed.data.value.trim().toUpperCase() : "";
    if (requestedMode !== "OPEN" && requestedMode !== "INVITE_ONLY") return c.json({ error: "登録モードはOPENまたはINVITE_ONLYを指定してください。" }, 422);
    value = requestedMode;
  }
  const result = await c.env.DB.prepare("UPDATE app_settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP WHERE setting_key = ?").bind(value, key).run();
  if (Number(result.meta.changes ?? 0) !== 1) return c.json({ error: "設定が見つかりません。" }, 404);
  return c.json({ updated: true, key, value });
});

app.notFound((c) => c.json({ error: "Not found" }, 404));

app.onError((error, c) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(JSON.stringify({ message: "request_failed", error: message, method: c.req.method, path: c.req.path }));
  if (message.includes("quota") || message.includes("limit") || message.includes("overloaded")) {
    return c.json({ error: "一時的に利用上限へ達しました。時間をおいて再試行してください。", code: "SERVICE_LIMIT" }, 503);
  }
  if (message === "JSON_REQUIRED") return c.json({ error: "Content-Type: application/json が必要です。" }, 422);
  return c.json({ error: "処理を完了できませんでした。時間をおいて再試行してください。" }, 500);
});

export default app;
export { calculateMastery };
