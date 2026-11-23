# 원시섬 — 함께 넣은 오픈소스

게임 규칙 · 이름 · 지도 · 화면은 모두 이 저장소에서 새로 만든 것입니다. 다른 게임의 그림·소리·코드는 쓰지 않았습니다.

## 사용자가 만든 3D 모형 (`web/assets.js`)
- 울타리 · 가마 · 움막 · 망루 · 우물 · 모닥불과 천막 · 공룡 4종(목긴이·뿔방패·큰이빨·판등이)의 모양은 저장소 주인이 직접 만들어 준 STL 파일을
  `assets/convert.py`로 바꾼 것입니다 (색은 `web/models.js`가 칠하고, 공룡 다리는 걸을 수 있게 나눴습니다).
- 원본 STL 파일은 저장소에 넣지 않았습니다. 그 밖의 공룡·사람·나무·바위는 `web/models.js`가 코드로 만듭니다.

## three.js r158 (`web/three.min.js`)
- https://github.com/mrdoob/three.js — MIT License
- `npm pack three@0.158.0` 의 `build/three.min.js` 를 넣었습니다. `build.py`가 한 파일 HTML 안에 묶으면서 맨 앞의 "옛 방식" 안내(console.warn) 한 줄만 지웁니다.

```
The MIT License

Copyright © 2010-2023 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```
