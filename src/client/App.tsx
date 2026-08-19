import QRCode from "qrcode";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BookOpen,
  BrainCircuit,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock3,
  Copy,
  Download,
  FilePenLine,
  Flame,
  Gauge,
  GraduationCap,
  Home,
  KeyRound,
  Library,
  LockKeyhole,
  LogOut,
  Menu,
  MessageSquareText,
  QrCode,
  RefreshCw,
  Settings,
  Share2,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  UserRound,
  X,
  Zap,
} from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { api, ApiError } from "./api";

interface User {
  id: string;
  email: string;
  role: "USER" | "ADMIN";
  examYear: number;
  onboardingCompleted: boolean;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setUser: (user: User | null) => void;
}

interface QuestionProgress {
  totalQuestions: number;
  answeredQuestions: number;
  remainingQuestions: number;
  completionRate: number;
}

interface DashboardData {
  mission: {
    id: string;
    comebackMode: boolean;
    estimatedMinutes: number;
    items: Array<{ id: string; item_type: string; title: string; estimated_minutes: number; status: string }>;
  };
  exam: { examDate: string; lawReferenceDate: string; daysRemaining: number };
  readiness: {
    score: number;
    label: string;
    evidenceLevel: string;
    metrics: Record<string, number>;
  };
  study: {
    practiceAttempts: number;
    practiceAccuracy: number;
    practiceMinutes: number;
    highConfidenceErrors: number;
    verifiedAttempts: number;
    verifiedAccuracy: number;
    questionProgress: QuestionProgress;
  };
  content: Record<string, number>;
}

interface LectureRecord {
  id: string;
  title: string;
  explanation: string;
  key_points_json: string;
  common_mistakes_json: string;
  related_law_json: string;
  estimated_minutes: number;
  status: string;
  subject_name: string;
  topic_name: string;
}

interface WritingReview {
  score: number;
  charCount: number;
  matchedGroups: number;
  totalGroups: number;
  lengthOk: boolean;
  modelAnswer: string;
  requiredElements: string[];
}

interface ProgressData {
  summary: { practiceAttempts: number; practiceAccuracy: number; practiceMinutes: number } & QuestionProgress;
  practicePerformance: Array<Record<string, unknown>>;
  verifiedPerformance: Array<Record<string, unknown>>;
  errorDna: Array<Record<string, unknown>>;
  coverage: Array<Record<string, unknown>>;
}

function parseJsonArray<T>(value: string): T[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

type RegistrationMode = "OPEN" | "INVITE_ONLY";

interface PublicConfig {
  turnstileSiteKey: string;
  registrationMode: RegistrationMode;
  invitationRequired: boolean;
}

const defaultPublicConfig: PublicConfig = {
  turnstileSiteKey: "1x00000000000000000000AA",
  registrationMode: "OPEN",
  invitationRequired: false,
};

function usePublicConfig(): PublicConfig {
  const [config, setConfig] = useState(defaultPublicConfig);
  useEffect(() => {
    api<PublicConfig>("/api/public/config")
      .then((result) => setConfig({
        turnstileSiteKey: result.turnstileSiteKey,
        registrationMode: result.registrationMode === "INVITE_ONLY" ? "INVITE_ONLY" : "OPEN",
        invitationRequired: result.registrationMode === "INVITE_ONLY",
      }))
      .catch(() => undefined);
  }, []);
  return config;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthContext is missing");
  return value;
}

function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      const result = await api<{ user: User }>("/api/auth/me");
      setUser(result.user);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) console.warn("Session check failed");
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);
  return <AuthContext.Provider value={{ user, loading, refresh, setUser }}>{children}</AuthContext.Provider>;
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand" aria-label="行書PASS">
      <span className="brand-mark"><Check size={19} strokeWidth={3} /></span>
      {!compact && <span>行書<span>PASS</span></span>}
    </span>
  );
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface InstallContextValue {
  installed: boolean;
  openInstall: () => void;
}

const InstallContext = createContext<InstallContextValue | null>(null);

function runsStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}

