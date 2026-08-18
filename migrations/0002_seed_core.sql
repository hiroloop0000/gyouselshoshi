INSERT INTO exam_settings (
  exam_year, exam_date, exam_start_time, exam_end_time, law_reference_date,
  legal_question_count, knowledge_question_count, scoring_published, official_source_url
) VALUES (
  2026, '2026-11-08', '13:00', '16:00', '2026-04-01', 46, 14, 0,
  'https://www.gyosei-shiken.or.jp/doc/guide/guide.html'
);

INSERT INTO exam_scoring_rules (id, exam_year, category, max_points, threshold_ratio, official_status, source_url) VALUES
  ('score-2026-legal', 2026, 'LEGAL', NULL, 0.50, 'PENDING', 'https://www.gyosei-shiken.or.jp/doc/guide/guide.html'),
  ('score-2026-knowledge', 2026, 'BASIC_KNOWLEDGE', NULL, 0.40, 'PENDING', 'https://www.gyosei-shiken.or.jp/doc/guide/guide.html'),
  ('score-2026-total', 2026, 'TOTAL', NULL, 0.60, 'PENDING', 'https://www.gyosei-shiken.or.jp/doc/guide/guide.html');

INSERT INTO app_settings (setting_key, setting_value, value_type, description) VALUES
  ('max_active_users', '100', 'INTEGER', '招待制の有効ユーザー上限'),
  ('exam_year', '2026', 'INTEGER', '現在の対象受験年度'),
  ('ai_enabled', 'true', 'BOOLEAN', 'Workers AI新規生成の有効状態'),
  ('free_ai_questions_per_day', '3', 'INTEGER', 'ユーザーごとのAI先生利用上限'),
  ('reverse_lecture_per_day', '2', 'INTEGER', 'AI反転講義の1日上限'),
  ('writing_ai_review_per_day', '1', 'INTEGER', '記述AIレビューの1日上限'),
  ('monthly_ai_budget_jpy', '5000', 'DECIMAL', 'AI月次予算の保護基準'),
  ('review_weight_importance', '1.20', 'DECIMAL', '復習優先度: 出題重要度'),
  ('review_weight_forgetting', '1.40', 'DECIMAL', '復習優先度: 忘却リスク'),
  ('review_weight_misunderstanding', '1.60', 'DECIMAL', '復習優先度: 誤解深度'),
  ('review_weight_confusion', '1.30', 'DECIMAL', '復習優先度: 制度混同度'),
  ('review_weight_urgency', '1.10', 'DECIMAL', '復習優先度: 試験緊急度');

INSERT INTO error_dna_master (code, label, description, base_weight) VALUES
  ('KNOWLEDGE_GAP', '知識欠落', '判断に必要なルール自体を保持できていない', 1.2),
  ('CONFUSION', '制度混同', '似た制度の要件・効果を取り違えた', 1.4),
  ('SUBJECT_CONFUSION', '主体混同', '処分庁・審査庁など判断主体を取り違えた', 1.3),
  ('EXCEPTION_MISS', '例外欠落', '原則は理解しているが例外を落とした', 1.3),
  ('NUMBER_TIME_CONFUSION', '数字・期間混同', '期間・日数・数値を取り違えた', 1.2),
  ('REQUIREMENT_MISS', '要件欠落', '成立要件の一部を見落とした', 1.3),
  ('READING_ERROR', '問題文読み違い', '否定・主体・時点などの読み取りを誤った', 1.0),
  ('APPLICATION_ERROR', '知識適用失敗', '知識はあるが事例への当てはめに失敗した', 1.4),
  ('TIME_PRESSURE', '時間圧迫', '時間制約により判断品質が低下した', 1.1),
  ('HIGH_CONFIDENCE_ERROR', '高確信誤答', '根拠まで説明できる確信で誤答した', 2.0);

INSERT INTO subjects (id, exam_year, code, name, group_code, content_priority) VALUES
  ('sub-admin', 2026, 'ADMINISTRATIVE_LAW', '行政法', 'LEGAL', 1),
  ('sub-civil', 2026, 'CIVIL_LAW', '民法', 'LEGAL', 2),
  ('sub-constitution', 2026, 'CONSTITUTION', '憲法', 'LEGAL', 3),
  ('sub-basic-knowledge', 2026, 'BASIC_KNOWLEDGE', '基礎知識', 'BASIC_KNOWLEDGE', 4),
  ('sub-commercial', 2026, 'COMMERCIAL_LAW', '商法・会社法', 'LEGAL', 5),
  ('sub-jurisprudence', 2026, 'JURISPRUDENCE', '基礎法学', 'LEGAL', 6);

