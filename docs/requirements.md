# 영어 회의 실시간 통역 도우미 요구사항 정의서 (RFP)

- 작성일: 2026-11-13
- 프로젝트 가칭: 미정 (Smooth AI 클론)
- 문서 목적: 지금까지 논의한 요구사항, 시장 조사, 기술 선택지를 한곳에 모아 개발 착수 기준으로 삼는다.
- 수치 기준: 가격과 벤치마크는 2026년 11월 조사 시점 값이며 수시로 바뀐다. 출처는 문서 끝에 있다.

---

## 1. 프로젝트 개요

### 1.1 목적
영어로 진행되는 화상 회의에서 상대방의 영어 발화를 실시간으로 인식해 한국어로 바로 통역(자막)해 주는 개인용 도구를 만든다. 이후 답변 제안, AI 음성 통역, 회의 노트로 확장한다.

### 1.2 기준 제품
Smooth AI (Frictionless AI, Inc.)를 기준으로 삼고, 유사 제품들의 기능을 함께 반영한다.

### 1.3 사용 환경 (확정 사항)
| 항목 | 결정 |
|---|---|
| 메인 플랫폼 | Windows PC |
| 보조 플랫폼 | 모바일 (안드로이드) |
| 주 회의 도구 | Microsoft Teams (주력), Zoom (함께 지원) |
| 핵심 방향 | 영어 → 한국어 실시간 통역 |
| 구현 형태 | 오버레이형 (회의에 봇이 들어가지 않고, 통화 기능을 직접 만들지 않음) |
| 배포 방식 | 웹 방식 우선 (설치 파일 없음) |
| 개발 순서 | PC 먼저, 모바일은 나중 |
| 사용자 | 본인 1인 (코딩 지식 없음, 개발은 AI에 위임) |

### 1.4 제약 조건
- EXE 설치 시 관리자 승인이 필요해 잦은 재설치 테스트가 어렵다. 그래서 설치가 필요 없는 형태가 필수다.
- 회의 음성과 글자가 외부 AI 서비스로 전송된다. 회사 관리 PC나 고객사 회의에 쓸 경우 회사 보안 정책과 기밀 규정을 먼저 확인해야 한다.
- 사용료는 사용 시간에 비례해 발생한다 (구독형이 아닌 종량제).

---

## 2. 시장 조사

### 2.1 제품 분류
| 분류 | 설명 | 대표 제품 |
|---|---|---|
| A. 비영어권용 회의 코파일럿 | 번역 + 답변 제안 + 음성. 본 프로젝트와 직접 경쟁 | Smooth AI, Deeptrue, Hedy, JotMe, Transync AI |
| B. 실시간 답변 제안형 | 번역 없이 화면에 답변만 띄움 | Cluely, Final Round AI, LockedIn AI, Sensei AI, Parakeet |
| C. 플랫폼 내장 기능 | 회의 도구 안에서만 동작 | Teams Interpreter, Google Meet 번역, Zoom AI Companion |
| D. 회의록형 | 기록과 사후 요약 중심 | 티로(Tiro), 클로바노트, 다글로, Otter, Fireflies |
| E. 봇 참여형 | 회의에 AI 봇이 입장 | Talo, SeaMeet |
| F. 통화 내장형 | 앱 안에서 직접 전화·영상통화 | EzDubs, Owaa AI, AI Phone, Polyglp, LingoEase, Trulinco |

### 2.2 기준 제품 상세: Smooth AI

**기능**
- 실시간 전사·번역 (스토어 표기 약 200ms)
- 실시간 답변 제안: 상대가 질문한 것을 자동 감지해 답변을 생성해 표시
- 표현 도우미: 하고 싶은 말을 타이핑하면 영어 표현을 빠르게 제시
- AI 음성 통역: 한국어·일본어·중국어·스페인어로 말하면 내 목소리를 닮은 영어 음성으로 전달 (Voice Pro 전용)
- 회의 후 피드백: 내 발화를 문장 단위로 분석하고 원어민 표현으로 바꿔 리포트 제공
- 자동 회의 노트
- 회의 준비 자료: 캘린더의 회의 제목·참석자 정보로 사전 자료 생성 (Gmail·Drive 연동 가능)
- 팀 기능: 공유 팀 메모리, 맞춤 용어