function InstallProvider({ children }: { children: ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(runsStandalone);
  const [bannerVisible, setBannerVisible] = useState(() => !runsStandalone());
  const [guideVisible, setGuideVisible] = useState(false);
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setBannerVisible(true);
    };
    const onInstalled = () => {
      setInstalled(true);
      setBannerVisible(false);
      setGuideVisible(false);
      setDeferredPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  const openInstall = useCallback(() => {
    if (!deferredPrompt) {
      setGuideVisible(true);
      return;
    }
    void (async () => {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      if (choice.outcome === "accepted") setInstalled(true);
      setBannerVisible(false);
    })();
  }, [deferredPrompt]);
  return <InstallContext.Provider value={{ installed, openInstall }}>
    {children}
    {!installed && bannerVisible && <aside className="install-banner" aria-label="アプリのインストール案内">
      <span><Download /></span><div><strong>行書PASSをホーム画面に追加</strong><p>アプリのように1タップで開けます。</p></div>
      <button className="button button-primary" type="button" onClick={openInstall}>追加する</button>
      <button className="install-dismiss" type="button" aria-label="インストール案内を閉じる" onClick={() => setBannerVisible(false)}><X /></button>
    </aside>}
    {guideVisible && <div className="install-guide-backdrop" role="presentation" onMouseDown={() => setGuideVisible(false)}>
      <section className="install-guide" role="dialog" aria-modal="true" aria-labelledby="install-guide-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="install-guide-close" aria-label="閉じる" onClick={() => setGuideVisible(false)}><X /></button>
        <span className="install-guide-icon"><Download /></span>
        <p className="eyebrow">INSTALL APP</p><h2 id="install-guide-title">ホーム画面に追加する方法</h2>
        {isIos ? <ol><li>Safari下部の共有ボタンをタップ</li><li>「ホーム画面に追加」を選択</li><li>右上の「追加」をタップ</li></ol> : <ol><li>Chrome右上のメニューをタップ</li><li>「アプリをインストール」または「ホーム画面に追加」を選択</li><li>確認画面で「インストール」をタップ</li></ol>}
        <p>追加後はホーム画面の「行書PASS」アイコンから起動できます。</p>
        <button className="button button-primary full" onClick={() => setGuideVisible(false)}>確認しました</button>
      </section>
    </div>}
  </InstallContext.Provider>;
}

function InstallButton({ className = "button button-ghost", label = "ホーム画面に追加" }: { className?: string; label?: string }) {
  const context = useContext(InstallContext);
  if (!context || context.installed) return null;
  return <button className={className} type="button" onClick={context.openInstall}><Download size={17} />{label}</button>;
}

function LandingPage() {
  const { invitationRequired } = usePublicConfig();
  return (
    <div className="landing">
      <header className="landing-header">
        <Brand />
        <nav aria-label="メインナビゲーション">
          <a href="#method">学習メソッド</a>
          <a href="#trust">安心設計</a>
          <InstallButton className="button button-small button-ghost install-nav" label="アプリを追加" />
          <Link className="button button-small button-dark" to="/login?mode=register">{invitationRequired ? "招待コードで始める" : "新規登録"} <ArrowRight size={16} /></Link>
        </nav>
      </header>
      <main id="main">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow"><Sparkles size={15} /> 2026年度行政書士試験対応</p>
            <h1>間違いを、<br /><em>合格できる知識</em>に。</h1>
            <p className="hero-lead">問題を解いて終わりにしない。あなたの誤答原因を見抜き、忘れる前に形を変えて再出題。今日やるべき学習まで、迷わず提示します。</p>
            <div className="hero-actions">
              <Link className="button button-primary" to="/login?mode=register">{invitationRequired ? "招待コードで学習を始める" : "学習を始める"} <ArrowRight size={18} /></Link>
              <Link className="button button-ghost" to="/guest">登録せずゲストで試す</Link>
              <a className="button button-ghost" href="#method">仕組みを見る</a>
            </div>
            <div className="trust-row">
              <span><ShieldCheck size={17} /> 公式情報を基準</span>
              <span><LockKeyhole size={17} /> {invitationRequired ? "招待制・安全な認証" : "Turnstile・安全な認証"}</span>
              <span><BrainCircuit size={17} /> AI停止時も学習継続</span>
            </div>
          </div>
          <div className="hero-product" aria-label="ダッシュボード画面イメージ">
            <div className="product-window">
              <div className="window-top"><Brand /><span className="avatar-mini">K</span></div>
              <div className="product-content">
                <div className="mission-preview">
                  <div>
                    <span className="preview-label">TODAY'S MISSION</span>
                    <h2>今日の合格ミッション</h2>
                    <p><Clock3 size={14} /> 28分で完了</p>
                  </div>
                  <div className="mission-ring"><strong>0</strong><span>/ 7</span></div>
                </div>
                <div className="preview-list">
                  {["忘れかけ問題 5問", "一語差ドリル 4問", "高確信誤答の修正", "行政事件訴訟法テキスト講義"].map((item, index) => (
                    <div key={item}><span>{index + 1}</span><p>{item}<small>{["6分", "4分", "5分", "7分"][index]}</small></p><ChevronRight size={16} /></div>
                  ))}
                </div>
              </div>
            </div>
            <div className="float-card float-card-a"><div className="float-icon"><TrendingUp size={18} /></div><span>合格到達度</span><strong>71<small>%</small></strong><em>参考表示</em></div>
            <div className="float-card float-card-b"><div className="float-icon amber"><AlertTriangle size={18} /></div><span>忘却予報</span><strong>5問</strong><em>今日が復習どき</em></div>
          </div>
        </section>

        <section className="principle-strip" aria-label="主要価値">
          <p>「何をやるか」で迷わない</p><i />
          <p>「なぜ間違えたか」が分かる</p><i />
          <p>「忘れる前」に戻ってくる</p>
        </section>

        <section className="method-section" id="method">
          <div className="section-heading">
            <p className="eyebrow">THE 6R LEARNING LOOP</p>
            <h2>誤答を得点力へ変える、6つの工程。</h2>
            <p>正解を見るだけでは、次の一問は解けません。思い出す・確信度を測る・原因を特定する・直す・使う・戻る、までを一続きにします。</p>
          </div>
          <div className="six-grid">
            {[
              ["01", "Recall", "思い出す", "解説の前に、自分の知識を引き出す"],
              ["02", "Rate", "確信度を測る", "勘か、根拠まで言えるかを記録"],
              ["03", "Reveal", "原因を見抜く", "知識不足・制度混同・読み違いを分類"],
              ["04", "Repair", "誤解を直す", "講義・比較表・根拠資料で修復"],
              ["05", "Reapply", "形を変えて使う", "条件を変えた類題で本当に確認"],
              ["06", "Return", "忘れる前に戻る", "記憶状態に合わせて自動再出題"],
            ].map(([number, en, ja, text], index) => (
              <article key={en} className={index === 2 || index === 5 ? "accent-card" : ""}>
                <span>{number}</span><div className="method-icon">{[<BrainCircuit />, <Gauge />, <CircleHelp />, <BookOpen />, <Zap />, <RefreshCw />][index]}</div>
                <p>{en}</p><h3>{ja}</h3><small>{text}</small>
              </article>
            ))}
          </div>
        </section>

        <section className="feature-showcase">
          <div className="section-heading left">
            <p className="eyebrow">BEYOND A QUESTION BANK</p>
            <h2>苦手を「科目」ではなく、<br />失点原因から治す。</h2>
            <p>行政法が苦手、だけでは次にやることが曖昧です。行書PASSは誤答DNAを10種類に分け、あなた固有の失点パターンを可視化します。</p>
          </div>
          <div className="dna-panel">
            <div className="dna-head"><span>あなたの誤答DNA</span><small>直近30回答</small></div>
            <div className="dna-bars">
              {[["制度混同", 78, "teal"], ["例外欠落", 62, "gold"], ["要件欠落", 47, "slate"], ["読み違い", 31, "pale"]].map(([name, width, tone]) => (
                <div key={String(name)}><span>{name}</span><i><b className={String(tone)} style={{ width: `${width}%` }} /></i><strong>{width}%</strong></div>
              ))}
            </div>
            <div className="dna-insight"><Sparkles size={20} /><p><strong>次の伸びしろ</strong>取消訴訟と審査請求の「期間」の混同を優先して修正します。</p></div>
          </div>
        </section>

        <section className="trust-section" id="trust">
          <div><ShieldCheck size={30} /><h3>確認済み教材だけで判定</h3><p>DRAFT教材を診断・模試・合格到達度に混ぜません。出典・基準日・確認日を管理します。</p></div>
          <div><BrainCircuit size={30} /><h3>AIは根拠資料の後に</h3><p>FAQ、テキスト講義、確認済み解説、キャッシュを優先。根拠がなければ推測せず、確認不能と伝えます。</p></div>
          <div><Activity size={30} /><h3>AI上限でも止まらない</h3><p>問題、復習、ミッション、到達度、模試はルールベース。生成AI障害時も学習を続けられます。</p></div>
        </section>

        <section className="cta-section">
          <div><p className="eyebrow light">{invitationRequired ? "PRIVATE BETA" : "OPEN BETA"} · FIRST 100 LEARNERS</p><h2>今日の一歩を、合格につながる一歩へ。</h2><p>{invitationRequired ? "お手元の招待コードから登録してください。" : "招待コードなしで、メールアドレスから登録できます。"}</p></div>
          <Link className="button button-light" to="/login?mode=register">学習を始める <ArrowRight size={18} /></Link>
        </section>
        <ShareSection />
      </main>
      <footer><Brand /><p>© 2026 行書PASS</p><p>「合格到達度」は学習実績の指標であり、合格確率ではありません。</p></footer>
    </div>
  );
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const input = document.createElement("textarea");
  input.value = value;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.append(input);
  input.select();
  const copied = document.execCommand("copy");
  input.remove();
  if (!copied) throw new Error("COPY_FAILED");
}

function ShareSection() {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [showQr, setShowQr] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrError, setQrError] = useState(false);
  const shareUrl = new URL("/", window.location.origin).toString();
  useEffect(() => {
    if (!showQr) return;
    let active = true;
    QRCode.toDataURL(shareUrl, { width: 240, margin: 2, errorCorrectionLevel: "M", color: { dark: "#132d2c", light: "#fffefb" } })
      .then((value) => { if (active) setQrDataUrl(value); })
      .catch(() => { if (active) setQrError(true); });
    return () => { active = false; };
  }, [shareUrl, showQr]);
  const copyLink = async () => {
    try {
      await copyText(shareUrl);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  };
  const toggleQr = () => {
    if (!showQr) {
      setQrDataUrl("");
      setQrError(false);
    }
    setShowQr((visible) => !visible);
  };
  return (
    <section className="share-section" aria-labelledby="share-title">
      <div className="share-heading"><span><Share2 /></span><div><p className="eyebrow">SHARE</p><h2 id="share-title">この学習アプリをシェア</h2><p>リンクを送るか、スマートフォンでQRコードを読み取れます。</p></div></div>
      <div className="share-controls">
        <div className="share-buttons">
          <button className="button button-ghost" type="button" onClick={() => void copyLink()}><Copy size={17} />リンクをコピー</button>
          <button className="button button-ghost" type="button" aria-expanded={showQr} onClick={toggleQr}><QrCode size={18} />{showQr ? "QRコードを閉じる" : "QRコードを表示"}</button>
          <InstallButton />
        </div>
        {copyState !== "idle" && <p className={copyState === "copied" ? "share-status success" : "share-status error"} role="status">{copyState === "copied" ? "リンクをコピーしました。" : "コピーできませんでした。URLを長押ししてコピーしてください。"}</p>}
        {showQr && <div className="share-qr-panel"><strong>スマートフォンで読み取る</strong>{qrDataUrl ? <img src={qrDataUrl} alt="行書PASS共有用QRコード" width="240" height="240" /> : qrError ? <p role="alert">QRコードを生成できませんでした。</p> : <span className="spinner" aria-label="QRコードを生成中" />}<code>{shareUrl}</code></div>}
      </div>
    </section>
  );
}

declare global {
  interface Window {
    turnstile?: { render: (element: HTMLElement, options: Record<string, unknown>) => string; reset: (widgetId?: string) => void };
  }
  interface Navigator {
    standalone?: boolean;
  }
}

function TurnstileWidget({ siteKey, onToken }: { siteKey: string; onToken: (token: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    const render = () => {
      if (!cancelled && container.current && window.turnstile) {
        container.current.replaceChildren();
        window.turnstile.render(container.current, { sitekey: siteKey, theme: "light", callback: onToken, "expired-callback": () => onToken("") });
      }
    };
    if (window.turnstile) render();
    else {
      const existing = document.querySelector<HTMLScriptElement>('script[data-turnstile="true"]');
      if (existing) existing.addEventListener("load", render, { once: true });
      else {
        const script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true; script.defer = true; script.dataset.turnstile = "true"; script.addEventListener("load", render, { once: true });
        document.head.append(script);
      }
    }
    return () => { cancelled = true; };
  }, [onToken, siteKey]);
  return <div className="turnstile-wrap" ref={container} aria-label="セキュリティ確認" />;
}

function AuthPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [mode, setMode] = useState(new URLSearchParams(location.search).get("mode") === "register" ? "register" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [invitationCode, setInvitationCode] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const { turnstileSiteKey: siteKey, invitationRequired } = usePublicConfig();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const tokenCallback = useCallback((token: string) => setTurnstileToken(token), []);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      const path = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const result = await api<{ user: User }>(path, { method: "POST", body: JSON.stringify({ email, password, turnstileToken, ...(mode === "register" && invitationRequired ? { invitationCode } : {}) }) });
      setUser(result.user);
      void navigate(result.user.onboardingCompleted ? "/app" : "/onboarding");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "処理に失敗しました。");
      window.turnstile?.reset(); setTurnstileToken("");
    } finally { setBusy(false); }
  };
  return (
    <main id="main" className="auth-page">
      <section className="auth-aside"><Link to="/"><Brand /></Link><div><p className="eyebrow light">LEARN WITH INTENTION</p><h1>今日の迷いをなくし、<br />本番の自信に変える。</h1><p>あなたの間違い方から、次に学ぶべき一問を組み立てます。</p></div><blockquote>「正解したか」より、<br />「次も正解できるか」。</blockquote></section>
      <section className="auth-form-wrap">
        <div className="auth-mobile-brand"><Link to="/"><Brand /></Link></div>
        <form className="auth-form" onSubmit={(event) => void submit(event)}>
          <div className="auth-tabs" role="tablist"><button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>ログイン</button><button type="button" className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>新規登録</button></div>
          <div className="auth-title"><h2>{mode === "login" ? "おかえりなさい" : "学習を始めましょう"}</h2><p>{mode === "login" ? "続きのミッションから再開できます。" : invitationRequired ? "招待コードをお持ちの方が登録できます。" : "招待コードなしで、すぐに登録できます。"}</p></div>
          {error && <div className="form-error" role="alert"><AlertTriangle size={18} />{error}</div>}
          <label>メールアドレス<input autoComplete="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></label>
          <label>パスワード<input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="12文字以上" required /></label>
          {mode === "register" && invitationRequired && <label>招待コード<input autoComplete="off" value={invitationCode} onChange={(event) => setInvitationCode(event.target.value)} placeholder="GYO-XXXXXXXXXXXX" required /></label>}
          <TurnstileWidget siteKey={siteKey} onToken={tokenCallback} />
          <button className="button button-primary full" disabled={busy || !turnstileToken}>{busy ? "処理中…" : mode === "login" ? "ログイン" : invitationRequired ? "招待コードで登録" : "新規登録"}<ArrowRight size={18} /></button>
          <p className="auth-note"><LockKeyhole size={15} /> パスワードは強固な鍵導出で保護され、平文では保存されません。</p>
          <div className="auth-guest"><span>まずは登録せずに画面を試せます</span><Link className="button button-ghost full" to="/guest">ゲストモードを開く <ArrowRight size={17} /></Link></div>
        </form>
      </section>
    </main>
  );
}

