-- Original 2026 practice questions. REVIEWED is practice-only; assessment uses VERIFIED.
-- Official past questions are not reproduced because publication requires permission.

INSERT INTO learning_objectives (
  id, topic_id, code, title, legal_rule, importance,
  has_lecture, has_basic, has_standard, has_transfer, has_comparison, has_review, has_writing
) VALUES
  ('lo-admin-procedure-application','topic-admin-procedure','APPLICATION_PROCESS','申請処理と理由提示を判断する','行政手続法5条から8条の義務と例外',1.3,0,1,1,1,1,1,0),
  ('lo-admin-appeal-suspension','topic-admin-appeal','APPEAL_SUSPENSION','審査請求と執行停止を判断する','行政不服審査法25条の原則・主体・要件',1.3,0,1,1,1,1,1,0),
  ('lo-admin-litigation-suspension','topic-admin-litigation','LITIGATION_SUSPENSION','取消訴訟と執行停止を判断する','行政事件訴訟法25条の原則・要件',1.3,0,1,1,1,1,1,0),
  ('lo-state-liability-core','topic-state-liability','STATE_LIABILITY_CORE','国家賠償法1条と2条を区別する','公権力行使責任と営造物責任',1.2,0,1,1,1,1,1,0),
  ('lo-civil-manifestation','topic-civil-general','MANIFESTATION','意思表示の瑕疵を判断する','心裡留保・錯誤・詐欺の効果',1.3,0,1,1,1,1,1,1),
  ('lo-civil-limitation','topic-civil-obligations','LIMITATION','債権の消滅時効を判断する','主観的起算点と客観的起算点',1.3,0,1,1,1,1,1,0),
  ('lo-civil-contract-cancel','topic-civil-obligations','CONTRACT_CANCEL','債務不履行解除を判断する','催告解除と軽微な不履行',1.3,0,1,1,1,1,1,1),
  ('lo-constitution-rights-core','topic-constitution-rights','RIGHTS_CORE','基本的人権の条文構造を説明する','平等・表現の自由・適正手続',1.2,0,1,1,1,1,1,0),
  ('lo-basic-personal-info','topic-basic-info','PERSONAL_INFO','個人情報取扱事業者の基本義務を判断する','利用目的・適正取得・取得時通知',1.1,0,1,1,1,1,1,0),
  ('lo-company-shareholders-meeting','topic-commercial-company','SHAREHOLDERS_MEETING','株主総会の権限と招集を判断する','取締役会設置会社の権限と招集',1.1,0,1,1,1,1,1,0),
  ('lo-jurisprudence-supreme-law','topic-jurisprudence-basic','SUPREME_LAW','法規範の優劣と国際法尊重を説明する','憲法98条の最高法規性と誠実遵守',1.0,0,1,1,1,1,1,0);