**동작 방식**
- 데스크톱 앱이 Zoom, Google Meet, Teams 위에 투명 창을 띄움
- 컴퓨터 오디오를 직접 들으므로 Discord, YouTube 등 어떤 앱과도 동작
- 회의에 봇이 들어가지 않음
- 모바일 앱(안드로이드, iOS)도 제공

**제한**
- 영어로 진행되는 회의만 번역 지원
- 번역 대상 언어 11개 (한국어, 영어, 일본어, 중국어, 베트남어, 태국어, 스페인어, 프랑스어, 독일어, 포르투갈어, 러시아어)
- 모바일에서 전화 통화 음성 전사는 미지원

**요금**
| 플랜 | 월 결제 | 연 결제(월 환산) | 포함 내용 |
|---|---|---|---|
| Free | 0달러 | - | 150분 + 튜토리얼 완료 시 50분 |
| Basic | 14달러 | 8.8달러 | 월 1,000분 |
| Pro | 29달러 | 18.3달러 | 무제한 (하루 최대 10시간) |
| Voice Pro | 79달러 | 49.8달러 | Pro + AI 음성 통역 월 400분 |
| Team | 문의 | - | 팀 메모리, 맞춤 용어 |

**사용하는 외부 AI (개인정보 처리방침 2026-10-23 수정본 기준)**
| 역할 | 업체 |
|---|---|
| 음성 인식 | Deepgram |
| LLM (답변 제안, 피드백, 리포트) | OpenAI, Anthropic, Groq, Google Vertex AI |
| 음성 복제·합성 | Fish Audio |
| 결제 | Polar |
| 데이터 저장 | Google Cloud |

**개인정보 관련 표기**
- 실시간 오디오는 전사 즉시 삭제, 저장하지 않음
- 사용자 데이터를 AI 학습에 사용하지 않음
- TLS 암호화, SOC 2 인증 인프라

**시사점**
- "듣기(Deepgram)"와 "두뇌(LLM)"를 분리한 구조다. 번역도 LLM이 맡는다.
- 품질의 핵심은 받아쓰기 엔진보다 LLM 조합과 응답 속도 최적화에 있다. 개발자는 파운데이션 모델을 수십 개 테스트했다고 밝혔다.

### 2.3 유사 제품별 주요 기능
| 제품 | 주요 기능 | 본 프로젝트에 반영할 점 |
|---|---|---|
| Deeptrue | 말하거나 타이핑한 내용을 번역 음성으로 출력, 대화 기반 답변 제안, Zoom·Meet·Teams, 30개 이상 언어, 단독 사용 또는 회의 연결 | 타이핑 → 번역 음성 흐름 |
| Hedy | 실시간 전사, 자동 제안, 하이라이트, 주제 정리, 사전 준비 노트, 요약. 표현 제안·군말 지적·더 나은 단어 추천 코칭 | 말하기 코칭, 하이라이트 표시 |
| JotMe | 실시간 번역·전사, AI 회의록, AI 검색, 실시간 요약, 사용자 정의 어휘, 음성 녹음, Generate Speech, 이중 언어 기록, 봇 없음. 데스크톱 + 모바일 + Chrome 확장 | 이중 언어 기록 내보내기, 맞춤 어휘 |
| Transync AI | Zoom·Teams·Meet, 가상 마이크로 번역 음성 송출, 회의 노트, 키워드·문맥 등록, 음성 복제, 화자 분리, 떠 있는 자막(PiP), 원문·번역 2단 표시, 발표 모드(QR 공유), 60개 언어 | 2단 표시, 떠 있는 자막, 키워드 등록, 가상 마이크 |
| Cluely | 통화 중 화면 위 오버레이로 답변·논점 표시(약 300ms), 화면 공유에 안 보이는 창, 회의 노트, 통화 전 참석자 정보 | 오버레이 UI 구조 |
| Final Round AI | 면접용 실시간 답변 코파일럿, 모의 면접 | (범위 밖, 참고만) |
| Teams Interpreter | 발화자 목소리를 유지한 음성 통역. Microsoft 365 Copilot 라이선스 필요 | 음성 통역의 기준점 |
| 티로(Tiro) | 한국어 특화 실시간 받아쓰기, 중간 요약, 템플릿별 정리 노트, 대화 중 AI 질문, PC에서 Zoom·Meet·Teams 기록 | 중간 요약, 회의 중 AI 질문 |
| 클로바노트, 다글로 | 녹음 기반 전사·요약, 노트에 대한 AI 채팅 | 사후 요약 형식 |
| Talo, SeaMeet | 회의에 봇이 입장해 통역·전사. 호스트 승인 필요 | 채택하지 않음 (봇 방식) |
| EzDubs | 전화·영상통화를 내 목소리와 감정으로 번역(1.5초 이내), 상대는 앱 불필요, 채팅 번역, 음성 메모 더빙 | (범위 밖, 통화 내장형) |
| Owaa AI, AI Phone | 일반 전화망·WhatsApp 통화 통역 | (범위 밖) |
| Polyglp | AI 통역 영상채팅(자막 + 음성), 무료 화상회의 주 3시간 | (범위 밖) |

