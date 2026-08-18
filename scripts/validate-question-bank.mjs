import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

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
  HAVING sources < 1
`).all();

const duplicateFingerprints = database.prepare(`
  SELECT fingerprint, COUNT(*) AS count
  FROM questions
  GROUP BY fingerprint
  HAVING count > 1
`).all();

if (invalidChoices.length || invalidSources.length || duplicateFingerprints.length) {
  console.error(JSON.stringify({ invalidChoices, invalidSources, duplicateFingerprints }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ summary, reviewedQuestions: summary.filter((row) => row.status === "REVIEWED").reduce((total, row) => total + Number(row.count), 0) }, null, 2));
