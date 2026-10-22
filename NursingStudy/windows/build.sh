#!/bin/sh
# Build 간호공부방.exe (Windows 10/11) with mono-mcs. Run ../build.py first.
set -e
cd "$(dirname "$0")"
mkdir -p ../dist
mcs -langversion:5 -target:winexe -platform:anycpu -sdk:4.5 -r:System.Windows.Forms -win32icon:../icon/app.ico \
  -resource:../dist/간호공부방.html,app.html -out:../dist/간호공부방.exe Launcher.cs ../../tools/InstallCleanup.cs
