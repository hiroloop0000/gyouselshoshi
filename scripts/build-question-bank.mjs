import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REFERENCE_DATE = "2026-04-01";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = resolve(ROOT, "migrations");
const existing = { admin: 9, civil: 5, constitution: 3, basic: 3, commercial: 2, jurisprudence: 2 };
const targets = { admin: 1400, civil: 900, constitution: 350, basic: 800, commercial: 350, jurisprudence: 200 };

const laws = [
  ["405AC0000000088", "admin", "行政手続法", "topic-admin-procedure", "lo-bank-admin-procedure"],
  ["426AC0000000068", "admin", "行政不服審査法", "topic-admin-appeal", "lo-bank-admin-appeal"],
  ["337AC0000000139", "admin", "行政事件訴訟法", "topic-admin-litigation", "lo-bank-admin-litigation"],
  ["322AC0000000125", "admin", "国家賠償法", "topic-state-liability", "lo-bank-state-liability"],
  ["322AC0000000067", "admin", "地方自治法", "topic-local-gov", "lo-bank-local-gov"],
  ["326AC1000000004", "admin", "行政書士法", "topic-admin-general", "lo-bank-gyoseishoshi"],
  ["129AC0000000089", "civil", "民法", "topic-civil-general", "lo-bank-civil-code"],
  ["321CONSTITUTION", "constitution", "日本国憲法", "topic-constitution-rights", "lo-bank-constitution"],
  ["415AC0000000057", "basic", "個人情報の保護に関する法律", "topic-basic-info", "lo-bank-appi"],
  ["426AC1000000104", "basic", "サイバーセキュリティ基本法", "topic-basic-info", "lo-bank-cybersecurity"],
  ["412AC0000000102", "basic", "電子署名及び認証業務に関する法律", "topic-basic-info", "lo-bank-electronic-signature"],
  ["421AC0000000066", "basic", "公文書等の管理に関する法律", "topic-basic-info", "lo-bank-public-records"],
  ["411AC0000000042", "basic", "行政機関の保有する情報の公開に関する法律", "topic-basic-info", "lo-bank-information-disclosure"],
  ["425AC0000000027", "basic", "行政手続における特定の個人を識別するための番号の利用等に関する法律", "topic-basic-info", "lo-bank-my-number"],
  ["417AC0000000086", "commercial", "会社法", "topic-commercial-company", "lo-bank-company-act"],
  ["132AC0000000048", "commercial", "商法", "topic-commercial-company", "lo-bank-commercial-code"],
  ["418AC0000000078", "jurisprudence", "法の適用に関する通則法", "topic-jurisprudence-basic", "lo-bank-general-rules"],
].map(([id, subject, title, topic, objective]) => ({ id, subject, title, topic, objective }));

const blankGroups = [
  ["しなければならない", "することができる", "してはならない", "するよう努めなければならない", "するものとする"],
  ["することができる", "しなければならない", "してはならない", "するよう努めるものとする", "しないことができる"],
  ["してはならない", "することができる", "しなければならない", "するよう努めなければならない", "するものとする"],
  ["遅滞なく", "直ちに", "速やかに", "あらかじめ", "いつでも"],
  ["直ちに", "遅滞なく", "速やかに", "あらかじめ", "いつでも"],
  ["速やかに", "直ちに", "遅滞なく", "あらかじめ", "いつでも"],
  ["あらかじめ", "遅滞なく", "直ちに", "速やかに", "いつでも"],
  ["善意", "悪意", "故意", "過失", "重大な過失"],
  ["悪意", "善意", "故意", "過失", "重大な過失"],
  ["故意", "過失", "善意", "悪意", "重大な過失"],
  ["過失", "故意", "善意", "悪意", "重大な過失"],
];

const clean = (value) => String(value ?? "")
  .split("").map((character) => character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127 ? " " : character)
  .join("").replace(/\s+/g, " ")
  .trim();
const hash = (value) => createHash("sha256").update(value).digest("hex");
const textOf = (node) => typeof node === "string" ? node : !node || typeof node !== "object" ? "" : (node.children ?? []).map(textOf).join("");

function descendants(node, tag, found = []) {
  if (!node || typeof node !== "object") return found;
  if (node.tag === tag) found.push(node);
  for (const child of node.children ?? []) descendants(child, tag, found);
  return found;
}

