# FollowMirror

Meta/Instagram/Threads에서 사용자가 직접 다운로드한 공식 데이터 사본을 브라우저 안에서만 분석해 팔로워/팔로잉 관계를 비교하는 Chrome 확장 프로그램입니다.

외부 서버 전송, 인증 정보 접근, 내부 API 사용, 자동 화면 조작은 하지 않습니다. 업로드한 ZIP/JSON 파일은 사용자 브라우저에서만 읽고, 분석 결과는 `chrome.storage.local`에 저장합니다.

## 1. 프로젝트 개요

- 배포 형태: Chrome Extension
- Manifest: Manifest V3
- UI: Chrome Side Panel
- 임시 이름: `FollowMirror`
- 핵심 목적: 공식 export 파일의 팔로잉/팔로워 목록을 로컬에서 비교
- 비교 기준: `following - followers`

## 2. v1 MVP 범위

### 필수 기능

- 공식 데이터 사본 신청 도움말 링크 제공
- ZIP 또는 JSON export 파일 선택
- 브라우저 메모리에서 파일 파싱
- 팔로잉/팔로워 계정 목록 추출
- 다중 파일 예: `followers_1.json`, `followers_2.json` 합산
- 파싱 결과 미리보기
  - 팔로잉 수
  - 팔로워 수
  - 인식한 파일
  - 건너뛴 파일
- 사용자가 확인한 뒤 분석 데이터에 반영
- `following - followers` 관계 상태 계산
- 결과 목록 표시
- 프로필 열기
- 유지 목록
- 목록에서 숨기기
- 로컬 데이터 초기화

### v1에서 제외하는 기능

- Threads 화면 자동 수집
- 자동 스크롤
- 버튼 대리 클릭
- 내부 API 또는 네트워크 응답 사용
- 로그인 또는 인증 정보 접근
- 외부 서버 전송
- HTML export 파싱
- 계정 상태를 변경하는 기능

## 3. 기술 스택

| 영역 | 선택 | 비고 |
| --- | --- | --- |
| Extension Manifest | Manifest V3 | Chrome Web Store 기준 |
| 빌드 도구 | WXT | Vite 기반 확장 프로그램 개발 |
| 언어 | TypeScript | 타입 안정성 |
| UI | React + Tailwind CSS | 사이드패널 |
| ZIP 파싱 | JSZip | 브라우저 로컬 처리 |
| 상태 저장 | `chrome.storage.local` | 로컬 저장 |
| 외부 서버 | 없음 | 모든 처리는 브라우저 안에서 수행 |

## 4. 권한 정책

필요한 권한만 요청합니다.

```json
{
  "permissions": ["storage", "sidePanel"]
}
```

`<all_urls>`, `tabs`, Threads 도메인 권한 등 넓은 권한은 사용하지 않습니다.

## 5. 사용 흐름

1. 확장 프로그램 아이콘을 눌러 사이드패널을 엽니다.
2. `가져오기` 탭에서 공식 도움말 링크를 엽니다.
3. Meta Accounts Center에서 데이터 사본을 요청합니다.
   - `JSON` 형식 권장
   - `Followers and following` 또는 `Connections` 계열 항목 선택
   - `Export to device` 선택
4. 준비된 ZIP 또는 JSON 파일을 내려받습니다.
5. 사이드패널에서 파일을 선택합니다.
6. 파싱 결과의 팔로잉/팔로워 수와 인식 파일을 확인합니다.
7. `분석에 반영`을 누릅니다.
8. `분석 결과` 탭에서 관계 상태를 확인합니다.

공식 도움말:

- Threads 데이터 다운로드: https://www.facebook.com/help/instagram/259803026523198
- Instagram 정보 내보내기: https://www.facebook.com/help/instagram/181231772500920

## 6. 데이터 모델

```typescript
interface Account {
  username: string;
  displayName: string;
  avatarUrl?: string;
  profileUrl: string;
  firstSeenAt: number;
  hidden?: boolean;
  kept?: boolean;
}

interface StoredRelationshipState {
  version: 1;
  following: Account[];
  followers: Account[];
  keptUsernames: string[];
  hiddenUsernames: string[];
  updatedAt?: number;
}
```

Meta export에는 표시 이름과 프로필 이미지가 없을 수 있습니다. 이 경우 UI는 username과 이니셜 표시를 사용합니다.

## 7. 프로젝트 구조

```text
extension/
├── entrypoints/
│   ├── background.ts
│   └── sidepanel/
│       ├── App.tsx
│       ├── index.html
│       └── styles.css
├── lib/
│   ├── diff.ts
│   ├── exportParser.ts
│   ├── storage.ts
│   └── types.ts
└── wxt.config.ts
```

## 8. 보안 및 개인정보

- 사용자가 선택한 파일만 읽습니다.
- 파일은 브라우저 안에서만 파싱합니다.
- 외부 서버로 데이터를 보내지 않습니다.
- 로그인 정보, 쿠키, 토큰에 접근하지 않습니다.
- Meta/Threads 내부 API를 사용하지 않습니다.
- 분석 결과는 `chrome.storage.local`에만 저장합니다.
- 로컬 데이터는 확장 프로그램의 `초기화` 버튼으로 삭제할 수 있습니다.

## 9. 로컬 실행

```bash
npm install
npm run dev
```

수동으로 로드하려면 빌드 후 Chrome 확장 프로그램 개발자 모드에서 `.output/chrome-mv3` 디렉터리를 선택합니다.

```bash
npm run build
```

## 10. 테스트 및 검증

```bash
npm run typecheck
npm test
npm run build
```

검증 항목:

- ZIP export 파싱
- 단일 JSON 파일 파싱
- 다중 followers 파일 합산
- 중복 username 제거
- 인식 불가 JSON 오류 처리
- HTML export 미지원 안내
- `following - followers` 계산
- 유지 목록/숨김 목록 반영
- Manifest 권한 최소화

## 11. 알려진 한계

- 실제 Meta export의 폴더명과 JSON 키는 변경될 수 있습니다.
- v1은 JSON export만 지원합니다.
- 대형 ZIP 파일은 브라우저 메모리 상황에 따라 처리 시간이 걸릴 수 있습니다.
- export 데이터가 Instagram 기준이면 프로필 링크도 Instagram URL로 열립니다.
