PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL DEFAULT 210000,
  role TEXT NOT NULL DEFAULT 'USER' CHECK (role IN ('USER', 'ADMIN')),
  plan TEXT NOT NULL DEFAULT 'FREE' CHECK (plan IN ('FREE', 'STANDARD', 'PREMIUM')),
  exam_year INTEGER NOT NULL DEFAULT 2026,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  onboarding_completed_at TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  csrf_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE invitations (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  code_prefix TEXT NOT NULL,
  expires_at TEXT,
  max_uses INTEGER NOT NULL DEFAULT 1 CHECK (max_uses > 0),
  used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE auth_rate_limits (
  bucket_key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  window_started_at TEXT NOT NULL,
  blocked_until TEXT
);

CREATE TABLE user_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  exam_experience TEXT,
  daily_minutes INTEGER,
  weekday_minutes INTEGER,
  weekend_minutes INTEGER,
  strong_subjects_json TEXT NOT NULL DEFAULT '[]',
  weak_subjects_json TEXT NOT NULL DEFAULT '[]',
  goal TEXT,
  preferred_time TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE exam_settings (
  exam_year INTEGER PRIMARY KEY,
  exam_date TEXT NOT NULL,
  exam_start_time TEXT,
  exam_end_time TEXT,
  law_reference_date TEXT NOT NULL,
  legal_question_count INTEGER,
  knowledge_question_count INTEGER,
  scoring_published INTEGER NOT NULL DEFAULT 0 CHECK (scoring_published IN (0, 1)),
  official_source_url TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE exam_scoring_rules (
  id TEXT PRIMARY KEY,
  exam_year INTEGER NOT NULL REFERENCES exam_settings(exam_year) ON DELETE CASCADE,
  category TEXT NOT NULL,
  max_points REAL,
  threshold_ratio REAL NOT NULL CHECK (threshold_ratio > 0 AND threshold_ratio <= 1),
  official_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (official_status IN ('PENDING', 'PUBLISHED')),
  source_url TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (exam_year, category)
);

CREATE TABLE subjects (
  id TEXT PRIMARY KEY,
  exam_year INTEGER NOT NULL REFERENCES exam_settings(exam_year),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  group_code TEXT NOT NULL CHECK (group_code IN ('LEGAL', 'BASIC_KNOWLEDGE')),
  content_priority INTEGER NOT NULL DEFAULT 99,
  is_active INTEGER NOT NULL DEFAULT 1,
  UNIQUE (exam_year, code)
);

CREATE TABLE topics (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  importance REAL NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  UNIQUE (subject_id, code)
);

CREATE TABLE subtopics (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  UNIQUE (topic_id, code)
);

CREATE TABLE learning_objectives (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  subtopic_id TEXT REFERENCES subtopics(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  legal_rule TEXT,
  importance REAL NOT NULL DEFAULT 1,
  has_lecture INTEGER NOT NULL DEFAULT 0,
  has_basic INTEGER NOT NULL DEFAULT 0,
  has_standard INTEGER NOT NULL DEFAULT 0,
  has_transfer INTEGER NOT NULL DEFAULT 0,
  has_comparison INTEGER NOT NULL DEFAULT 0,
  has_review INTEGER NOT NULL DEFAULT 0,
  has_writing INTEGER NOT NULL DEFAULT 0,
  UNIQUE (topic_id, code)
);

CREATE TABLE lectures (
  id TEXT PRIMARY KEY,
  learning_objective_id TEXT NOT NULL REFERENCES learning_objectives(id),
  title TEXT NOT NULL,
  explanation TEXT NOT NULL,
  key_points_json TEXT NOT NULL DEFAULT '[]',
  common_mistakes_json TEXT NOT NULL DEFAULT '[]',
  related_law_json TEXT NOT NULL DEFAULT '[]',
  estimated_minutes INTEGER NOT NULL DEFAULT 7,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'REVIEWED', 'VERIFIED')),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  verified_at TEXT
);

CREATE TABLE questions (
  id TEXT PRIMARY KEY,
  learning_objective_id TEXT NOT NULL REFERENCES learning_objectives(id),
  exam_year INTEGER NOT NULL,
  question_type TEXT NOT NULL CHECK (question_type IN ('SINGLE_CHOICE', 'MULTI_CHOICE', 'WRITING', 'TRANSFER', 'COMPARISON', 'ONE_WORD_DIFF')),
  stem TEXT NOT NULL,
  normalized_text TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  correct_explanation TEXT NOT NULL,
  reveal_hint TEXT,
  judgment_point TEXT,
  difficulty TEXT NOT NULL DEFAULT 'STANDARD' CHECK (difficulty IN ('BASIC', 'STANDARD', 'EXAM', 'ADVANCED')),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'REVIEWED', 'VERIFIED')),
  is_ai_training INTEGER NOT NULL DEFAULT 0 CHECK (is_ai_training IN (0, 1)),
  importance REAL NOT NULL DEFAULT 1,
  license_status TEXT NOT NULL DEFAULT 'ORIGINAL' CHECK (license_status IN ('ORIGINAL', 'PERMISSION_PENDING', 'LICENSED')),
  legal_rule TEXT,
  published_at TEXT,
  last_verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE question_choices (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  choice_order INTEGER NOT NULL,
  body TEXT NOT NULL,
  is_correct INTEGER NOT NULL DEFAULT 0 CHECK (is_correct IN (0, 1)),
  explanation TEXT NOT NULL,
  UNIQUE (question_id, choice_order)
);

