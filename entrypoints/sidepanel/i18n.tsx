import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type Locale = 'ko' | 'en';

interface Dict {
  app: {
    name: string;
    tagline: string;
  };
  header: {
    languageToggle: string;
    resetConfirm: string;
  };
  upload: {
    heroTitle: string;
    heroSubtitle: string;
    selectButton: string;
    reuploadButton: string;
    dropHere: string;
    privacyNote: string;
    howToTitle: string;
    howToSteps: readonly string[];
    threadsHelp: string;
    instagramHelp: string;
    statusIdle: string;
    statusParsing: string;
    statusReady: string;
    statusError: string;
    parsedFollowing: string;
    parsedFollowers: string;
    recognized: string;
    skipped: string;
    noRecognized: string;
    applyButton: string;
    needBoth: string;
    haveFollowing: (n: number) => string;
    haveFollowers: (n: number) => string;
  };
  result: {
    statLabel: string;
    statHint: string;
    profile: string;
    openOn: string;
    keep: string;
    keepUndo: string;
    hide: string;
    keptCount: (n: number) => string;
    keptHide: string;
    hiddenSummary: (n: number) => string;
    zeroTitle: string;
    zeroBody: string;
    reupload: string;
    resetData: string;
  };
  notice: {
    filesParsed: string;
    applied: string;
    reset: string;
    loadError: string;
    parseError: string;
  };
}

const en: Dict = {
  app: {
    name: 'Who Unfollowed Me?',
    tagline: 'Local-only analysis of your own data export.',
  },
  header: {
    languageToggle: 'Language',
    resetConfirm: 'Delete all stored data?',
  },
  upload: {
    heroTitle: 'Upload your data file',
    heroSubtitle: 'Pick the ZIP or JSON from Threads or Instagram.',
    selectButton: 'Select file',
    reuploadButton: 'Upload again',
    dropHere: 'Drop file here or click',
    privacyNote: 'Files are read only inside your browser.',
    howToTitle: 'How to get my data',
    howToSteps: [
      'Request "Followers and following" or "Connections" in JSON.',
      'Choose "Export to device".',
      'Wait for the email, then download within the deadline.',
    ],
    threadsHelp: 'Threads help',
    instagramHelp: 'Instagram export',
    statusIdle: 'Waiting',
    statusParsing: 'Reading…',
    statusReady: 'Ready',
    statusError: 'Error',
    parsedFollowing: 'Following',
    parsedFollowers: 'Followers',
    recognized: 'Recognized files',
    skipped: 'Skipped files',
    noRecognized: 'No files recognized yet.',
    applyButton: 'Apply to analysis',
    needBoth: 'Need both following and followers to analyze.',
    haveFollowing: (n) => `${n.toLocaleString()} following stored`,
    haveFollowers: (n) => `${n.toLocaleString()} followers stored`,
  },
  result: {
    statLabel: "Don't follow you back",
    statHint: "Accounts you follow that don't follow you.",
    profile: 'Open profile',
    openOn: 'Open on',
    keep: 'Keep',
    keepUndo: 'Unkeep',
    hide: 'Hide',
    keptCount: (n) => `Kept list (${n.toLocaleString()})`,
    keptHide: 'Hide kept list',
    hiddenSummary: (n) => `${n.toLocaleString()} hidden`,
    zeroTitle: 'All caught up',
    zeroBody: 'Everyone you follow follows you back.',
    reupload: 'Upload new data',
    resetData: 'Clear stored data',
  },
  notice: {
    filesParsed: 'File loaded. Apply to add it to the analysis.',
    applied: 'Applied to analysis.',
    reset: 'Local data cleared.',
    loadError: 'Could not load saved data.',
    parseError: 'Could not read the file.',
  },
};

const ko: Dict = {
  app: {
    name: '누가 뒷삭을 했을까?',
    tagline: '내 데이터로 브라우저에서만 분석합니다.',
  },
  header: {
    languageToggle: '언어',
    resetConfirm: '저장된 데이터를 모두 지울까요?',
  },
  upload: {
    heroTitle: '데이터 파일을 업로드하세요',
    heroSubtitle: 'Threads 또는 Instagram에서 받은 ZIP / JSON 파일을 선택하세요.',
    selectButton: '파일 선택',
    reuploadButton: '다시 업로드',
    dropHere: '파일을 끌어두거나 클릭',
    privacyNote: '파일은 브라우저 안에서만 처리됩니다.',
    howToTitle: '데이터 받는 방법',
    howToSteps: [
      '"Followers and following" 또는 "Connections"를 JSON으로 요청합니다.',
      '"Export to device"로 내려받기를 선택합니다.',
      '준비 메일이 오면 기한 안에 다운로드합니다.',
    ],
    threadsHelp: 'Threads 도움말',
    instagramHelp: 'Instagram 정보 내보내기',
    statusIdle: '대기',
    statusParsing: '읽는 중',
    statusReady: '읽기 완료',
    statusError: '오류',
    parsedFollowing: '팔로잉',
    parsedFollowers: '팔로워',
    recognized: '인식한 파일',
    skipped: '건너뛴 파일',
    noRecognized: '아직 인식한 파일이 없습니다.',
    applyButton: '분석에 반영',
    needBoth: '분석하려면 팔로잉과 팔로워가 모두 필요합니다.',
    haveFollowing: (n) => `저장된 팔로잉 ${n.toLocaleString()}명`,
    haveFollowers: (n) => `저장된 팔로워 ${n.toLocaleString()}명`,
  },
  result: {
    statLabel: '맞팔하지 않는 계정',
    statHint: '내가 팔로우하지만 나를 팔로우하지 않는 계정.',
    profile: '프로필',
    openOn: '프로필 열기',
    keep: '유지',
    keepUndo: '유지 해제',
    hide: '숨기기',
    keptCount: (n) => `유지 목록 (${n.toLocaleString()})`,
    keptHide: '유지 목록 닫기',
    hiddenSummary: (n) => `숨긴 항목 ${n.toLocaleString()}개`,
    zeroTitle: '모두 맞팔로우 중',
    zeroBody: '내가 팔로우하는 모든 계정이 나를 팔로우하고 있어요.',
    reupload: '새 데이터 업로드',
    resetData: '저장된 데이터 초기화',
  },
  notice: {
    filesParsed: '파일을 읽었어요. 반영 버튼을 눌러 분석에 적용하세요.',
    applied: '분석에 반영했습니다.',
    reset: '저장된 데이터를 지웠습니다.',
    loadError: '저장된 데이터를 불러오지 못했습니다.',
    parseError: '파일을 읽지 못했습니다.',
  },
};

const dictionaries: Record<Locale, Dict> = { en, ko };

const STORAGE_KEY = 'wum.locale';

function detectInitialLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'ko' || stored === 'en') return stored;
  } catch {
    // ignore — extension storage may be unavailable in some contexts
  }

  if (typeof navigator !== 'undefined') {
    const lang = navigator.language?.toLowerCase() ?? '';
    if (lang.startsWith('ko')) return 'ko';
  }
  return 'en';
}

interface I18nValue {
  locale: Locale;
  t: Dict;
  setLocale: (next: Locale) => void;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    setLocaleState(detectInitialLocale());
  }, []);

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      t: dictionaries[locale],
      setLocale: (next) => {
        setLocaleState(next);
        try {
          localStorage.setItem(STORAGE_KEY, next);
        } catch {
          // ignore
        }
      },
    }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
