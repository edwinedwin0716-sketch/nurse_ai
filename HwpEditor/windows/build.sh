#!/bin/sh
# Build HWP편집기.exe (Windows 10/11) with mono-mcs. Run ../build.py first.
set -e
cd "$(dirname "$0")"
mkdir -p ../dist
mcs -langversion:5 -target:winexe -platform:anycpu -sdk:4.5 -r:System.Windows.Forms -win32icon:../icon/app.ico \
  -resource:../dist/HWP편집기.html,app.html -out:../dist/HWP편집기.exe Launcher.cs ../../tools/InstallCleanup.cs