CREATE TABLE question_sources (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  law_name TEXT,
  article_number TEXT,
  source_reference TEXT NOT NULL,
  source_url TEXT,
  reference_date TEXT NOT NULL,
  case_reference TEXT,
  last_verified_at TEXT
);

CREATE TABLE question_relations (
  id TEXT PRIMARY KEY,
  source_question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  target_question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL CHECK (relation_type IN ('REAPPLY', 'RETURN', 'SIMILAR', 'CONTRAST', 'DUPLICATE_CANDIDATE')),
  similarity REAL,
  UNIQUE (source_question_id, target_question_id, relation_type)
);

CREATE TABLE writing_rubrics (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL UNIQUE REFERENCES questions(id) ON DELETE CASCADE,
  model_answer TEXT NOT NULL,
  required_elements_json TEXT NOT NULL,
  keywords_json TEXT NOT NULL,
  accepted_phrases_json TEXT NOT NULL DEFAULT '[]',
  subject_role TEXT,
  counterparty TEXT,
  legal_relationship TEXT,
  requirements TEXT,
  effect TEXT,
  legal_basis TEXT,
  rubric_json TEXT NOT NULL
);

CREATE TABLE word_difference_sets (
  id TEXT PRIMARY KEY,
  learning_objective_id TEXT NOT NULL REFERENCES learning_objectives(id),
  original_statement TEXT NOT NULL,
  modified_statement TEXT NOT NULL,
  changed_phrase TEXT NOT NULL,
  legal_significance TEXT NOT NULL,
  explanation TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'REVIEWED', 'VERIFIED')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE comparison_sets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  left_label TEXT NOT NULL,
  right_label TEXT NOT NULL,
  dimensions_json TEXT NOT NULL,
  explanation TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'REVIEWED', 'VERIFIED')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_answers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(id),
  selected_choice_id TEXT REFERENCES question_choices(id),
  written_answer TEXT,
  is_correct INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
  elapsed_ms INTEGER NOT NULL CHECK (elapsed_ms >= 0),
  hint_used INTEGER NOT NULL DEFAULT 0 CHECK (hint_used IN (0, 1)),
  confidence TEXT NOT NULL CHECK (confidence IN ('EXPLAIN', 'PROBABLE', 'GUESS')),
  reasoning_note TEXT,
  answered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE confidence_scores (
  id TEXT PRIMARY KEY,
  user_answer_id TEXT NOT NULL UNIQUE REFERENCES user_answers(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 3),
  label TEXT NOT NULL
);

CREATE TABLE error_dna_master (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  base_weight REAL NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE error_dna_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_answer_id TEXT NOT NULL REFERENCES user_answers(id) ON DELETE CASCADE,
  error_code TEXT NOT NULL REFERENCES error_dna_master(code),
  detected_by TEXT NOT NULL DEFAULT 'RULE' CHECK (detected_by IN ('RULE', 'USER', 'AI', 'ADMIN')),
  incorrect_rule_note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE review_schedule (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  due_at TEXT NOT NULL,
  interval_days REAL NOT NULL DEFAULT 1,
  forgetting_risk REAL NOT NULL DEFAULT 0.5,
  misunderstanding_depth REAL NOT NULL DEFAULT 0,
  confusion_score REAL NOT NULL DEFAULT 0,
  review_priority REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'DUE' CHECK (status IN ('DUE', 'COMPLETED', 'SNOOZED')),
  last_answer_id TEXT REFERENCES user_answers(id),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, question_id)
);

CREATE TABLE daily_missions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mission_date TEXT NOT NULL,
  estimated_minutes INTEGER NOT NULL,
  comeback_mode INTEGER NOT NULL DEFAULT 0,
  completed_items INTEGER NOT NULL DEFAULT 0,
  total_items INTEGER NOT NULL DEFAULT 0,
  generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, mission_date)
);

CREATE TABLE daily_mission_items (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES daily_missions(id) ON DELETE CASCADE,
  item_order INTEGER NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('REVIEW', 'ONE_WORD', 'HIGH_CONFIDENCE', 'LECTURE', 'WRITING', 'TRANSFER', 'REVERSE_LECTURE')),
  title TEXT NOT NULL,
  target_id TEXT,
  estimated_minutes INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'DONE', 'SKIPPED')),
  UNIQUE (mission_id, item_order)
);

