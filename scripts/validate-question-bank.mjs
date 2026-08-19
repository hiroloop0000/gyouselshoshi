import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const expectedReviewedBySubject = {
  "行政法": 1404,
  "民法": 902,
  "憲法": 351,
  "基礎知識": 801,
  "商法・会社法": 351,
  "基礎法学": 201,
};
const expectedReviewedTotal = 4010;

const database = new DatabaseSync(":memory:");
database.exec("PRAGMA foreign_keys = ON");

for (const file of readdirSync(new URL("../migrations/", import.meta.url)).sort()) {
  if (!file.endsWith(".sql")) continue;
  database.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8"));
}

const summary = database.prepare(`
  SELECT s.name AS subject, q.status, COUNT(*) AS count
  FROM questions q
  JOIN learning_objectives lo ON lo.id = q.learning_objective_id
  JOIN topics t ON t.id = lo.topic_id
  JOIN subjects s ON s.id = t.subject_id
  GROUP BY s.name, q.status
  ORDER BY s.content_priority, q.status
`).all();

const invalidChoices = database.prepare(`
  SELECT q.id, COUNT(c.id) AS choices, COALESCE(SUM(c.is_correct), 0) AS correct_choices
  FROM questions q
  LEFT JOIN question_choices c ON c.question_id = q.id
  WHERE q.status = 'REVIEWED' AND q.question_type <> 'WRITING'
  GROUP BY q.id
  HAVING choices <> 5 OR correct_choices <> 1
`).all();

const invalidSources = database.prepare(`
  SELECT q.id, COUNT(src.id) AS sources
  FROM questions q
  LEFT JOIN question_sources src ON src.question_id = q.id
  WHERE q.status = 'REVIEWED'
  GROUP BY q.id
  HAVING sources < 1 OR SUM(CASE WHEN
    src.law_name IS NOT NULL AND LENGTH(TRIM(src.law_name)) > 0
    AND src.article_number IS NOT NULL AND LENGTH(TRIM(src.article_number)) > 0
    AND src.source_reference IS NOT NULL AND LENGTH(TRIM(src.source_reference)) > 0
    AND src.source_url IS NOT NULL AND src.source_url LIKE 'https://%'
    AND src.reference_date = '2026-04-01'
  THEN 1 ELSE 0 END) < 1
`).all();

const duplicateFingerprints = database.prepare(`
  SELECT fingerprint, COUNT(*) AS count
  FROM questions
  GROUP BY fingerprint
  HAVING count > 1
`).all();

const duplicateNormalizedText = database.prepare(`
  SELECT normalized_text, COUNT(*) AS count
  FROM questions
  WHERE status = 'REVIEWED'
  GROUP BY normalized_text
  HAVING count > 1
`).all();

const duplicateChoiceBodies = database.prepare(`
  SELECT q.id, c.body, COUNT(*) AS count
  FROM questions q
  JOIN question_choices c ON c.question_id = q.id
  WHERE q.status = 'REVIEWED'
  GROUP BY q.id, c.body
  HAVING count > 1
`).all();

const invalidGeneratedQuestions = database.prepare(`
  SELECT id, status, license_status, is_ai_training, last_verified_at
  FROM questions
  WHERE id LIKE 'q-bank-%' AND (
    status <> 'REVIEWED'
    OR license_status <> 'ORIGINAL'
    OR is_ai_training <> 1
    OR last_verified_at IS NOT NULL
  )
`).all();

const invalidGeneratedSources = database.prepare(`
  SELECT q.id, src.source_reference, src.source_url, src.reference_date
  FROM questions q
  JOIN question_sources src ON src.question_id = q.id
  WHERE q.id LIKE 'q-bank-%' AND (
    src.source_reference NOT LIKE 'e-Gov法令API v2 %'
    OR src.source_url NOT LIKE 'https://laws.e-gov.go.jp/law/%'
    OR src.reference_date <> '2026-04-01'
  )
`).all();

const invalidWritingQuestions = database.prepare(`
  SELECT q.id, COUNT(wr.id) AS rubrics
  FROM questions q
  LEFT JOIN writing_rubrics wr ON wr.question_id = q.id
  WHERE q.status = 'REVIEWED' AND q.question_type = 'WRITING'
  GROUP BY q.id
  HAVING rubrics <> 1
`).all();

