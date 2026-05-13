import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type Locale = 'ko' | 'en';
type GuidePlatform = 'threads' | 'instagram';
type GuideStep = {
  title: string;
  body: string;
  importantNote?: string;
  previewTitle: string;
  previewItems: readonly string[];
  previewActiveIndex: number;
  previewKind:
    | 'exportHome'
    | 'profile'
    | 'destination'
    | 'confirm'
    | 'customizeInstagram'
    | 'customizeThreads'
    | 'ready';
};

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
    safetyTitle: string;
    safetyItems: readonly string[];
    selectButton: string;
    reuploadButton: string;
    dropHere: string;
    dropActive: string;
    privacyNote: string;
    howToTitle: string;
    howToOpen: string;
    howToIntro: string;
    howToClose: string;
    howToPrev: string;
    howToNext: string;
    howToDone: string;
    howToStepCount: (current: number, total: number) => string;
    howToSteps: Record<GuidePlatform, readonly GuideStep[]>;
    howToFooterNote: string;
    accountsCenterExport: string;
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
    safetyNote: string;
    profile: string;
    openOn: string;
    profileOpenModeLabel: string;
    profileOpenCurrentTab: string;
    profileOpenNewTab: string;
    hide: string;
    hideHint: string;
    reviewedToast: (label: string) => string;
    reviewUndo: string;
    hiddenSummary: (n: number) => string;
    zeroTitle: string;
    zeroBody: string;
    zeroReviewedTitle: string;
    zeroReviewedBody: string;
    reupload: string;
    resetData: string;
  };
  support: {
    ctaTitle: string;
    ctaBody: string;
    koFiButton: string;
    paypalButton: string;
    optionalNote: string;
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
    heroSubtitle: 'Create a Meta Accounts Center export, then upload the ready ZIP or JSON.',
    safetyTitle: 'Safe by design',
    safetyItems: [
      'No login, password, cookies, or access tokens.',
      'No scraping, auto-scrolling, or internal API access.',
      'Automated unfollowing is not provided because it can create policy and account restriction risks.',
      'You review profiles yourself before taking any action.',
    ],
    selectButton: 'Select file',
    reuploadButton: 'Upload again',
    dropHere: 'Drop ZIP or JSON here, or click',
    dropActive: 'Drop the file to upload',
    privacyNote: 'Files are read only inside your browser.',
    howToTitle: 'How to get my data',
    howToOpen: 'Open guide',
    howToIntro: 'Follow these screens in Meta Accounts Center, then come back with the ZIP file.',
    howToClose: 'Close',
    howToPrev: 'Back',
    howToNext: 'Next',
    howToDone: 'Done',
    howToStepCount: (current, total) => `Step ${current} of ${total}`,
    howToSteps: {
      threads: [
        {
          title: 'Create export',
          body: 'Open Meta Accounts Center export and start a new export request.',
          previewTitle: 'Export your information',
          previewItems: ['Create export', 'Current activity', 'Past activity'],
          previewActiveIndex: 0,
          previewKind: 'exportHome',
        },
        {
          title: 'Choose Instagram profile',
          body: 'If your Threads profile was created with Instagram, select that connected Instagram profile.',
          previewTitle: 'Select profile',
          previewItems: ['Instagram profile', 'Connected Threads data'],
          previewActiveIndex: 0,
          previewKind: 'profile',
        },
        {
          title: 'Export to device',
          body: 'Choose export to device, not export to an external service.',
          previewTitle: 'Choose where to export',
          previewItems: ['Export to device', 'Export to external service'],
          previewActiveIndex: 0,
          previewKind: 'destination',
        },
        {
          title: 'Confirm export settings',
          body: 'Open Customize information. Do not export everything.',
          previewTitle: 'Confirm your export',
          previewItems: ['Customize information', 'Date range', 'Format', 'Media quality'],
          previewActiveIndex: 0,
          previewKind: 'confirm',
        },
        {
          title: 'Clear all first',
          body: 'Tap Clear all first. This keeps the ZIP small by exporting only the Threads data this analysis needs.',
          importantNote: 'Important: tap Clear all first, then check only Threads.',
          previewTitle: 'Customize information',
          previewItems: ['Clear all first', 'Your Instagram activity', 'Threads: on'],
          previewActiveIndex: 2,
          previewKind: 'customizeThreads',
        },
        {
          title: 'Set JSON format',
          body: 'Set Date range to all time if available and Format to JSON. Media quality does not matter for this analysis.',
          previewTitle: 'Confirm your export',
          previewItems: ['Date range: all time', 'Format: JSON', 'Media quality: any'],
          previewActiveIndex: -1,
          previewKind: 'confirm',
        },
        {
          title: 'Download when ready',
          body: 'Meta will email you when the export is ready. Return to this Accounts Center page and use the Download button that appears next to Cancel.',
          previewTitle: 'Export your information',
          previewItems: ['Requested', 'Download', 'Cancel'],
          previewActiveIndex: 0,
          previewKind: 'ready',
        },
      ],
      instagram: [
        {
          title: 'Create export',
          body: 'Open Meta Accounts Center export and start a new export request.',
          previewTitle: 'Export your information',
          previewItems: ['Create export', 'Current activity', 'Past activity'],
          previewActiveIndex: 0,
          previewKind: 'exportHome',
        },
        {
          title: 'Choose Instagram profile',
          body: 'Select the Instagram profile you want to analyze.',
          previewTitle: 'Select profile',
          previewItems: ['Instagram profile'],
          previewActiveIndex: 0,
          previewKind: 'profile',
        },
        {
          title: 'Export to device',
          body: 'Choose export to device, not export to an external service.',
          previewTitle: 'Choose where to export',
          previewItems: ['Export to device', 'Export to external service'],
          previewActiveIndex: 0,
          previewKind: 'destination',
        },
        {
          title: 'Confirm export settings',
          body: 'Open Customize information. Do not export everything.',
          previewTitle: 'Confirm your export',
          previewItems: ['Customize information', 'Date range', 'Format', 'Media quality'],
          previewActiveIndex: 0,
          previewKind: 'confirm',
        },
        {
          title: 'Clear all first',
          body: 'Tap Clear all first. This keeps the ZIP small by exporting only Followers and following.',
          importantNote: 'Important: tap Clear all first, then check only Followers and following.',
          previewTitle: 'Customize information',
          previewItems: [
            'Clear all first',
            'Connections',
            'Contacts: off',
            'Followers and following: on',
          ],
          previewActiveIndex: 3,
          previewKind: 'customizeInstagram',
        },
        {
          title: 'Set JSON format',
          body: 'Set Date range to all time if available and Format to JSON. Media quality does not matter for this analysis.',
          previewTitle: 'Confirm your export',
          previewItems: ['Date range: all time', 'Format: JSON', 'Media quality: any'],
          previewActiveIndex: -1,
          previewKind: 'confirm',
        },
        {
          title: 'Download when ready',
          body: 'Meta will email you when the export is ready. Return to this Accounts Center page and use the Download button that appears next to Cancel.',
          previewTitle: 'Export your information',
          previewItems: ['Requested', 'Download', 'Cancel'],
          previewActiveIndex: 0,
          previewKind: 'ready',
        },
      ],
    },
    howToFooterNote: 'Screens may vary by account or language. The important part is the ZIP or JSON file, not a screenshot or link.',
    accountsCenterExport: 'Open Meta Accounts Center export',
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
    statLabel: 'To review',
    statHint: "Accounts you follow that don't follow you back and are not marked yet.",
    safetyNote: 'To reduce policy and account restriction risks, this extension only helps you review accounts. It never follows, unfollows, or changes your Threads or Instagram account.',
    profile: 'Open profile',
    openOn: 'Open on',
    profileOpenModeLabel: 'Open profiles in',
    profileOpenCurrentTab: 'Current tab',
    profileOpenNewTab: 'New tab',
    hide: 'Reviewed',
    hideHint: 'Mark as handled',
    reviewedToast: (label) => `${label} marked as reviewed.`,
    reviewUndo: 'Undo',
    hiddenSummary: (n) => `${n.toLocaleString()} reviewed`,
    zeroTitle: 'All caught up',
    zeroBody: 'Everyone you follow follows you back.',
    zeroReviewedTitle: 'Review complete',
    zeroReviewedBody: 'No remaining accounts to review. Reviewed records are saved locally.',
    reupload: 'Upload new data',
    resetData: 'Clear stored data',
  },
  support: {
    ctaTitle: 'Support development',
    ctaBody: 'This tool is free. If it helped, you can support ongoing maintenance.',
    koFiButton: 'Support on Ko-fi',
    paypalButton: 'Support with PayPal',
    optionalNote: 'Payments open on an external site. This extension does not process payment information.',
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
    name: '누가 뒷삭했을까?',
    tagline: '내 데이터로 브라우저에서만 분석합니다.',
  },
  header: {
    languageToggle: '언어',
    resetConfirm: '저장된 데이터를 모두 지울까요?',
  },
  upload: {
    heroTitle: '데이터 파일을 업로드하세요',
    heroSubtitle: 'Meta Accounts Center에서 export를 만든 뒤, 준비된 ZIP / JSON 파일을 선택하세요.',
    safetyTitle: '계정에 손대지 않아요',
    safetyItems: [
      '로그인 정보, 쿠키, 토큰을 요구하거나 읽지 않습니다.',
      '스크래핑, 자동 스크롤, 내부 API 접근을 하지 않습니다.',
      '자동 언팔로우는 정책 위반과 계정 제한 리스크가 있어 제공하지 않습니다.',
      '프로필을 직접 확인하고 최종 판단은 사용자가 합니다.',
    ],
    selectButton: '파일 선택',
    reuploadButton: '다시 업로드',
    dropHere: 'ZIP 또는 JSON 파일을 끌어두거나 클릭',
    dropActive: '파일을 여기에 놓으세요',
    privacyNote: '파일은 브라우저 안에서만 처리됩니다.',
    howToTitle: '데이터 받는 방법',
    howToOpen: '가이드 열기',
    howToIntro: 'Meta Accounts Center에서 아래 흐름대로 진행한 뒤, ZIP 파일을 받아 다시 돌아오면 됩니다.',
    howToClose: '닫기',
    howToPrev: '이전',
    howToNext: '다음',
    howToDone: '완료',
    howToStepCount: (current, total) => `${total}단계 중 ${current}단계`,
    howToSteps: {
      threads: [
        {
          title: '내보내기 만들기',
          body: 'Meta Accounts Center의 내 정보 내보내기 화면을 열고 새 내보내기 요청을 시작합니다.',
          previewTitle: '내 정보 내보내기',
          previewItems: ['내보내기 만들기', '현재 활동', '지난 활동'],
          previewActiveIndex: 0,
          previewKind: 'exportHome',
        },
        {
          title: 'Instagram 프로필 선택',
          body: 'Threads를 Instagram 계정으로 만들었다면 연결된 Instagram 프로필을 선택합니다.',
          previewTitle: '프로필 선택',
          previewItems: ['Instagram 프로필', '연결된 Threads 데이터'],
          previewActiveIndex: 0,
          previewKind: 'profile',
        },
        {
          title: '기기에 내보내기',
          body: '외부 서비스가 아니라 기기로 내보내기를 선택합니다.',
          previewTitle: '내보낼 위치 선택',
          previewItems: ['기기로 내보내기', '외부 서비스로 내보내기'],
          previewActiveIndex: 0,
          previewKind: 'destination',
        },
        {
          title: '내보내기 설정 확인',
          body: '정보 맞춤 설정으로 들어갑니다. 전체 정보는 내보내지 않는 게 좋습니다.',
          previewTitle: '내보내기 확인',
          previewItems: [
            '정보 맞춤 설정: 사용 가능한 모든 정보',
            '기간: 작년',
            '형식: HTML',
            '미디어 품질: 보통 화질',
          ],
          previewActiveIndex: 0,
          previewKind: 'confirm',
        },
        {
          title: '모두 지우기 먼저 누르기',
          body: '반드시 모두 지우기를 먼저 눌러 전체 선택을 해제하세요. 그래야 필요한 Threads 데이터만 받아서 ZIP 파일이 너무 커지지 않습니다.',
          importantNote: '중요: 모두 지우기를 먼저 누른 뒤 Threads만 체크하세요.',
          previewTitle: '내보낼 특정 정보 선택',
          previewItems: ['모두 지우기', '내 Instagram 활동', 'Threads: 켬'],
          previewActiveIndex: 2,
          previewKind: 'customizeThreads',
        },
        {
          title: 'JSON 형식 설정',
          body: '기간은 가능하면 전체 기간, 형식은 JSON으로 설정합니다. 미디어 품질은 이 분석에 중요하지 않습니다.',
          previewTitle: '내보내기 확인',
          previewItems: ['기간: 전체 기간', '형식: JSON', '미디어 품질: 아무거나'],
          previewActiveIndex: -1,
          previewKind: 'confirm',
        },
        {
          title: '준비되면 다운로드',
          body: 'Meta에서 준비 완료 메일이 오면 이 Accounts Center 화면으로 돌아옵니다. 취소 옆에 생긴 다운로드 버튼을 눌러 ZIP 파일을 받습니다.',
          previewTitle: '내 정보 내보내기',
          previewItems: ['요청됨', '다운로드', '취소'],
          previewActiveIndex: 0,
          previewKind: 'ready',
        },
      ],
      instagram: [
        {
          title: '내보내기 만들기',
          body: 'Meta Accounts Center의 내 정보 내보내기 화면을 열고 새 내보내기 요청을 시작합니다.',
          previewTitle: '내 정보 내보내기',
          previewItems: ['내보내기 만들기', '현재 활동', '지난 활동'],
          previewActiveIndex: 0,
          previewKind: 'exportHome',
        },
        {
          title: 'Instagram 프로필 선택',
          body: '분석하려는 Instagram 프로필을 선택합니다.',
          previewTitle: '프로필 선택',
          previewItems: ['Instagram 프로필'],
          previewActiveIndex: 0,
          previewKind: 'profile',
        },
        {
          title: '기기에 내보내기',
          body: '외부 서비스가 아니라 기기로 내보내기를 선택합니다.',
          previewTitle: '내보낼 위치 선택',
          previewItems: ['기기로 내보내기', '외부 서비스로 내보내기'],
          previewActiveIndex: 0,
          previewKind: 'destination',
        },
        {
          title: '내보내기 설정 확인',
          body: '정보 맞춤 설정으로 들어갑니다. 전체 정보는 내보내지 않는 게 좋습니다.',
          previewTitle: '내보내기 확인',
          previewItems: [
            '정보 맞춤 설정: 사용 가능한 모든 정보',
            '기간: 작년',
            '형식: HTML',
            '미디어 품질: 보통 화질',
          ],
          previewActiveIndex: 0,
          previewKind: 'confirm',
        },
        {
          title: '모두 지우기 먼저 누르기',
          body: '반드시 모두 지우기를 먼저 눌러 전체 선택을 해제하세요. 그래야 팔로워 및 팔로잉만 받아서 ZIP 파일이 너무 커지지 않습니다.',
          importantNote: '중요: 모두 지우기를 먼저 누른 뒤 팔로워 및 팔로잉만 체크하세요.',
          previewTitle: '내보낼 특정 정보 선택',
          previewItems: ['모두 지우기', '연결 활동', '연락처: 끔', '팔로워 및 팔로잉: 켬'],
          previewActiveIndex: 3,
          previewKind: 'customizeInstagram',
        },
        {
          title: 'JSON 형식 설정',
          body: '기간은 가능하면 전체 기간, 형식은 JSON으로 설정합니다. 미디어 품질은 이 분석에 중요하지 않습니다.',
          previewTitle: '내보내기 확인',
          previewItems: ['기간: 전체 기간', '형식: JSON', '미디어 품질: 아무거나'],
          previewActiveIndex: -1,
          previewKind: 'confirm',
        },
        {
          title: '준비되면 다운로드',
          body: 'Meta에서 준비 완료 메일이 오면 이 Accounts Center 화면으로 돌아옵니다. 취소 옆에 생긴 다운로드 버튼을 눌러 ZIP 파일을 받습니다.',
          previewTitle: '내 정보 내보내기',
          previewItems: ['요청됨', '다운로드', '취소'],
          previewActiveIndex: 0,
          previewKind: 'ready',
        },
      ],
    },
    howToFooterNote: '계정이나 언어에 따라 화면은 조금 다를 수 있습니다. 중요한 건 스크린샷이나 링크가 아니라 ZIP 또는 JSON 파일입니다.',
    accountsCenterExport: 'Meta Accounts Center 내보내기 열기',
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
    statLabel: '검토할 계정',
    statHint: '아직 처리하지 않은 맞팔 제외 계정.',
    safetyNote: '정책 위반과 계정 제한 리스크를 줄이기 위해, 이 확장 프로그램은 확인을 돕기만 합니다. Threads 또는 Instagram 계정의 팔로우 상태를 대신 변경하지 않습니다.',
    profile: '프로필',
    openOn: '프로필 열기',
    profileOpenModeLabel: '프로필 열기 방식',
    profileOpenCurrentTab: '현재 탭',
    profileOpenNewTab: '새 탭',
    hide: '검토 완료',
    hideHint: '언팔했거나 더 볼 필요 없음',
    reviewedToast: (label) => `${label}을(를) 검토 완료로 표시했어요.`,
    reviewUndo: '되돌리기',
    hiddenSummary: (n) => `검토 완료한 계정 ${n.toLocaleString()}개`,
    zeroTitle: '모두 맞팔로우 중',
    zeroBody: '내가 팔로우하는 모든 계정이 나를 팔로우하고 있어요.',
    zeroReviewedTitle: '검토 완료',
    zeroReviewedBody: '남은 검토 항목이 없습니다. 검토 완료 기록은 기기에 남아 있어요.',
    reupload: '새 데이터 업로드',
    resetData: '저장된 데이터 초기화',
  },
  support: {
    ctaTitle: '개발 후원',
    ctaBody: '이 도구는 무료입니다. 도움이 됐다면 유지보수를 후원할 수 있어요.',
    koFiButton: 'Ko-fi로 후원',
    paypalButton: 'PayPal로 후원',
    optionalNote: '결제는 외부 사이트에서 열립니다. 이 확장 프로그램은 결제 정보를 처리하지 않습니다.',
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
