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
- API 키는 사용자가 설정 화면에 넣고, 그 브라우저의 localStorage에만 저장된다. 키를 코드나 저장소에 넣지 않는다. (예외: Supabase 공개 키, 아래 참고)
- 회의 폴더와 회의 기록은 브라우저 IndexedDB에 저장한다. 저장소 접근은 `Store` 객체 한 곳에 모아 두었다.
- Supabase 동기화(`Cloud` 객체): 로그인하면 `Store` 의 put·update·del 이 바뀐 것을 표시해 두고 Supabase 표(packs, meetings, 기록을 통째로 JSON)에 올린다. 받을 때는 `StoreRaw` 로 써서 다시 올리지 않는다. 라이브러리 없이 Auth·REST 주소를 fetch 로 부른다. 표·보안 규칙은 `docs/supabase.sql`. 이 앱의 Supabase 프로젝트는 `MeetingAssit`(ref `iqyknmtkbdpsitxwdfia`, 서울)이고, 주소와 공개(publishable) 키는 사용자 결정(2026-11-15)으로 `index.html` 의 `SB_DEFAULT_URL`·`SB_DEFAULT_KEY` 에 넣어 두었다. 공개 키만 예외이며, 비밀(service_role) 키와 Soniox·Claude·Groq 키는 절대 코드에 넣지 않는다. 테스트는 `tests/cloud.e2e.js` 의 가짜 서버로 한다.
- Soniox가 선택 설정(확정 대기 시간, 번역어 지정, 회의 배경)을 거부하면 그 설정만 빼고 다시 연결한다. 새 선택 설정을 추가할 때도 같은 방식으로 한다.

## 사용자 등록·내 목소리·회의 정보
- 사용자 등록 창(`#onboard`, `openOnboard(단계)`): 이름 → API 키 → Supabase 계정 → 목소리 → 첫 폴더. 키가 없고 `settings.onboarded` 가 아니면 처음에 저절로 뜬다. 테스트의 BASE 는 `onboarded: true`.
- 프로필(이름, 부르는 이름, 내 정보, 목소리)은 localStorage `meetingassit.profile.v1`. Supabase 에는 packs 표의 id `__profile__` 줄로 올리고 받는다 (폴더 목록에는 넣지 않는다). API 키는 넣지 않는다.
- 목소리: 16kHz μ-law, 6초까지. 연결마다 `voicePrefixPcm` 을 맨 앞에 보내고, `mapVoiceTokens`(CORE)가 그 구간 글자·번역을 빼고 같은 화자를 speaker "me" 로 바꾼다. 'PC 소리 + 내 마이크'(source "both")는 워크릿 입력 2에 마이크를 섞고 조각마다 어느 쪽이 컸는지(`log`)로도 나를 고른다.
- 번역에 넘기는 회의 정보는 `meetInfo()` → `meetingContextText`·`nameTerms`(CORE). 폴더 필드: topic, people(한 줄에 한 명). 회의 기록 필드: topic, people, 줄의 me.
- 실제 목소리로 화자를 잘 가리는지, 앞에 보낸 목소리 때문에 첫 자막이 얼마나 늦는지는 테스트로 알 수 없다 (연결 상태에 '내 목소리를 찾았습니다 (n초)'가 뜬다).