### 2.4 시장에서 읽히는 점
- 번역 + 답변 제안 + 음성 + 피드백을 모두 갖춘 제품은 Smooth AI와 Deeptrue 정도로 드물다.
- 대부분의 제품은 번역 또는 답변 제안 중 한쪽만 한다.
- 봇 없이 PC 소리를 직접 잡는 오버레이 구조가 주류다.
- "한국어 사용자의 영어 회의"에 집중한 국내 제품은 조사 범위에서 Smooth AI 외에 확인되지 않았다 (누락 가능성 있음).

---

## 3. 기능 요구사항

우선순위: 필수(1단계) → 핵심(2단계) → 확장(3단계)

### 3.1 1단계: 필수
| ID | 요구사항 | 참고 제품 |
|---|---|---|
| F-101 | PC에서 재생되는 회의 소리(시스템 오디오)를 실시간으로 받는다 | Smooth AI, Transync AI |
| F-102 | 영어 발화를 실시간 영어 자막으로 표시한다 (단어 단위로 차오르는 방식) | 공통 |
| F-103 | 영어 원문 바로 아래에 한국어 번역을 실시간으로 표시한다 | Smooth AI, Transync AI(2단 표시) |
| F-104 | 원문과 번역을 항상 함께 보여 준다 (번역 오류를 원문으로 확인) | Transync AI |
| F-105 | 시작/정지 버튼. 정지 중에는 요금이 발생하지 않는다 | 공통 |
| F-106 | 지난 대화를 스크롤로 다시 볼 수 있다 | 공통 |
| F-107 | Teams, Zoom, Google Meet, YouTube 등 회의 도구와 무관하게 동작한다 | Smooth AI |
| F-108 | 회의에 봇이 입장하지 않으며 상대방 화면에 아무것도 보이지 않는다 | Smooth AI, JotMe, Cluely |
| F-109 | API 키는 설정 화면에서 사용자가 직접 입력하고 기기에만 저장한다 | - |
| F-110 | 설정 화면에 AI 서비스 연결 상태를 표시한다 | - |