CREATE TABLE user_topic_mastery (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  knowledge_retention REAL NOT NULL DEFAULT 0,
  recall_stability REAL NOT NULL DEFAULT 0,
  distinction_skill REAL NOT NULL DEFAULT 0,
  transfer_skill REAL NOT NULL DEFAULT 0,
  writing_skill REAL NOT NULL DEFAULT 0,
  evidence_explanation REAL NOT NULL DEFAULT 0,
  answer_speed REAL NOT NULL DEFAULT 0,
  exam_reproducibility REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, topic_id)
);

CREATE TABLE diagnostic_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exam_year INTEGER NOT NULL,
  question_count INTEGER NOT NULL DEFAULT 15,
  answered_count INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE bookmarks (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('QUESTION', 'LECTURE')),
  resource_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, resource_type, resource_id)
);

CREATE TABLE ai_questions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  normalized_question TEXT NOT NULL,
  question_text TEXT NOT NULL,
  answer_text TEXT NOT NULL,
  source_tier TEXT NOT NULL CHECK (source_tier IN ('FAQ', 'LECTURE', 'VERIFIED_EXPLANATION', 'COMPARISON', 'CACHE', 'WORKERS_AI', 'UNSUPPORTED')),
  model TEXT,
  estimated_neurons REAL NOT NULL DEFAULT 0,
  cached INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE ai_answer_cache (
  cache_key TEXT PRIMARY KEY,
  normalized_question TEXT NOT NULL,
  answer_text TEXT NOT NULL,
  source_refs_json TEXT NOT NULL DEFAULT '[]',
  verified INTEGER NOT NULL DEFAULT 0,
  hit_count INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE ai_usage_daily (
  usage_date TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_count INTEGER NOT NULL DEFAULT 0,
  reverse_lecture_count INTEGER NOT NULL DEFAULT 0,
  writing_review_count INTEGER NOT NULL DEFAULT 0,
  estimated_neurons REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (usage_date, user_id)
);

CREATE TABLE verified_faq (
  id TEXT PRIMARY KEY,
  normalized_question TEXT NOT NULL UNIQUE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  source_refs_json TEXT NOT NULL,
  verified_at TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE mock_exams (
  id TEXT PRIMARY KEY,
  exam_year INTEGER NOT NULL,
  title TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 180,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'REVIEWED', 'VERIFIED')),
  scoring_rule_snapshot_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE mock_exam_questions (
  mock_exam_id TEXT NOT NULL REFERENCES mock_exams(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(id),
  question_order INTEGER NOT NULL,
  PRIMARY KEY (mock_exam_id, question_order),
  UNIQUE (mock_exam_id, question_id)
);

CREATE TABLE mock_exam_results (
  id TEXT PRIMARY KEY,
  mock_exam_id TEXT NOT NULL REFERENCES mock_exams(id),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,
  submitted_at TEXT,
  total_score REAL,
  category_scores_json TEXT NOT NULL DEFAULT '{}',
  elapsed_seconds INTEGER,
  result_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE app_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  value_type TEXT NOT NULL CHECK (value_type IN ('INTEGER', 'DECIMAL', 'BOOLEAN', 'STRING', 'JSON')),
  description TEXT NOT NULL,
  is_secret INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE learning_events (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  duration_seconds INTEGER,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sessions_token_expires ON sessions(token_hash, expires_at);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_invitations_active_expiry ON invitations(is_active, expires_at);
CREATE INDEX idx_subjects_exam_year ON subjects(exam_year, is_active);
CREATE INDEX idx_topics_subject ON topics(subject_id, is_active);
CREATE INDEX idx_objectives_topic ON learning_objectives(topic_id);
CREATE INDEX idx_lectures_objective_status ON lectures(learning_objective_id, status);
CREATE INDEX idx_questions_objective_status ON questions(learning_objective_id, status);
CREATE INDEX idx_questions_exam_status ON questions(exam_year, status, difficulty);
CREATE INDEX idx_questions_fingerprint ON questions(fingerprint);
CREATE INDEX idx_choices_question ON question_choices(question_id, choice_order);
CREATE INDEX idx_sources_question ON question_sources(question_id);
CREATE INDEX idx_answers_user_date ON user_answers(user_id, answered_at DESC);
CREATE INDEX idx_answers_question ON user_answers(question_id, answered_at DESC);
CREATE INDEX idx_error_dna_user ON error_dna_events(user_id, error_code, created_at DESC);
CREATE INDEX idx_review_due ON review_schedule(user_id, status, due_at, review_priority DESC);
CREATE INDEX idx_missions_user_date ON daily_missions(user_id, mission_date DESC);
CREATE INDEX idx_mastery_user ON user_topic_mastery(user_id, updated_at DESC);
CREATE INDEX idx_ai_questions_user_date ON ai_questions(user_id, created_at DESC);
CREATE INDEX idx_ai_cache_normalized ON ai_answer_cache(normalized_question, expires_at);
CREATE INDEX idx_mock_results_user ON mock_exam_results(user_id, submitted_at DESC);
CREATE INDEX idx_events_user_type_date ON learning_events(user_id, event_type, occurred_at DESC);
