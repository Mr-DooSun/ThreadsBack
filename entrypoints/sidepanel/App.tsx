import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
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
  loadRelationshipState,
  replaceSnapshotAccounts,
  resetRelationshipState,
  saveRelationshipState,
  toggleUsernameFlag,
} from '../../lib/storage';
import type { Account, StoredRelationshipState } from '../../lib/types';
import { I18nProvider, useI18n, type Locale } from './i18n';

type ImportStatus = 'idle' | 'parsing' | 'ready' | 'error';
type Platform = 'threads' | 'instagram';

const HELP_LINKS = {
  accountsCenter:
    'https://accountscenter.instagram.com/info_and_permissions/dyi/',
  threads: 'https://www.facebook.com/help/instagram/259803026523198',
  instagram: 'https://www.facebook.com/help/instagram/181231772500920',
};

// PayPal can be added later if a separate direct support link is needed.
const SUPPORT_LINKS = {
  koFi: 'https://ko-fi.com/mrdoosun',
  paypal: '',
};

const PLATFORM_STORAGE_KEY = 'wum.platform';
const DEFAULT_PLATFORM: Platform = 'threads';
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

export default function App() {
  return (
    <I18nProvider>
      <AppShell />
    </I18nProvider>
  );
}

function AppShell() {
  const { t, locale } = useI18n();
  const [state, setState] = useState<StoredRelationshipState | null>(null);
  const [importStatus, setImportStatus] = useState<ImportStatus>('idle');
  const [parseResult, setParseResult] = useState<ExportParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showHowTo, setShowHowTo] = useState(false);
  const [showKept, setShowKept] = useState(false);
  const [reuploadOpen, setReuploadOpen] = useState(false);
  const [platform, setPlatformState] = useState<Platform>(DEFAULT_PLATFORM);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const analysis = useMemo(
    () => (state ? analyzeRelationships(state) : null),
    [state],
  );

  useEffect(() => {
    setPlatformState(detectInitialPlatform());
  }, []);

  useEffect(() => {
    document.title = t.app.name;
    document.documentElement.lang = locale;
  }, [locale, t.app.name]);

  useEffect(() => {
    void loadRelationshipState()
      .then(setState)
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

  async function handleFileChange(files: FileList | null) {
    const selectedFiles = files ? [...files] : [];
    setNotice(null);
    setError(null);
    setParseResult(null);

    if (selectedFiles.length === 0) {
      setImportStatus('idle');
      return;
    }

    setImportStatus('parsing');

    try {
      const result = await parseExportFiles(selectedFiles);
      setParseResult(result);
      setImportStatus('ready');

      const detected = detectPlatformFromFiles(result.recognizedFiles);
      if (detected) {
        setPlatform(detected);
      }

      setNotice(t.notice.filesParsed);
    } catch (parseError) {
      setImportStatus('error');
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
    if (!state || !parseResult) return;

    const nextState = replaceSnapshotAccounts(state, {
      following:
        parseResult.following.length > 0 ? parseResult.following : undefined,
      followers:
        parseResult.followers.length > 0 ? parseResult.followers : undefined,
    });

    await saveRelationshipState(nextState);
    setState(nextState);
    setParseResult(null);
    setImportStatus('idle');
    setReuploadOpen(false);
    setNotice(t.notice.applied);
  }

  async function toggleFlag(
    key: 'hiddenUsernames' | 'keptUsernames',
    username: string,
  ) {
    if (!state) return;

    const nextState = toggleUsernameFlag(state, key, username);
    await saveRelationshipState(nextState);
    setState(nextState);
  }

  async function resetAll() {
    if (!window.confirm(t.header.resetConfirm)) return;

    const nextState = await resetRelationshipState();
    setState(nextState);
    setParseResult(null);
    setImportStatus('idle');
    setReuploadOpen(false);
    setShowKept(false);
    setError(null);
    setNotice(t.notice.reset);
  }

  if (!state || !analysis) {
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
      <PlatformTabs platform={platform} onChange={setPlatform} />

      {(error || notice) && (
        <section className="px-4 pt-3">
          {notice && (
            <Toast tone="success" onDismiss={() => setNotice(null)}>
              {notice}
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
          status={importStatus}
          parseResult={parseResult}
          error={error}
          showHowTo={showHowTo}
          onToggleHowTo={() => setShowHowTo((prev) => !prev)}
          inputRef={fileInputRef}
          onFilesSelected={(files) => void handleFileChange(files)}
          onApply={() => void applyParseResult()}
        />
      ) : (
        <ResultsView
          analysis={analysis}
          showKept={showKept}
          onToggleKeptList={() => setShowKept((prev) => !prev)}
          reuploadOpen={reuploadOpen}
          onToggleReupload={() => setReuploadOpen((prev) => !prev)}
          status={importStatus}
          parseResult={parseResult}
          error={error}
          inputRef={fileInputRef}
          onFilesSelected={(files) => void handleFileChange(files)}
          onApply={() => void applyParseResult()}
          onToggleKeep={(username) =>
            void toggleFlag('keptUsernames', username)
          }
          onToggleHidden={(username) =>
            void toggleFlag('hiddenUsernames', username)
          }
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
}: {
  platform: Platform;
  onChange: (next: Platform) => void;
}) {
  return (
    <nav className="px-4 pt-3">
      <div className="grid grid-cols-2 gap-1 rounded-full themed-soft p-1">
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
      className={
        'rounded-full px-3 py-1.5 text-xs font-semibold tracking-wide transition-all ' +
        (active
          ? 'tab-active shadow-sm'
          : 'text-muted hover:text-strong')
      }
    >
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
  status,
  parseResult,
  error,
  showHowTo,
  onToggleHowTo,
  inputRef,
  onFilesSelected,
  onApply,
}: {
  state: StoredRelationshipState;
  status: ImportStatus;
  parseResult: ExportParseResult | null;
  error: string | null;
  showHowTo: boolean;
  onToggleHowTo: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
  onFilesSelected: (files: FileList | null) => void;
  onApply: () => void;
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
          status={status}
        />
      )}

      <HowToBlock open={showHowTo} onToggle={onToggleHowTo} />

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
  showKept,
  onToggleKeptList,
  reuploadOpen,
  onToggleReupload,
  status,
  parseResult,
  error,
  inputRef,
  onFilesSelected,
  onApply,
  onToggleKeep,
  onToggleHidden,
  onReset,
  platform,
}: {
  analysis: NonNullable<ReturnType<typeof analyzeRelationships>>;
  showKept: boolean;
  onToggleKeptList: () => void;
  reuploadOpen: boolean;
  onToggleReupload: () => void;
  status: ImportStatus;
  parseResult: ExportParseResult | null;
  error: string | null;
  inputRef: RefObject<HTMLInputElement | null>;
  onFilesSelected: (files: FileList | null) => void;
  onApply: () => void;
  onToggleKeep: (username: string) => void;
  onToggleHidden: (username: string) => void;
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
        <ZeroState />
      ) : (
        <ul className="space-y-2">
          {analysis.reviewAccounts.map((account) => (
            <AccountRow
              key={account.username}
              account={account}
              platform={platform}
              onToggleKeep={onToggleKeep}
              onToggleHidden={onToggleHidden}
            />
          ))}
        </ul>
      )}

      {analysis.keptAccounts.length > 0 && (
        <Disclosure
          label={
            showKept
              ? t.result.keptHide
              : t.result.keptCount(analysis.keptAccounts.length)
          }
          open={showKept}
          onToggle={onToggleKeptList}
        >
          <ul className="space-y-2 p-3">
            {analysis.keptAccounts.map((account) => (
              <AccountRow
                key={account.username}
                account={account}
                platform={platform}
                onToggleKeep={onToggleKeep}
                onToggleHidden={onToggleHidden}
              />
            ))}
          </ul>
        </Disclosure>
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

function ZeroState() {
  const { t } = useI18n();

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
      <p className="mt-3 text-sm font-semibold">{t.result.zeroTitle}</p>
      <p className="tone-success-soft mt-1 text-[11px]">{t.result.zeroBody}</p>
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
  status,
}: {
  result: ExportParseResult;
  onApply: () => void;
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

      <button
        type="button"
        onClick={onApply}
        disabled={!canApply}
        className="btn-primary mt-4 w-full rounded-xl px-3 py-2.5 text-sm font-semibold shadow-sm transition-all hover:shadow-md"
      >
        {t.upload.applyButton}
      </button>
    </div>
  );
}

function HowToBlock({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();

  return (
    <Disclosure label={t.upload.howToTitle} open={open} onToggle={onToggle}>
      <div className="space-y-3 p-3">
        <ol className="list-decimal space-y-1.5 pl-4 text-[12px] leading-5 text-default">
          {t.upload.howToSteps.map((step, index) => (
            <li key={index}>{step}</li>
          ))}
        </ol>
        <div className="grid grid-cols-1 gap-1.5">
          <LinkButton url={HELP_LINKS.accountsCenter} primary>
            {t.upload.accountsCenterExport}
          </LinkButton>
          <LinkButton url={HELP_LINKS.threads}>
            {t.upload.threadsHelp}
          </LinkButton>
          <LinkButton url={HELP_LINKS.instagram}>
            {t.upload.instagramHelp}
          </LinkButton>
        </div>
      </div>
    </Disclosure>
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
  children,
}: {
  url: string;
  primary?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => void browser.tabs.create({ url })}
      className={
        'flex items-center justify-between rounded-lg border px-3 py-2 text-left text-xs font-medium transition-colors ' +
        (primary
          ? 'btn-primary border-transparent shadow-sm hover:shadow-md'
          : 'themed-card surface-hover text-default')
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
  onToggleKeep,
  onToggleHidden,
}: {
  account: Account;
  platform: Platform;
  onToggleKeep: (username: string) => void;
  onToggleHidden: (username: string) => void;
}) {
  const { t } = useI18n();

  function openProfile() {
    void browser.tabs.create({
      url: buildProfileUrl(account.username, platform),
    });
  }

  function handleAction(
    event: MouseEvent<HTMLButtonElement>,
    action: () => void,
  ) {
    event.stopPropagation();
    action();
  }

  return (
    <li
      className={
        'themed-card group overflow-hidden rounded-xl border shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ' +
        (account.kept ? 'border-[var(--kept-border)]' : '')
      }
    >
      <button
        type="button"
        onClick={openProfile}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
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
      <div className="flex border-t themed-border">
        <RowAction
          onClick={(event) =>
            handleAction(event, () => onToggleKeep(account.username))
          }
          active={!!account.kept}
        >
          {account.kept ? t.result.keepUndo : t.result.keep}
        </RowAction>
        <span className="w-px bg-[var(--border)]" aria-hidden />
        <RowAction
          onClick={(event) =>
            handleAction(event, () => onToggleHidden(account.username))
          }
        >
          {t.result.hide}
        </RowAction>
      </div>
    </li>
  );
}

function RowAction({
  onClick,
  active,
  children,
}: {
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'flex-1 px-2 py-2 text-[11px] font-semibold transition-colors ' +
        (active ? 'row-action-active' : 'text-muted hover:text-strong surface-hover')
      }
    >
      {children}
    </button>
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