### 3.2 2단계: 핵심 차별 기능
| ID | 요구사항 | 참고 제품 |
|---|---|---|
| F-201 | 대화 맥락을 보고 내가 할 만한 영어 답변을 2~3개 제안한다 | Smooth AI, Deeptrue, Cluely |
| F-202 | 상대가 나에게 질문한 것을 자동 감지해 답변을 띄운다 | Smooth AI |
| F-203 | 한국어로 타이핑하거나 말하면 자연스러운 영어 문장으로 바꿔 준다 | Smooth AI, Deeptrue |
| F-204 | 변환된 영어 문장을 AI 음성으로 재생한다 | Deeptrue, JotMe(Generate Speech) |
| F-205 | 회의가 끝나면 요약, 결정 사항, 할 일을 자동 정리한다 | Smooth AI, JotMe, 티로 |
| F-206 | 회의 중간에 지금까지의 내용을 요약해 볼 수 있다 | 티로, JotMe |
| F-207 | 회의 창 위에 항상 떠 있는 작은 자막 창을 제공한다 | Smooth AI, Transync AI(PiP), Cluely |

### 3.3 3단계: 확장
| ID | 요구사항 | 참고 제품 |
|---|---|---|
| F-301 | 내 영어 발화를 문장별로 교정하고 원어민 표현으로 바꿔 리포트로 제공한다 | Smooth AI |
| F-302 | 군말, 약한 표현을 짚어 주는 말하기 코칭 | Hedy |
| F-303 | 회사명, 프로젝트명, 전문 용어를 미리 등록해 인식·번역 정확도를 높인다 | Transync AI, JotMe, Smooth AI(Team) |
| F-304 | 회의 기록 저장, 검색, 이중 언어 기록 내보내기 | JotMe |
| F-305 | 화자 구분 (누가 말했는지 표시) | Transync AI, Soniox 기본 기능 |
| F-306 | 회의 중 대화 내용에 대해 AI에게 질문한다 | 티로 |
| F-307 | 중요한 순간을 하이라이트로 표시한다 | Hedy |
| F-308 | 내 한국어 발화를 영어 음성으로 실시간 통역해 회의에 송출한다 (가상 마이크) | Smooth AI(Voice Pro), Transync AI, Teams Interpreter |
| F-309 | 내 목소리를 닮은 음성으로 통역한다 (음성 복제) | Smooth AI, Transync AI, EzDubs |
| F-310 | 회의 전 준비 자료 생성 (캘린더 연동) | Smooth AI, Hedy, Cluely |
| F-311 | 영어 외 다른 언어 회의 지원 | Deeptrue, JotMe, Transync AI |
| F-312 | 모바일 버전: 폰 마이크로 대면 대화·회의 소리를 듣는다 | Smooth AI, JotMe |
| F-313 | 받아쓰기·번역 엔진을 설정에서 바꿔 쓰고 비교할 수 있다 | - |

---

## 4. 비기능 요구사항

| ID | 분류 | 요구사항 |
|---|---|---|
| N-01 | 속도 | 영어 자막은 말하는 속도를 따라가야 한다. 한국어 번역은 가능한 한 문장이 끝나기 전에 뜨기 시작해야 한다 |
| N-02 | 속도 | 답변 제안은 2초 안에 나와야 한다 (회의에서는 2초만 지나도 쓸모가 없어진다) |
| N-03 | 정확도 | 영어 인식 오류율은 독립 벤치마크 기준 5% 안팎 이하 엔진을 쓴다 |
| N-04 | 정확도 | 영어→한국어 번역 품질은 객관 자료가 없으므로 실제 회의·영어 영상으로 직접 검증한다 |
| N-05 | 설치 | 관리자 승인 없이 실행할 수 있어야 한다 (설치 파일 없음) |
| N-06 | 갱신 | 수정본은 재설치 없이 반영되어야 한다 |
| N-07 | 비용 | 월 20시간 사용 기준 사용료가 Smooth AI Basic(월 14달러)보다 낮아야 한다 |
| N-08 | 보안 | API 키는 채팅·코드·저장소에 노출하지 않고 사용자 기기에만 둔다 |
| N-09 | 개인정보 | 음성을 저장하지 않고 학습에 쓰지 않는 조건의 AI 서비스를 고른다 |
| N-10 | 개인정보 | 회의 기록은 기본적으로 사용자 기기 안에만 저장한다 |
| N-11 | 안정성 | AI 서비스 하나가 끊겨도 나머지 기능은 계속 동작한다 (예: 번역이 멈춰도 영어 자막은 계속) |
| N-12 | 유지보수 | 받아쓰기·번역·LLM 엔진을 교체할 수 있는 구조로 만든다 |
| N-13 | 사용성 | 코딩 지식 없이 설정 화면만으로 사용할 수 있어야 한다 |

