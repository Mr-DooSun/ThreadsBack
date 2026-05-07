# FollowMirror

Meta/Instagram/Threads에서 사용자가 직접 다운로드한 공식 데이터 사본을 브라우저 안에서만 분석해 팔로워/팔로잉 관계를 비교하는 Chrome 확장 프로그램입니다.

이 프로젝트는 처음에는 Threads 화면을 직접 읽는 방향으로 시작했지만, 정책 리스크와 유지보수 리스크를 줄이기 위해 **공식 export 파일 기반 로컬 분석기**로 전환했습니다. 외부 서버 전송, 인증 정보 접근, 내부 API 사용, 자동 화면 조작은 하지 않습니다.

## 현재 상태

- 최신 커밋 기준 구현: `Build local export analyzer MVP`
- 앱 형태: Chrome MV3 확장 프로그램
- UI: Chrome Side Panel
- 데이터 입력: 사용자가 선택한 ZIP 또는 JSON 파일
- 데이터 처리: 브라우저 메모리에서 로컬 파싱
- 데이터 저장: `chrome.storage.local`
- 비교 기준: `following - followers`
- 최종 Manifest 권한:

```json
{
  "permissions": ["storage", "sidePanel"]
}
```

`host_permissions`, `content_scripts`, `<all_urls>`, `tabs` 권한은 사용하지 않습니다.

## 제품 방향

### 하는 일

- Meta/Instagram/Threads 공식 데이터 사본 신청을 안내합니다.
- 사용자가 다운로드한 ZIP/JSON 파일을 선택하게 합니다.
- ZIP 내부 또는 JSON 파일에서 팔로워/팔로잉 데이터를 찾습니다.
- 팔로잉 목록에서 팔로워 목록을 뺀 결과를 보여줍니다.
- 사용자가 각 계정을 직접 판단할 수 있도록 프로필 링크, 유지 목록, 숨기기 기능을 제공합니다.

### 하지 않는 일

- Threads 화면 자동 수집
- 자동 스크롤
- 버튼 대리 클릭
- 내부 API 또는 네트워크 응답 사용
- 로그인 정보, 쿠키, 토큰 접근
- 외부 서버 전송
- HTML export 파싱
- 팔로우/팔로잉 상태 변경
- 백그라운드 상시 분석

## 사용 흐름

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

## 개발 환경 세팅

```bash
npm install
```

개발 서버:

```bash
npm run dev
```

빌드:

```bash
npm run build
```

Chrome에서 수동 로드:

1. `chrome://extensions` 열기
2. 개발자 모드 켜기
3. `압축해제된 확장 프로그램 로드` 클릭
4. 이 폴더 선택:

```text
.output/chrome-mv3
```

macOS 파일 선택창에서 `.output`이 안 보이면 `Command + Shift + .`로 숨김 파일 표시를 켭니다.

## 스크립트

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | WXT 개발 서버 실행 |
| `npm run build` | Chrome MV3 확장 빌드 |
| `npm run zip` | 스토어 제출용 zip 생성 |
| `npm run typecheck` | TypeScript 타입 검사 |
| `npm test` | Vitest 단위 테스트 실행 |

## 프로젝트 구조

```text
.
├── entrypoints/
│   ├── background.ts
│   └── sidepanel/
│       ├── App.tsx
│       ├── index.html
│       ├── main.tsx
│       └── styles.css
├── lib/
│   ├── diff.ts
│   ├── diff.test.ts
│   ├── exportParser.ts
│   ├── exportParser.test.ts
│   ├── storage.ts
│   └── types.ts
├── package.json
├── tsconfig.json
├── wxt.config.ts
└── README.md
```

### 주요 파일 역할

- `entrypoints/background.ts`
  - 확장 아이콘 클릭 시 Chrome Side Panel이 열리도록 설정합니다.
- `entrypoints/sidepanel/App.tsx`
  - 전체 UI입니다.
  - `가져오기` 탭: 공식 도움말 링크, 파일 업로드, 파싱 미리보기, 분석 반영
  - `분석 결과` 탭: 팔로잉/팔로워 수, 확인 필요 목록, 유지 목록, 숨기기
- `lib/exportParser.ts`
  - ZIP/JSON export 파일을 파싱합니다.
  - `followers_1.json`, `followers_2.json`, `following.json`, `relationships_following`, `relationships_followers` 등 알려진 패턴을 탐색합니다.
- `lib/diff.ts`
  - username 정규화, 중복 제거, `following - followers` 계산을 담당합니다.
- `lib/storage.ts`
  - `chrome.storage.local` 저장/로드/초기화를 담당합니다.
- `lib/types.ts`
  - 계정, 스냅샷, 분석 결과, 저장 상태 타입을 정의합니다.

## 데이터 모델

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

