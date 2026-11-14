# 회의 통역 도우미 (MeetingAssit) 작업 규칙

영어 회의 소리를 실시간 영어 자막과 한국어 번역으로 보여 주는 웹 앱이다. 요구사항은 `docs/requirements.md`, 사용 안내는 `README.md`에 있다.

## 사용자
- 저장소 주인은 개발자가 아니다. 설명은 쉬운 말로 하고, 확인이 필요한 일은 화면에서 무엇을 보면 되는지로 알려 준다.
- 화면 글자와 코드 주석은 한국어로 쓴다.

## 배포 (꼭 지킬 것)
- 실제 앱은 **`gh-pages` 브랜치**에서 GitHub Pages로 배포된다. `main`에만 올리면 앱에 반영되지 않는다.
- 반영 순서:
  1. 작업 브랜치에서 커밋하고 `main`에 합친다.
  2. `git push origin main main:gh-pages` 로 두 브랜치에 같이 올린다.
  3. `gh api "repos/thewooke0620-lang/MeetingAssit/actions/runs?per_page=1"` 로 "pages build and deployment" 실행이 올린 커밋에 대해 `completed / success` 인지 확인한다.
- 배포 완료를 확인하기 전에는 사용자에게 "반영했다"고 말하지 않는다.
- 배포할 때마다 `index.html` 의 `APP_VERSION` 을 올린다 (예: `2026.11.15-2` → `2026.11.15-3`). 열려 있는 앱이 이 값을 보고 새 버전 알림을 띄운다.
- 주소: https://thewooke0620-lang.github.io/MeetingAssit/

## 테스트
- `sh tests/run-all.sh` 로 전체를 돌린다. 수정 후에는 항상 돌리고, 새 기능에는 테스트를 추가한다.
- Node.js와 Playwright(크로미움)가 필요하다. 실제 Soniox·Claude·Groq는 부르지 않고 가짜 응답으로 동작만 확인한다.
- 그래서 테스트가 통과해도 **실제 번역 품질과 실제 속도는 확인된 것이 아니다.** 사용자에게 결과를 알릴 때 이 점을 분명히 한다.
- `tests/core.test.js` 는 `index.html` 안의 `/*CORE-START*/` ~ `/*CORE-END*/` 구간(화면과 무관한 순수 로직)을 꺼내서 확인한다. 이 표시를 지우지 않는다.

## 구조
- 앱 전체가 `index.html` 한 파일이다. 빌드 과정이 없고, 외부 라이브러리를 쓰지 않는다.
- 음성 인식: Soniox 실시간 API (웹소켓). 번역: Soniox 내장, Claude, Groq 중 선택.
- API 키는 사용자가 설정 화면에 넣고, 그 브라우저의 localStorage에만 저장된다. 키를 코드나 저장소에 넣지 않는다.
- 회의 묶음과 회의 기록은 브라우저 IndexedDB에 저장한다. 저장소 접근은 `Store` 객체 한 곳에 모아 두었다. 설치형 앱이나 서버 DB로 옮길 때 이 객체만 바꾼다.
- Soniox가 선택 설정(확정 대기 시간, 번역어 지정, 회의 배경)을 거부하면 그 설정만 빼고 다시 연결한다. 새 선택 설정을 추가할 때도 같은 방식으로 한다.

## 정해 둔 방향
- 순서: 웹에서 기능 안정 → 폰 앱 → 설치형(exe). 포장은 맨 마지막에 한다.
- 기기 간 동기화가 필요해지면 Supabase(PostgreSQL)를 붙일 계획이다.
- 참고 제품은 Smooth AI(trysmooth.ai)다. 디자인이나 문구를 그대로 가져오지 않는다.
