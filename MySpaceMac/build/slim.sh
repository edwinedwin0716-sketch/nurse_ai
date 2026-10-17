#!/bin/sh
# 언어 파일을 한국어·영어만 남기고 ad-hoc 서명(rcodesign) 후 압축 (GitHub 100MB 제한 대응)
set -e
cd "$(dirname "$0")/.."
for pair in arm64:AppleSilicon x64:Intel; do
  arch=${pair%%:*}; name=${pair##*:}; app="dist/MySpace-darwin-$arch/MySpace.app"
  find "$app" -type d -name '*.lproj' | while read -r d; do
    case "$(basename "$d")" in ko.lproj|ko_*.lproj|en.lproj|en_*.lproj|Base.lproj) ;; *) rm -rf "$d" ;; esac
  done
  rcodesign sign "$app" >/dev/null
  # .tar.xz: zip보다 훨씬 작아서 GitHub 100MB 제한 안에 들어간다 (Mac에서 더블클릭으로 풀림)
  rm -f "MySpace-mac-$name.tar.xz"
  cp "설치 및 사용법.txt" "dist/MySpace-darwin-$arch/"
  tar -C "dist/MySpace-darwin-$arch" -cf - MySpace.app "설치 및 사용법.txt" | xz -9e -T0 > "MySpace-mac-$name.tar.xz"
done
ls -la MySpace-mac-*.tar.xz
