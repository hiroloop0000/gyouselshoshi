import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const expectedReviewedBySubject = {
  "行政法": 1400,
  "民法": 900,
  "憲法": 350,
  "基礎知識": 800,
  "商法・会社法": 350,
  "基礎法学": 200,
};
const expectedReviewedTotal = 4000;

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
  WHERE q.status = 'REVIEWED'
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
  distributionErrors,
};
if (Object.values(failures).some((items) => items.length)) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ summary, reviewedBySubject, reviewedQuestions: reviewedTotal, generatedQuestions: generatedTotal, checks: { fiveChoicesAndOneCorrect: true, sourceAndReferenceDate: true, uniqueFingerprintAndText: true, uniqueChoices: true, generatedRemainReviewedOnly: true } }, null, 2));
