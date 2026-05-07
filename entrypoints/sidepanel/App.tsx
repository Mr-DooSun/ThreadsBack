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

type ViewTab = 'import' | 'analysis';
type ImportStatus = 'idle' | 'parsing' | 'ready' | 'error';

const HELP_LINKS = {
  threads: 'https://www.facebook.com/help/instagram/259803026523198',
  instagram: 'https://www.facebook.com/help/instagram/181231772500920',
};

export default function App() {
  const [activeTab, setActiveTab] = useState<ViewTab>('import');
  const [state, setState] = useState<StoredRelationshipState | null>(null);
  const [importStatus, setImportStatus] = useState<ImportStatus>('idle');
  const [parseResult, setParseResult] = useState<ExportParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const analysis = useMemo(
    () => (state ? analyzeRelationships(state) : null),
    [state],
  );

  useEffect(() => {
    void loadRelationshipState().then(setState).catch((loadError: unknown) => {
      setError(
        loadError instanceof Error
          ? loadError.message
          : '저장된 데이터를 불러오지 못했습니다.',
      );
    });
  }, []);

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
      setNotice('파일을 읽었습니다. 건수를 확인한 뒤 분석에 반영하세요.');
    } catch (parseError) {
      setImportStatus('error');
      setError(
        parseError instanceof ExportParseError || parseError instanceof Error
          ? parseError.message
          : '파일을 읽지 못했습니다.',
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
    setNotice('분석 데이터에 반영했습니다.');
    setActiveTab('analysis');
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
    const nextState = await resetRelationshipState();
    setState(nextState);
    setParseResult(null);
    setImportStatus('idle');
    setNotice('로컬 저장 데이터를 초기화했습니다.');
  }

  if (!state || !analysis) {
    return (
      <main className="flex min-h-screen w-full items-center justify-center bg-slate-50 text-sm text-slate-600">
        불러오는 중
      </main>
    );
  }

  return (
    <main className="min-h-screen w-full bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-base font-semibold">FollowMirror</h1>
            <p className="mt-1 text-xs text-slate-500">공식 데이터 사본 로컬 분석</p>
          </div>
          <button
            type="button"
            onClick={() => void resetAll()}
            className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            초기화
          </button>
        </div>
        <nav className="mt-4 grid grid-cols-2 rounded-md bg-slate-100 p-1">
          <TabButton
            active={activeTab === 'import'}
            onClick={() => setActiveTab('import')}
          >
            가져오기
          </TabButton>
          <TabButton
            active={activeTab === 'analysis'}
            onClick={() => setActiveTab('analysis')}
          >
            분석 결과
          </TabButton>
        </nav>
      </header>

      {(error || notice) && (
        <section className="px-4 pt-3">
          {notice && <Status tone="success">{notice}</Status>}
          {error && <Status tone="error">{error}</Status>}
        </section>
      )}

      {activeTab === 'import' ? (
        <ImportPanel
          status={importStatus}
          result={parseResult}
          inputRef={fileInputRef}
          onFilesSelected={(files) => void handleFileChange(files)}
          onApply={() => void applyParseResult()}
        />
      ) : (
        <AnalysisPanel
          state={state}
          analysis={analysis}
          onToggleKeep={(username) => void toggleFlag('keptUsernames', username)}
          onToggleHidden={(username) => void toggleFlag('hiddenUsernames', username)}
        />
      )}
    </main>
  );
}