---

## 5. AI 엔진 선정

### 5.1 역할 구분
| 역할 | 하는 일 | 후보 |
|---|---|---|
| 귀 (음성 인식) | 회의 소리를 글자로 변환 | Soniox, Deepgram, AssemblyAI, OpenAI, Azure |
| 번역 | 영어 글자를 한국어로 | Soniox 내장, OpenAI 통역 모델, Claude, GPT |
| 두뇌 (LLM) | 답변 제안, 회의 노트, 피드백 | Claude, GPT |
| 입 (음성 합성) | 영어 문장을 음성으로 | Soniox TTS, OpenAI 등 |

참고: Claude API는 음성 입력을 받지 않는다. 듣기에는 쓸 수 없고 두뇌 역할에만 쓸 수 있다.

### 5.2 실시간 음성 인식 엔진 비교
| 엔진 | 시간당 가격 | 오류율 (Coval) | 자막 확정 속도 (Coval) | 번역 내장 | 비고 |
|---|---|---|---|---|---|
| Soniox v5 | 0.12달러 (번역 포함 약 0.18) | 4.8% | 37ms | 있음 | 최저가, 화자 구분 포함 |
| AssemblyAI U-3.6 Pro | 0.45달러 (저가형 0.15) | 2.2% | 106ms | 없음 | 정확도 1위 |
| Deepgram Flux / Nova-3 | 0.39~0.46달러 (할인가 0.29) | 5.7% | 99ms | 없음 | 신규 200달러 크레딧, Flux는 영어 전용, Smooth AI가 사용 |
| OpenAI 실시간 받아쓰기 | 1.02달러 | 약 5.1% | 약 550ms | 별도 통역 모델 | Pro 100 크레딧 사용 가능 |
| Azure | 1.00달러 | - | - | 별도 과금 | - |

다른 벤치마크 수치
- Pipecat (실시간, 의미 기준 오류율): AssemblyAI 1.22% / Soniox v5 1.27% / Deepgram Nova-3 1.62%. 응답 속도는 Deepgram 247ms, Soniox 260ms로 비슷.
- Artificial Analysis: OpenAI 3.9%(812ms) / Soniox v6 4.6%(80ms).
- 억양 있는 영어 (AssemblyAI 공개 자료, 경쟁사 자료임): Soniox 오류율 11.69%로 16위.

해석 시 주의
- 벤치마크마다 테스트 음성과 채점 방식이 달라 절대 수치가 다르다. 같은 표 안의 순위로 봐야 한다.
- 가격 비교표 일부는 Soniox 자체 자료다. 0.12달러 수치는 제3자 글에서도 같게 확인된다.
- Soniox v6는 2026-11-03 출시로 독립 측정이 아직 적다.

### 5.3 OpenAI 통역 전용 모델 (GPT-Realtime-Translate)
- 70개 이상 언어 음성을 13개 언어로 실시간 통역. 출력 언어에 한국어 포함.
- 번역된 음성과 글자 자막을 함께 반환.
- 분당 0.034달러 (시간당 2.04달러).
- 한 연결에 목표 언어 하나. 양방향 통역은 연결 2개 필요.

### 5.4 구성안 비교
| | ① Soniox 단독 | ② OpenAI 단독 | ③ Soniox + Claude |
|---|---|---|---|
| 듣기 | Soniox | OpenAI | Soniox |
| 번역 | Soniox 내장 | OpenAI 통역 모델 | Claude |
| 답변 제안·회의 노트 | 불가 | GPT | Claude |
| 자막 속도 | 가장 빠름 | 한 박자 느림 | 번역이 조금 늦음 |
| 시간당 비용 | 약 0.18달러 | 약 2달러 이상 | 0.12달러 + Claude 사용료 |
| 가입할 곳 | 1곳 | 1곳 | 2곳 |
| 구독 크레딧 | 없음 | ChatGPT Pro 100이면 월 100달러 | Claude Max면 월 100달러 (Claude 부분) |
| 다중 AI 문제 | 거의 없음 | 거의 없음 | 해당 |