## 파서가 기대하는 데이터 형태

Meta export의 내부 구조는 공식적으로 안정된 개발자 스펙처럼 공개되어 있지 않습니다. 그래서 파서는 하나의 파일명만 하드코딩하지 않고 여러 후보를 탐색합니다.

지원하는 대표 형태:

```json
{
  "relationships_following": [
    {
      "string_list_data": [
        {
          "href": "https://www.instagram.com/example",
          "value": "example",
          "timestamp": 1700000000
        }
      ]
    }
  ]
}
```

또는:

```json
[
  {
    "string_list_data": [
      {
        "href": "https://www.instagram.com/example",
        "value": "example",
        "timestamp": 1700000000
      }
    ]
  }
]
```

ZIP 내부에서 탐색하는 대표 파일명:

- `followers_1.json`
- `followers_2.json`
- `following.json`
- `connections/followers_and_following/followers_1.json`
- `connections/followers_and_following/following.json`

실제 export 구조가 다르면 `lib/exportParser.ts`의 탐색 로직을 보강해야 합니다.

## 실제 export 파일 확인 방법

개인정보를 출력하지 않고 ZIP 내부 파일명만 확인:

```bash
unzip -l your-export.zip | grep -Ei 'follow|connection|relationship'
```

JSON 최상위 key만 확인:

```bash
jq 'keys' path/to/following.json
```

배열 형태 파일인지 확인:

```bash
jq 'type' path/to/followers_1.json
```

민감한 계정 목록 자체를 공유하지 말고, 파일명과 최상위 key 구조만 확인해서 파서를 보강하는 것이 좋습니다.

## 테스트 및 검증

```bash
npm run typecheck
npm test
npm run build
```

현재 테스트 범위:

- ZIP export 파싱
- 단일 followers JSON 파싱
- 단일 following JSON 파싱
- 다중 followers 파일 합산
- 중복 username 제거
- 인식 불가 JSON 오류 처리
- HTML export 미지원 안내
- 대량 데이터 10,000건 파싱
- `following - followers` 계산
- 유지 목록/숨김 목록 반영

빌드 후 Manifest 확인:

```bash
cat .output/chrome-mv3/manifest.json
```

정상이라면 다음만 포함되어야 합니다.

```json
{
  "permissions": ["storage", "sidePanel"]
}
```

`host_permissions`와 `content_scripts`가 있으면 안 됩니다.

## 개인정보 및 정책 메모

- 이 프로젝트는 사용자가 직접 선택한 공식 export 파일만 처리합니다.
- 파일은 외부 서버로 업로드하지 않습니다.
- 인증 정보, 쿠키, 토큰에 접근하지 않습니다.
- Meta/Threads 내부 API를 사용하지 않습니다.
- 자동 스크롤이나 자동 화면 조작을 하지 않습니다.
- 공개 배포를 고려해 최소 권한을 유지합니다.

Chrome Web Store 제출 전에는 별도 개인정보처리방침 문서가 필요합니다. 핵심 문구는 “사용자가 선택한 파일을 브라우저 로컬에서만 파싱하고, 분석 결과는 `chrome.storage.local`에만 저장하며, 외부 전송은 없다”가 되어야 합니다.

## 알려진 한계

- 실제 Meta export의 폴더명과 JSON key는 변경될 수 있습니다.
- v1은 JSON export만 지원합니다.
- HTML export는 지원하지 않습니다.
- 대형 ZIP 파일은 브라우저 메모리 상황에 따라 처리 시간이 걸릴 수 있습니다.
- export 데이터가 Instagram 기준이면 프로필 링크도 Instagram URL로 열립니다.
- Threads 전용 export의 실제 파일 구조는 추가 검증이 필요합니다.

## 다음 작업 후보

1. 실제 Meta/Instagram/Threads export ZIP으로 파서 검증
2. 인식 실패 시 사용자가 파일명과 최상위 key를 쉽게 복사할 수 있는 디버그 정보 UI 추가
3. 개인정보처리방침 초안 작성
4. Chrome Web Store용 설명문/스크린샷/아이콘 준비
5. CSV 내보내기 추가
6. 대형 파일 처리 UX 개선
   - 파일 크기 표시
   - 파싱 진행 상태
   - 더 친절한 오류 메시지
7. 실제 Threads export 구조가 확인되면 `exportParser.ts` 테스트 fixture 보강

## 최근 의사결정

- DOM 기반 화면 읽기 기능은 제거했습니다.
- `host_permissions`는 제거했습니다.
- export 파일은 저장하지 않고 파싱 결과만 저장합니다.
- 파싱 결과 반영 시 기존 following/followers 목록은 새 export 결과로 교체합니다.
- 유지 목록과 숨김 목록은 초기화하지 않고 유지합니다.