function GuestPage() {
  const [choice, setChoice] = useState("");
  const [confidence, setConfidence] = useState<"explain" | "probable" | "guess">("probable");
  const [submitted, setSubmitted] = useState(false);
  const correctChoice = "reason";
  const choices = [
    { id: "score", label: "A", text: "その日の合否予想だけ" },
    { id: "reason", label: "B", text: "なぜそう判断したか、という理由と確信度" },
    { id: "time", label: "C", text: "学習にかかった時間だけ" },
    { id: "answer", label: "D", text: "正答番号だけ" },
  ];
  const resultCorrect = choice === correctChoice;
  const selectChoice = (id: string) => {
    setChoice(id);
    setSubmitted(false);
  };
  return (
    <main id="main" className="guest-page">
      <header className="guest-header">
        <Link to="/"><Brand /></Link>
        <span className="guest-badge"><UserRound size={15} /> ゲストモード</span>
        <nav aria-label="ゲストメニュー"><Link to="/login">ログイン</Link><Link className="button button-small button-primary" to="/login?mode=register">無料で登録</Link></nav>
      </header>
      <section className="guest-hero">
        <div>
          <p className="eyebrow"><Sparkles size={15} /> NO SIGN-UP DEMO</p>
          <h1>登録せずに、<br />学習の流れを体験。</h1>
          <p>今日のミッションから一問を解き、判断理由と確信度を振り返る流れを試せます。</p>
          <div className="guest-actions"><a className="button button-primary" href="#guest-demo">デモ問題を解く <ArrowRight size={18} /></a><Link className="button button-ghost" to="/">トップへ戻る</Link></div>
        </div>
        <aside className="guest-overview" aria-label="ゲスト体験の内容">
          <span className="card-kicker">GUEST EXPERIENCE</span>
          <strong>約3分</strong>
          <p>登録情報なしで、主要な学習体験を確認できます。</p>
          <ul><li><CheckCircle2 size={17} /> 今日のミッション</li><li><CheckCircle2 size={17} /> デモ問題と確信度</li><li><CheckCircle2 size={17} /> 回答後の振り返り</li></ul>
        </aside>
      </section>
      <div className="guest-notice" role="note"><ShieldCheck size={21} /><div><strong>保存されない体験モードです</strong><p>メールアドレス・パスワードは不要です。回答や進捗は保存されず、AI先生など一部機能は登録後に利用できます。</p></div></div>
      <section className="guest-demo-layout" id="guest-demo" aria-label="ゲスト学習デモ">
        <article className="guest-mission-card">
          <div className="card-head"><div><span className="card-kicker">TODAY'S MISSION · DEMO</span><h2>今日の合格ミッション</h2><p><Clock3 size={15} /> 約3分</p></div><div className="progress-circle"><div><strong>0</strong><span>/ 1</span></div></div></div>
          <div className="guest-mission-item"><span>1</span><div><strong>学習ループ体験問題</strong><small>回答 → 確信度 → 振り返り</small></div><em>3分</em></div>
          <p className="guest-help"><Target size={18} /> ゲストでは操作方法を安全に体験できます。実際の行政書士教材は、品質確認済みのものだけを登録後の学習判定に使います。</p>
        </article>
        <article className="guest-question-card">
          <div className="guest-question-meta"><span>デモ問題</span><em>到達度に未算入</em></div>
          <h2>同じ誤答を減らすため、回答後にまず残すとよい情報はどれでしょう？</h2>
          <fieldset><legend className="sr-only">回答を選択</legend>{choices.map((item) => <label key={item.id} className={choice === item.id ? "selected" : ""}><input type="radio" name="guest-answer" value={item.id} checked={choice === item.id} onChange={() => selectChoice(item.id)} /><span>{item.label}</span><strong>{item.text}</strong></label>)}</fieldset>
          <div className="guest-confidence"><span>確信度</span><div>{[["explain", "説明できる"], ["probable", "たぶん"], ["guess", "勘"]].map(([value, label]) => <button key={value} type="button" className={confidence === value ? "selected" : ""} aria-pressed={confidence === value} onClick={() => setConfidence(value as typeof confidence)}>{label}</button>)}</div></div>
          <button className="button button-primary full" type="button" disabled={!choice} onClick={() => setSubmitted(true)}>回答を確認 <ArrowRight size={18} /></button>
          {submitted && <div className={`guest-result ${resultCorrect ? "correct" : "retry"}`} role="status">{resultCorrect ? <CheckCircle2 /> : <RefreshCw />}<div><strong>{resultCorrect ? "正解です。判断理由まで残すのがポイントです。" : "もう一歩です。正答はBです。"}</strong><p>正誤だけでなく、判断理由と確信度を記録すると「知識不足・制度混同・読み違い」など、次に直すべき原因を選べます。</p></div></div>}
        </article>
      </section>
      <section className="guest-cta"><div><p className="eyebrow light">READY TO CONTINUE?</p><h2>進捗を保存して、今日の続きから。</h2><p>登録すると、復習時期・誤答DNA・今日のミッションをあなた専用に組み立てます。</p></div><Link className="button button-light" to="/login?mode=register">無料で登録する <ArrowRight size={18} /></Link></section>
      <footer className="guest-footer"><Brand /><p>ゲストモードのデータは保存されません。</p></footer>
    </main>
  );
}

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function LoadingScreen() { return <div className="loading-screen"><Brand /><span className="spinner" /><p>学習データを準備しています</p></div>; }