const first = (node, tag) => descendants(node, tag, [])[0] ?? null;
const direct = (node, tag) => (node?.children ?? []).find((child) => child && typeof child === "object" && child.tag === tag) ?? null;

async function fetchLaw(law) {
  const query = new URLSearchParams({ response_format: "json", law_full_text_format: "json", json_format: "full", asof: REFERENCE_DATE, omit_amendment_suppl_provision: "true" });
  const response = await fetch(`https://laws.e-gov.go.jp/api/2/law_data/${law.id}?${query}`, { headers: { accept: "application/json", "user-agent": "gyosei-pass-question-bank-builder/1.0" } });
  if (!response.ok) throw new Error(`${law.title}: e-Gov API ${response.status}`);
  return response.json();
}

function extract(law, payload) {
  if (clean(payload.revision_info?.law_title) !== law.title) throw new Error(`${law.id}: 法令名不一致`);
  const revision = clean(payload.revision_info?.law_revision_id);
  if (!revision.startsWith(`${law.id}_`)) throw new Error(`${law.title}: 改正ID不正`);
  const main = first(payload.law_full_text, "MainProvision");
  if (!main) throw new Error(`${law.title}: 本則なし`);
  const units = [];
  for (const article of descendants(main, "Article")) {
    const articleTitle = clean(textOf(direct(article, "ArticleTitle"))) || `第${article.attr?.Num}条`;
    const paragraphs = (article.children ?? []).filter((child) => child?.tag === "Paragraph");
    for (const paragraph of paragraphs) {
      const paragraphNum = clean(paragraph.attr?.Num || textOf(direct(paragraph, "ParagraphNum")) || "1");
      const paragraphSentence = direct(paragraph, "ParagraphSentence");
      const sentences = paragraphSentence ? descendants(paragraphSentence, "Sentence").map((node) => clean(textOf(node))).filter(Boolean) : [];
      sentences.forEach((text, index) => {
        if (text.length < 24 || text.length > 260 || /^(削除|［削除］)$/.test(text) || (text.match(/[。！？]/g) ?? []).length > 3) return;
        const parts = [articleTitle];
        if (paragraphs.length > 1 || paragraphNum !== "1") parts.push(`第${paragraphNum}項`);
        if (sentences.length > 1) parts.push(`第${index + 1}文`);
        units.push({ law, revision, ref: parts.join(""), text });
      });
    }
  }
  if (units.length < 5) throw new Error(`${law.title}: 出題可能文が${units.length}件`);
  return units;
}

function interleave(units) {
  const groups = new Map();
  for (const unit of units) (groups.get(unit.law.id) ?? (groups.set(unit.law.id, []), groups.get(unit.law.id))).push(unit);
  const result = [];
  for (let i = 0; [...groups.values()].some((group) => i < group.length); i += 1) for (const group of groups.values()) if (i < group.length) result.push(group[i]);
  return result;
}

function nearby(unit, units, count, seed, uniqueRef = false) {
  const candidates = units.filter((item) => item.law.id === unit.law.id && item.text !== unit.text && (!uniqueRef || item.ref !== unit.ref))
    .map((item) => ({ item, distance: Math.abs(item.text.length - unit.text.length), tie: hash(`${seed}:${item.ref}:${item.text}`) }))
    .sort((a, b) => a.distance - b.distance || a.tie.localeCompare(b.tie));
  const result = [], used = new Set();
  for (const { item } of candidates) {
    const key = uniqueRef ? item.ref : item.text;
    if (used.has(key)) continue;
    used.add(key); result.push(item);
    if (result.length === count) break;
  }
  if (result.length !== count) throw new Error(`${unit.law.title}${unit.ref}: 誤答候補不足`);
  return result;
}

function arrange(wrong, correct, seed) {
  const index = parseInt(hash(seed).slice(0, 8), 16) % 5;
  const choices = [...wrong]; choices.splice(index, 0, correct);
  return { choices, index };
}

