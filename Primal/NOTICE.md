# 원시섬 — 함께 넣은 오픈소스

게임 규칙 · 이름 · 지도 · 화면은 모두 이 저장소에서 새로 만든 것입니다. 다른 게임의 그림·소리·코드는 쓰지 않았습니다.

## 사용자가 만든 3D 모형 28종 (`web/assets.js`)
- 시설·자연물 16종: 울타리 · 석조 가마 · 원시 오두막 · 망루 · 우물 · 모닥불과 천막 · 대장간 화덕 · 원시 작업대 · 통나무 뗏목 · 짚 움막 · 물고기 건조대 · 석조 제단 · 야자수 · 고사리 군락 · 현무암 바위 · 야영 잡화
- 공룡·고생물 12종: 브라키오사우루스 · 트리케라톱스 · 티라노사우루스 · 스테고사우루스 · 프테라노돈 · 매머드 · 파라사우롤로푸스 · 안킬로사우루스 · 벨로시랩터 · 디메트로돈 · 스피노사우루스 · 스밀로돈
- 모양은 저장소 주인이 직접 만들어 준 STL 파일 28개(총 137,758 삼각형)를 `assets/convert.py`로 바꾼 것입니다.
  변환기는 같은 꼭짓점을 합치고 위치를 16비트로 줄이며, `parts.json`의 부품 구간대로 재질별로 나누고,
  공룡은 다리를 떼어 걷게 합니다.
- 원본 STL 파일은 저장소에 넣지 않았습니다. 그 밖의 풀뜯개·발톱이·사람·나무·바위는 `web/models.js`가 코드로 만듭니다.

## 절차적 재질 (`web/textures.js`)
- 나무 · 돌 · 가죽 · 털 · 깃털 · 짚 · 잎 · 천 · 밧줄 · 금속 · 흙의 알베도 · 노멀 · 러프니스 그림을
  브라우저 캔버스에서 코드로 그립니다. 외부 그림 파일이나 다른 프로그램의 텍스처는 쓰지 않았습니다.

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
