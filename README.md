# 行書PASS — 行政書士AI学習Webアプリ

学習心理学の「想起・確信度・誤答原因・変形適用・間隔反復」を一つの学習ループにまとめた、2026年度行政書士試験向けWebアプリです。問題数を競うのではなく、誤答を本番で再現できる知識へ変えることを目的にしています。

> 現在のアプリケーション基盤はproduction運用を前提に実装していますが、法律教材は別の品質工程です。DRAFT教材をVERIFIEDとして扱わず、初回診断・模試・合格到達度にはVERIFIED教材だけを利用します。

## 主な機能

- 公開登録（必要に応じて招待制へ切替可能）、定員管理、USER / ADMIN権限
- 登録・ログイン不要で、データを保存せず学習ループを試せるゲストモード
- ランディングページのURLコピー・QRコード共有
- Workers互換の分割PBKDF2-SHA-256（総反復回数210,000）＋個別salt、HttpOnly / Secure / SameSite Cookie、CSRF、Turnstile、rate limit
- 初回オンボーディングと15問診断セッション
- 今日の合格ミッション、3分で復帰モード
- 6R誤答変換（Recall / Rate / Reveal / Repair / Reapply / Return）
- 10種類の誤答DNA、高確信誤答救急室
- 忘却予報、設定可能な復習優先度、複数軸の習得判定
- 一語差ドリル、比較表、40字記述、初見転移問題を格納できる教材モデル
- 根拠優先AI先生（FAQ → 講義 → VERIFIED解説 → 比較表 → cache → Workers AI）
- AI日次上限、月次予算保護、生成停止時の非AI学習継続
- VERIFIEDのみの模試・合格到達度
- 教材ステータス、論点カバレッジ、AI利用、ユーザー統計の管理画面
- mobile-firstレスポンシブUI、キーボード操作、PWA、オフラインfallback

## アーキテクチャ

```text
Browser / PWA
  ├─ React + TypeScript + Vite
  ├─ /assets/* ─────────────── Workers Static Assets
  └─ /api/* ───────────────── Hono on Cloudflare Workers
                                  ├─ D1 (auth / content / learning / analytics)
                                  ├─ Turnstile Siteverify
                                  └─ Workers AI Binding (grounded fallback only)
```

Cloudflareの現行推奨に合わせ、新規フルスタックアプリはPagesではなくWorkers Static Assetsへ一体deployします。静的ファイルはWorkerを起動せず配信し、`/api/*` のみWorker-firstです。

## 必要環境

- Node.js 22以上（開発時確認: 24.15.0）
- npm 10以上（開発時確認: 11.12.1）
- Wrangler 4以上（開発時確認: 4.124.0）
- Cloudflareアカウント（Workers、D1、Workers AI、Turnstile）

## インストール

```bash
npm install
npm run cf:types
```

秘密情報はコミットしません。

```bash
cp .dev.vars.example .dev.vars
```

ローカルではCloudflareのTurnstileテストキーを利用できます。本番値は `.dev.vars` や `wrangler.jsonc` へ書かず、次で登録します。

```bash
npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler secret put BOOTSTRAP_ADMIN_TOKEN
```

- `TURNSTILE_SITE_KEY`: 公開値。`wrangler.jsonc` の `vars` に設定可能
- `TURNSTILE_SECRET_KEY`: Secret。サーバーだけが利用
- `BOOTSTRAP_ADMIN_TOKEN`: Secret。最初の管理者作成時だけ使用

## ローカル開発

ターミナルを2つ使います。

```bash
npm run db:migrate:local
npm run dev:worker
```

```bash
npm run dev
```

Viteは `/api` を `http://localhost:8787` へproxyします。Workers AIはローカル推論されないため、AIを実際に呼ぶテストはremote bindingまたはdeploy後に行います。FAQ・講義・問題・復習・ミッション等はAIなしで動作します。

## D1

### 作成

対象Cloudflareアカウントでログインしていることを `npx wrangler whoami` で確認してから実行します。

```bash
npx wrangler d1 create gyosei-pass-db
```

出力された `database_id` を `wrangler.jsonc` のゼロ UUID (`00000000-0000-0000-0000-000000000000`) と置き換えます。

### migration

```bash
npm run db:migrate:local
npm run db:migrate:remote
```

- `0001_initial_schema.sql`: 認証、教材、学習履歴、6R、復習、AI、模試、管理設定
- `0002_seed_core.sql`: 2026年度設定、合格率条件（固定点はNULL）、科目、誤答DNA、DRAFT教材、公式FAQ

D1のrows read節約のため、`user_id`、`question_id`、`topic_id`、`due_at`、`status`、`exam_year` と主要な複合条件にindexを設定しています。ダッシュボードはJOIN・集約・並列クエリを使い、N+1を避けています。

## 初期管理者

1. `BOOTSTRAP_ADMIN_TOKEN` をWrangler Secretへ登録
2. migration適用後、ADMINが0人のときだけ `/api/auth/bootstrap` を呼ぶ（一般ユーザーが先に登録していても実行可能）
3. ヘッダー `X-Bootstrap-Token` にSecret、JSON bodyに `email` と12文字以上の `password` を送る
4. 登録は既定で `OPEN`。招待制へ切り替える場合だけ `registration_mode` を `INVITE_ONLY` に変更し、管理画面で招待コードを発行する

```bash
curl -X POST https://YOUR-WORKER.workers.dev/api/auth/bootstrap \
  -H "Content-Type: application/json" \
  -H "X-Bootstrap-Token: YOUR_ONE_TIME_SECRET" \
  -d '{"email":"admin@example.com","password":"use-a-long-unique-password"}'
```

