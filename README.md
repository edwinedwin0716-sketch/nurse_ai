# nurse_ai

간호학과 공부용 프로그램 모음입니다. 모두 **인터넷·API 키 없이** 기기 안에서 동작합니다.
(AI로 다듬기는 선택 기능이며, ChatGPT·Claude 앱에 붙여넣는 방식은 구독 그대로 쓰고 API 키가 필요 없습니다.)

## 🩺 간호과정 도우미 (`NursingHelper/`)
주관적·객관적 자료를 넣으면 간호진단을 추천하고 간호과정의 큰 틀을 만들어 줍니다.

- 형식 3가지: **제출 양식**(사정 / 간호계획 및 수행 / 합리적 근거 / 간호평가, A4·표지) · **B4 워크북**(간호과정 별책 순서) · 기본 형식
- NANDA-I 2024–2026 진단명 14개, 영역·과·별책 부록 8 페이지 표시
- Word(.doc) 저장, 제미나이 / ChatGPT / Claude로 다듬기

| 다운로드 | 설치 |
|---|---|
| 💻 Windows: [`NursingHelper-1.3.zip`](NursingHelper/NursingHelper-1.3.zip) | 압축 해제 → `NursingHelperSetup.exe` 실행 |
| 📱 Android: [`NursingHelper.apk`](NursingHelper/NursingHelper.apk) | 설치 시 "출처를 알 수 없는 앱" 허용 |

## 🗂️ 플래시카드 학습 (`StudyHelper/`)
강의자료·필기 파일에서 **형광펜, 색·굵은 글씨, 펜 필기**를 찾아 플래시카드와 학습지를 만듭니다.

- 지원 파일: PDF(굿노트·삼성노트 필기 포함) · PPTX · DOCX · HWPX
- 카드: 빈칸 · 수치 · 용어 · 문제(5지선다·OX) · 표시한 문항
- 모름 / 애매 / 알아요 채점, 1·3·7·14·30일 복습 주기, 단원별 학습
- 같은 상위 제목("1. 고혈압"이 다시 나오는 경우 등)은 하나로 합쳐서 정리
- 학습지(요점정리·핵심 수치·지식확인 문제·정답표) Word 저장 / PDF 인쇄

| 다운로드 | 설치 |
|---|---|
| 💻 PC: [`Flashcards-PC-2.0.zip`](StudyHelper/Flashcards-PC-2.0.zip) | 압축 해제 → `플래시카드.html` 더블클릭 (크롬·엣지) |
| 📱 Android: [`StudyHelper.apk`](StudyHelper/StudyHelper.apk) | 설치 후 파일 올리기 또는 다른 앱에서 [공유] |

## 🚀 MySpace 런처 (Windows `MySpaceLauncher/` · Mac `MySpaceMac/`)
화면 아래쪽에 뜨는 애플(macOS) 스타일 툴바예요. 자주 쓰는 앱·파일·폴더·웹사이트를 한 곳에서 실행합니다.

- 신호등 창 버튼, 둥근 검색창, 카테고리 탭(즐겨찾기 · AI · 메신저 · 업무 · 게임 · 문서 · 도구)
- 투명도 조절(30~100%), 라이트/다크 모드, 창 크기 2·3·4줄
- `Ctrl+Shift+Space`로 어디서나 열기/숨기기, 검색 후 Enter로 바로 실행
- 바탕화면·시작 메뉴의 새 바로가기와 Steam 게임 자동 추가, 웹사이트 로고 표시

| 다운로드 | 설치 |
|---|---|
| 💻 Windows: [`MySpaceLauncher-1.3.zip`](MySpaceLauncher/MySpaceLauncher-1.3.zip) | 압축 해제 → `MySpaceSetup.exe` 실행 |
| 🍎 Mac (Apple 실리콘 M1~M4): [`MySpace-mac-AppleSilicon.tar.xz`](MySpaceMac/MySpace-mac-AppleSilicon.tar.xz) | 더블클릭으로 풀기 → `MySpace.app`을 응용 프로그램 폴더로 → 처음 한 번 시스템 설정 › 개인정보 보호 및 보안 › [그래도 열기] |
| 🍎 Mac (인텔): [`MySpace-mac-Intel.tar.xz`](MySpaceMac/MySpace-mac-Intel.tar.xz) | 위와 같음 |

## 주의
- 자동으로 만든 내용입니다. 이론적 근거·문제·해설은 반드시 교재로 확인하세요.
- 환자 이름·등록번호·생년월일 같은 개인정보는 넣지 마세요.
- 직접 만든 프로그램이라 Windows·Android에서 보안 경고가 뜰 수 있습니다.

## 빌드
- Windows: `NursingHelper/src/build.sh`, `MySpaceLauncher/src/build.sh` (mono-mcs)
- Mac: `cd MySpaceMac && npm install && node build/package.js && sh build/slim.sh` (Electron, rcodesign 임시 서명)
- Android: `*/android/build-apk.sh` (Ubuntu `android-sdk-platform-23 aapt dalvik-exchange apksigner zipalign`)
- 플래시카드 웹앱 묶기: `python3 StudyHelper/build.py`
