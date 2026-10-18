# 작업 규칙 (nurse_ai)

사용자는 비전공자 간호학생이다. 쉬운 한국어로 설명하고, 만들 수 있는 건 직접 만들어서 깃허브에 올린다.

## 모든 프로그램은 기기별로 최적화해서 따로 만든다
| 기기 | 방식 | 참고 |
|---|---|---|
| 📱 안드로이드 | WebView apk | `*/android/build-apk.sh` (Ubuntu `android-sdk-platform-23 aapt dalvik-exchange apksigner zipalign`), minSdk 23 · targetSdk 34, `android:exported`, Java에 람다 금지(dx) |
| 💻 Windows 10/11 | 네이티브 exe (WinForms) 또는 Edge 앱 창 실행기 exe | mono-mcs `-langversion:5` (문자열 보간 금지), 바탕화면·시작 메뉴 바로가기, SmartScreen 안내 |
| 📱 아이폰·아이패드 | 깃허브 페이지 웹앱 (manifest + service worker, 홈 화면에 추가) | 애플은 개발자 등록 없이 앱 설치 불가 → 웹앱. 파일 저장은 공유 시트(`navigator.share` files) |
| 🍎 Mac | 웹앱(사파리 파일 → Dock에 추가) 또는 Electron .app (파일 접근이 필요할 때, MySpaceMac 참고) | Electron은 ko/en 로케일만 남기고 tar.xz (100MB 제한), rcodesign 임시 서명 |

해당 기기에서 의미 없는 건 만들지 않고 이유를 적는다 (예: Spotlight는 Mac에 기본, 런처는 휴대폰 불필요).

## 올리는 방법
- 설치 파일은 각 폴더에 두고 README 맨 위 "📥 바로 다운로드" 표(기기 4칸)와 프로그램 설명을 고친다.
- 다운로드 페이지(탭 + 기기 버튼 + 설치 3단계): `tools/download_page.html`을 고치고 `python3 tools/build_pages.py` → `docs/` (깃허브 페이지: https://edwinedwin0716-sketch.github.io/nurse_ai/). claude.ai 다운로드 페이지도 `--artifact out.html`로 만들어 같이 갱신한다.
- 웹앱 원본을 바꾸면 `python3 StudyHelper/build.py` → `python3 tools/build_pages.py` 순서로 다시 만든다.
- 사용자가 따로 주는 웹 주소(예: https://edwinedwin0716-sketch.github.io/matjip-finder/)의 프로그램은 그 저장소에 기기별 버전을 넣고, 여기 다운로드 표·페이지에도 탭을 추가한다.
- 버전을 올리면 zip 이름, AssemblyVersion, versionCode/versionName, 사용법 txt를 같이 고친다.
- PR을 만들어 바로 병합한다. 커밋 끝에 Co-Authored-By / Claude-Session 줄.

## 지킬 것
- API 키, 실명, 학번, 환자 정보, 사용자 파일은 올리지 않는다. 서명 키(`release.keystore`)도 올리지 않는다.
- 날짜 형식은 InvariantCulture(ko-KR에서 `M/d`가 "4. 20"이 됨).
- 후원 링크(카카오페이): https://qr.kakaopay.com/Ej8Yr8VXm — README 맨 위와 각 앱 하단에만, 홍보글에는 넣지 않는다.
