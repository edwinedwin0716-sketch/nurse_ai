#!/bin/sh
# Build NursingHelper.exe (Windows 10/11, Edge 앱 창 실행기) with mono-mcs. Run ../build_web.py first.
set -e
cd "$(dirname "$0")"
mkdir -p ../dist
mcs -langversion:5 -target:winexe -platform:anycpu -sdk:4.5 -r:System.Windows.Forms -win32icon:app.ico \
  -resource:../dist/간호과정도우미.html,app.html -out:../dist/NursingHelper.exe Launcher.cs ../../tools/InstallCleanup.cs