INSERT INTO topics (id, subject_id, code, name, importance) VALUES
  ('topic-admin-general', 'sub-admin', 'GENERAL', '行政法一般理論', 1.0),
  ('topic-admin-procedure', 'sub-admin', 'PROCEDURE', '行政手続法', 1.2),
  ('topic-admin-appeal', 'sub-admin', 'APPEAL', '行政不服審査法', 1.2),
  ('topic-admin-litigation', 'sub-admin', 'LITIGATION', '行政事件訴訟法', 1.3),
  ('topic-state-liability', 'sub-admin', 'STATE_LIABILITY', '国家賠償法', 1.0),
  ('topic-local-gov', 'sub-admin', 'LOCAL_GOV', '地方自治法', 1.0),
  ('topic-civil-general', 'sub-civil', 'GENERAL_PROVISIONS', '民法総則', 1.2),
  ('topic-civil-obligations', 'sub-civil', 'OBLIGATIONS', '債権', 1.3),
  ('topic-constitution-rights', 'sub-constitution', 'HUMAN_RIGHTS', '基本的人権', 1.1),
  ('topic-basic-info', 'sub-basic-knowledge', 'INFORMATION', '情報通信・個人情報保護', 1.0),
  ('topic-commercial-company', 'sub-commercial', 'COMPANY', '会社法', 1.0),
  ('topic-jurisprudence-basic', 'sub-jurisprudence', 'BASIC', '法の基礎概念', 0.8);

INSERT INTO learning_objectives (
  id, topic_id, code, title, legal_rule, importance,
  has_lecture, has_basic, has_standard, has_transfer, has_comparison, has_review, has_writing
) VALUES
  ('lo-admin-procedure-criteria', 'topic-admin-procedure', 'CRITERIA', '審査基準と処分基準を区別する', '行政手続法上の基準の対象と機能を区別する', 1.2, 1, 1, 1, 1, 1, 1, 0),
  ('lo-admin-litigation-cancel', 'topic-admin-litigation', 'CANCEL_ACTION', '取消訴訟の基本構造を説明する', '取消訴訟の対象・主体・期間・効力を整理する', 1.3, 1, 1, 1, 1, 1, 1, 1),
  ('lo-admin-appeal-period', 'topic-admin-appeal', 'APPEAL_PERIOD', '審査請求の期間を判断する', '主観的期間と客観的期間を区別する', 1.3, 1, 1, 1, 1, 1, 1, 0),
  ('lo-civil-cancel-void', 'topic-civil-general', 'CANCEL_VOID', '取消しと無効を区別する', '効力・主張主体・追認可能性を比較する', 1.2, 1, 1, 1, 1, 1, 1, 1);

INSERT INTO lectures (id, learning_objective_id, title, explanation, key_points_json, common_mistakes_json, related_law_json, estimated_minutes, status) VALUES
  ('lec-admin-criteria', 'lo-admin-procedure-criteria', '審査基準と処分基準：誰の何を判断する基準か', 'この講義はコンテンツレビュー前の下書きです。審査基準と処分基準を、対象となる行政活動・公表の扱い・判断主体の観点から比較して整理します。公開前に2026年4月1日施行法令との照合が必要です。', '["申請に対する処分か、不利益処分かを先に識別する","主語と対象行為をセットで覚える","条文の文言差を一語差ドリルで確認する"]', '["名称だけで判断する","公表と設定の要件を混同する"]', '[{"law":"行政手続法","referenceDate":"2026-04-01"}]', 7, 'DRAFT'),
  ('lec-cancel-action', 'lo-admin-litigation-cancel', '取消訴訟を5つの箱で整理する', 'この講義はコンテンツレビュー前の下書きです。対象、原告適格、被告、出訴期間、判決の効力の5つに分けて整理します。条文・判例の最終確認後にVERIFIEDへ昇格します。', '["対象","原告適格","被告","期間","効力"]', '["審査請求の期間と混同する","処分庁と被告を短絡させる"]', '[{"law":"行政事件訴訟法","referenceDate":"2026-04-01"}]', 8, 'DRAFT');

INSERT INTO questions (
  id, learning_objective_id, exam_year, question_type, stem, normalized_text, fingerprint,
  correct_explanation, reveal_hint, judgment_point, difficulty, status, is_ai_training, importance, legal_rule
) VALUES
  ('q-draft-criteria-1', 'lo-admin-procedure-criteria', 2026, 'SINGLE_CHOICE', '【DRAFT教材】審査基準と処分基準の区別に関する次の記述のうち、学習上まず確認すべき判断軸として最も適切なものはどれか。', '審査基準と処分基準の区別 判断軸', 'draft-criteria-axis-v1', '対象となる行政活動を先に特定し、そのうえで設定・公表等の規律を確認します。本問は法務レビュー前のDRAFTで、到達度には算入されません。', '名称の暗記ではなく「何に対する基準か」を確認してください。', '対象となる行政活動の違い', 'BASIC', 'DRAFT', 1, 1.1, '審査基準と処分基準の対象を区別する'),
  ('q-draft-cancel-1', 'lo-admin-litigation-cancel', 2026, 'TRANSFER', '【DRAFT教材】取消訴訟と審査請求を混同しないため、最初に別表で比較すべき要素の組合せとして最も適切なものはどれか。', '取消訴訟 審査請求 比較要素', 'draft-cancel-compare-v1', '手続の性質、申立先、期間、判断の形式を分けて比較します。本問は法務レビュー前のDRAFTで、到達度には算入されません。', '司法手続と行政上の不服申立てという出発点を意識してください。', '制度の入口・期間・判断形式', 'STANDARD', 'DRAFT', 1, 1.2, '取消訴訟と審査請求の制度比較');

