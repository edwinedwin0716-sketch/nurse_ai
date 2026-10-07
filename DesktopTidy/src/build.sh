#!/bin/sh
# Build 바탕화면정리.exe with the Mono C# compiler (mono-mcs). Pure .NET Framework 4, no PowerShell.
set -e
cd "$(dirname "$0")"
mkdir -p ../dist
mcs -langversion:5 -target:winexe -platform:anycpu -sdk:4.5 -r:System.Windows.Forms -r:System.Drawing -r:System.Web.Extensions -r:System.Core \
  -win32icon:app.ico -out:../dist/DesktopTidy.exe Tidy.cs ModernControls.cs