function OnboardingPage() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ examYear: 2026, examExperience: "FIRST", dailyMinutes: 30, weekdayMinutes: 30, weekendMinutes: 60, strongSubjects: [] as string[], weakSubjects: ["行政法"] as string[], goal: "2026年度試験に合格する", preferredTime: "EVENING" });
  const [error, setError] = useState("");
  if (user?.onboardingCompleted) return <Navigate to="/app" replace />;
  const submit = async () => {
    try { await api("/api/onboarding", { method: "POST", body: JSON.stringify(form) }); if (user) setUser({ ...user, onboardingCompleted: true }); void navigate("/app"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "保存できませんでした。"); }
  };
  const subjects = ["行政法", "民法", "憲法", "基礎知識", "商法・会社法", "基礎法学"];
  return (
    <main id="main" className="onboarding-page">
      <header><Brand /><span>初期設定 <b>{step}</b> / 3</span></header>
      <div className="onboarding-progress"><i style={{ width: `${(step / 3) * 100}%` }} /></div>
      <section className="onboarding-card">
        {step === 1 && <><p className="eyebrow">YOUR EXAM</p><h1>受験スタイルを教えてください</h1><p>最初のミッション量と診断問題を調整します。</p><div className="choice-grid"><button className={form.examExperience === "FIRST" ? "selected" : ""} onClick={() => setForm({ ...form, examExperience: "FIRST" })}><GraduationCap />初受験<small>基礎から積み上げる</small></button><button className={form.examExperience === "RETRY" ? "selected" : ""} onClick={() => setForm({ ...form, examExperience: "RETRY" })}><RefreshCw />再受験<small>弱点から立て直す</small></button></div><label>1日に確保できる時間<div className="range-row"><input type="range" min="10" max="180" step="5" value={form.dailyMinutes} onChange={(e) => setForm({ ...form, dailyMinutes: Number(e.target.value), weekdayMinutes: Number(e.target.value) })} /><strong>{form.dailyMinutes}分</strong></div></label></>}
        {step === 2 && <><p className="eyebrow">SUBJECT MAP</p><h1>いまの得意・苦手は？</h1><p>苦手科目を優先しつつ、得点効率が偏らないように調整します。</p><h3>苦手に感じる科目</h3><div className="subject-chips">{subjects.map((subject) => <button key={subject} className={form.weakSubjects.includes(subject) ? "selected" : ""} onClick={() => setForm({ ...form, weakSubjects: form.weakSubjects.includes(subject) ? form.weakSubjects.filter((item) => item !== subject) : [...form.weakSubjects, subject] })}>{form.weakSubjects.includes(subject) && <Check size={15} />}{subject}</button>)}</div><label>目標<input value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} /></label></>}
        {step === 3 && <><p className="eyebrow">STUDY RHYTHM</p><h1>いつ学習しますか？</h1><p>無理なく戻れる時間帯にミッションを合わせます。</p><div className="choice-grid time-grid">{[["MORNING", "朝"], ["DAYTIME", "日中"], ["EVENING", "夕方"], ["NIGHT", "夜"], ["FLEXIBLE", "不定期"]].map(([value, label]) => <button key={value ?? "time"} className={form.preferredTime === value ? "selected" : ""} onClick={() => setForm({ ...form, preferredTime: value ?? "FLEXIBLE" })}><Clock3 />{label ?? ""}</button>)}</div><div className="diagnosis-note"><Target /><div><strong>次に15問の初回診断</strong><p>VERIFIED教材のみで診断します。教材準備中の場合、結果は到達度へ算入されません。</p></div></div></>}
        {error && <div className="form-error">{error}</div>}
        <div className="onboarding-actions">{step > 1 && <button className="button button-ghost" onClick={() => setStep(step - 1)}>戻る</button>}<button className="button button-primary" onClick={() => step < 3 ? setStep(step + 1) : void submit()}>{step < 3 ? "次へ" : "設定を完了"}<ArrowRight size={17} /></button></div>
      </section>
    </main>
  );
}