function textQuestion(unit, units, seed) {
  const wrongUnits = nearby(unit, units, 4, seed);
  const sourceByText = new Map(wrongUnits.map((item) => [item.text, item.ref]));
  const { choices, index } = arrange(wrongUnits.map((item) => item.text), unit.text, seed);
  return { variant: "text", type: "SINGLE_CHOICE", difficulty: "STANDARD", stem: `2026年4月1日施行時点の「${unit.law.title}」${unit.ref}の文言として、正しいものはどれか。`, choices: choices.map((body, i) => ({ body, correct: i === index, explanation: i === index ? `${unit.law.title}${unit.ref}の文言です。` : `この文言は${sourceByText.get(body) ?? "別の条項"}に由来し、問われた${unit.ref}とは一致しません。` })), explanation: `正解は${index + 1}。e-Gov法令APIが返した${REFERENCE_DATE}時点の${unit.law.title}${unit.ref}の本文と一致します。`, hint: "主体・義務の強さ・時期を一語ずつ確認します。", point: `${unit.law.title}${unit.ref}の正確な文言` };
}

function citationQuestion(unit, units, seed) {
  const wrongUnits = nearby(unit, units, 4, seed, true);
  const { choices, index } = arrange(wrongUnits.map((item) => `${item.law.title} ${item.ref}`), `${unit.law.title} ${unit.ref}`, seed);
  return { variant: "citation", type: "SINGLE_CHOICE", difficulty: "STANDARD", stem: `次の「${unit.law.title}」の条文は、2026年4月1日施行時点のどの条項に定められているか。\n「${unit.text}」`, choices: choices.map((body, i) => ({ body, correct: i === index, explanation: i === index ? `引用文の出典は${unit.law.title}${unit.ref}です。` : `引用文の出典は${unit.law.title}${unit.ref}であり、${body}ではありません。` })), explanation: `正解は${index + 1}。引用文は${unit.law.title}${unit.ref}です。`, hint: "規律対象と法的効果から条番号を結び付けます。", point: `条文本文から${unit.ref}を想起する` };
}

function lawQuestion(unit, _units, seed) {
  const wrong = laws.filter((law) => law.id !== unit.law.id).sort((a, b) => hash(`${seed}:${a.id}`).localeCompare(hash(`${seed}:${b.id}`))).slice(0, 4).map((law) => law.title);
  const { choices, index } = arrange(wrong, unit.law.title, seed);
  return { variant: "law", type: "COMPARISON", difficulty: "BASIC", stem: `次の文言を2026年4月1日施行時点で定める法令はどれか。\n「${unit.text}」`, choices: choices.map((body, i) => ({ body, correct: i === index, explanation: i === index ? `この文言は${unit.law.title}${unit.ref}に置かれています。` : `この文言の出典は${unit.law.title}${unit.ref}であり、${body}ではありません。` })), explanation: `正解は${index + 1}。この文言の出典は${unit.law.title}${unit.ref}です。`, hint: "規律対象と条文中の固有語から法令を特定します。", point: `条文本文と${unit.law.title}の対応` };
}

function blankQuestion(unit, seed) {
  const group = blankGroups.find((candidate) => unit.text.includes(candidate[0]));
  if (!group) return null;
  const answer = group[0], blanked = unit.text.replace(answer, "＿＿＿＿");
  const { choices, index } = arrange(group.slice(1), answer, seed);
  return { variant: "blank", type: "ONE_WORD_DIFF", difficulty: "EXAM", stem: `2026年4月1日施行時点の${unit.law.title}${unit.ref}について、空欄に入る正確な文言はどれか。\n「${blanked}」`, choices: choices.map((body, i) => ({ body, correct: i === index, explanation: i === index ? `条文の文言は「${answer}」です。` : `「${body}」では義務・裁量・時期などの意味が変わります。` })), explanation: `正解は${index + 1}。${unit.law.title}${unit.ref}の正確な文言は「${answer}」です。`, hint: "義務・禁止・裁量・努力義務、または時期の強さを区別します。", point: `${unit.ref}の一語差` };
}

