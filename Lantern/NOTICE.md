# 등불 원정대 — 함께 넣은 오픈소스

온라인으로 친구와 함께 하기(기기끼리 직접 연결, WebRTC)에 아래 라이브러리를 그대로 넣어 씁니다.
게임 규칙 · 이름 · 그림 · 화면은 모두 이 저장소에서 새로 만든 것입니다.

## PeerJS 1.5.4 (`web/peerjs.min.js`)
- https://github.com/peers/peerjs — MIT License
- `npm pack peerjs@1.5.4` 의 `dist/peerjs.min.js` 를 고치지 않고 넣었습니다. `build.py`가 한 파일 HTML 안에 묶습니다.
- 연결할 때만 PeerJS 공개 중계 서버(0.peerjs.com)를 거칩니다. 방 코드로 만든 연결 이름만 전달되고 개인정보는 보내지 않습니다.

```
Copyright (c) 2015 Michelle Bu and Eric Zhang, http://peerjs.com

(The MIT License)

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```