const navItems = [
  { to: "/app", label: "ホーム", icon: Home, end: true },
  { to: "/app/learn", label: "学習", icon: BookOpen },
  { to: "/app/questions", label: "問題", icon: FilePenLine },
  { to: "/app/teacher", label: "AI先生", icon: MessageSquareText },
  { to: "/app/progress", label: "成績", icon: BarChart3 },
];

function AppShell() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const logout = async () => { try { await api("/api/auth/logout", { method: "POST" }); } finally { setUser(null); void navigate("/"); } };
  return (
    <div className="app-layout">
      <aside className={menuOpen ? "app-sidebar open" : "app-sidebar"}>
        <div className="sidebar-brand"><Brand /><button aria-label="メニューを閉じる" onClick={() => setMenuOpen(false)}><X /></button></div>
        <nav aria-label="学習メニュー">{navItems.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} onClick={() => setMenuOpen(false)}><Icon size={20} /><span>{label}</span></NavLink>)}</nav>
        <div className="sidebar-extra"><NavLink to="/app/mock"><CalendarDays size={20} />模試</NavLink>{user?.role === "ADMIN" && <NavLink to="/app/admin"><Settings size={20} />管理</NavLink>}<InstallButton className="sidebar-install" /></div>
        <div className="sidebar-user"><span>{user?.email.slice(0, 1).toUpperCase()}</span><div><strong>{user?.email.split("@")[0]}</strong><small>{user?.role === "ADMIN" ? "管理者" : `${user?.examYear}年度受験`}</small></div><button aria-label="ログアウト" onClick={() => void logout()}><LogOut size={17} /></button></div>
      </aside>
      <div className="app-main">
        <header className="mobile-app-header"><button aria-label="メニューを開く" onClick={() => setMenuOpen(true)}><Menu /></button><Brand /><span className="avatar-mini">{user?.email.slice(0, 1).toUpperCase()}</span></header>
        <main id="main" className="app-content"><Routes><Route index element={<DashboardPage />} /><Route path="learn" element={<LearnPage />} /><Route path="questions" element={<QuestionsPage />} /><Route path="teacher" element={<TeacherPage />} /><Route path="progress" element={<ProgressPage />} /><Route path="mock" element={<MockPage />} /><Route path="admin" element={user?.role === "ADMIN" ? <AdminPage /> : <Navigate to="/app" />} /></Routes></main>
        <nav className="bottom-nav" aria-label="モバイルナビゲーション">{navItems.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end}><Icon size={20} /><span>{label}</span></NavLink>)}</nav>
      </div>
      {menuOpen && <button className="sidebar-scrim" aria-label="メニューを閉じる" onClick={() => setMenuOpen(false)} />}
    </div>
  );
}

function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-intro"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api<DashboardData>("/api/dashboard").then(setData).catch((cause) => setError(cause instanceof Error ? cause.message : "読み込めませんでした。")); }, []);
  if (!data && !error) return <PageSkeleton />;
  if (!data) return <EmptyState icon={<AlertTriangle />} title="ダッシュボードを読み込めません" text={error} />;
  const missionDone = data.mission.items.filter((item) => item.status === "DONE").length;
  return (
    <>
      <PageIntro eyebrow="GOOD MORNING" title="今日も、合格に近づく一日を。" description={`${data.exam.daysRemaining}日後の本試験に向け、今日の優先順位を組みました。`} action={<div className="exam-count"><span>本試験まで</span><strong>{data.exam.daysRemaining}</strong><small>days</small></div>} />
      {data.mission.comebackMode && <div className="comeback-banner"><Flame /><div><strong>3分で復帰モード</strong><p>空白を責めず、軽い復習から再開しましょう。</p></div></div>}
      <section className="dashboard-grid">
        <article className="mission-card">
          <div className="card-head"><div><span className="card-kicker">TODAY'S MISSION</span><h2>今日の合格ミッション</h2><p><Clock3 size={15} /> 約{data.mission.estimatedMinutes}分</p></div><div className="progress-circle" style={{ "--progress": `${data.mission.items.length ? (missionDone / data.mission.items.length) * 360 : 0}deg` } as React.CSSProperties}><div><strong>{missionDone}</strong><span>/ {data.mission.items.length}</span></div></div></div>
          <div className="mission-items">{data.mission.items.map((item, index) => <Link to={item.item_type === "LECTURE" ? "/app/learn" : item.item_type === "REVERSE_LECTURE" ? "/app/teacher" : item.item_type === "WRITING" ? "/app/questions?type=WRITING" : item.item_type === "ONE_WORD" ? "/app/questions?type=ONE_WORD_DIFF" : item.item_type === "TRANSFER" ? "/app/questions?type=TRANSFER" : "/app/questions"} key={item.id}><span className={item.status === "DONE" ? "done" : ""}>{item.status === "DONE" ? <Check size={15} /> : index + 1}</span><div><strong>{item.title}</strong><small>{item.item_type.replaceAll("_", " ")}</small></div><em>{item.estimated_minutes}分</em><ChevronRight size={17} /></Link>)}</div>
          <Link className="button button-primary full" to="/app/questions">ミッションを始める <ArrowRight size={18} /></Link>
        </article>
        <div className="dashboard-side">
          <article className="readiness-card"><div className="card-head compact"><div><span className="card-kicker">READINESS</span><h3>合格到達度</h3></div><small>{data.readiness.evidenceLevel}</small></div><div className="readiness-score"><strong>{data.readiness.score}</strong><span>%</span><div><i style={{ width: `${data.readiness.score}%` }} /></div></div><p>合格確率ではなく、確認済み学習実績から算出する到達指標です。</p><Link to="/app/progress">内訳を見る <ArrowRight size={15} /></Link></article>
          <div className="mini-stat-grid"><article><div className="stat-icon teal"><Target /></div><span>問題進捗</span><strong>{data.study.questionProgress.answeredQuestions}<small> / {data.study.questionProgress.totalQuestions}問</small></strong><small>残り {data.study.questionProgress.remainingQuestions}問</small></article><article><div className="stat-icon amber"><Gauge /></div><span>練習正答率</span><strong>{data.study.practiceAccuracy}%</strong><small>総回答 {data.study.practiceAttempts}回</small></article></div>
          <article className="forecast-card"><div><span className="card-kicker">FORGETTING FORECAST</span><h3>忘却予報</h3></div><div className="forecast-row"><span className="forecast-orb"><RefreshCw /></span><p><strong>{Math.max(0, data.mission.items.filter((item) => item.item_type === "REVIEW").length)}セット</strong><small>今日の復習対象</small></p><Link to="/app/questions"><ChevronRight /></Link></div></article>
          <article className="alert-card"><AlertTriangle /><div><span>高確信誤答</span><strong>{data.study.highConfidenceErrors}件</strong><p>確信して間違えたルールを優先修正</p></div><Link to="/app/questions"><ArrowRight /></Link></article>
        </div>
      </section>
      <section className="content-health"><div><h2>教材の品質状況</h2><p>合格到達度や模試にはVERIFIEDのみを使います。</p></div>{["VERIFIED", "REVIEWED", "DRAFT"].map((status) => <article key={status}><span className={`status-dot ${status.toLowerCase()}`} />{status}<strong>{data.content[status] ?? 0}</strong></article>)}</section>
    </>
  );
}