①과 ③은 같은 길의 앞뒤 단계다. ①로 시작해 2단계에서 Claude를 붙이면 ③이 된다.

### 5.5 구독 크레딧
| 구독 | 월 요금 | 월 API 크레딧 | 쓸 수 있는 범위 |
|---|---|---|---|
| Claude Pro | 20달러 | 없음 | - |
| Claude Max | 100달러 | 100달러 | 번역, 답변 제안, 회의 노트 (듣기 불가) |
| ChatGPT Plus | 20달러 | 없음 | - |
| ChatGPT Pro 100 | 100달러 | 100달러 (2026-10-28 시작, 직접 신청) | 듣기, 통역, 답변 제안 전부 |

구독과 API는 별개 상품이며, 크레딧은 개발자용 계정에 연결해 신청해야 한다. OpenAI 쪽은 "혜택 제공 기간 동안"이라는 단서가 있다.

### 5.6 권장안
1. 1단계는 ① Soniox 단독으로 시작한다. 가장 싸고 빠르고 구조가 단순하다.
2. 2단계에서 답변 제안용 LLM을 붙인다. 보유 구독에 따라 Claude 또는 GPT를 고른다.
3. 번역은 Soniox 내장과 LLM 번역을 둘 다 켤 수 있게 만들어 직접 비교한다.
4. 번역이 아쉬우면 OpenAI 통역 모델을 비교 대상으로 추가한다.

---

## 6. 구조 설계

### 6.1 동작 흐름
1. 프로그램이 PC에서 나는 회의 소리를 잡는다.
2. 소리를 음성 인식 서비스로 실시간 전송한다 (연결을 열어 두고 계속 흘려보냄).
3. 영어 글자가 단어 단위로 돌아온다.
4. 한국어 번역이 같은 통로(Soniox 내장) 또는 LLM을 거쳐 돌아온다.
5. 프로그램이 영어 원문과 한국어 번역을 화면에 표시한다.
6. (2단계) 쌓인 대화를 LLM에 보내 답변 제안과 회의 노트를 받는다.

### 6.2 구현 형태: 웹 방식
- 크롬·엣지에서 주소를 열어 실행한다. 설치와 관리자 승인이 필요 없다.
- 수정본은 새로고침으로 반영된다.
- 회의 소리는 브라우저 화면 공유 창에서 "시스템 오디오 공유"를 켜서 받는다. Teams 데스크톱 앱 소리도 이 방법으로 들어온다.
- 같은 주소를 폰에서 열면 마이크 입력으로 동작한다 (모바일 버전의 출발점).
- 코드는 GitHub 저장소에 두고 자동 배포한다.

웹 방식의 제약
- 시작할 때마다 화면 공유 창에서 한 번 선택해야 한다.
- "항상 위에 떠 있는 창"은 크롬·엣지의 작은 창 띄우기 기능으로 구현할 계획이며, Teams 위에 잘 뜨는지 개발 중 확인이 필요하다.

### 6.3 대안 형태
| 형태 | 장점 | 단점 |
|---|---|---|
| 설치 없는 실행 파일 | 더블클릭 실행, 설치 승인 불필요 가능 | 보안 설정이 실행 파일 자체를 막으면 불가 |
| 1회 설치 + 온라인 갱신 | 창 제어가 자유롭고 이후 재설치 불필요 | 최초 1회 승인 필요, 구현 복잡 |

웹 방식으로 기능을 안정시킨 뒤, 필요할 때만 설치형으로 포장한다.

---

## 7. 여러 AI를 함께 쓸 때의 위험과 대응

