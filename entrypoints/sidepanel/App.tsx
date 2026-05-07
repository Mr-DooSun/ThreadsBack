import {
  useEffect,
  useMemo,
  useRef,
  useState,
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

const HELP_LINKS = {
  threads: 'https://www.facebook.com/help/instagram/259803026523198',
  instagram: 'https://www.facebook.com/help/instagram/181231772500920',
};

export default function App() {
  return (
    <I18nProvider>
      <AppShell />
    </I18nProvider>
  );
}

function AppShell() {
  const { t } = useI18n();
  const [state, setState] = useState<StoredRelationshipState | null>(null);
  const [importStatus, setImportStatus] = useState<ImportStatus>('idle');
  const [parseResult, setParseResult] = useState<ExportParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showHowTo, setShowHowTo] = useState(false);
  const [showKept, setShowKept] = useState(false);
  const [reuploadOpen, setReuploadOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const analysis = useMemo(
    () => (state ? analyzeRelationships(state) : null),
    [state],
  );

  useEffect(() => {
    void loadRelationshipState()
      .then(setState)
      .catch((loadError: unknown) => {
        setError(
          loadError instanceof Error ? loadError.message : t.notice.loadError,
        );
      });
  }, [t.notice.loadError]);

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
    setShowSettings(false);
    setError(null);
    setNotice(t.notice.reset);
  }

  if (!state || !analysis) {
    return (
      <main className="flex min-h-screen w-full items-center justify-center bg-slate-50 text-sm text-slate-500">
        …
      </main>
    );
  }

  const hasData = state.following.length > 0 && state.followers.length > 0;

  return (
    <main className="min-h-screen w-full bg-slate-50 text-slate-950">
      <Header onOpenSettings={() => setShowSettings(true)} />

      {showSettings ? (
        <SettingsView
          canReset={hasData || state.following.length > 0 || state.followers.length > 0}
          onClose={() => setShowSettings(false)}
          onReset={() => void resetAll()}
        />
      ) : (
        <>
          {(error || notice) && (
            <section className="px-4 pt-3">
              {notice && (
                <Status tone="success" onDismiss={() => setNotice(null)}>
                  {notice}
                </Status>
              )}
              {error && (
                <Status tone="error" onDismiss={() => setError(null)}>
                  {error}
                </Status>
              )}
            </section>
          )}

          {!hasData ? (
            <UploadView
              state={state}
              status={importStatus}
              parseResult={parseResult}
              showHowTo={showHowTo}
              onToggleHowTo={() => setShowHowTo((prev) => !prev)}
              inputRef={fileInputRef}
              onFilesSelected={(files) => void handleFileChange(files)}
              onApply={() => void applyParseResult()}
            />
          ) : (
            <ResultsView
              state={state}
              analysis={analysis}
              showKept={showKept}
              onToggleKeptList={() => setShowKept((prev) => !prev)}
              reuploadOpen={reuploadOpen}
              onToggleReupload={() => setReuploadOpen((prev) => !prev)}
              status={importStatus}
              parseResult={parseResult}
              inputRef={fileInputRef}
              onFilesSelected={(files) => void handleFileChange(files)}
              onApply={() => void applyParseResult()}
              onToggleKeep={(username) =>
                void toggleFlag('keptUsernames', username)
              }
              onToggleHidden={(username) =>
                void toggleFlag('hiddenUsernames', username)
              }
            />
          )}
        </>
      )}
    </main>
  );
}