function ImportPanel({
  status,
  result,
  inputRef,
  onFilesSelected,
  onApply,
}: {
  status: ImportStatus;
  result: ExportParseResult | null;
  inputRef: RefObject<HTMLInputElement | null>;
  onFilesSelected: (files: FileList | null) => void;
  onApply: () => void;
}) {
  const canApply =
    result !== null && (result.following.length > 0 || result.followers.length > 0);

  return (
    <section className="space-y-4 px-4 py-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold">공식 데이터 사본 신청</h2>
        <p className="mt-2 text-xs leading-5 text-slate-600">
          Meta가 제공하는 export 파일을 직접 다운로드한 뒤 여기에서만 분석합니다.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2">
          <LinkButton url={HELP_LINKS.threads}>Threads 데이터 도움말</LinkButton>
          <LinkButton url={HELP_LINKS.instagram}>Instagram 정보 내보내기</LinkButton>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold">요청 체크리스트</h2>
        <ul className="mt-3 space-y-2 text-xs leading-5 text-slate-600">
          <li>JSON 형식으로 요청하세요.</li>
          <li>Followers and following 또는 Connections 항목을 선택하세요.</li>
          <li>Export to device로 받은 ZIP 또는 JSON 파일을 사용하세요.</li>
          <li>준비까지 시간이 걸릴 수 있고, 준비된 파일은 제한 기간 안에 내려받아야 합니다.</li>
        </ul>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold">파일 업로드</h2>
        <label className="mt-3 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-7 text-center hover:bg-slate-100">
          <span className="text-sm font-medium text-slate-700">
            ZIP 또는 JSON 선택
          </span>
          <span className="mt-1 text-xs text-slate-500">
            파일은 브라우저 안에서만 읽습니다.
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
        <p className="mt-3 text-xs text-slate-500">
          상태: {statusLabel(status)}
        </p>
      </div>

      {result && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="grid grid-cols-2 gap-3 text-center">
            <Stat label="팔로잉" value={result.following.length} />
            <Stat label="팔로워" value={result.followers.length} />
          </div>

          <FileSummary
            title="인식한 파일"
            files={result.recognizedFiles}
            emptyText="아직 인식한 파일이 없습니다."
          />

          {result.skippedFiles.length > 0 && (
            <div className="mt-4">
              <h3 className="text-xs font-semibold text-slate-600">
                건너뛴 파일
              </h3>
              <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto text-xs text-slate-500">
                {result.skippedFiles.map((file) => (
                  <li key={`${file.name}:${file.reason}`}>
                    {file.name} - {file.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            type="button"
            onClick={onApply}
            disabled={!canApply}
            className="mt-4 w-full rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            분석에 반영
          </button>
        </div>
      )}
    </section>
  );
}

function AnalysisPanel({
  state,
  analysis,
  onToggleKeep,
  onToggleHidden,
}: {
  state: StoredRelationshipState;
  analysis: NonNullable<ReturnType<typeof analyzeRelationships>>;
  onToggleKeep: (username: string) => void;
  onToggleHidden: (username: string) => void;
}) {
  const canReview = state.following.length > 0 && state.followers.length > 0;

  return (
    <section className="px-4 py-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-3 gap-3 text-center">
          <Stat label="팔로잉" value={analysis.followingCount} />
          <Stat label="팔로워" value={analysis.followerCount} />
          <Stat label="확인 필요" value={analysis.reviewAccounts.length} />
        </div>
      </div>

      <div className="mt-4">
        {!canReview ? (
          <EmptyState />
        ) : (
          <AccountList
            title="확인 필요"
            accounts={analysis.reviewAccounts}
            emptyText="현재 확인할 계정이 없습니다."
            onToggleKeep={onToggleKeep}
            onToggleHidden={onToggleHidden}
          />
        )}
      </div>

      {analysis.keptAccounts.length > 0 && (
        <div className="mt-4">
          <AccountList
            title="유지 목록"
            accounts={analysis.keptAccounts}
            emptyText=""
            onToggleKeep={onToggleKeep}
            onToggleHidden={onToggleHidden}
          />
        </div>
      )}

      {analysis.hiddenCount > 0 && (
        <p className="mt-3 text-center text-xs text-slate-500">
          숨긴 항목 {analysis.hiddenCount.toLocaleString()}개
        </p>
      )}
    </section>
  );
}

function TabButton({
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
      className={
        active
          ? 'rounded px-3 py-1.5 text-sm font-medium bg-white text-slate-950 shadow-sm'
          : 'rounded px-3 py-1.5 text-sm font-medium text-slate-500 hover:text-slate-800'
      }
    >
      {children}
    </button>
  );
}

function LinkButton({ url, children }: { url: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => void browser.tabs.create({ url })}
      className="rounded-md border border-slate-200 px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
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
}: {
  tone: 'success' | 'error';
  children: ReactNode;
}) {
  const className =
    tone === 'error'
      ? 'border-red-200 bg-red-50 text-red-700'
      : 'border-emerald-200 bg-emerald-50 text-emerald-700';

  return (
    <div className={`mb-2 rounded-md border px-3 py-2 text-xs ${className}`}>
      {children}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-8 text-center">
      <p className="text-sm font-medium text-slate-700">
        가져오기 탭에서 공식 데이터 사본을 업로드하면 결과가 표시됩니다.
      </p>
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
    <div className="mt-4">
      <h3 className="text-xs font-semibold text-slate-600">{title}</h3>
      {files.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">{emptyText}</p>
      ) : (
        <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto text-xs text-slate-500">
          {files.map((file) => (
            <li key={file}>{file}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AccountList({
  title,
  accounts,
  emptyText,
  onToggleKeep,
  onToggleHidden,
}: {
  title: string;
  accounts: Account[];
  emptyText: string;
  onToggleKeep: (username: string) => void;
  onToggleHidden: (username: string) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-xs tabular-nums text-slate-500">
          {accounts.length.toLocaleString()}
        </span>
      </div>
      {accounts.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-5 text-center text-sm text-slate-500">
          {emptyText}
        </div>
      ) : (
        <ul className="max-h-[340px] space-y-2 overflow-y-auto pr-1">
          {accounts.map((account) => (
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
  return (
    <li className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-3">
        <Avatar account={account} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {account.displayName || account.username}
          </p>
          <p className="truncate text-xs text-slate-500">@{account.username}</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => void browser.tabs.create({ url: account.profileUrl })}
          className="rounded-md border border-slate-200 px-2 py-1.5 text-xs font-medium hover:bg-slate-50"
        >
          프로필 열기
        </button>
        <button
          type="button"
          onClick={() => onToggleKeep(account.username)}
          className="rounded-md border border-slate-200 px-2 py-1.5 text-xs font-medium hover:bg-slate-50"
        >
          {account.kept ? '유지 해제' : '유지'}
        </button>
        <button
          type="button"
          onClick={() => onToggleHidden(account.username)}
          className="rounded-md border border-slate-200 px-2 py-1.5 text-xs font-medium hover:bg-slate-50"
        >
          숨기기
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
        className="h-10 w-10 rounded-full bg-slate-100 object-cover"
      />
    );
  }

  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600">
      {account.username.slice(0, 1).toUpperCase()}
    </div>
  );
}

function statusLabel(status: ImportStatus): string {
  switch (status) {
    case 'parsing':
      return '읽는 중';
    case 'ready':
      return '읽기 완료';
    case 'error':
      return '오류';
    default:
      return '대기';
  }
}
