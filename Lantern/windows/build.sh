#!/bin/sh
# Build 등불원정대.exe (Windows 10/11) with mono-mcs. Run ../build.py first.
set -e
cd "$(dirname "$0")"
mkdir -p ../dist
mcs -langversion:5 -target:winexe -platform:anycpu -sdk:4.5 -r:System.Windows.Forms -win32icon:../icon/app.ico \
  -resource:../dist/등불원정대.html,app.html -out:../dist/등불원정대.exe Launcher.cs ../../tools/InstallCleanup.cs
# zip: 등불원정대/ 폴더 안에 exe + 사용법
rm -rf ../dist/zip && mkdir -p ../dist/zip/등불원정대
cp ../dist/등불원정대.exe "설치 및 사용법.txt" ../dist/zip/등불원정대/
rm -f ../Lantern-Windows-1.0.zip
(cd ../dist/zip && python3 -c "import shutil; shutil.make_archive('../../Lantern-Windows-1.0', 'zip', '.', '등불원정대')")
echo "ZIP ready: ../Lantern-Windows-1.0.zip"
