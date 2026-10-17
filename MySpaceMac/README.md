# MySpace 런처 for Mac

Windows용 MySpace 런처와 같은 기능을 하는 macOS 앱입니다 (Electron).

- 화면 아래 가운데(Dock 위)에 뜨는 반투명(vibrancy) 창, 신호등 버튼, 검색, 카테고리 탭
- 투명도 30~100%, 라이트/다크, 창 크기 2·3·4줄, 항상 위
- ⌥Space(바꿀 수 있음)로 어디서나 열기/숨기기, 메뉴 막대 아이콘
- 응용 프로그램 폴더의 AI·메신저·업무·게임 앱 자동 등록, 데스크탑·다운로드 새 파일과 Steam 게임 자동 추가
- Finder에서 끌어 놓기, 우클릭 메뉴(Finder에서 보기·즐겨찾기·이름 변경·카테고리 이동·제거)

설치와 사용법은 `설치 및 사용법.txt`를 보세요.

## 개발
```sh
npm install
npm test                 # 자동 추가 규칙 테스트
npx electron .           # 실행
node build/package.js    # dist/MySpace-darwin-{arm64,x64}/MySpace.app
sh build/slim.sh         # 언어 정리 + rcodesign 임시 서명 + .tar.xz 압축
```