function LearnPage() {
  const { user } = useAuth();
  const [lectures, setLectures] = useState<LectureRecord[]>([]);
  const [selected, setSelected] = useState<LectureRecord | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showDraft, setShowDraft] = useState(false);
  const [completing, setCompleting] = useState(false);
  useEffect(() => {
    api<{ lectures: LectureRecord[] }>(`/api/lectures${showDraft ? "?includeDraft=true" : ""}`)
      .then((result) => setLectures(result.lectures))
      .catch((cause) => setError(cause instanceof Error ? cause.message : "読込失敗"));
  }, [showDraft]);
  const complete = async () => {
    if (!selected) return;
    setCompleting(true);
    setNotice("");
    try {
      await api(`/api/lectures/${selected.id}/complete`, { method: "POST" });
      setNotice("講義完了を記録し、今日のミッションへ反映しました。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "完了を記録できませんでした。");
    } finally {
      setCompleting(false);
    }
  };
  const sources = selected ? parseJsonArray<{ law: string; articles: string; referenceDate: string; url: string }>(selected.related_law_json) : [];
  return <>
    <PageIntro eyebrow="TEXT LEARNING LIBRARY" title="テキスト講義" description="32の必須学習目標を、5〜10分で読める根拠付きテキストで学びます。" action={user?.role === "ADMIN" && <label className="toggle-label"><input type="checkbox" checked={showDraft} onChange={(event) => setShowDraft(event.target.checked)} />DRAFTを表示</label>} />
    {error && <div className="form-error">{error}</div>}
    {selected && <section className="lecture-reader">
      <div className="lecture-reader-head"><div><span>{selected.subject_name} · {selected.topic_name}</span><h2>{selected.title}</h2></div><button aria-label="講義を閉じる" onClick={() => setSelected(null)}><X /></button></div>
      {selected.status !== "VERIFIED" && <div className="draft-warning"><AlertTriangle size={18} />出典と内容を照合したREVIEWED講義です。最終確認前のため合格到達度の根拠には使いません。</div>}
      <p className="lecture-body">{selected.explanation}</p>
      <div className="lecture-columns">
        <div><h3>押さえるポイント</h3><ul>{parseJsonArray<string>(selected.key_points_json).map((point) => <li key={point}>{point}</li>)}</ul></div>
        <div><h3>よくある間違い</h3><ul>{parseJsonArray<string>(selected.common_mistakes_json).map((mistake) => <li key={mistake}>{mistake}</li>)}</ul></div>
      </div>
      <div className="lecture-sources"><strong>根拠法令（2026年4月1日基準）</strong>{sources.map((source) => <a key={`${source.law}-${source.articles}`} href={source.url} target="_blank" rel="noreferrer">{source.law} {source.articles}<ArrowRight size={14} /></a>)}</div>
      {notice && <div className="completion-notice"><CheckCircle2 />{notice}</div>}
      <button className="button button-primary" disabled={completing} onClick={() => void complete()}>{completing ? "記録中…" : "このテキスト講義を完了する"}</button>
    </section>}
    {lectures.length === 0 ? <EmptyState icon={<Library />} title="テキスト講義を準備中です" text="レビュー済みテキスト講義が公開されると、ここから学べます。" /> : <div className="lecture-grid">{lectures.map((lecture) => <article key={lecture.id}><div className="lecture-meta"><span>{lecture.subject_name}</span><em className={`badge ${lecture.status.toLowerCase()}`}>{lecture.status}</em></div><h2>{lecture.title}</h2><p>{lecture.explanation}</p><div><Clock3 size={15} />{lecture.estimated_minutes}分</div><button className="button button-ghost" onClick={() => { setSelected(lecture); setNotice(""); window.scrollTo({ top: 0, behavior: "smooth" }); }}>テキストを読む <ArrowRight size={16} /></button></article>)}</div>}
  </>;
}

function QuestionProgressPanel({ progress, filterProgress }: { progress: QuestionProgress; filterProgress: QuestionProgress | null }) {
  return <section className="question-progress-panel" aria-label="問題バンク進捗">
    <div className="question-progress-head"><div><span className="card-kicker">QUESTION BANK PROGRESS</span><h2>全{progress.totalQuestions.toLocaleString("ja-JP")}問中、{progress.answeredQuestions.toLocaleString("ja-JP")}問を解答済み</h2></div><strong>{progress.completionRate}<small>%</small></strong></div>
    <div className="question-progress-track" role="progressbar" aria-label="問題バンク完了率" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.completionRate}><i style={{ width: `${progress.completionRate}%` }} /></div>
    <div className="question-progress-foot"><span>残り {progress.remainingQuestions.toLocaleString("ja-JP")}問</span><Link to="/app/progress">成績で詳しく見る <ArrowRight size={14} /></Link></div>
    {filterProgress && <p className="filter-progress">選択中の形式：{filterProgress.answeredQuestions} / {filterProgress.totalQuestions}問を解答済み</p>}
  </section>;
}

