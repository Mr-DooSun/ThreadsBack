# Test Fixtures

확장 사이드패널 UI를 실제 데이터로 테스트하기 위한 가짜 export 파일입니다.

## 파일

| 파일 | 용도 |
|------|------|
| `following.json` | 단일 JSON (팔로잉 15명) |
| `followers_1.json` | 단일 JSON (팔로워 10명) |
| `instagram-export.zip` | Meta export와 같은 디렉토리 구조로 묶은 ZIP |

## 예상 결과

업로드 → "분석에 반영" 누르면 결과 화면에:

- **맞팔하지 않는 계정: 7**
- 표시 순서 (사용자명 사전순):
  1. `cool_news_daily`
  2. `design_inspiration`
  3. `everyday_english`
  4. `indie_dev_log`
  5. `korea_food_diary`
  6. `photo_master`
  7. `very_long_username_for_truncation_test` ← truncate 동작 확인용

8명은 맞팔(`john_smith`, `sarah_kim`, `mr_doosun`, `code_jeju`, `daily_devnotes`, `art_maria`, `the_curious_cat`, `_alex`)이라 결과 화면에 안 보입니다.

## 테스트 시나리오

### 1. 단일 JSON 업로드
1. `following.json` 선택 → "팔로잉 15 / 팔로워 0" 표시
2. "분석에 반영" → 노란 경고 (팔로워가 없어 분석 불가)
3. `followers_1.json` 추가 업로드 → "팔로잉 0 / 팔로워 10"
4. "분석에 반영" → 결과 화면 진입, 7명 표시

### 2. ZIP 한 번에 업로드
1. `instagram-export.zip` 선택 → "팔로잉 15 / 팔로워 10" 한 번에
2. "분석에 반영" → 결과 화면 진입

### 3. 두 JSON 동시 선택
파일 선택 다이얼로그에서 `following.json`과 `followers_1.json` 둘 다 선택해도 동일하게 동작합니다.

### 4. 결과 화면 인터랙션
- 카드 클릭 → 새 탭에서 프로필 열기
- "유지" → 카드가 강조색으로 바뀌고 "유지 목록"으로 이동
- "숨기기" → 리스트에서 사라지고 하단에 "숨긴 항목 N개"
- "유지 목록 (N)" 펼치기 → 유지된 계정 확인 + "유지 해제" 가능
- "새 데이터 업로드" 펼치기 → 다른 fixture로 갈아끼우기
- "저장된 데이터 초기화" → confirm dialog 후 빈 상태로

### 5. 언어 토글
- 헤더 우상단 `한 / EN` 클릭 → 즉시 모든 텍스트 전환, 새로고침해도 유지

### 6. 0건 success 상태 보기
일부러 모든 계정이 맞팔이 되도록 followers를 따로 만들어서 업로드하거나, "유지/숨기기"로 7명을 모두 처리하면 success state(`모두 맞팔로우 중`) UI가 나타납니다.

## 대량 데이터 (선택)

스크롤/렌더 부하를 보고 싶다면:

```bash
node fixtures/generate-large.mjs 200 80
# fixtures/large/following.json + followers_1.json 생성
# 기본값: following 200, mutual 80 → 결과 120명
```

인자는 `<following 총 수> <맞팔 수>` 입니다.

## 주의

이 fixtures는 모두 가짜입니다. 실제 사용자명/프로필 URL과 우연히 일치할 수 있으니 결과 화면에서 "프로필 열기"를 누르면 실존하지 않을 수도 있는 Instagram 계정으로 이동합니다. UI 동작 확인 외 용도로 쓰지 마세요.