const objectivesWithoutReviewedLecture = database.prepare(`
  SELECT lo.id, lo.title, COUNT(l.id) AS reviewed_lectures
  FROM learning_objectives lo
  LEFT JOIN lectures l ON l.learning_objective_id = lo.id AND l.status = 'REVIEWED'
  GROUP BY lo.id
  HAVING reviewed_lectures < 1
`).all();

const lectureRows = database.prepare(`
  SELECT id, key_points_json, common_mistakes_json, related_law_json
  FROM lectures
  WHERE status = 'REVIEWED'
`).all();
const invalidLectureJson = [];
for (const row of lectureRows) {
  try {
    const keyPoints = JSON.parse(row.key_points_json);
    const mistakes = JSON.parse(row.common_mistakes_json);
    const related = JSON.parse(row.related_law_json);
    if (
      !Array.isArray(keyPoints) || keyPoints.length < 3
      || !Array.isArray(mistakes) || mistakes.length < 2
      || !Array.isArray(related) || related.length < 1
      || related.some((source) => source.referenceDate !== "2026-04-01" || !String(source.url ?? "").startsWith("https://laws.e-gov.go.jp/law/"))
    ) invalidLectureJson.push({ id: row.id, error: "講義JSONまたは出典が不足" });
  } catch (error) {
    invalidLectureJson.push({ id: row.id, error: error instanceof Error ? error.message : "JSON解析失敗" });
  }
}
const reviewedLectures = lectureRows.length;
const writingQuestions = Number(database.prepare("SELECT COUNT(*) AS count FROM questions WHERE status = 'REVIEWED' AND question_type = 'WRITING'").get().count);

const reviewedBySubject = Object.fromEntries(database.prepare(`
  SELECT s.name AS subject, COUNT(*) AS count
  FROM questions q
  JOIN learning_objectives lo ON lo.id = q.learning_objective_id
  JOIN topics t ON t.id = lo.topic_id
  JOIN subjects s ON s.id = t.subject_id
  WHERE q.status = 'REVIEWED'
  GROUP BY s.name
`).all().map((row) => [row.subject, Number(row.count)]));
const reviewedTotal = Object.values(reviewedBySubject).reduce((total, count) => total + count, 0);
const generatedTotal = Number(database.prepare("SELECT COUNT(*) AS count FROM questions WHERE id LIKE 'q-bank-%'").get().count);
const distributionErrors = Object.entries(expectedReviewedBySubject)
  .filter(([subject, expected]) => reviewedBySubject[subject] !== expected)
  .map(([subject, expected]) => ({ subject, expected, actual: reviewedBySubject[subject] ?? 0 }));
if (reviewedTotal !== expectedReviewedTotal) distributionErrors.push({ subject: "TOTAL", expected: expectedReviewedTotal, actual: reviewedTotal });
if (generatedTotal !== 3976) distributionErrors.push({ subject: "GENERATED", expected: 3976, actual: generatedTotal });

const failures = {
  invalidChoices,
  invalidSources,
  duplicateFingerprints,
  duplicateNormalizedText,
  duplicateChoiceBodies,
  invalidGeneratedQuestions,
  invalidGeneratedSources,
  invalidWritingQuestions,
  objectivesWithoutReviewedLecture,
  invalidLectureJson,
  lectureCountErrors: reviewedLectures === 32 ? [] : [{ expected: 32, actual: reviewedLectures }],
  writingCountErrors: writingQuestions === 10 ? [] : [{ expected: 10, actual: writingQuestions }],
  distributionErrors,
};
if (Object.values(failures).some((items) => items.length)) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ summary, reviewedBySubject, reviewedQuestions: reviewedTotal, generatedQuestions: generatedTotal, reviewedLectures, writingQuestions, checks: { fiveChoicesAndOneCorrect: true, writingRubrics: true, lectureCoverage: true, sourceAndReferenceDate: true, uniqueFingerprintAndText: true, uniqueChoices: true, generatedRemainReviewedOnly: true } }, null, 2));