| 위험 | 내용 | 대응 |
|---|---|---|
| 지연 누적 | 받아쓰기 → 번역 순서로 시간이 더해진다 | 문장이 끝나길 기다리지 않고 조각 단위로 번역에 넘긴다. 번역에는 응답이 빠른 가벼운 모델을 쓴다 |
| 오류 전파 | 잘못 들은 단어를 번역이 그럴듯하게 옮긴다 | 영어 원문을 항상 같이 표시한다. 용어를 미리 등록한다 |
| 고장 지점 증가 | 한 곳만 장애가 나도 멈춘다 | 한쪽이 끊겨도 나머지는 계속 돌게 한다 |
| 요금·키 분산 | 업체마다 결제, 키, 사용량 확인이 따로다 | 설정 화면에 업체별 연결 상태와 오류를 표시한다 |
| 모델 종료 | 업체가 구형 모델을 주기적으로 종료한다 | 엔진 교체가 쉬운 구조로 만든다 |
| 데이터 분산 | 음성과 글자가 서로 다른 회사로 간다 | 업체별 보관·학습 정책을 확인하고 문서에 기록한다 |

---

## 8. 비용 추정

### 8.1 사용료 (월 20시간 기준)
| 구성 | 예상 월 비용 |
|---|---|
| Soniox 자막 + 번역 | 약 3.6달러 |
| Soniox + LLM (답변 제안, 회의 노트) | 약 3.6달러 + LLM 사용료 (개인 사용 수준이면 수 달러 예상, 미검증) |
| OpenAI 통역 모델 | 약 41달러 (Pro 100 크레딧이면 약 49시간까지 추가 비용 없음) |
| 참고: Smooth AI Basic | 14달러 (월 1,000분, 연 결제 시 8.8달러) |
| 참고: Smooth AI Pro | 29달러 (무제한, 연 결제 시 18.3달러) |

### 8.2 직접 만들기의 득실
- 사용료는 직접 만드는 쪽이 싸지만 차이는 월 1만 원 안팎이다.
- 만들고 고치는 시간이 사용료 절감액보다 훨씬 크다.
- 직접 만드는 의미는 업무 용어·화면 구성의 자유, 제작 경험, 향후 타인 제공 가능성에 있다.
- Smooth AI 무료 200분을 먼저 써 보고 따라 만들 부분을 정하는 것을 권한다.

---

## 9. 개발 단계

| 단계 | 내용 | 완료 기준 |
|---|---|---|
| 0. 준비 | Soniox 가입·API 키 발급, GitHub 저장소 생성, 프로그램 이름 확정 | 키 보유, 저장소 준비 |
| 1. 자막·번역 | F-101 ~ F-110 | Teams 회의 또는 영어 영상에서 영어 자막과 한국어 번역이 실시간으로 표시됨 |
| 1-검증 | 번역 품질·지연 확인, Soniox 내장 번역 평가 | 계속 쓸지, LLM 번역으로 바꿀지 결정 |
| 2. 답변 제안·노트 | F-201 ~ F-207 | 회의 중 답변 제안이 2초 안에 표시됨, 종료 후 회의 노트 생성 |
| 3. 확장 | F-301 ~ F-313 중 필요한 것 | 항목별 |
| 4. 모바일 | F-312 | 폰에서 같은 기능 동작 |
| 5. 설치형 (선택) | 필요 시 포장 | 1회 승인으로 설치 |

---

## 10. 미결정 사항

| 번호 | 항목 | 영향 |
|---|---|---|
| Q-1 | 프로그램 이름과 GitHub 저장소 이름 | 착수 조건 |
| Q-2 | 보유 구독: Claude Max인지, ChatGPT Pro 100인지 | 2단계 LLM 선택, 구성안 ②·③ 결정 |
| Q-3 | 사용할 PC가 개인 소유인지 회사 관리 PC인지 | 보안 정책 확인 필요 여부, AI 서비스 접속 가능 여부 |
| Q-4 | Soniox API 키 발급 여부 | 1단계 착수 조건 |
| Q-5 | 번역을 Soniox 내장으로 할지 LLM으로 할지 | 1단계 검증 후 결정 |
| Q-6 | 혼자 쓸지, 나중에 다른 사람에게도 제공할지 | 로그인·결제·키 관리 설계 |