初期管理者作成後はendpointが409を返します。不要になったBootstrap Secretは削除してください。

```bash
npx wrangler secret delete BOOTSTRAP_ADMIN_TOKEN
```

## Workers AI

AI Binding名は `AI`、初期モデル設定は `@cf/qwen/qwen3-30b-a3b-fp8` です。モデル名をコードへ固定せず `AI_MODEL` varに置き、無料プランで利用可能か・日本語品質・単価・速度をdeploy時に再確認して変更できます。

AIへ渡す前に確認済みローカル資料を検索します。確認済みcontextが0件ならAIを呼ばず、次を返します。

> 確認済み資料から十分な根拠を確認できません。

月次予算は `monthly_ai_budget_jpy`、日次質問上限は `free_ai_questions_per_day` で管理します。80%でcache優先、90%で制限、100%で新規生成停止です。Cloudflare実利用量はDashboardとD1推定値を併用して監視してください。

## 教材ワークフロー

```text
AI/人手の下書き (DRAFT)
  → 形式・根拠・正答・複数正解・選択肢解説・重複チェック
  → REVIEWED
  → 法令基準日・出典・最終正答・解説の人手確認
  → VERIFIED
```

禁止事項:

- AI生成直後のVERIFIED化
- 2026年度の未公表配点を公式固定値として登録
- 出典未確認の条文番号・判例
- 許諾のない過去問転載
- DRAFTを診断、模試、合格到達度へ算入

公式過去問は行政書士試験研究センターの許諾が必要です。`license_status` が `LICENSED` のものだけを許諾コンテンツとして公開してください。

## テスト

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run deploy:dry
```

E2E:

```bash
npx playwright install chromium
npm run test:e2e
```

Unitではscoring相当の到達度、復習優先度、習得判定、登録モード、パスワード保護、招待、定員、AI cost guardを検証します。IntegrationではWorkerのhealth/error応答、E2Eではlanding、公開登録導線、ゲスト体験、URLコピー、QR表示、keyboard focusを確認します。

## Deploy

必ず対象アカウントを確認します。

```bash
npx wrangler whoami
npm run typecheck
npm run lint
npm test
npm run build
npx wrangler deploy --dry-run
npm run db:migrate:remote
npx wrangler deploy
```

GitHub Actions deployにはRepository/Environment Secretsを設定します。

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`（Workers Scripts、D1等に必要な最小権限）

ローカル開発ではAPI Tokenを新規作成せず `wrangler login` を優先します。

## Production checklist

- [ ] `wrangler whoami` のAccount IDが対象と一致
- [ ] D1を作成し `database_id` を設定
- [ ] remote migrationを適用
- [ ] Turnstile widgetを本番hostname制限付きで作成
- [ ] `TURNSTILE_SITE_KEY` を公開varへ設定
- [ ] `TURNSTILE_SECRET_KEY` と `BOOTSTRAP_ADMIN_TOKEN` をSecret登録
- [ ] 最初のADMINを作成しBootstrap Secretを削除
- [ ] `registration_mode`（既定 `OPEN`）と `max_active_users` を確認。招待制の場合のみ招待コードを発行
- [ ] VERIFIED教材の件数・論点coverageを確認
- [ ] typecheck / lint / tests / build / dry-runが成功
- [ ] Workers Logs/TracesとD1/Workers AI usage監視を確認
- [ ] CSP、Cookie、CSRF、rate limit、Turnstileを本番hostnameで確認
- [ ] PWA install/offline fallbackとmobile実機を確認
- [ ] 料金planを明示的に確認し、無断でPaidへ変更しない

## 4,000問の法令学習バンク

`scripts/build-question-bank.mjs` は、e-Gov法令API v2から2026年4月1日時点の17法令を取得し、条文に基づく独自問題を再現生成します。行政書士試験研究センターの過去問本文は転載しません。

```bash
npm run bank:build
npm run bank:validate
```

生成後のREVIEWED問題は既存の人手作成24問を含めて次の4,000問です。

| 科目 | 問題数 |
| --- | ---: |
| 行政法 | 1,400 |
| 民法 | 900 |
| 憲法 | 350 |
| 基礎知識 | 800 |
| 商法・会社法 | 350 |
| 基礎法学 | 200 |

問題形式は、条項から本文を選ぶ問題、本文から条項を選ぶ問題、本文から法令名を選ぶ問題、重要語句の一語差問題です。単なる選択肢の並べ替えは別問題として数えません。

検証スクリプトは、空DBへの全マイグレーション適用に加え、科目別件数、5肢、正解1つ、選択肢重複、問題文・指紋重複、出典、基準日、e-Gov改正IDを検査します。生成問題は最終法務確認前の `REVIEWED` に固定し、到達度・診断・模試に利用できる `VERIFIED` へ自動昇格させません。

再生成時はマイグレーション差分と法令改正IDをレビューしてから本番へ適用してください。

## 公式情報とCloudflare仕様

- [令和8年度行政書士試験のご案内](https://www.gyosei-shiken.or.jp/doc/guide/guide.html)
- [e-Gov法令API v2](https://laws.e-gov.go.jp/api/2/redoc/)
- [行政書士試験研究センター 著作権について](https://www.gyosei-shiken.or.jp/doc/about/copyright.html)
- [Cloudflare Workers Limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Cloudflare D1 Pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- [Cloudflare D1 Limits](https://developers.cloudflare.com/d1/platform/limits/)
- [Workers AI Pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [Workers AI Models](https://developers.cloudflare.com/workers-ai/models/)
- [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- [Turnstile server-side validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)

仕様・無料枠は変更され得ます。deploy前に必ず上記公式ページを再確認してください。