## 계정 화면·내 지식·소리 보관
- 계정 시트(`openAcct`): 개인화 수준(`knowledgeLevel`, CORE) → `openKnow()`(표현 탭의 '내 지식' #knSec 로 이동, `renderKnow`), 회의 후 자동으로 배우기(`settings.autoLearn`, 계정 시트에만 둠), 목소리, 다시 듣기(`settings.keepAudio`), 앱을 나가도 계속 기록(`settings.bgKeep`).
- 프로필 지식 필드: me(하는 일, settings.me 와 같이), style, terms(고유 용어, 폴더 용어집과 `mergeTermsText` 로 합쳐 번역·Soniox 에 씀), learned, kAt. 배우기는 `learnMeetings`·`importKnowledge`(AI 요청에 `<learn>` 표시, 테스트 가짜 응답 kind 'learn'). 회의 정리 뒤 `autoLearnAfter`.
- 소리 보관(`AudioKeep`): IndexedDB 버전 2 의 audio 보관함, 10초 조각. 회의 기록에는 구간 { key, start, type } 만(m.audio). 서버에 올리지 않는다. 다시 듣기는 `playAt`.
- 안드로이드: `window.MeetingNative.keepRecording(on)` → `android/MeetingService.java`(마이크 포그라운드 서비스). 매니페스트 권한·서비스는 워크플로가 sed 로 넣는다.
- 가입 확인 링크: `Cloud.fromLink()` 가 주소 뒤 `#access_token=…` 을 받아 로그인. Supabase 의 Site URL·Redirect URLs 에 앱 주소가 있어야 한다 (사용자가 대시보드에서 설정).

## 폴더·설정·뒤로가기
- 화면에서는 '폴더'라고 부른다 (코드와 저장소 이름은 예전대로 pack). 폴더 내용(이름·주제·참여자·배경·용어집·쌓인 내용·질문)과 그 폴더의 지난 회의(#meetList)는 폴더 창(#packDlg, `openPackDlg`·`openPackEditor`)에서만 고친다. 설정에는 계정·API·그 외 설정·백업만 둔다.
- 뒤로가기(`Nav`, `navPush`): 탭을 바꾸거나 창(dialog)을 열 때 history 에 기록하고, popstate 에서 열린 창 → 폰 왼쪽 메뉴 → 이전 탭 순으로 되돌린다. 단추로 닫은 창은 기록을 하나 지운다. 안드로이드 앱은 MainActivity 의 뒤로 단추가 웹 기록을 되돌리고, 더 없으면 앱을 뒤로 보낸다(끄지 않음).
- 폰 시작 화면의 '회의 시작'(#fab)은 아래 탭 막대 가운데에 있다 (내용을 가리지 않게).
- 홈에는 '새 회의' 칸이 없다. 시작하면 `startFlow()` 가 시작 창(#startDlg)을 띄운다: '배경 정보를 등록할까요?' → 그냥 진행하기 / 등록하기(폴더·들을 소리·이번 회의 주제·참여자, 칸 id 는 homePack·homeSource·meetTopic·meetPeople). `settings.askBg === false` 면 묻지 않는다 (테스트 BASE 는 false). 폴더 보기의 '이 폴더에서 새 회의'는 `startFlow(true)` 로 바로 등록 화면.
- 폴더 탭(TABS.prep = '폴더'): 폴더 목록 → 누르면 폴더 보기(`FV.id`, 그 폴더 회의를 날짜순, 제목·태그·내용으로 찾기). 뒤로가기 기록에 folder 를 남긴다.
- 리포트 이름은 `reportName(m)` = 날짜_제목(제목만 고칠 수 있음). 태그는 회의 정리(DIGEST_SYSTEM 의 tags)로 5개까지 달고 m.tags 에 둔다. 손으로 고치면 tagsManual 이라 다시 덮어쓰지 않는다. 찾기는 `meetMatch`.

## 데스크톱 앱 (desktop/)
- Electron 껍데기다. 화면은 GitHub Pages의 웹 앱 주소를 불러온다(`desktop/main.js` 의 `APP_URL`). 웹을 배포하면 exe에도 반영된다.
- 껍데기가 더하는 것: 컴퓨터 소리 바로 듣기(getDisplayMedia → loopback), 자막 팝업(따로 떠 있는 항상 위 창, Windows 11 acrylic 블러). 화면 쪽은 `window.desktop` 이 있으면 `body.desktop`, 팝업 창은 같은 주소의 `#popup` 으로 열려 `body.popup` 으로 동작한다. 본 창과 팝업은 BroadcastChannel(`meetingassit-live`)로 자막·명령을 주고받는다.
- 빌드: `cd desktop && npm install && npx electron-builder --win --x64` (리눅스에서는 wine 필요). 결과는 `desktop/dist/`. 올릴 때는 `desktop/package.json` 의 version 을 올린다. 이 작업 환경에서는 GitHub 릴리스를 만들 수 없어 exe 를 사용자에게 파일로 직접 보낸다 (exe 는 100MB가 넘어 저장소에 넣을 수 없다).
- 실행 확인: `cd tests && xvfb-run -a node desktop.smoke.js` (desktop 에서 npm install 필요). 실제 Windows 소리 받기는 Windows에서만 확인할 수 있다.

## 폰 앱 (PWA)
- 설치형 웹 앱이다: `manifest.webmanifest`, `sw.js`(앱 파일만 캐시, html 은 네트워크 우선), `icons/`. 서비스 워커는 github.io 에서만 등록한다.
- 안드로이드 APK: `android/` 의 Capacitor 껍데기(웹 앱 주소를 불러옴, 마이크 권한, 화면 켜 두기)를 GitHub Actions(`.github/workflows/android.yml`)가 빌드해 `apk` 브랜치에 올린다(디버그 서명). 받는 주소: https://github.com/thewooke0620-lang/MeetingAssit/raw/apk/MeetingAssit.apk . 이 작업 환경에서는 안드로이드 SDK 를 받을 수 없고 Actions 결과물(Artifacts) 내려받기도 막혀 있어 이렇게 한다. 플레이스토어에 올리려면 정식 서명 키가 필요하다.

## 정해 둔 방향
- 순서: 웹 기능 안정 → 설치형(exe, 2026.11 시작) → 폰 앱. 폰 앱도 같은 index.html 을 감싸는 방식(예: Capacitor)으로 만든다.
- 기기 간 동기화는 Supabase(PostgreSQL)로 한다 (2026.11 연결). 나중에 API 키도 Supabase Edge Functions 뒤로 옮길 수 있다.
- 참고 제품은 Smooth AI(trysmooth.ai)다. 디자인이나 문구를 그대로 가져오지 않는다.