INSERT INTO question_choices (id, question_id, choice_order, body, is_correct, explanation) VALUES
  ('c-criteria-1-a', 'q-draft-criteria-1', 1, '条文番号の桁数', 0, '条文番号だけでは制度の機能を区別できません。'),
  ('c-criteria-1-b', 'q-draft-criteria-1', 2, '対象となる行政活動の種類', 1, '申請に対する処分か不利益処分かという対象の識別が出発点です。'),
  ('c-criteria-1-c', 'q-draft-criteria-1', 3, '行政庁の所在地', 0, '所在地は一般的な制度区別の判断軸ではありません。'),
  ('c-criteria-1-d', 'q-draft-criteria-1', 4, '申請者の職業', 0, '申請者の職業は一般的な制度区別の判断軸ではありません。'),
  ('c-criteria-1-e', 'q-draft-criteria-1', 5, '書面の文字数', 0, '文字数は制度の法的性質を決めません。'),
  ('c-cancel-1-a', 'q-draft-cancel-1', 1, '名称・フォント・ページ数', 0, '形式的な表示要素では制度差を説明できません。'),
  ('c-cancel-1-b', 'q-draft-cancel-1', 2, '手続の性質・申立先・期間・判断形式', 1, '制度の入口から出口までを比較する主要軸です。'),
  ('c-cancel-1-c', 'q-draft-cancel-1', 3, '当事者の年齢・職業・住所', 0, '一般的な制度比較の主要軸ではありません。'),
  ('c-cancel-1-d', 'q-draft-cancel-1', 4, '用紙サイズ・提出部数・文字色', 0, '制度の法的差異ではありません。'),
  ('c-cancel-1-e', 'q-draft-cancel-1', 5, '行政庁舎の階数・開庁時間', 0, '制度の法的差異ではありません。');

INSERT INTO question_sources (id, question_id, law_name, article_number, source_reference, source_url, reference_date) VALUES
  ('src-criteria-1', 'q-draft-criteria-1', '行政手続法', NULL, 'e-Gov法令検索で2026年4月1日施行時点の条文確認が必要', 'https://elaws.e-gov.go.jp/document?lawid=405AC0000000088', '2026-04-01'),
  ('src-cancel-1', 'q-draft-cancel-1', '行政事件訴訟法・行政不服審査法', NULL, 'e-Gov法令検索で2026年4月1日施行時点の条文確認が必要', 'https://elaws.e-gov.go.jp/', '2026-04-01');

INSERT INTO word_difference_sets (id, learning_objective_id, original_statement, modified_statement, changed_phrase, legal_significance, explanation, status) VALUES
  ('wd-draft-1', 'lo-admin-procedure-criteria', '行政庁は、審査基準を定めるものとする。', '行政庁は、審査基準を定めるよう努めるものとする。', '定めるものとする／定めるよう努めるものとする', '義務の強さが変わるため、結論に影響する。', '条文の現行文言を確認してからVERIFIEDへ昇格するDRAFT教材です。', 'DRAFT');

INSERT INTO comparison_sets (id, title, left_label, right_label, dimensions_json, explanation, status) VALUES
  ('cmp-draft-appeal-litigation', '審査請求と取消訴訟', '審査請求', '取消訴訟', '["手続の性質","申立先","期間","判断形式","執行停止"]', '各軸の現行法・例外を確認してからVERIFIEDへ昇格するDRAFT比較表です。', 'DRAFT');

INSERT INTO verified_faq (id, normalized_question, question, answer, source_refs_json, verified_at) VALUES
  ('faq-exam-date-2026', '2026年度の試験日はいつ', '2026年度の行政書士試験日はいつですか。', '結論：2026年11月8日（日）、試験時間は13時から16時です。受験案内の更新や試験場情報は行政書士試験研究センターの公式案内を必ず確認してください。', '[{"title":"令和8年度行政書士試験のご案内","url":"https://www.gyosei-shiken.or.jp/doc/guide/guide.html"}]', '2026-08-18'),
  ('faq-pass-rule', '合格基準を教えて', '行政書士試験の合格基準を教えてください。', '結論：法令等が満点の50%以上、基礎知識が満点の40%以上、全体が満点の60%以上という3条件をすべて満たす必要があります。難易度に応じ補正的措置が加わる場合があります。2026年度の固定配点は公式公表前のため、このアプリでは未確定として扱います。', '[{"title":"令和8年度行政書士試験のご案内","url":"https://www.gyosei-shiken.or.jp/doc/guide/guide.html"}]', '2026-08-18');