function QuestionsPage() {
  const { user } = useAuth();
  const location = useLocation();
  const requestedType = new URLSearchParams(location.search).get("type");
  const [question, setQuestion] = useState<Record<string, unknown> | null>(null);
  const [choice, setChoice] = useState("");
  const [writtenAnswer, setWrittenAnswer] = useState("");
  const [confidence, setConfidence] = useState<"EXPLAIN" | "PROBABLE" | "GUESS">("PROBABLE");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState("");
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [preview, setPreview] = useState(false);
  const [progress, setProgress] = useState<QuestionProgress | null>(null);
  const [filterProgress, setFilterProgress] = useState<QuestionProgress | null>(null);
  const load = useCallback(async () => {
    setResult(null); setChoice(""); setWrittenAnswer(""); setMessage(""); setStartedAt(Date.now());
    const params = new URLSearchParams();
    if (preview) params.set("preview", "true");
    if (requestedType) params.set("type", requestedType);
    try {
      const value = await api<{ question: Record<string, unknown>; progress: QuestionProgress; filterProgress: QuestionProgress | null }>(`/api/questions/next${params.size ? `?${params}` : ""}`);
      setQuestion(value.question);
      setProgress(value.progress);
      setFilterProgress(value.filterProgress);
    } catch (cause) {
      setQuestion(null);
      setMessage(cause instanceof Error ? cause.message : "問題を取得できませんでした。");
    }
  }, [preview, requestedType]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  const isWriting = question?.question_type === "WRITING";
  const submit = async () => {
    if (!question || (isWriting ? writtenAnswer.trim().length === 0 : !choice)) return;
    try {
      const value = await api<Record<string, unknown>>("/api/answers", { method: "POST", body: JSON.stringify({ questionId: question.id, selectedChoiceId: isWriting ? undefined : choice, writtenAnswer: isWriting ? writtenAnswer : undefined, confidence, elapsedMs: Date.now() - startedAt, hintUsed: false }) });
      setResult(value);
      const nextProgress = value.questionProgress as QuestionProgress | undefined;
      if (nextProgress) setProgress(nextProgress);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "回答を保存できませんでした。");
    }
  };
  const choices = (question?.choices as Array<{ id: string; body: string; choice_order: number }> | undefined) ?? [];
  const writingReview = result?.writingReview as WritingReview | null | undefined;
  return <>
    <PageIntro eyebrow="PRACTICE" title={requestedType === "WRITING" ? "40字記述" : "問題演習"} description="回答はすぐ練習成績へ反映。VERIFIED問題だけを合格到達度・診断・模試に使います。" action={user?.role === "ADMIN" && <label className="toggle-label"><input type="checkbox" checked={preview} onChange={(event) => setPreview(event.target.checked)} />DRAFTプレビュー</label>} />
    {progress && <QuestionProgressPanel progress={progress} filterProgress={filterProgress} />}
    {!question ? <EmptyState icon={<FilePenLine />} title="問題を準備中です" text={message || "レビュー済みの練習問題が公開されると、ここから学習できます。"} action={user?.role === "ADMIN" ? <button className="button button-ghost" onClick={() => setPreview(true)}>DRAFTを確認</button> : undefined} /> : <section className="question-card">
      <div className="question-meta"><span>{String(question.subject_name)} · {String(question.topic_name)}</span><span className={`badge ${String(question.status).toLowerCase()}`}>{String(question.status)}</span><em>{String(question.difficulty)}</em></div>
      <h2>{String(question.stem)}</h2>
      {question.status === "REVIEWED" && <div className="draft-warning"><AlertTriangle size={18} />練習成績には反映されます。最終確認前のため、合格到達度・診断・模試には算入されません。</div>}
      {question.status === "DRAFT" && <div className="draft-warning"><AlertTriangle size={18} />管理者プレビュー専用です。成績・到達度・診断・模試には算入されません。</div>}
      {isWriting ? <div className="writing-answer"><label htmlFor="writing-answer">40字程度で答案を入力</label><textarea id="writing-answer" value={writtenAnswer} onChange={(event) => setWrittenAnswer(event.target.value)} maxLength={80} placeholder="主体・要件・効果を意識して記述してください" /><span className={writtenAnswer.length >= 20 && writtenAnswer.length <= 60 ? "in-range" : ""}>{[...writtenAnswer].length}字 / 目安20〜60字</span></div> : <div className="choices">{choices.map((item) => <label key={item.id} className={choice === item.id ? "selected" : ""}><input type="radio" name="choice" value={item.id} checked={choice === item.id} onChange={() => setChoice(item.id)} /><span>{item.choice_order}</span><p>{item.body}</p></label>)}</div>}
      {!result && <><div className="confidence-block"><strong>この答えへの確信度</strong><div>{[["EXPLAIN", "根拠まで説明できる"], ["PROBABLE", "たぶん正しい"], ["GUESS", "勘・消去法"]].map(([value, label]) => <button key={value} className={confidence === value ? "selected" : ""} onClick={() => setConfidence(value as typeof confidence)}>{label}</button>)}</div></div><button className="button button-primary full" disabled={isWriting ? writtenAnswer.trim().length === 0 : !choice} onClick={() => void submit()}>回答を確定する</button></>}
      {result && <div className={result.correct ? "answer-result correct" : "answer-result incorrect"}><div className="result-title">{result.correct ? <CheckCircle2 /> : <AlertTriangle />}<h3>{result.correct ? (isWriting ? "採点基準を満たしました" : "正解") : (isWriting ? "必要な法的要素を補強しましょう" : "もう一度、判断の分岐を確認")}</h3></div><div className="score-scope"><CheckCircle2 />練習成績へ反映済み{!result.includedInReadiness && "（合格到達度とは分離）"}</div>{writingReview && <div className="writing-review"><strong>要素得点 {writingReview.score}%</strong><span>{writingReview.matchedGroups} / {writingReview.totalGroups} 要素 · {writingReview.charCount}字</span><p><b>模範解答</b>{writingReview.modelAnswer}</p><p><b>必要要素</b>{writingReview.requiredElements.join("・")}</p></div>}<p>{String(result.explanation)}</p>{Boolean(result.judgmentPoint) && <div className="judgment-point"><strong>今回の判断ポイント</strong><p>{String(result.judgmentPoint)}</p></div>}{Boolean(result.highConfidenceEmergency) && <div className="emergency"><AlertTriangle /><div><strong>高確信誤答救急室へ</strong><p>採用した判断ルールを保存し、比較・変形問題・翌日再テストへつなげました。</p></div></div>}<div className="result-actions"><button className="button button-ghost" onClick={() => void load()}>次の問題へ</button><Link className="button button-primary" to="/app/learn">関連テキスト講義で修復</Link></div></div>}
    </section>}
  </>;
}

function TeacherPage() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<{ answer: string; sourceTier: string; cached: boolean; sources: Array<{ title: string; url?: string }>; missionItemType: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ask = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setAnswer(null);
    try {
      setAnswer(await api("/api/ai/ask", { method: "POST", body: JSON.stringify({ question }) }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "質問できませんでした。");
    } finally {
      setBusy(false);
    }
  };
  const sourceLabel = answer?.sourceTier === "WORKERS_AI" ? "AI回答" : answer?.sourceTier === "LECTURE" ? "教材フォールバック" : answer?.sourceTier === "FAQ" ? "確認済みFAQ" : answer?.sourceTier === "CACHE" ? "回答キャッシュ" : "根拠不足";
  return <>
    <PageIntro eyebrow="GROUNDED AI TUTOR" title="AI先生" description="確認済み・レビュー済み教材を検索し、AIに接続できないときも教材から根拠付きで案内します。" />
    <section className="teacher-layout"><div className="teacher-chat">
      <div className="teacher-intro"><span><BrainCircuit /></span><div><h2>何を整理しますか？</h2><p>例：「取消訴訟と審査請求の違いは？」</p></div></div>
      {answer && <article className="ai-answer"><div className="answer-source"><span>{sourceLabel}</span>{answer.cached && <em>CACHE HIT</em>}</div><p>{answer.answer}</p>{answer.sources.length > 0 && <div className="source-list"><strong>参照した教材</strong>{answer.sources.map((source) => source.url ? <a key={source.title} href={source.url} target="_blank" rel="noreferrer">{source.title}<ArrowRight size={13} /></a> : <span key={source.title}>{source.title}</span>)}</div>}</article>}
      {answer?.missionItemType === "REVERSE_LECTURE" && <div className="completion-notice teacher-completion"><CheckCircle2 />AI反転講義のミッションを完了しました。</div>}
      {error && <div className="form-error">{error}</div>}
      <form className="teacher-form" onSubmit={(event) => void ask(event)}><label htmlFor="teacher-question" className="sr-only">AI先生への質問</label><textarea id="teacher-question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="制度名と知りたい点を具体的に入力…" maxLength={1000} /><button aria-label="質問を送信" disabled={busy || question.trim().length < 2}>{busy ? <span className="spinner small" /> : <ArrowRight />}</button></form>
    </div><aside className="ai-policy"><ShieldCheck /><h3>根拠優先の回答順</h3><ol>{["VERIFIED FAQ", "確認済み・レビュー済みテキスト講義", "確認済み回答キャッシュ", "Workers AI", "教材フォールバック"].map((item, index) => <li key={item}><span>{index + 1}</span>{item}</li>)}</ol><p>AI生成に接続できない場合も、関連教材の要点を表示して学習を継続できます。</p></aside></section>
  </>;
}