---

## 11. 확인이 필요한 위험

- 영어→한국어 번역 품질을 제3자가 측정한 자료가 없다. 직접 써 봐야 안다.
- 웹 방식에서 Teams 위에 떠 있는 창이 실제로 잘 동작하는지 미확인.
- 회사 관리 PC라면 회의 음성의 외부 전송이 회사·고객사 규정에 걸릴 수 있다. 이는 설계로 해결되는 문제가 아니다.
- 억양이 강한 영어에서 Soniox 정확도가 떨어진다는 자료가 있다 (경쟁사 발표).
- 구독 크레딧 혜택은 정책 변경 가능성이 있다.
- 첫 버전이 Smooth AI의 속도와 품질을 바로 따라가기는 어렵다.

---

## 12. 출처

**기준 제품**
- Smooth AI 공식 사이트: https://www.trysmooth.ai/
- Smooth AI 개인정보 처리방침: https://www.trysmooth.ai/privacy
- Smooth AI 생체정보 정책: https://www.trysmooth.ai/biometric-policy
- Smooth AI (Google Play): https://play.google.com/store/apps/details?id=ai.trysmooth.app
- Smooth AI 개발자 소개글: https://news.hada.io/topic?id=26389

**유사 제품**
- Deeptrue: https://www.producthunt.com/posts/deeptrue-2
- Hedy: https://www.hedy.ai/international-teams-ai-meeting-tool/
- JotMe: https://www.jotme.io/ko/blog/best-translation-app-review
- Transync AI: https://www.transyncai.com/ko/docs/quickstart/
- Cluely: https://www.everydev.ai/tools/cluely
- Teams Interpreter: https://www.uctoday.com/unified-communications/microsoft-teams-new-interpreter-agent-aims-to-break-down-language-barriers-in-meetings-symity/
- 티로: https://eopla.net/magazines/44166
- SeaMeet: https://wiki.seasalt.ai/en/seameet/live-translation/
- EzDubs: https://apps.apple.com/kr/app/ezdubs-%ED%99%94%EC%83%81-%ED%86%B5%ED%99%94-%EB%B2%88%EC%97%AD/id6470951323

**AI 엔진 가격·벤치마크**
- Soniox 요금: https://soniox.com/pricing
- Soniox 실시간 번역: https://soniox.com/speech-translation
- Coval 벤치마크: https://www.coval.ai/blog/best-speech-to-text-providers-in-2026-independent-benchmarks-and-how-to-choose/
- Pipecat 벤치마크: https://www.pipecat.ai/benchmarks/speech-to-text
- Artificial Analysis: https://artificialanalysis.ai/speech-to-text
- AssemblyAI 벤치마크 (경쟁사 자료): https://www.assemblyai.com/benchmarks
- AssemblyAI 실시간 STT 비교: https://www.assemblyai.com/blog/best-api-models-for-real-time-speech-recognition-and-transcription
- Deepgram STT 비교: https://deepgram.com/learn/best-speech-to-text-apis
- Micdrop STT 비교: https://micdrop.dev/blog/top-speech-to-text-apis-voice-agents
- OpenAI 음성 모델 발표: https://openai.com/index/advancing-voice-intelligence-with-new-models-in-the-api/
- OpenAI 실시간 통역 가이드: https://developers.openai.com/cookbook/examples/voice_solutions/realtime_translation_guide

**구독 크레딧**
- Claude API 별도 과금 안내: https://support.claude.com/en/articles/9876003-why-is-claude-api-usage-billed-separately-from-my-paid-claude-plan
- Claude Max·Ultra·Team 월 API 크레딧: https://support.claude.com/en/articles/17154008-monthly-api-credits-for-max-ultra-and-team-plans
- OpenAI ChatGPT 구독자 API 크레딧: https://developers.openai.com/api/docs/guides/chatgpt-api-credits