function selectQuestions(subject, subjectUnits, needed) {
  const ordered = interleave(subjectUnits), blankUnits = ordered.filter((unit) => blankGroups.some((group) => unit.text.includes(group[0])));
  const blankCount = Math.min(Math.floor(needed * 0.15), blankUnits.length);
  const normalTotal = needed - blankCount;
  const counts = [Math.ceil(normalTotal / 3), Math.ceil((normalTotal - Math.ceil(normalTotal / 3)) / 2), 0];
  counts[2] = normalTotal - counts[0] - counts[1];
  if (ordered.length < Math.max(...counts)) throw new Error(`${subject}: 出題可能条文が不足 (${ordered.length})`);
  const result = [], usedStems = new Set();
  const addUnique = (question, unit) => {
    const key = clean(question.stem);
    if (usedStems.has(key)) return false;
    usedStems.add(key);
    result.push({ ...question, unit });
    return true;
  };
  const makers = [textQuestion, citationQuestion, lawQuestion];
  makers.forEach((maker, variant) => {
    const candidates = variant === 2 ? ordered.filter((unit) => unit.crossLawUnique) : ordered;
    let added = 0;
    for (let i = 0; i < candidates.length && added < counts[variant]; i += 1) {
      const unit = candidates[(i + variant * 97) % candidates.length], seed = `${subject}:${variant}:${unit.law.id}:${unit.ref}:${unit.text}`;
      if (addUnique(maker(unit, subjectUnits, seed), unit)) added += 1;
    }
    if (added !== counts[variant]) throw new Error(`${subject}: ${variant}形式の一意な問題が不足 (${added}/${counts[variant]})`);
  });
  let blankAdded = 0;
  for (let i = 0; i < blankUnits.length && blankAdded < blankCount; i += 1) {
    const unit = blankUnits[i], seed = `${subject}:blank:${unit.law.id}:${unit.ref}:${unit.text}`;
    if (addUnique(blankQuestion(unit, seed), unit)) blankAdded += 1;
  }
  if (blankAdded !== blankCount) throw new Error(`${subject}: 穴埋め形式の一意な問題が不足 (${blankAdded}/${blankCount})`);
  if (result.length !== needed) throw new Error(`${subject}: ${result.length} != ${needed}`);
  return result;
}

const q = (value) => value === null || value === undefined ? "NULL" : typeof value === "number" ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
const tuple = (row) => `(${row.map(q).join(",")})`;

function inserts(table, columns, rows) {
  const prefix = `INSERT INTO ${table} (${columns.join(",")}) VALUES\n`, statements = [];
  let batch = [], bytes = Buffer.byteLength(prefix) + 2;
  for (const row of rows) {
    const encoded = tuple(row), rowBytes = Buffer.byteLength(encoded) + 2;
    if (batch.length && bytes + rowBytes > 82_000) { statements.push(`${prefix}${batch.join(",\n")};`); batch = []; bytes = Buffer.byteLength(prefix) + 2; }
    batch.push(encoded); bytes += rowBytes;
  }
  if (batch.length) statements.push(`${prefix}${batch.join(",\n")};`);
  if (statements.some((statement) => Buffer.byteLength(statement) > 100_000)) throw new Error(`${table}: D1 SQL文100KB超過`);
  return statements.join("\n\n");
}

function structureSql() {
  const rows = laws.map((law) => [law.objective, law.topic, `STATUTE_${law.id}`, `${law.title}の条文構造を再生する`, `${law.title}の2026年4月1日施行時点の本文・条項・法令名を相互想起する`, 1, 0, 1, 1, 0, 1, 1, 0]);
  return `-- e-Gov法令API v2、${REFERENCE_DATE}時点。過去問本文は転載しない独自条文学習問題。\n-- REVIEWEDは練習専用。診断・到達度・模試はVERIFIED限定。\n\n${inserts("learning_objectives", ["id","topic_id","code","title","legal_rule","importance","has_lecture","has_basic","has_standard","has_transfer","has_comparison","has_review","has_writing"], rows)}`;
}