INSERT INTO questions (
  id,learning_objective_id,exam_year,question_type,stem,normalized_text,fingerprint,
  correct_explanation,reveal_hint,judgment_point,difficulty,status,is_ai_training,
  importance,license_status,legal_rule,published_at
) VALUES
  ('q-rv-admin-01','lo-admin-procedure-criteria',2026,'SINGLE_CHOICE','行政手続法上の審査基準に関する次の記述のうち、正しいものはどれか。','行政手続法 審査基準 設定 具体化 公表','rv26-admin-01','正解は3。審査基準を定め、できる限り具体的にし、行政上特別の支障があるときを除き公にします。','設定義務と公表の例外を分けます。','審査基準の設定・具体化・公表','STANDARD','REVIEWED',1,1.4,'ORIGINAL','行政手続法5条',CURRENT_TIMESTAMP),
  ('q-rv-admin-02','lo-admin-procedure-application',2026,'ONE_WORD_DIFF','行政手続法上の標準処理期間に関する次の記述のうち、正しいものはどれか。','行政手続法 標準処理期間 努力義務 公表','rv26-admin-02','正解は2。設定は努力義務ですが、定めたときは公にしておかなければなりません。','定めるよう努める／定めたときは公にする。','努力義務と公表義務','STANDARD','REVIEWED',1,1.2,'ORIGINAL','行政手続法6条',CURRENT_TIMESTAMP),
  ('q-rv-admin-03','lo-admin-procedure-application',2026,'TRANSFER','申請により求められた許認可等を拒否する処分の理由提示について、正しいものはどれか。','行政手続法 拒否処分 理由提示 同時 例外','rv26-admin-03','正解は4。原則は処分と同時です。客観的指標への不適合が申請内容から明らかな場合は、申請者の求めがあったときで足ります。','原則の時点と例外を確認します。','拒否処分と理由提示','EXAM','REVIEWED',1,1.4,'ORIGINAL','行政手続法8条',CURRENT_TIMESTAMP),
  ('q-rv-admin-04','lo-admin-appeal-period',2026,'SINGLE_CHOICE','処分についての審査請求期間に関する次の記述のうち、原則に合致するものはどれか。','行政不服審査法 審査請求期間 三月 一年','rv26-admin-04','正解は2。知った日の翌日から3月、かつ処分日の翌日から1年です。正当な理由がある場合の例外があります。','主観的期間と客観的期間を二本立てで見ます。','3月・1年','EXAM','REVIEWED',1,1.5,'ORIGINAL','行政不服審査法18条',CURRENT_TIMESTAMP),
  ('q-rv-admin-05','lo-admin-appeal-suspension',2026,'TRANSFER','行政不服審査法上の執行停止に関する次の記述のうち、正しいものはどれか。','行政不服審査法 執行停止 原則 職権 申立て','rv26-admin-05','正解は3。審査請求は当然には執行を停止せず、一定の審査庁は申立てまたは職権で執行停止をとれます。','執行不停止の原則から確認します。','執行不停止と職権停止','EXAM','REVIEWED',1,1.5,'ORIGINAL','行政不服審査法25条',CURRENT_TIMESTAMP),
  ('q-rv-admin-06','lo-admin-litigation-cancel',2026,'SINGLE_CHOICE','取消訴訟の出訴期間に関する次の記述のうち、原則に合致するものはどれか。','行政事件訴訟法 出訴期間 六箇月 一年','rv26-admin-06','正解は1。知った日から6箇月、かつ処分または裁決の日から1年です。正当な理由がある場合の例外があります。','審査請求の3月と混同しないでください。','6箇月・1年','EXAM','REVIEWED',1,1.5,'ORIGINAL','行政事件訴訟法14条',CURRENT_TIMESTAMP),
  ('q-rv-admin-07','lo-admin-litigation-suspension',2026,'COMPARISON','処分の取消しの訴えと執行停止に関する次の記述のうち、正しいものはどれか。','行政事件訴訟法 取消訴訟 執行停止 重大な損害','rv26-admin-07','正解は4。訴え提起だけでは停止せず、重大な損害を避ける緊急の必要があるとき、裁判所が申立てにより停止できます。','裁判所への申立てが必要です。','訴え提起と執行停止','EXAM','REVIEWED',1,1.5,'ORIGINAL','行政事件訴訟法25条',CURRENT_TIMESTAMP),
  ('q-rv-admin-08','lo-state-liability-core',2026,'TRANSFER','公権力の行使に当たる公務員が職務上、故意または過失により違法に損害を加えた場合について正しいものはどれか。','国家賠償法 一条 公務員 故意 過失 求償','rv26-admin-08','正解は2。国または公共団体が賠償し、公務員に故意または重大な過失があるときは求償できます。','責任主体と求償要件を分けます。','賠償責任と求償','STANDARD','REVIEWED',1,1.4,'ORIGINAL','国家賠償法1条',CURRENT_TIMESTAMP),
  ('q-rv-admin-09','lo-state-liability-core',2026,'COMPARISON','公の営造物の設置または管理の瑕疵により損害が生じた場合について、正しいものはどれか。','国家賠償法 二条 営造物 設置 管理 瑕疵','rv26-admin-09','正解は5。国または公共団体が賠償し、特定の公務員の故意・過失は条文上の要件ではありません。','1条と2条を区別します。','営造物責任','STANDARD','REVIEWED',1,1.4,'ORIGINAL','国家賠償法2条',CURRENT_TIMESTAMP),
  ('q-rv-civil-01','lo-civil-manifestation',2026,'TRANSFER','Aが真意ではないと知りながらBに意思表示をした。心裡留保について正しいものはどれか。','民法 心裡留保 真意 相手方','rv26-civil-01','正解は3。原則有効ですが、BがAの真意を知り、または知ることができたときは無効です。','表意者の内心だけでは直ちに無効になりません。','心裡留保','STANDARD','REVIEWED',1,1.4,'ORIGINAL','民法93条',CURRENT_TIMESTAMP),
  ('q-rv-civil-02','lo-civil-manifestation',2026,'SINGLE_CHOICE','民法95条の錯誤による意思表示に関する次の記述のうち、正しいものはどれか。','民法 錯誤 取消し 重要 基礎事情 表示','rv26-civil-02','正解は1。重要な錯誤は取消しの対象で、基礎事情の錯誤はその事情が基礎とされていることの表示が必要です。','現在法の効果は無効ではなく取消しです。','錯誤取消し','EXAM','REVIEWED',1,1.5,'ORIGINAL','民法95条',CURRENT_TIMESTAMP),
  ('q-rv-civil-03','lo-civil-manifestation',2026,'TRANSFER','Aが第三者Cの詐欺によりBに意思表示をした場合について、正しいものはどれか。','民法 第三者詐欺 相手方 悪意 有過失','rv26-civil-03','正解は4。Bが詐欺の事実を知り、または知ることができたときに限り、Aは取り消せます。','相手方の認識可能性が分岐点です。','第三者詐欺','EXAM','REVIEWED',1,1.5,'ORIGINAL','民法96条',CURRENT_TIMESTAMP),
  ('q-rv-civil-04','lo-civil-limitation',2026,'SINGLE_CHOICE','民法166条1項の債権の消滅時効に関する次の記述のうち、正しいものはどれか。','民法 債権 消滅時効 五年 十年','rv26-civil-04','正解は2。権利行使できることを知った時から5年、または権利行使できる時から10年です。','主観5年・客観10年です。','債権の消滅時効','STANDARD','REVIEWED',1,1.5,'ORIGINAL','民法166条1項',CURRENT_TIMESTAMP),
  ('q-rv-civil-05','lo-civil-contract-cancel',2026,'TRANSFER','相当期間を定めて履行を催告したが履行がなかった場合の民法541条による解除について、正しいものはどれか。','民法 催告解除 相当期間 軽微','rv26-civil-05','正解は5。原則は解除できますが、期間経過時の不履行が社会通念に照らして軽微なら解除できません。','最後に不履行が軽微か確認します。','催告解除','EXAM','REVIEWED',1,1.5,'ORIGINAL','民法541条',CURRENT_TIMESTAMP),
  ('q-rv-const-01','lo-constitution-rights-core',2026,'SINGLE_CHOICE','日本国憲法14条1項が明示的に列挙する事由の組合せとして、正しいものはどれか。','憲法 平等 人種 信条 性別 社会的身分 門地','rv26-const-01','正解は2。人種、信条、性別、社会的身分または門地です。','列挙された5事由を再生します。','14条列挙事由','BASIC','REVIEWED',1,1.2,'ORIGINAL','日本国憲法14条1項',CURRENT_TIMESTAMP),
  ('q-rv-const-02','lo-constitution-rights-core',2026,'SINGLE_CHOICE','日本国憲法21条の文言に関する次の記述のうち、正しいものはどれか。','憲法 表現の自由 検閲 通信の秘密','rv26-const-02','正解は4。表現の自由を保障し、検閲を禁止し、通信の秘密を侵してはならないとします。','1項と2項をセットで整理します。','表現の自由','STANDARD','REVIEWED',1,1.3,'ORIGINAL','日本国憲法21条',CURRENT_TIMESTAMP),
  ('q-rv-const-03','lo-constitution-rights-core',2026,'SINGLE_CHOICE','日本国憲法31条の条文上の保障として、最も適切なものはどれか。','憲法 適正手続 生命 自由 刑罰','rv26-const-03','正解は1。法律の定める手続によらなければ生命・自由を奪われ、または刑罰を科せられません。','主体は何人も、手続は法律の定める手続です。','31条の適正手続','BASIC','REVIEWED',1,1.2,'ORIGINAL','日本国憲法31条',CURRENT_TIMESTAMP),
  ('q-rv-basic-01','lo-basic-personal-info',2026,'SINGLE_CHOICE','個人情報保護法17条の利用目的の特定に関する次の記述のうち、正しいものはどれか。','個人情報保護法 利用目的 特定 変更 関連性','rv26-basic-01','正解は3。利用目的はできる限り特定し、変更は合理的な関連性の範囲を超えてはなりません。','特定義務と変更限界を分けます。','利用目的','STANDARD','REVIEWED',1,1.2,'ORIGINAL','個人情報保護法17条',CURRENT_TIMESTAMP),
  ('q-rv-basic-02','lo-basic-personal-info',2026,'SINGLE_CHOICE','個人情報保護法20条の適正な取得に関する次の記述のうち、正しいものはどれか。','個人情報保護法 適正取得 要配慮個人情報 同意','rv26-basic-02','正解は2。不正な手段による取得は禁止され、要配慮個人情報は法定例外を除き事前同意が必要です。','一般情報と要配慮情報を区別します。','適正取得','STANDARD','REVIEWED',1,1.3,'ORIGINAL','個人情報保護法20条',CURRENT_TIMESTAMP),
  ('q-rv-basic-03','lo-basic-personal-info',2026,'TRANSFER','個人情報を取得した場合の利用目的の通知等について、個人情報保護法21条1項の原則に合致するものはどれか。','個人情報保護法 取得 利用目的 通知 公表','rv26-basic-03','正解は4。事前公表がある場合を除き、取得後速やかに本人へ通知し、または公表します。','事前公表の有無を見ます。','取得時通知','STANDARD','REVIEWED',1,1.2,'ORIGINAL','個人情報保護法21条1項',CURRENT_TIMESTAMP),
  ('q-rv-company-01','lo-company-shareholders-meeting',2026,'COMPARISON','会社法295条における株主総会の権限に関する次の記述のうち、正しいものはどれか。','会社法 株主総会 権限 取締役会設置会社','rv26-company-01','正解は5。取締役会設置会社では法定事項と定款事項に限り、非設置会社では会社に関する一切の事項を決議できます。','取締役会の有無が分岐点です。','株主総会の権限','STANDARD','REVIEWED',1,1.2,'ORIGINAL','会社法295条',CURRENT_TIMESTAMP),
  ('q-rv-company-02','lo-company-shareholders-meeting',2026,'SINGLE_CHOICE','会社法296条の株主総会の招集に関する次の記述のうち、正しいものはどれか。','会社法 定時株主総会 毎事業年度 招集','rv26-company-02','正解は1。定時総会は毎事業年度終了後一定時期に、必要があればいつでも総会を招集でき、原則として取締役が招集します。','時期と招集者を確認します。','株主総会の招集','BASIC','REVIEWED',1,1.1,'ORIGINAL','会社法296条',CURRENT_TIMESTAMP),
  ('q-rv-juris-01','lo-jurisprudence-supreme-law',2026,'SINGLE_CHOICE','日本国憲法98条1項の最高法規性に関する次の記述のうち、正しいものはどれか。','憲法 最高法規 抵触 効力','rv26-juris-01','正解は3。憲法に反する法律・命令等は、その全部または一部が効力を有しません。','抵触する下位規範の効力を問います。','最高法規性','BASIC','REVIEWED',1,1.1,'ORIGINAL','日本国憲法98条1項',CURRENT_TIMESTAMP),
  ('q-rv-juris-02','lo-jurisprudence-supreme-law',2026,'SINGLE_CHOICE','日本国憲法98条2項の条約および国際法規に関する規定として、正しいものはどれか。','憲法 条約 国際法規 誠実遵守','rv26-juris-02','正解は2。日本国が締結した条約と確立された国際法規は、誠実に遵守する必要があります。','締結手続ではなく遵守原則です。','条約等の誠実遵守','BASIC','REVIEWED',1,1.0,'ORIGINAL','日本国憲法98条2項',CURRENT_TIMESTAMP);
