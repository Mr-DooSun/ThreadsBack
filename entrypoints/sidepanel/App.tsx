import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { browser } from 'wxt/browser';
import { analyzeRelationships } from '../../lib/diff';
import {
  ExportParseError,
  parseExportFiles,
  type ExportParseResult,
} from '../../lib/exportParser';
import {
  loadRelationshipStates,
  replaceSnapshotAccounts,
  resetRelationshipState,
  saveRelationshipState,
  toggleReviewedUsername,
} from '../../lib/storage';
import type {
  Account,
  RelationshipPlatform,
  StoredRelationshipState,
  StoredRelationshipStates,
} from '../../lib/types';
import { I18nProvider, useI18n, type Locale } from './i18n';

type ImportStatus = 'idle' | 'parsing' | 'ready' | 'error';
type Platform = RelationshipPlatform;
type ProfileOpenMode = 'currentTab' | 'newTab';
type ReviewUndoState = {
  username: string;
  label: string;
};

const HELP_LINKS = {
  accountsCenter:
    'https://accountscenter.instagram.com/info_and_permissions/dyi/',
};

// PayPal can be added later if a separate direct support link is needed.
const SUPPORT_LINKS = {
  koFi: 'https://ko-fi.com/mrdoosun',
  paypal: '',
};

const PLATFORM_STORAGE_KEY = 'wum.platform';
const PROFILE_OPEN_MODE_STORAGE_KEY = 'wum.profileOpenMode';
const DEFAULT_PLATFORM: Platform = 'threads';
const DEFAULT_PROFILE_OPEN_MODE: ProfileOpenMode = 'currentTab';
const APP_ICON_URL = browser.runtime.getURL('/icons/128.png');

function buildProfileUrl(username: string, platform: Platform): string {
  return platform === 'threads'
    ? `https://www.threads.net/@${username}`
    : `https://www.instagram.com/${username}`;
}

function detectInitialPlatform(): Platform {
  try {
    const stored = localStorage.getItem(PLATFORM_STORAGE_KEY);
    if (stored === 'threads' || stored === 'instagram') return stored;
  } catch {
    // ignore
  }
  return DEFAULT_PLATFORM;
}

function detectInitialProfileOpenMode(): ProfileOpenMode {
  try {
    const stored = localStorage.getItem(PROFILE_OPEN_MODE_STORAGE_KEY);
    if (stored === 'currentTab' || stored === 'newTab') return stored;
  } catch {
    // ignore
  }
  return DEFAULT_PROFILE_OPEN_MODE;
}

function detectPlatformFromFiles(paths: readonly string[]): Platform | null {
  const joined = paths.join('|').toLowerCase();
  if (joined.includes('threads') || joined.includes('your_threads')) {
    return 'threads';
  }
  if (joined.includes('instagram')) {
    return 'instagram';
  }
  if (joined.includes('connections/')) {
    return 'instagram';
  }
  return null;
}

function detectPlatformFromParseResult(result: ExportParseResult): Platform | null {
  const threadsHints = result.platformHints.filter(
    (hint) => hint === 'threads',
  ).length;
  const instagramHints = result.platformHints.filter(
    (hint) => hint === 'instagram',
  ).length;

  if (threadsHints > instagramHints) return 'threads';
  if (instagramHints > threadsHints) return 'instagram';

  const byFilePath = detectPlatformFromFiles(result.recognizedFiles);
  if (byFilePath) return byFilePath;

  const profileUrls = [...result.following, ...result.followers].map(
    (account) => account.profileUrl.toLowerCase(),
  );
  const threadsCount = profileUrls.filter((url) =>
    url.includes('threads.net/'),
  ).length;
  const instagramCount = profileUrls.filter((url) =>
    url.includes('instagram.com/'),
  ).length;

  if (threadsCount > instagramCount) return 'threads';
  if (instagramCount > threadsCount) return 'instagram';
  return null;
}

export default function App() {
  return (
    <I18nProvider>
      <AppShell />
    </I18nProvider>
  );
}