function Header({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { t } = useI18n();

  return (
    <header className="border-b border-slate-200 bg-white px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold">{t.app.name}</h1>
          <p className="mt-0.5 text-xs text-slate-500">{t.app.tagline}</p>
        </div>
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label={t.header.settings}
          className="shrink-0 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          {t.header.settings}
        </button>
      </div>
    </header>
  );
}

function SettingsView({
  canReset,
  onClose,
  onReset,
}: {
  canReset: boolean;
  onClose: () => void;
  onReset: () => void;
}) {
  const { t, locale, setLocale } = useI18n();

  return (
    <section className="space-y-4 px-4 py-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">
          {t.settings.title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          {t.settings.close}
        </button>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="text-xs font-semibold text-slate-700">
          {t.settings.language}
        </h3>
        <p className="mt-1 text-[11px] text-slate-500">
          {t.settings.languageHint}
        </p>
        <div className="mt-3">
          <LanguageToggle locale={locale} onChange={setLocale} />
        </div>
      </div>

      {canReset && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-xs font-semibold text-slate-700">
            {t.settings.data}
          </h3>
          <p className="mt-1 text-[11px] text-slate-500">
            {t.settings.resetHint}
          </p>
          <button
            type="button"
            onClick={onReset}
            className="mt-3 w-full rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
          >
            {t.settings.reset}
          </button>
        </div>
      )}
    </section>
  );
}

function LanguageToggle({
  locale,
  onChange,
}: {
  locale: Locale;
  onChange: (next: Locale) => void;
}) {
  return (
    <div
      role="group"
      className="inline-flex overflow-hidden rounded-md border border-slate-200 text-xs font-medium"
    >
      <LangButton
        active={locale === 'ko'}
        onClick={() => onChange('ko')}
        label="한국어"
      >
        한국어
      </LangButton>
      <LangButton
        active={locale === 'en'}
        onClick={() => onChange('en')}
        label="English"
      >
        English
      </LangButton>
    </div>
  );
}

function LangButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={
        active
          ? 'bg-slate-900 px-3 py-1.5 text-white'
          : 'bg-white px-3 py-1.5 text-slate-600 hover:bg-slate-50'
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
  showHowTo,
  onToggleHowTo,
  inputRef,
  onFilesSelected,
  onApply,
}: {
  state: StoredRelationshipState;
  status: ImportStatus;
  parseResult: ExportParseResult | null;
  showHowTo: boolean;
  onToggleHowTo: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
  onFilesSelected: (files: FileList | null) => void;
  onApply: () => void;
}) {
  const { t } = useI18n();

  return (
    <section className="space-y-4 px-4 py-5">
      <UploadCard
        status={status}
        inputRef={inputRef}
        onFilesSelected={onFilesSelected}
      />

      {(state.following.length > 0 || state.followers.length > 0) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          {t.upload.needBoth}
          <ul className="mt-1.5 space-y-0.5">
            {state.following.length > 0 && (
              <li>{t.upload.haveFollowing(state.following.length)}</li>
            )}
            {state.followers.length > 0 && (
              <li>{t.upload.haveFollowers(state.followers.length)}</li>
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
    </section>
  );
}

function ResultsView({
  state,
  analysis,
  showKept,
  onToggleKeptList,
  reuploadOpen,
  onToggleReupload,
  status,
  parseResult,
  inputRef,
  onFilesSelected,
  onApply,
  onToggleKeep,
  onToggleHidden,
}: {
  state: StoredRelationshipState;
  analysis: NonNullable<ReturnType<typeof analyzeRelationships>>;
  showKept: boolean;
  onToggleKeptList: () => void;
  reuploadOpen: boolean;
  onToggleReupload: () => void;
  status: ImportStatus;
  parseResult: ExportParseResult | null;
  inputRef: RefObject<HTMLInputElement | null>;
  onFilesSelected: (files: FileList | null) => void;
  onApply: () => void;
  onToggleKeep: (username: string) => void;
  onToggleHidden: (username: string) => void;
}) {
  const { t } = useI18n();
  const reviewCount = analysis.reviewAccounts.length;

  return (
    <section className="space-y-4 px-4 py-5">
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-7 text-center">
        <p className="text-5xl font-semibold tabular-nums text-slate-950">
          {reviewCount.toLocaleString()}
        </p>
        <p className="mt-2 text-sm font-medium text-slate-700">
          {t.result.statLabel}
        </p>
        <p className="mt-1 text-xs text-slate-500">{t.result.statHint}</p>
      </div>

      {reviewCount === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
          {t.result.empty}
        </div>
      ) : (
        <ul className="space-y-2">
          {analysis.reviewAccounts.map((account) => (
            <AccountRow
              key={account.username}
              account={account}
              onToggleKeep={onToggleKeep}
              onToggleHidden={onToggleHidden}
            />
          ))}
        </ul>
      )}

      {analysis.keptAccounts.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white">
          <button
            type="button"
            onClick={onToggleKeptList}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
            aria-expanded={showKept}
          >
            <span>
              {showKept
                ? t.result.keptHide
                : t.result.keptCount(analysis.keptAccounts.length)}
            </span>
            <span className="text-slate-400">{showKept ? '−' : '+'}</span>
          </button>
          {showKept && (
            <ul className="space-y-2 border-t border-slate-100 p-3">
              {analysis.keptAccounts.map((account) => (
                <AccountRow
                  key={account.username}
                  account={account}
                  onToggleKeep={onToggleKeep}
                  onToggleHidden={onToggleHidden}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {analysis.hiddenCount > 0 && (
        <p className="text-center text-xs text-slate-500">
          {t.result.hiddenSummary(analysis.hiddenCount)}
        </p>
      )}

      <div className="rounded-lg border border-slate-200 bg-white">
        <button
          type="button"
          onClick={onToggleReupload}
          className="flex w-full items-center justify-between px-4 py-3 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
          aria-expanded={reuploadOpen}
        >
          <span>{t.result.reupload}</span>
          <span className="text-slate-400">{reuploadOpen ? '−' : '+'}</span>
        </button>
        {reuploadOpen && (
          <div className="border-t border-slate-100 p-3 space-y-3">
            <UploadCard
              status={status}
              inputRef={inputRef}
              onFilesSelected={onFilesSelected}
              compact
            />
            {parseResult && (
              <ParseSummary
                result={parseResult}
                onApply={onApply}
                status={status}
              />
            )}
            <p className="text-[11px] text-slate-500">
              {t.upload.haveFollowing(state.following.length)} · {t.upload.haveFollowers(state.followers.length)}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function UploadCard({
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

  return (
    <div
      className={
        compact
          ? 'rounded-lg border border-slate-200 bg-white'
          : 'rounded-2xl border border-slate-200 bg-white p-5'
      }
    >
      {!compact && (
        <>
          <h2 className="text-sm font-semibold">{t.upload.heroTitle}</h2>
          <p className="mt-1 text-xs text-slate-500">
            {t.upload.heroSubtitle}
          </p>
        </>
      )}

      <label
        className={
          compact
            ? 'flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center hover:bg-slate-100'
            : 'mt-3 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-9 text-center hover:bg-slate-100'
        }
      >
        <span className="text-sm font-semibold text-slate-700">
          {t.upload.selectButton}
        </span>
        <span className="mt-1 text-xs text-slate-500">
          {t.upload.dropHere}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept=".zip,.json,.html,.htm,application/zip,application/json,text/html"
          multiple
          className="sr-only"
          onChange={(event) => onFilesSelected(event.currentTarget.files)}
        />
      </label>

      <p
        className={
          compact
            ? 'px-3 pb-3 pt-2 text-[11px] text-slate-500'
            : 'mt-3 text-[11px] text-slate-500'
        }
      >
        {t.upload.privacyNote} · {statusLabel(status, t)}
      </p>
    </div>
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
    <div className="rounded-lg border border-slate-200 bg-white p-4">
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
          <h3 className="text-xs font-semibold text-slate-600">
            {t.upload.skipped}
          </h3>
          <ul className="mt-1.5 max-h-24 space-y-0.5 overflow-y-auto text-[11px] text-slate-500">
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
        className="mt-4 w-full rounded-md bg-slate-950 px-3 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
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
    <div className="rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
        aria-expanded={open}
      >
        <span>{t.upload.howToTitle}</span>
        <span className="text-slate-400">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-100 px-4 py-3">
          <ol className="list-decimal space-y-1.5 pl-4 text-xs leading-5 text-slate-600">
            {t.upload.howToSteps.map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
          <div className="grid grid-cols-1 gap-2">
            <LinkButton url={HELP_LINKS.threads}>
              {t.upload.threadsHelp}
            </LinkButton>
            <LinkButton url={HELP_LINKS.instagram}>
              {t.upload.instagramHelp}
            </LinkButton>
          </div>
        </div>
      )}
    </div>
  );
}

function LinkButton({ url, children }: { url: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => void browser.tabs.create({ url })}
      className="rounded-md border border-slate-200 px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
    >
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function Status({
  tone,
  children,
  onDismiss,
}: {
  tone: 'success' | 'error';
  children: ReactNode;
  onDismiss?: () => void;
}) {
  const className =
    tone === 'error'
      ? 'border-red-200 bg-red-50 text-red-700'
      : 'border-emerald-200 bg-emerald-50 text-emerald-700';

  return (
    <div
      className={`mb-2 flex items-start justify-between gap-2 rounded-md border px-3 py-2 text-xs ${className}`}
    >
      <span className="flex-1">{children}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="dismiss"
          className="shrink-0 text-current opacity-60 hover:opacity-100"
        >
          ×
        </button>
      )}
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
      <h3 className="text-xs font-semibold text-slate-600">{title}</h3>
      {files.length === 0 ? (
        <p className="mt-1.5 text-[11px] text-slate-500">{emptyText}</p>
      ) : (
        <ul className="mt-1.5 max-h-24 space-y-0.5 overflow-y-auto text-[11px] text-slate-500">
          {files.map((file) => (
            <li key={file}>{file}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AccountRow({
  account,
  onToggleKeep,
  onToggleHidden,
}: {
  account: Account;
  onToggleKeep: (username: string) => void;
  onToggleHidden: (username: string) => void;
}) {
  const { t } = useI18n();

  return (
    <li className="rounded-lg border border-slate-200 bg-white p-3">
      <button
        type="button"
        onClick={() => void browser.tabs.create({ url: account.profileUrl })}
        className="flex w-full items-center gap-3 text-left"
        aria-label={`${t.result.profile} @${account.username}`}
      >
        <Avatar account={account} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">
            {account.displayName || account.username}
          </p>
          <p className="truncate text-xs text-slate-500">@{account.username}</p>
        </div>
        <span className="shrink-0 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600">
          {t.result.profile}
        </span>
      </button>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onToggleKeep(account.username)}
          className={
            account.kept
              ? 'rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100'
              : 'rounded-md border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50'
          }
        >
          {account.kept ? t.result.keepUndo : t.result.keep}
        </button>
        <button
          type="button"
          onClick={() => onToggleHidden(account.username)}
          className="rounded-md border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
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
        className="h-10 w-10 shrink-0 rounded-full bg-slate-100 object-cover"
      />
    );
  }

  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600">
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