function subjectSql(subject, questions) {
  const questionRows = [], choiceRows = [], sourceRows = [];
  questions.forEach((question, index) => {
    const serial = String(index + 1).padStart(4, "0"), id = `q-bank-${subject}-${serial}`;
    const normalized = clean(question.stem).toLowerCase(), fingerprint = `bank26-${hash(`${normalized}|${question.choices.map((choice) => choice.body).join("|")}`).slice(0, 32)}`;
    questionRows.push([id, question.unit.law.objective, 2026, question.type, question.stem, normalized, fingerprint, question.explanation, question.hint, question.point, question.difficulty, "REVIEWED", 1, ["admin","civil"].includes(subject) ? 1.2 : 1, "ORIGINAL", `${question.unit.law.title}${question.unit.ref}`, "2026-08-19 00:00:00"]);
    question.choices.forEach((choice, i) => choiceRows.push([`c-bank-${subject}-${serial}-${i + 1}`, id, i + 1, choice.body, choice.correct ? 1 : 0, choice.explanation]));
    sourceRows.push([`src-bank-${subject}-${serial}`, id, question.unit.law.title, question.unit.ref, `e-Gov法令API v2 ${question.unit.revision}（${REFERENCE_DATE}時点）`, `https://laws.e-gov.go.jp/law/${question.unit.law.id}`, REFERENCE_DATE, null, null]);
  });
  return [`-- ${subject}: ${questions.length}問`, inserts("questions", ["id","learning_objective_id","exam_year","question_type","stem","normalized_text","fingerprint","correct_explanation","reveal_hint","judgment_point","difficulty","status","is_ai_training","importance","license_status","legal_rule","published_at"], questionRows), inserts("question_choices", ["id","question_id","choice_order","body","is_correct","explanation"], choiceRows), inserts("question_sources", ["id","question_id","law_name","article_number","source_reference","source_url","reference_date","case_reference","last_verified_at"], sourceRows)].join("\n\n");
}

function verify(generated) {
  const stems = new Set(), fingerprints = new Set();
  for (const [subject, questions] of Object.entries(generated)) {
    if (questions.length + existing[subject] !== targets[subject]) throw new Error(`${subject}: 科目総数不一致`);
    for (const question of questions) {
      if (question.choices.length !== 5 || question.choices.filter((choice) => choice.correct).length !== 1) throw new Error(`${subject}: 正解肢数不正`);
      const bodies = question.choices.map((choice) => clean(choice.body));
      if (new Set(bodies).size !== 5) throw new Error(`${subject}: 選択肢重複`);
      const stem = clean(question.stem), fingerprint = hash(`${stem}|${bodies.join("|")}`);
      if (stems.has(stem) || fingerprints.has(fingerprint)) throw new Error(`${subject}: 問題重複`);
      stems.add(stem); fingerprints.add(fingerprint);
    }
  }
}

const allUnits = [], revisions = [];
for (const law of laws) {
  process.stdout.write(`取得: ${law.title} ... `);
  const payload = await fetchLaw(law), units = extract(law, payload);
  allUnits.push(...units); revisions.push({ id: law.id, title: law.title, revision: payload.revision_info.law_revision_id, units: units.length });
  console.log(`${units.length}文`);
}

const lawIdsByText = new Map();
for (const unit of allUnits) {
  if (!lawIdsByText.has(unit.text)) lawIdsByText.set(unit.text, new Set());
  lawIdsByText.get(unit.text).add(unit.law.id);
}
for (const unit of allUnits) unit.crossLawUnique = lawIdsByText.get(unit.text).size === 1;

const generated = {};
for (const subject of Object.keys(targets)) generated[subject] = selectQuestions(subject, allUnits.filter((unit) => unit.law.subject === subject), targets[subject] - existing[subject]);
verify(generated);

const files = {
  "0009_question_bank_admin.sql": `${structureSql()}\n\n${subjectSql("admin", generated.admin)}\n`,
  "0010_question_bank_civil_constitution.sql": `${subjectSql("civil", generated.civil)}\n\n${subjectSql("constitution", generated.constitution)}\n`,
  "0011_question_bank_basic_commercial.sql": `${subjectSql("basic", generated.basic)}\n\n${subjectSql("commercial", generated.commercial)}\n`,
  "0012_question_bank_jurisprudence.sql": `${subjectSql("jurisprudence", generated.jurisprudence)}\n`,
};
mkdirSync(MIGRATIONS, { recursive: true });
for (const file of Object.keys(files)) rmSync(resolve(MIGRATIONS, file), { force: true });
for (const [file, contents] of Object.entries(files)) writeFileSync(resolve(MIGRATIONS, file), contents, "utf8");

const formats = Object.fromEntries(Object.entries(generated).map(([subject, questions]) => {
  const counts = {};
  for (const question of questions) counts[question.variant] = (counts[question.variant] ?? 0) + 1;
  return [subject, counts];
}));
console.log(JSON.stringify({ referenceDate: REFERENCE_DATE, revisions, generated: Object.fromEntries(Object.entries(generated).map(([subject, questions]) => [subject, questions.length])), finalReviewed: targets, total: Object.values(targets).reduce((sum, count) => sum + count, 0), formats }, null, 2));