function AppShell() {
  const { t, locale } = useI18n();
  const [states, setStates] = useState<StoredRelationshipStates | null>(null);
  const [importStatus, setImportStatus] = useState<ImportStatus>('idle');
  const [parseResult, setParseResult] = useState<ExportParseResult | null>(null);
  const [parsePlatform, setParsePlatform] = useState<Platform | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reviewUndo, setReviewUndo] = useState<ReviewUndoState | null>(null);
  const [showHowTo, setShowHowTo] = useState(false);
  const [reuploadOpen, setReuploadOpen] = useState(false);
  const [platform, setPlatformState] = useState<Platform>(detectInitialPlatform);
  const [profileOpenMode, setProfileOpenModeState] =
    useState<ProfileOpenMode>(detectInitialProfileOpenMode);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const parseRunRef = useRef(0);
  const state = states?.[platform] ?? null;

  const analysis = useMemo(
    () => (state ? analyzeRelationships(state) : null),
    [state],
  );

  useEffect(() => {
    document.title = t.app.name;
    document.documentElement.lang = locale;
  }, [locale, t.app.name]);

  useEffect(() => {
    void loadRelationshipStates(detectInitialPlatform())
      .then(setStates)
      .catch((loadError: unknown) => {
        setError(
          loadError instanceof Error ? loadError.message : t.notice.loadError,
        );
      });
  }, [t.notice.loadError]);

  function setPlatform(next: Platform) {
    setPlatformState(next);
    try {
      localStorage.setItem(PLATFORM_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }

  function resetImportDraft() {
    parseRunRef.current += 1;
    setParseResult(null);
    setParsePlatform(null);
    setImportStatus('idle');
    setError(null);
    setNotice(null);
    setReviewUndo(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function handlePlatformChange(next: Platform) {
    if (next === platform) return;

    setPlatform(next);
    resetImportDraft();
    setReuploadOpen(false);
  }

  function setProfileOpenMode(next: ProfileOpenMode) {
    setProfileOpenModeState(next);
    try {
      localStorage.setItem(PROFILE_OPEN_MODE_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }

  function updateRelationshipState(
    targetPlatform: Platform,
    nextState: StoredRelationshipState,
  ) {
    setStates((currentStates) =>
      currentStates
        ? {
            ...currentStates,
            [targetPlatform]: nextState,
          }
        : currentStates,
    );
  }

  async function handleFileChange(files: FileList | null) {
    const selectedFiles = files ? [...files] : [];
    resetImportDraft();

    if (selectedFiles.length === 0) {
      return;
    }

    const parseRun = parseRunRef.current + 1;
    parseRunRef.current = parseRun;
    setImportStatus('parsing');

    try {
      const selectedPlatform = platform;
      const result = await parseExportFiles(selectedFiles, {
        preferredPlatform: selectedPlatform,
      });
      if (parseRun !== parseRunRef.current) return;

      const detected = detectPlatformFromParseResult(result);
      const targetPlatform = detected ?? selectedPlatform;
      setParseResult(result);
      setParsePlatform(targetPlatform);
      setImportStatus('ready');

      if (detected) {
        setPlatform(detected);
      }

      setNotice(t.notice.filesParsed);
    } catch (parseError) {
      if (parseRun !== parseRunRef.current) return;

      setImportStatus('error');
      setParsePlatform(null);
      setError(
        parseError instanceof ExportParseError || parseError instanceof Error
          ? parseError.message
          : t.notice.parseError,
      );
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  async function applyParseResult() {
    if (!states || !parseResult) return;

    const targetPlatform = parsePlatform ?? platform;
    const nextState = replaceSnapshotAccounts(states[targetPlatform], {
      following:
        parseResult.following.length > 0 ? parseResult.following : undefined,
      followers:
        parseResult.followers.length > 0 ? parseResult.followers : undefined,
    });

    await saveRelationshipState(targetPlatform, nextState);
    updateRelationshipState(targetPlatform, nextState);
    if (targetPlatform !== platform) {
      setPlatform(targetPlatform);
    }
    resetImportDraft();
    setReuploadOpen(false);
    setNotice(t.notice.applied);
  }

  function clearParseResult() {
    resetImportDraft();
  }

  async function markReviewed(account: Account) {
    if (!state) return;

    const nextState = toggleReviewedUsername(state, account.username);
    await saveRelationshipState(platform, nextState);
    updateRelationshipState(platform, nextState);
    setNotice(null);
    setReviewUndo({
      username: account.username,
      label: account.displayName || `@${account.username}`,
    });
  }

  async function undoReviewed(username: string) {
    if (!state) return;

    const nextState = toggleReviewedUsername(state, username);
    await saveRelationshipState(platform, nextState);
    updateRelationshipState(platform, nextState);
    setReviewUndo(null);
  }

  async function resetAll() {
    if (!window.confirm(t.header.resetConfirm)) return;

    const nextState = await resetRelationshipState(platform);
    updateRelationshipState(platform, nextState);
    resetImportDraft();
    setReuploadOpen(false);
    setNotice(t.notice.reset);
  }

  if (!states || !state || !analysis) {
    return (
      <main
        data-theme={platform}
        className="themed-bg flex min-h-screen w-full items-center justify-center"
      >
        <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-current opacity-40" />
      </main>
    );
  }

  const hasData = state.following.length > 0 && state.followers.length > 0;

  return (
    <main
      data-theme={platform}
      className="themed-bg min-h-screen w-full text-strong transition-colors"
    >
      <Header />
      {hasData ? (
        <ReviewControlBar
          platform={platform}
          onPlatformChange={handlePlatformChange}
          profileOpenMode={profileOpenMode}
          onProfileOpenModeChange={setProfileOpenMode}
        />
      ) : (
        <PlatformTabs platform={platform} onChange={handlePlatformChange} />
      )}

      {(error || notice) && (
        <section className="px-4 pt-3">
          {notice && (
            <Toast tone="success" onDismiss={() => setNotice(null)}>
              {notice}
            </Toast>
          )}
          {reviewUndo && (
            <Toast tone="success" onDismiss={() => setReviewUndo(null)}>
              <span>{t.result.reviewedToast(reviewUndo.label)}</span>
              <button
                type="button"
                onClick={() => void undoReviewed(reviewUndo.username)}
                className="ml-2 rounded-md px-1.5 py-0.5 font-bold underline-offset-2 hover:underline"
              >
                {t.result.reviewUndo}
              </button>
            </Toast>
          )}
          {error && (
            <Toast tone="error" onDismiss={() => setError(null)}>
              {error}
            </Toast>
          )}
        </section>
      )}

      {!hasData ? (
        <UploadView
          state={state}
          platform={platform}
          status={importStatus}
          parseResult={parseResult}
          error={error}
          showHowTo={showHowTo}
          onToggleHowTo={() => setShowHowTo((prev) => !prev)}
          inputRef={fileInputRef}
          onFilesSelected={(files) => void handleFileChange(files)}
          onApply={() => void applyParseResult()}
          onClear={clearParseResult}
        />
      ) : (
        <ResultsView
          analysis={analysis}
          profileOpenMode={profileOpenMode}
          reuploadOpen={reuploadOpen}
          onToggleReupload={() => setReuploadOpen((prev) => !prev)}
          status={importStatus}
          parseResult={parseResult}
          error={error}
          inputRef={fileInputRef}
          onFilesSelected={(files) => void handleFileChange(files)}
          onApply={() => void applyParseResult()}
          onClear={clearParseResult}
          onMarkReviewed={(account) => void markReviewed(account)}
          onReset={() => void resetAll()}
          platform={platform}
        />
      )}
    </main>
  );
}

function Header() {
  const { t, locale, setLocale } = useI18n();

  return (
    <header className="sticky top-0 z-10 themed-elevated border-b themed-border px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex items-center gap-2">
          <div
            aria-hidden
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          >
            <img
              src={APP_ICON_URL}
              alt=""
              className="h-8 w-8 rounded-lg"
            />
          </div>
          <h1 className="truncate text-lg font-bold tracking-tight brand-title">
            {t.app.name}
          </h1>
        </div>
        <LanguageToggle locale={locale} onChange={setLocale} />
      </div>
    </header>
  );
}

function PlatformTabs({
  platform,
  onChange,
  embedded = false,
}: {
  platform: Platform;
  onChange: (next: Platform) => void;
  embedded?: boolean;
}) {
  return (
    <nav className={embedded ? '' : 'px-4 pt-3'}>
      <div
        role="group"
        aria-label="Platform"
        className="platform-tabs grid grid-cols-2 gap-1.5 rounded-2xl p-1"
      >
        <PlatformTab
          active={platform === 'threads'}
          onClick={() => onChange('threads')}
        >
          Threads
        </PlatformTab>
        <PlatformTab
          active={platform === 'instagram'}
          onClick={() => onChange('instagram')}
        >
          Instagram
        </PlatformTab>
      </div>
    </nav>
  );
}

function ReviewControlBar({
  platform,
  onPlatformChange,
  profileOpenMode,
  onProfileOpenModeChange,
}: {
  platform: Platform;
  onPlatformChange: (next: Platform) => void;
  profileOpenMode: ProfileOpenMode;
  onProfileOpenModeChange: (next: ProfileOpenMode) => void;
}) {
  return (
    <section className="themed-bg sticky top-14 z-10 space-y-2 px-4 pb-3 pt-3">
      <PlatformTabs platform={platform} onChange={onPlatformChange} embedded />
      <ProfileOpenModeControl
        mode={profileOpenMode}
        onChange={onProfileOpenModeChange}
      />
    </section>
  );
}

function PlatformTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`platform-tab rounded-xl px-3 py-2 text-xs font-semibold tracking-wide transition-all ${
        active ? 'is-active' : ''
      }`}
    >
      <span className="platform-tab-dot" aria-hidden />
      {children}
    </button>
  );
}

function LanguageToggle({
  locale,
  onChange,
}: {
  locale: Locale;
  onChange: (next: Locale) => void;
}) {
  const { t } = useI18n();

  return (
    <div
      role="group"
      aria-label={t.header.languageToggle}
      className="inline-flex shrink-0 overflow-hidden rounded-full themed-border border bg-[var(--bg-soft)] p-0.5 text-[11px] font-semibold tracking-wide"
    >
      <LangButton active={locale === 'ko'} onClick={() => onChange('ko')}>
        한
      </LangButton>
      <LangButton active={locale === 'en'} onClick={() => onChange('en')}>
        EN
      </LangButton>
      <LangButton active={locale === 'ja'} onClick={() => onChange('ja')}>
        日
      </LangButton>
    </div>
  );
}

function LangButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? 'min-w-[2rem] rounded-full bg-[var(--text-strong)] px-2.5 py-1 text-[var(--bg-page)] transition-colors'
          : 'min-w-[2rem] rounded-full px-2.5 py-1 text-muted transition-colors hover:text-strong'
      }
    >
      {children}
    </button>
  );
}

function UploadView({
  state,
  platform,
  status,
  parseResult,
  error,
  showHowTo,
  onToggleHowTo,
  inputRef,
  onFilesSelected,
  onApply,
  onClear,
}: {
  state: StoredRelationshipState;
  platform: Platform;
  status: ImportStatus;
  parseResult: ExportParseResult | null;
  error: string | null;
  showHowTo: boolean;
  onToggleHowTo: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
  onFilesSelected: (files: FileList | null) => void;
  onApply: () => void;
  onClear: () => void;
}) {
  const { t } = useI18n();

  return (
    <section className="space-y-5 px-4 pb-8 pt-5">
      <div className="text-center">
        <HeroIcon />
        <h2 className="mt-4 text-lg font-semibold tracking-tight text-strong">
          {t.upload.heroTitle}
        </h2>
        <p className="mx-auto mt-1.5 max-w-[18rem] text-xs leading-relaxed text-muted">
          {t.upload.heroSubtitle}
        </p>
      </div>

      <SafetyNote />

      <UploadDropzone
        status={status}
        inputRef={inputRef}
        onFilesSelected={onFilesSelected}
      />

      {error && <InlineError>{error}</InlineError>}

      {(state.following.length > 0 || state.followers.length > 0) && (
        <div className="rounded-xl border tone-warning p-3 text-[11px] leading-relaxed">
          <p className="font-medium">{t.upload.needBoth}</p>
          <ul className="tone-warning-soft mt-1 space-y-0.5">
            {state.following.length > 0 && (
              <li>· {t.upload.haveFollowing(state.following.length)}</li>
            )}
            {state.followers.length > 0 && (
              <li>· {t.upload.haveFollowers(state.followers.length)}</li>
            )}
          </ul>
        </div>
      )}

      {parseResult && (
        <ParseSummary
          result={parseResult}
          onApply={onApply}
          onClear={onClear}
          status={status}
        />
      )}

      <HowToBlock
        open={showHowTo}
        platform={platform}
        onToggle={onToggleHowTo}
      />

      <p className="text-center text-[11px] text-subtle">
        {t.upload.privacyNote}
      </p>
    </section>
  );
}

function SafetyNote() {
  const { t } = useI18n();

  return (
    <section className="rounded-2xl border themed-border bg-[var(--accent-soft-bg)] p-4">
      <h3 className="text-sm font-semibold text-strong">
        {t.upload.safetyTitle}
      </h3>
      <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-muted">
        {t.upload.safetyItems.map((item) => (
          <li key={item} className="flex gap-2">
            <span
              aria-hidden
              className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-50"
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SupportCta() {
  const { t } = useI18n();
  const hasSupportLink = Boolean(SUPPORT_LINKS.koFi || SUPPORT_LINKS.paypal);

  if (!hasSupportLink) return null;

  return (
    <section className="rounded-2xl border themed-border bg-[var(--bg-soft)] p-3">
      <div className="space-y-1 text-center">
        <p className="text-xs font-semibold text-strong">
          {t.support.ctaTitle}
        </p>
        <p className="mx-auto max-w-[18rem] text-[11px] leading-relaxed text-muted">
          {t.support.ctaBody}
        </p>
      </div>
      <div className="grid gap-2">
        {SUPPORT_LINKS.koFi && (
          <SupportLinkButton url={SUPPORT_LINKS.koFi} className="mt-3">
            {t.support.koFiButton}
          </SupportLinkButton>
        )}
        {SUPPORT_LINKS.paypal && (
          <SupportLinkButton
            url={SUPPORT_LINKS.paypal}
            className="mt-3"
            secondary
          >
            {t.support.paypalButton}
          </SupportLinkButton>
        )}
      </div>
      <p className="mt-2 text-center text-[10px] leading-relaxed text-subtle">
        {t.support.optionalNote}
      </p>
    </section>
  );
}

function SupportLinkButton({
  url,
  className = '',
  secondary = false,
  children,
}: {
  url: string;
  className?: string;
  secondary?: boolean;
  children: ReactNode;
}) {
  const isAvailable = url.length > 0;

  function openSupportLink() {
    if (!isAvailable) return;
    void browser.tabs.create({ url });
  }

  return (
    <button
      type="button"
      onClick={openSupportLink}
      disabled={!isAvailable}
      className={
        'flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold shadow-sm transition-all disabled:cursor-not-allowed disabled:opacity-45 ' +
        (secondary
          ? 'themed-card border themed-border text-default hover:shadow-md'
          : 'btn-primary hover:shadow-md') +
        (className ? ` ${className}` : '')
      }
    >
      <span>{children}</span>
      {isAvailable && <ExternalLinkIcon />}
    </button>
  );
}

function HeroIcon() {
  return (
    <img
      aria-hidden
      src={APP_ICON_URL}
      alt=""
      className="mx-auto h-14 w-14 rounded-2xl shadow-lg"
    />
  );
}

function ResultsView({
  analysis,
  profileOpenMode,
  reuploadOpen,
  onToggleReupload,
  status,
  parseResult,
  error,
  inputRef,
  onFilesSelected,
  onApply,
  onClear,
  onMarkReviewed,
  onReset,
  platform,
}: {
  analysis: NonNullable<ReturnType<typeof analyzeRelationships>>;
  profileOpenMode: ProfileOpenMode;
  reuploadOpen: boolean;
  onToggleReupload: () => void;
  status: ImportStatus;
  parseResult: ExportParseResult | null;
  error: string | null;
  inputRef: RefObject<HTMLInputElement | null>;
  onFilesSelected: (files: FileList | null) => void;
  onApply: () => void;
  onClear: () => void;
  onMarkReviewed: (account: Account) => void;
  onReset: () => void;
  platform: Platform;
}) {
  const { t } = useI18n();
  const reviewCount = analysis.reviewAccounts.length;

  return (
    <section className="space-y-4 px-4 pb-8 pt-4">
      <HeroStat count={reviewCount} />

      <p className="rounded-xl border themed-border bg-[var(--bg-soft)] px-3 py-2 text-[11px] leading-relaxed text-muted">
        {t.result.safetyNote}
      </p>

      {reviewCount === 0 ? (
        <ZeroState reviewed={analysis.notFollowingBack.length > 0} />
      ) : (
        <ul className="space-y-3">
          {analysis.reviewAccounts.map((account) => (
            <AccountRow
              key={account.username}
              account={account}
              platform={platform}
              profileOpenMode={profileOpenMode}
              onMarkReviewed={onMarkReviewed}
            />
          ))}
        </ul>
      )}

      {analysis.hiddenCount > 0 && (
        <p className="text-center text-[11px] text-subtle">
          {t.result.hiddenSummary(analysis.hiddenCount)}
        </p>
      )}

      <Disclosure
        label={t.result.reupload}
        open={reuploadOpen}
        onToggle={onToggleReupload}
      >
        <div className="space-y-3 p-3">
          <UploadDropzone
            status={status}
            inputRef={inputRef}
            onFilesSelected={onFilesSelected}
            compact
          />
          {error && <InlineError>{error}</InlineError>}
          {parseResult && (
            <ParseSummary
              result={parseResult}
              onApply={onApply}
              onClear={onClear}
              status={status}
            />
          )}
        </div>
      </Disclosure>

      <SupportCta />

      <div className="pt-2 text-center">
        <button
          type="button"
          onClick={onReset}
          className="tone-danger-link rounded-md px-2 py-1 text-[11px] font-medium transition-colors"
        >
          {t.result.resetData}
        </button>
      </div>
    </section>
  );
}

function ProfileOpenModeControl({
  mode,
  onChange,
}: {
  mode: ProfileOpenMode;
  onChange: (next: ProfileOpenMode) => void;
}) {
  const { t } = useI18n();

  return (
    <section className="themed-card rounded-2xl border p-3 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[11px] font-semibold text-muted">
          {t.result.profileOpenModeLabel}
        </p>
        <div
          role="group"
          aria-label={t.result.profileOpenModeLabel}
          className="grid grid-cols-2 gap-1 rounded-full themed-soft p-1 text-[11px] font-semibold"
        >
          <ModeButton
            active={mode === 'currentTab'}
            onClick={() => onChange('currentTab')}
          >
            {t.result.profileOpenCurrentTab}
          </ModeButton>
          <ModeButton active={mode === 'newTab'} onClick={() => onChange('newTab')}>
            {t.result.profileOpenNewTab}
          </ModeButton>
        </div>
      </div>
    </section>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        'rounded-full px-3 py-1.5 transition-all ' +
        (active ? 'tab-active shadow-sm' : 'text-muted hover:text-strong')
      }
    >
      {children}
    </button>
  );
}

function HeroStat({ count }: { count: number }) {
  const { t } = useI18n();

  return (
    <div className="themed-card overflow-hidden rounded-2xl border p-5 shadow-sm">
      <div className="text-center">
        <p
          className="hero-number text-5xl font-bold tracking-tight tabular-nums"
          aria-label={`${count} ${t.result.statLabel}`}
        >
          {count.toLocaleString()}
        </p>
        <p className="mt-2 text-sm font-semibold text-strong">
          {t.result.statLabel}
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">
          {t.result.statHint}
        </p>
      </div>
    </div>
  );
}

function ZeroState({ reviewed }: { reviewed: boolean }) {
  const { t } = useI18n();
  const title = reviewed ? t.result.zeroReviewedTitle : t.result.zeroTitle;
  const body = reviewed ? t.result.zeroReviewedBody : t.result.zeroBody;

  return (
    <div className="rounded-2xl border tone-success p-6 text-center">
      <div className="tone-success mx-auto flex h-12 w-12 items-center justify-center rounded-full border-0 bg-[var(--success-bg)]">
        <svg
          viewBox="0 0 24 24"
          className="h-6 w-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="m5 12 5 5L20 7" />
        </svg>
      </div>
      <p className="mt-3 text-sm font-semibold">{title}</p>
      <p className="tone-success-soft mt-1 text-[11px]">{body}</p>
    </div>
  );
}

function UploadDropzone({
  status,
  inputRef,
  onFilesSelected,
  compact = false,
}: {
  status: ImportStatus;
  inputRef: RefObject<HTMLInputElement | null>;
  onFilesSelected: (files: FileList | null) => void;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const isParsing = status === 'parsing';
  const [isDragActive, setIsDragActive] = useState(false);

  function handleDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (isParsing) return;

    event.dataTransfer.dropEffect = 'copy';
    setIsDragActive(true);
  }

  function handleDragLeave(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragActive(false);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragActive(false);

    if (isParsing) return;
    onFilesSelected(event.dataTransfer.files);
  }

  return (
    <label
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={
        (compact
          ? 'themed-card flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-4 text-sm transition-colors '
          : 'themed-card flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed px-4 py-8 text-center shadow-sm transition-colors ') +
        'surface-hover ' +
        (isDragActive ? 'themed-border-strong bg-[var(--accent-soft-bg)] ' : '') +
        (isParsing ? 'pointer-events-none opacity-60' : '')
      }
    >
      <span className="text-sm font-semibold text-strong">
        {isParsing
          ? statusLabel(status, t)
          : isDragActive
            ? t.upload.dropActive
            : t.upload.selectButton}
      </span>
      {!compact && !isParsing && (
        <span className="text-[11px] text-muted">
          {isDragActive ? t.upload.dropActive : t.upload.dropHere}
        </span>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".zip,.json,.html,.htm,application/zip,application/json,text/html"
        multiple
        className="sr-only"
        onChange={(event) => onFilesSelected(event.currentTarget.files)}
      />
    </label>
  );
}

function ParseSummary({
  result,
  onApply,
  onClear,
  status,
}: {
  result: ExportParseResult;
  onApply: () => void;
  onClear: () => void;
  status: ImportStatus;
}) {
  const { t } = useI18n();
  const canApply =
    status === 'ready' &&
    (result.following.length > 0 || result.followers.length > 0);

  return (
    <div className="themed-card rounded-2xl border p-4 shadow-sm">
      <div className="grid grid-cols-2 gap-3 text-center">
        <Stat label={t.upload.parsedFollowing} value={result.following.length} />
        <Stat label={t.upload.parsedFollowers} value={result.followers.length} />
      </div>

      <FileSummary
        title={t.upload.recognized}
        files={result.recognizedFiles}
        emptyText={t.upload.noRecognized}
      />

      {result.skippedFiles.length > 0 && (
        <div className="mt-3">
          <h3 className="text-[11px] font-semibold text-default">
            {t.upload.skipped}
          </h3>
          <ul className="mt-1.5 max-h-24 space-y-0.5 overflow-y-auto text-[11px] text-muted">
            {result.skippedFiles.map((file) => (
              <li key={`${file.name}:${file.reason}`}>
                {file.name} — {file.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] gap-2">
        <button
          type="button"
          onClick={onClear}
          className="rounded-xl border themed-border bg-[var(--bg-soft)] px-3 py-2.5 text-sm font-semibold text-default transition-colors hover:bg-[var(--bg-page)]"
        >
          {t.upload.clearSelection}
        </button>
        <button
          type="button"
          onClick={onApply}
          disabled={!canApply}
          className="btn-primary rounded-xl px-3 py-2.5 text-sm font-semibold shadow-sm transition-all hover:shadow-md disabled:cursor-not-allowed disabled:opacity-55"
        >
          {t.upload.applyButton}
        </button>
      </div>
    </div>
  );
}

function HowToBlock({
  open,
  platform,
  onToggle,
}: {
  open: boolean;
  platform: Platform;
  onToggle: () => void;
}) {
  const { t } = useI18n();

  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="themed-card surface-hover flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-xs font-semibold text-default shadow-sm transition-colors"
      >
        <span>{t.upload.howToTitle}</span>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
          {t.upload.howToOpen}
          <ExternalLinkIcon />
        </span>
      </button>

      {open && <HowToModal platform={platform} onClose={onToggle} />}
    </>
  );
}

function HowToModal({
  platform,
  onClose,
}: {
  platform: Platform;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [activeStep, setActiveStep] = useState(0);
  const steps = t.upload.howToSteps[platform];
  const totalSteps = steps.length;
  const isFirstStep = activeStep === 0;
  const isLastStep = activeStep === totalSteps - 1;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft') {
        setActiveStep((prev) => Math.max(prev - 1, 0));
      }
      if (event.key === 'ArrowRight') {
        setActiveStep((prev) => Math.min(prev + 1, totalSteps - 1));
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, totalSteps]);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-30 flex items-stretch justify-center overflow-hidden bg-black/55 px-3 py-3 backdrop-blur-sm sm:items-center sm:py-4"
      role="presentation"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="how-to-title"
        className="themed-elevated my-auto flex max-h-[calc(100dvh-1.5rem)] w-full flex-col overflow-hidden rounded-2xl border themed-border shadow-2xl sm:max-h-[calc(100dvh-2rem)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shrink-0 flex items-start justify-between gap-3 border-b themed-border px-4 py-3">
          <div className="min-w-0">
            <h2 id="how-to-title" className="text-sm font-semibold text-strong">
              {t.upload.howToTitle}
            </h2>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">
              {t.upload.howToIntro}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.upload.howToClose}
            className="surface-hover -mr-1 shrink-0 rounded-full px-2 py-1 text-lg leading-none text-muted transition-colors hover:text-strong"
          >
            ×
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
          <div className="guide-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
            <div className="guide-slide-viewport">
              <div
                className="flex transition-transform duration-200 ease-out"
                style={{ transform: `translateX(-${activeStep * 100}%)` }}
              >
                {steps.map((step, index) => (
                  <div
                    key={`${platform}-${step.title}`}
                    className="w-full shrink-0 pr-2"
                  >
                    <GuideStep step={step} index={index} totalSteps={totalSteps} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="guide-cta shrink-0 rounded-xl border p-3">
            <div className="flex items-start gap-3">
              <div className="brand-tile flex h-8 w-8 shrink-0 items-center justify-center rounded-xl">
                <ExternalLinkIcon className="h-4 w-4 text-current" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-strong">
                  Meta Accounts Center
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
                  {t.upload.accountsCenterExportHint}
                </p>
              </div>
            </div>
            <LinkButton
              url={HELP_LINKS.accountsCenter}
              primary
              centered
              className="mt-3 w-full rounded-xl py-2.5 text-sm font-semibold"
            >
              {t.upload.accountsCenterExport}
            </LinkButton>
          </div>

          <div className="shrink-0 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setActiveStep((prev) => Math.max(prev - 1, 0))}
              disabled={isFirstStep}
              className="themed-card surface-hover rounded-lg border px-3 py-2 text-xs font-semibold text-default transition-colors disabled:pointer-events-none disabled:opacity-35"
            >
              {t.upload.howToPrev}
            </button>

            <div className="flex items-center gap-1.5">
              {steps.map((step, index) => (
                <button
                  key={`${platform}-${step.title}`}
                  type="button"
                  aria-label={t.upload.howToStepCount(index + 1, totalSteps)}
                  onClick={() => setActiveStep(index)}
                  className={
                    'h-1.5 rounded-full transition-all ' +
                    (index === activeStep
                      ? 'w-5 bg-[var(--text-strong)]'
                      : 'w-1.5 bg-[var(--text-subtle)] opacity-45')
                  }
                />
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                if (isLastStep) {
                  onClose();
                  return;
                }
                setActiveStep((prev) => Math.min(prev + 1, totalSteps - 1));
              }}
              className="btn-primary rounded-lg border border-transparent px-3 py-2 text-xs font-semibold shadow-sm transition-all hover:shadow-md"
            >
              {isLastStep ? t.upload.howToDone : t.upload.howToNext}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function GuideStep({
  step,
  index,
  totalSteps,
}: {
  step: ReturnType<typeof useI18n>['t']['upload']['howToSteps'][Platform][number];
  index: number;
  totalSteps: number;
}) {
  const { t } = useI18n();

  return (
    <article className="overflow-hidden rounded-xl border themed-border bg-[var(--bg-soft)]">
      <div className="space-y-3 p-3">
        <div className="flex items-start gap-3">
          <div className="brand-tile flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums">
            {index + 1}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-subtle">
              {t.upload.howToStepCount(index + 1, totalSteps)}
            </p>
            <h3 className="mt-0.5 text-sm font-semibold text-strong">
              {step.title}
            </h3>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">
              {step.body}
            </p>
            {step.importantNote && (
              <p className="tone-warning mt-2 rounded-lg border px-2.5 py-2 text-[11px] font-semibold leading-relaxed">
                {step.importantNote}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <GuidePreview
            title={step.previewTitle}
            items={step.previewItems}
            activeIndex={step.previewActiveIndex}
            kind={step.previewKind}
          />
        </div>
      </div>
    </article>
  );
}

function GuidePreview({
  title,
  items,
  activeIndex,
  kind,
}: {
  title: string;
  items: readonly string[];
  activeIndex: number;
  kind:
    | 'exportHome'
    | 'profile'
    | 'destination'
    | 'confirm'
    | 'customizeInstagram'
    | 'customizeThreads'
    | 'ready';
}) {
  if (kind === 'exportHome') {
    return (
      <MetaExportHomePreview
        title={title}
        items={items}
        activeIndex={activeIndex}
      />
    );
  }

  if (kind === 'profile') {
    return (
      <MetaProfilePreview
        title={title}
        items={items}
        activeIndex={activeIndex}
      />
    );
  }

  if (kind === 'destination') {
    return (
      <MetaDestinationPreview
        title={title}
        items={items}
        activeIndex={activeIndex}
      />
    );
  }

  if (kind === 'confirm') {
    return (
      <MetaConfirmPreview
        title={title}
        items={items}
        activeIndex={activeIndex}
      />
    );
  }

  if (kind === 'customizeInstagram') {
    return (
      <MetaCustomizePreview
        title={title}
        items={items}
        activeIndex={activeIndex}
        variant="instagram"
      />
    );
  }

  if (kind === 'customizeThreads') {
    return (
      <MetaCustomizePreview
        title={title}
        items={items}
        activeIndex={activeIndex}
        variant="threads"
      />
    );
  }

  if (kind === 'ready') {
    return (
      <MetaReadyPreview
        title={title}
        items={items}
        activeIndex={activeIndex}
      />
    );
  }

  return (
    <div className="border-t themed-border bg-[var(--bg-soft)] p-3">
      <div className="overflow-hidden rounded-lg border themed-border bg-[var(--bg-elevated)]">
        <div className="flex items-center gap-1.5 border-b themed-border px-2.5 py-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--text-subtle)] opacity-50" />
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--text-subtle)] opacity-35" />
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--text-subtle)] opacity-25" />
          <span className="ml-1 min-w-0 truncate text-[10px] font-semibold text-muted">
            {title}
          </span>
        </div>
        <div className="space-y-1.5 p-2.5">
          {items.map((item, itemIndex) => (
            <div
              key={item}
              className={
                'flex items-center justify-between rounded-md border px-2 py-1.5 text-[10px] font-medium transition-colors ' +
                (itemIndex === activeIndex
                  ? 'btn-primary border-transparent'
                  : 'themed-border text-muted')
              }
            >
              <span className="truncate">{item}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MetaShell({
  children,
  showBack = false,
}: {
  children: ReactNode;
  showBack?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-[#d9dde3] bg-white text-[#111318] shadow-sm">
      <div className="flex h-7 items-center justify-between border-b-2 border-black bg-white px-3">
        <span className="text-xl leading-none">{showBack ? '‹' : ''}</span>
        <span className="text-xl leading-none">×</span>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

function MetaExportHomePreview({
  title,
  items,
  activeIndex,
}: {
  title: string;
  items: readonly string[];
  activeIndex: number;
}) {
  const copy = getMetaPreviewCopy(title, items);
  const createLabel = items[0] ?? copy.createExport;
  const currentLabel = items[1] ?? copy.currentActivity;
  const pastLabel = items[2] ?? copy.pastActivity;

  return (
    <MetaShell>
      <div className="space-y-4">
        <div>
          <p className="text-base font-bold leading-tight">{title}</p>
          <p className="mt-1 text-[10px] leading-relaxed text-[#111318]">
            {copy.exportHomeDescription}
          </p>
        </div>
        <div
          className={
            'rounded-full px-3 py-2 text-center text-[11px] font-semibold text-white ' +
            (activeIndex === 0 ? 'bg-[#0866e5] ring-2 ring-[#8bb9ff]' : 'bg-[#0866e5]')
          }
        >
          {createLabel}
        </div>
        <div className="grid grid-cols-2 text-center text-[10px] font-semibold">
          <div className="border-b-2 border-black pb-1 text-[#111318]">
            {currentLabel}
          </div>
          <div className="border-b border-[#d9dde3] pb-1 text-[#616771]">
            {pastLabel}
          </div>
        </div>
      </div>
    </MetaShell>
  );
}

function MetaProfilePreview({
  title,
  items,
  activeIndex,
}: {
  title: string;
  items: readonly string[];
  activeIndex: number;
}) {
  const copy = getMetaPreviewCopy(title, items);

  return (
    <MetaShell showBack>
      <div className="space-y-3">
        <div>
          <p className="text-base font-bold leading-tight">{title}</p>
          <p className="mt-1 text-[10px] leading-relaxed text-[#616771]">
            {copy.profileDescription}
          </p>
        </div>
        <div
          className={
            'flex items-center gap-2 rounded-xl border border-[#d9dde3] p-2 ' +
            (activeIndex === 0 ? 'bg-[#eaf2ff]' : 'bg-white')
          }
        >
          <div className="h-9 w-9 shrink-0 rounded-full bg-[#d8d1c4]" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-bold">
              {items[0] ?? copy.profileLabel}
            </p>
            <p className="text-[10px] text-[#616771]">Instagram</p>
          </div>
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-[#0866e5] text-[12px] font-bold text-white">
            ✓
          </span>
        </div>
        <div className="rounded-full bg-[#0866e5] px-3 py-2 text-center text-[11px] font-semibold text-white">
          {copy.next}
        </div>
      </div>
    </MetaShell>
  );
}

function MetaDestinationPreview({
  title,
  items,
  activeIndex,
}: {
  title: string;
  items: readonly string[];
  activeIndex: number;
}) {
  const copy = getMetaPreviewCopy(title, items);

  return (
    <MetaShell showBack>
      <div className="space-y-3">
        <div>
          <p className="text-[10px] font-semibold text-[#111318]">
            {copy.accountLabel} · Instagram
          </p>
          <p className="mt-1 text-base font-bold leading-tight">{title}</p>
          <p className="mt-1 text-[10px] leading-relaxed text-[#111318]">
            {copy.destinationDescription}
          </p>
        </div>
        <div className="overflow-hidden rounded-xl border border-[#d9dde3]">
          {items.map((item, index) => (
            <MetaPreviewRow
              key={item}
              label={item}
              active={index === activeIndex}
            />
          ))}
        </div>
      </div>
    </MetaShell>
  );
}

function MetaConfirmPreview({
  title,
  items,
  activeIndex,
}: {
  title: string;
  items: readonly string[];
  activeIndex: number;
}) {
  const copy = getMetaPreviewCopy(title, items);
  const hasFinalSettings = items.some((item) => item.includes(':'));
  const rows = hasFinalSettings
    ? items.map((item) => {
        const [label, value] = item.split(':').map((part) => part.trim());
        return { label, value };
      })
    : [
        {
          label: items[0] ?? copy.customizeInformation,
          value: copy.allAvailableInformation,
        },
        { label: items[1] ?? copy.dateRange, value: copy.lastYear },
        { label: items[2] ?? copy.format, value: 'HTML' },
        { label: items[3] ?? copy.mediaQuality, value: copy.mediumQuality },
      ];

  return (
    <MetaShell showBack>
      <div className="space-y-3">
        <div>
          <p className="text-base font-bold leading-tight">{title}</p>
          <p className="mt-1 text-[10px] leading-relaxed text-[#616771]">
            {copy.confirmDescription}
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-[#d9dde3] p-2">
          <div className="h-8 w-8 shrink-0 rounded-full bg-[#d8d1c4]" />
          <div className="min-w-0">
            <p className="truncate text-[11px] font-bold">{copy.accountLabel}</p>
            <p className="text-[10px] text-[#616771]">Instagram</p>
            <p className="text-[10px] text-[#616771]">
              {copy.exportToDeviceOnce}
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-[#d9dde3]">
          {rows.map((row, index) => (
            <MetaPreviewRow
              key={row.label}
              label={row.label}
              value={row.value}
              active={index === activeIndex}
            />
          ))}
        </div>

        <div className="rounded-full bg-[#0866e5] px-3 py-2 text-center text-[11px] font-semibold text-white">
          {copy.startExport}
        </div>
      </div>
    </MetaShell>
  );
}

function MetaCustomizePreview({
  title,
  items,
  activeIndex,
  variant,
}: {
  title: string;
  items: readonly string[];
  activeIndex: number;
  variant: 'threads' | 'instagram';
}) {
  const copy = getMetaPreviewCopy(title, items);
  const clearLabel = items[0] ?? copy.clearAll;
  const sectionTitle =
    variant === 'threads'
      ? items[1] ?? copy.instagramActivity
      : items[1] ?? copy.connections;
  const sectionDescription =
    variant === 'threads'
      ? copy.threadsActivityDescription
      : copy.connectionsDescription;
  const rows =
    variant === 'threads'
      ? [{ label: parsePreviewLabel(items[2] ?? 'Threads: on'), checked: true }]
      : [
          { label: parsePreviewLabel(items[2] ?? copy.contactsOff), checked: false },
          {
            label: parsePreviewLabel(items[3] ?? copy.followersFollowingOn),
            checked: true,
          },
        ];

  return (
    <MetaShell showBack>
      <div className="space-y-3">
        <div>
          <p className="text-base font-bold leading-tight">{title}</p>
          <p className="mt-1 text-[10px] leading-relaxed text-[#616771]">
            {copy.customizeDescription}
          </p>
        </div>

        <div className={activeIndex === 0 ? 'rounded-lg ring-2 ring-[#0866e5]' : ''}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold">{sectionTitle}</p>
            <span className="text-[11px] font-semibold text-[#0866e5]">
              {clearLabel}
            </span>
          </div>
          <p className="mt-0.5 text-[10px] leading-relaxed text-[#616771]">
            {sectionDescription}
          </p>
        </div>

        <div className="overflow-hidden rounded-xl border border-[#d9dde3]">
          {rows.map((row, index) => (
            <div
              key={row.label}
              className={
                'flex items-center justify-between border-b border-[#d9dde3] px-3 py-2 last:border-b-0 ' +
                (index + 2 === activeIndex
                  ? 'bg-[#eaf2ff]'
                  : 'bg-white')
              }
            >
              <span className="text-[11px] font-semibold">{row.label}</span>
              <span
                className={
                  'flex h-5 w-5 items-center justify-center rounded-md border text-[12px] font-bold ' +
                  (row.checked
                    ? 'border-[#0866e5] bg-[#0866e5] text-white'
                    : 'border-[#b9c0ca] bg-white text-transparent')
                }
              >
                ✓
              </span>
            </div>
          ))}
        </div>

        <div className="rounded-full bg-[#0866e5] px-3 py-2 text-center text-[11px] font-semibold text-white">
          {copy.save}
        </div>
      </div>
    </MetaShell>
  );
}

function parsePreviewLabel(value: string): string {
  return value.split(':')[0]?.trim() || value;
}

function MetaReadyPreview({
  title,
  items,
}: {
  title: string;
  items: readonly string[];
  activeIndex: number;
}) {
  const copy = getMetaPreviewCopy(title, items);
  const requestedLabel = items[0] ?? copy.requested;
  const downloadLabel = items[1] ?? copy.download;
  const cancelLabel = items[2] ?? copy.cancel;

  return (
    <MetaShell>
      <div className="space-y-3">
        <div>
          <p className="text-base font-bold leading-tight">{title}</p>
          <p className="mt-1 text-[10px] leading-relaxed text-[#616771]">
            {copy.readyDescription}
          </p>
        </div>

        <div className="grid grid-cols-2 text-center text-[10px] font-semibold">
          <div className="border-b-2 border-black pb-1 text-[#111318]">
            {copy.currentActivity}
          </div>
          <div className="border-b border-[#d9dde3] pb-1 text-[#616771]">
            {copy.pastActivity}
          </div>
        </div>

        <div>
          <p className="text-sm font-bold">{requestedLabel}</p>
          <p className="mt-0.5 text-[10px] text-[#616771]">
            {copy.preparingDescription}
          </p>
        </div>

        <div className="rounded-xl border border-[#d9dde3] p-3">
          <div className="flex gap-2">
            <div className="h-9 w-9 shrink-0 rounded-full bg-[#d8d1c4]" />
            <div className="min-w-0">
              <p className="truncate text-[11px] font-bold">
                {copy.specificInformationDownload}
              </p>
              <p className="text-[10px] text-[#616771]">{copy.accountLabel}</p>
              <p className="text-[10px] text-[#616771]">Instagram</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-full bg-[#0866e5] px-3 py-2 text-center text-[11px] font-semibold text-white ring-2 ring-[#8bb9ff]">
              {downloadLabel}
            </div>
            <div className="rounded-full bg-[#f0f2f5] px-3 py-2 text-center text-[11px] font-semibold text-[#111318]">
              {cancelLabel}
            </div>
          </div>
        </div>
      </div>
    </MetaShell>
  );
}

function getMetaPreviewCopy(title: string, items: readonly string[]) {
  const previewText = [title, ...items].join(' ');
  const isKorean = /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(previewText);
  const isJapanese = /[\u3040-\u30ff\u3400-\u9fff]/.test(previewText);

  if (isKorean) {
    return {
      accountLabel: '내 계정',
      allAvailableInformation: '사용 가능한 모든 정보',
      cancel: '취소',
      clearAll: '모두 지우기',
      confirmDescription:
        '내보내기가 준비되면 알림을 보내드립니다. 보안을 위해 4일 동안만 파일을 다운로드할 수 있습니다.',
      connections: '연결 활동',
      connectionsDescription: '회원님이 소통한 사람과 소통 방식',
      contactsOff: '연락처: 끔',
      createExport: '내보내기 만들기',
      currentActivity: '현재 활동',
      customizeDescription: '이 분석에 필요한 정보만 선택하세요.',
      customizeInformation: '정보 맞춤 설정',
      dateRange: '기간',
      destinationDescription:
        '정보를 기기나 외부 서비스로 내보낼 수 있습니다.',
      download: '다운로드',
      exportHomeDescription:
        '회원님 정보의 사본을 외부 서비스에 내보내거나 회원님의 기기에 내보낼 수 있습니다.',
      exportToDeviceOnce: '기기로 내보내기 · 1회',
      followersFollowingOn: '팔로워 및 팔로잉: 켬',
      format: '형식',
      instagramActivity: '내 Instagram 활동',
      lastYear: '작년',
      mediaQuality: '미디어 품질',
      mediumQuality: '보통 화질',
      next: '다음',
      pastActivity: '지난 활동',
      preparingDescription: '회원님 정보가 내보내기를 위해 준비 중입니다.',
      profileDescription: '분석하려는 Instagram 프로필을 선택합니다.',
      profileLabel: 'Instagram 프로필',
      readyDescription: '준비 완료 메일이 오면 현재 활동에서 확인하세요.',
      requested: '요청됨',
      save: '저장',
      specificInformationDownload: '특정 정보 다운로드',
      startExport: '내보내기 시작',
      threadsActivityDescription:
        '회원님의 Threads 프로필 및 활동에 관한 정보',
    };
  }

  if (isJapanese) {
    return {
      accountLabel: '自分のアカウント',
      allAvailableInformation: '利用可能なすべての情報',
      cancel: 'キャンセル',
      clearAll: 'すべてクリア',
      confirmDescription:
        'エクスポートの準備ができたら通知します。セキュリティのため、ファイルは4日間のみダウンロードできます。',
      connections: 'つながり',
      connectionsDescription: 'やり取りした相手とその方法',
      contactsOff: '連絡先: オフ',
      createExport: 'エクスポートを作成',
      currentActivity: '現在のアクティビティ',
      customizeDescription: 'この分析に必要な情報だけを選択してください。',
      customizeInformation: '情報をカスタマイズ',
      dateRange: '期間',
      destinationDescription:
        '情報をデバイスまたは外部サービスにエクスポートできます。',
      download: 'ダウンロード',
      exportHomeDescription:
        '自分の情報のコピーを外部サービスまたはデバイスにエクスポートできます。',
      exportToDeviceOnce: 'デバイスにエクスポート · 1回',
      followersFollowingOn: 'フォロワーとフォロー中: オン',
      format: '形式',
      instagramActivity: 'Instagramアクティビティ',
      lastYear: '昨年',
      mediaQuality: 'メディア品質',
      mediumQuality: '標準画質',
      next: '次へ',
      pastActivity: '過去のアクティビティ',
      preparingDescription: '情報をエクスポートする準備をしています。',
      profileDescription: '分析したいInstagramプロフィールを選択します。',
      profileLabel: 'Instagramプロフィール',
      readyDescription: '準備完了メールが届いたら、現在のアクティビティで確認してください。',
      requested: 'リクエスト済み',
      save: '保存',
      specificInformationDownload: '特定の情報をダウンロード',
      startExport: 'エクスポートを開始',
      threadsActivityDescription: 'Threadsプロフィールとアクティビティの情報',
    };
  }

  return {
    accountLabel: 'your account',
    allAvailableInformation: 'All available information',
    cancel: 'Cancel',
    clearAll: 'Clear all',
    confirmDescription: 'We will send a notification when your export is ready.',
    connections: 'Connections',
    connectionsDescription: 'Who and how you have connected with people',
    contactsOff: 'Contacts: off',
    createExport: 'Create export',
    currentActivity: 'Current activity',
    customizeDescription: 'Select only the information this analysis needs.',
    customizeInformation: 'Customize information',
    dateRange: 'Date range',
    destinationDescription:
      'You can export info to your device or to an external service.',
    download: 'Download',
    exportHomeDescription:
      'You can export a copy of your information to your device.',
    exportToDeviceOnce: 'Export to Device · Once',
    followersFollowingOn: 'Followers and following: on',
    format: 'Format',
    instagramActivity: 'Your Instagram activity',
    lastYear: 'Last year',
    mediaQuality: 'Media quality',
    mediumQuality: 'Medium quality',
    next: 'Next',
    pastActivity: 'Past activity',
    preparingDescription: 'Your information is being prepared for export.',
    profileDescription: 'Select the account connected to your Threads profile.',
    profileLabel: 'Instagram profile',
    readyDescription: 'Check Current activity after the email arrives.',
    requested: 'Requested',
    save: 'Save',
    specificInformationDownload: 'specific information download',
    startExport: 'Start export',
    threadsActivityDescription: 'Your Threads profile and activity',
  };
}

function MetaPreviewRow({
  label,
  value,
  active,
}: {
  label: string;
  value?: string;
  active: boolean;
}) {
  return (
    <div
      className={
        'flex items-center justify-between border-b border-[#d9dde3] px-3 py-2 last:border-b-0 ' +
        (active ? 'bg-[#eaf2ff]' : 'bg-white')
      }
    >
      <div className="min-w-0">
        <p className="truncate text-[11px] font-bold">{label}</p>
        {value && (
          <p className="mt-0.5 truncate text-[10px] text-[#616771]">
            {value}
          </p>
        )}
      </div>
      <span className="ml-2 text-lg leading-none text-[#111318]">›</span>
    </div>
  );
}

function Disclosure({
  label,
  open,
  onToggle,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="themed-card overflow-hidden rounded-2xl border shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="surface-hover flex w-full items-center justify-between px-4 py-3 text-left text-xs font-semibold text-default transition-colors"
        aria-expanded={open}
      >
        <span>{label}</span>
        <ChevronIcon open={open} />
      </button>
      {open && <div className="border-t themed-border">{children}</div>}
    </div>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={
        'h-4 w-4 text-subtle transition-transform duration-150 ' +
        (open ? 'rotate-180' : '')
      }
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function LinkButton({
  url,
  primary = false,
  centered = false,
  className = '',
  children,
}: {
  url: string;
  primary?: boolean;
  centered?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => void browser.tabs.create({ url })}
      className={
        'flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-medium transition-colors ' +
        (centered ? 'justify-center ' : 'justify-between ') +
        (primary
          ? 'btn-primary border-transparent shadow-sm hover:shadow-md'
          : 'themed-card surface-hover text-default') +
        (className ? ` ${className}` : '')
      }
    >
      <span>{children}</span>
      <ExternalLinkIcon className={primary ? 'text-current' : undefined} />
    </button>
  );
}

function ExternalLinkIcon({ className = 'text-subtle' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-3.5 w-3.5 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </svg>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-strong">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function Toast({
  tone,
  children,
  onDismiss,
}: {
  tone: 'success' | 'error';
  children: ReactNode;
  onDismiss?: () => void;
}) {
  const className =
    tone === 'error' ? 'tone-danger' : 'tone-success';

  return (
    <div
      role="status"
      className={`mb-2 flex items-start justify-between gap-2 rounded-xl border px-3 py-2 text-[11px] shadow-sm ${className}`}
    >
      <span className="flex-1 leading-relaxed">{children}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="dismiss"
          className="shrink-0 text-current opacity-50 transition-opacity hover:opacity-100"
        >
          ×
        </button>
      )}
    </div>
  );
}

function InlineError({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border tone-danger px-3 py-2 text-[11px] leading-relaxed shadow-sm">
      {children}
    </div>
  );
}

function FileSummary({
  title,
  files,
  emptyText,
}: {
  title: string;
  files: string[];
  emptyText: string;
}) {
  return (
    <div className="mt-3">
      <h3 className="text-[11px] font-semibold text-default">{title}</h3>
      {files.length === 0 ? (
        <p className="mt-1.5 text-[11px] text-muted">{emptyText}</p>
      ) : (
        <ul className="mt-1.5 max-h-24 space-y-0.5 overflow-y-auto text-[11px] text-muted">
          {files.map((file) => (
            <li key={file} className="truncate">
              {file}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AccountRow({
  account,
  platform,
  profileOpenMode,
  onMarkReviewed,
}: {
  account: Account;
  platform: Platform;
  profileOpenMode: ProfileOpenMode;
  onMarkReviewed: (account: Account) => void;
}) {
  const { t } = useI18n();

  async function openProfile() {
    const url = buildProfileUrl(account.username, platform);

    if (profileOpenMode === 'newTab') {
      await browser.tabs.create({ url });
      return;
    }

    try {
      const [activeTab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (typeof activeTab?.id === 'number') {
        await browser.tabs.update(activeTab.id, { url });
        return;
      }

      await browser.tabs.update({ url });
    } catch {
      await browser.tabs.create({ url });
    }
  }

  return (
    <li className="themed-card group overflow-hidden rounded-xl border shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center gap-2 px-3.5 py-3.5">
        <button
          type="button"
          onClick={() => void openProfile()}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-label={`${t.result.profile} @${account.username}`}
        >
          <Avatar account={account} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-strong">
              {account.displayName || account.username}
            </p>
            <p className="truncate text-[11px] text-muted">
              @{account.username}
            </p>
          </div>
          <ExternalLinkIcon />
        </button>
        <button
          type="button"
          onClick={() => onMarkReviewed(account)}
          title={t.result.hideHint}
          className="surface-hover shrink-0 rounded-lg border themed-border px-2.5 py-1.5 text-[11px] font-semibold text-muted transition-colors hover:text-strong"
        >
          {t.result.hide}
        </button>
      </div>
    </li>
  );
}

function Avatar({ account }: { account: Account }) {
  if (account.avatarUrl) {
    return (
      <img
        src={account.avatarUrl}
        alt=""
        className="h-9 w-9 shrink-0 rounded-full themed-soft object-cover"
      />
    );
  }

  return (
    <div
      aria-hidden
      className="avatar-fallback flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
    >
      {account.username.slice(0, 1).toUpperCase()}
    </div>
  );
}

function statusLabel(status: ImportStatus, t: ReturnType<typeof useI18n>['t']): string {
  switch (status) {
    case 'parsing':
      return t.upload.statusParsing;
    case 'ready':
      return t.upload.statusReady;
    case 'error':
      return t.upload.statusError;
    default:
      return t.upload.statusIdle;
  }
}
