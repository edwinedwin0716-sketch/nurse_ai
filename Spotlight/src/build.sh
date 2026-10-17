#!/bin/sh
# Build Spotlight.exe with the Mono C# compiler (mono-mcs).
set -e
cd "$(dirname "$0")"
mkdir -p ../dist
mcs -langversion:5 -target:winexe -platform:anycpu -sdk:4.5 \
  -r:System.Windows.Forms -r:System.Drawing -r:System.Web.Extensions -r:System.Core -win32icon:app.ico \
  -out:../dist/Spotlight.exe Spotlight.cs Search.cs Index.cs ModernControls.cs