function ProgressPage() {
  const [data, setData] = useState<ProgressData | null>(null);
  useEffect(() => { api<ProgressData>("/api/progress").then(setData).catch(() => undefined); }, []);
  return <>
    <PageIntro eyebrow="LEARNING ANALYTICS" title="成績・到達度" description="日々の練習成績と、最終確認済み問題による合格到達度を分けて表示します。" />
    {!data ? <PageSkeleton /> : <>
      <div className="practice-summary"><article><span>解答済み</span><strong>{data.summary.answeredQuestions}<small> / {data.summary.totalQuestions}問</small></strong></article><article><span>問題進捗</span><strong>{data.summary.completionRate}<small>%</small></strong></article><article><span>残り</span><strong>{data.summary.remainingQuestions}<small>問</small></strong></article><article><span>総回答（復習含む）</span><strong>{data.summary.practiceAttempts}<small>回</small></strong></article><article><span>練習正答率</span><strong>{data.summary.practiceAccuracy}<small>%</small></strong></article><article><span>練習時間</span><strong>{data.summary.practiceMinutes}<small>分</small></strong></article></div>
      <div className="progress-layout">
        <section className="analytics-card"><h2>科目別・練習成績</h2>{data.practicePerformance.length === 0 ? <p className="muted">問題に回答すると、ここへすぐ反映されます。</p> : <div className="performance-list">{data.practicePerformance.map((item) => <div key={String(item.subject)}><span>{String(item.subject)}</span><i><b style={{ width: `${String(item.accuracy)}%` }} /></i><strong>{String(item.accuracy)}%</strong></div>)}</div>}<p className="scope-note">REVIEWED・VERIFIED問題を集計</p></section>
        <section className="analytics-card"><h2>合格到達度の確認データ</h2>{data.verifiedPerformance.length === 0 ? <p className="muted">VERIFIED問題の回答はまだありません。練習成績は左側に記録されています。</p> : <div className="performance-list">{data.verifiedPerformance.map((item) => <div key={String(item.subject)}><span>{String(item.subject)}</span><i><b style={{ width: `${String(item.accuracy)}%` }} /></i><strong>{String(item.accuracy)}%</strong></div>)}</div>}<p className="scope-note">模試・診断・合格到達度はVERIFIEDのみ</p></section>
        <section className="analytics-card wide"><h2>誤答DNA</h2>{data.errorDna.length === 0 ? <p className="muted">誤答原因の記録はまだありません。</p> : <div className="dna-tags">{data.errorDna.map((item) => <span key={String(item.error_code)}>{String(item.error_code)}<strong>{String(item.count)}</strong></span>)}</div>}</section>
        <section className="analytics-card wide"><h2>論点カバレッジ</h2><p>練習可能な論点と、最終確認済みの到達度対象を区別しています。</p><div className="coverage-grid">{data.coverage.map((item) => { const total = Number(item.objectives); const reviewed = Number(item.reviewed_covered); const verified = Number(item.verified_covered); const rate = total ? Math.round((reviewed / total) * 100) : 0; return <div key={String(item.subject)}><strong>{String(item.subject)}</strong><span>練習 {reviewed} / {total} · VERIFIED {verified}</span><i><b style={{ width: `${rate}%` }} /></i><em>{rate}%</em></div>; })}</div></section>
      </div>
    </>}
  </>;
}

function MockPage() {
  const [data, setData] = useState<{ exams: Array<Record<string, unknown>>; note: string | null } | null>(null); useEffect(() => { api<typeof data>("/api/mock-exams").then(setData).catch(() => undefined); }, []);
  return <><PageIntro eyebrow="EXAM MODE" title="模試" description="制限時間・見直し・未回答管理を含む、本番モードです。AIとヒントは利用できません。" />{!data || data.exams.length === 0 ? <EmptyState icon={<CalendarDays />} title="VERIFIED模試を準備中です" text={data?.note ?? "確認済み問題だけで構成できるまで公開しません。"} /> : <div className="mock-grid">{data.exams.map((exam) => <article key={String(exam.id)}><CalendarDays /><h2>{String(exam.title)}</h2><p>{String(exam.duration_minutes)}分</p><button className="button button-primary">模試を開始</button></article>)}</div>}</>;
}

function AdminPage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null); const [invite, setInvite] = useState(""); const [message, setMessage] = useState("");
  const load = useCallback(() => { api<Record<string, unknown>>("/api/admin/overview").then(setData).catch((cause) => setMessage(cause instanceof Error ? cause.message : "取得失敗")); }, []); useEffect(() => void load(), [load]);
  const createInvite = async () => { try { const result = await api<{ code: string }>("/api/admin/invitations", { method: "POST", body: JSON.stringify({ expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(), maxUses: 1 }) }); setInvite(result.code); } catch (cause) { setMessage(cause instanceof Error ? cause.message : "発行失敗"); } };
  if (!data) return <PageSkeleton />;
  const users = data.users as Record<string, unknown>; const content = data.content as { questionsByStatus: Array<Record<string, unknown>>; lectures: number; writingQuestions: number; coverage: Array<Record<string, unknown>> }; const aiData = data.ai as Record<string, unknown>;
  return <><PageIntro eyebrow="ADMIN CONSOLE" title="運用ダッシュボード" description="ユーザー、教材品質、学習、AI予算、年度設定を一元管理します。" action={<button className="button button-dark" onClick={() => void createInvite()}><KeyRound size={17} /> 招待コード発行</button>} />{invite && <div className="invite-result"><CheckCircle2 /><div><strong>招待コードを発行しました</strong><code>{invite}</code><p>この画面を閉じると再表示できません。</p></div></div>}{message && <div className="form-error">{message}</div>}<div className="admin-kpis"><article><UserRound /><span>登録ユーザー</span><strong>{String(Number(users.total ?? 0))}</strong><small>有効 {String(Number(users.active ?? 0))}</small></article><article><ShieldCheck /><span>VERIFIED</span><strong>{String(Number(content.questionsByStatus.find((item) => item.status === "VERIFIED")?.count ?? 0))}</strong><small>判定利用可能</small></article><article><Library /><span>テキスト講義</span><strong>{content.lectures}</strong><small>全ステータス</small></article><article><BrainCircuit /><span>AI requests</span><strong>{String(Number(aiData.requests ?? 0))}</strong><small>{String(Number(aiData.neurons ?? 0))} neurons</small></article></div><div className="admin-panels"><section className="analytics-card"><h2>問題ステータス</h2><div className="status-table">{["VERIFIED", "REVIEWED", "DRAFT"].map((status) => <div key={status}><span className={`status-dot ${status.toLowerCase()}`} />{status}<strong>{String(Number(content.questionsByStatus.find((item) => item.status === status)?.count ?? 0))}</strong></div>)}</div></section><section className="analytics-card"><h2>教材整備の注意</h2><div className="admin-warning"><AlertTriangle /><p>DRAFTを合格到達度・初回診断・模試へ使用しないでください。VERIFIED昇格には根拠・正答・選択肢解説の最終確認が必要です。</p></div></section></div></>;
}

function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) { return <section className="empty-state"><span>{icon}</span><h2>{title}</h2><p>{text}</p>{action}</section>; }
function PageSkeleton() { return <div className="page-skeleton"><div /><div /><div className="wide" /></div>; }

export default function App() {
  return <InstallProvider><AuthProvider><Routes><Route path="/" element={<LandingPage />} /><Route path="/login" element={<AuthPage />} /><Route path="/guest" element={<GuestPage />} /><Route path="/onboarding" element={<Protected><OnboardingPage /></Protected>} /><Route path="/app/*" element={<Protected><AppShell /></Protected>} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></AuthProvider></InstallProvider>;
}
