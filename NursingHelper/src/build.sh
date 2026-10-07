#!/bin/sh
# Build NursingHelper.exe / NursingHelperSetup.exe with the Mono C# compiler (mono-mcs).
set -e
cd "$(dirname "$0")"
mkdir -p ../dist
mcs -langversion:5 -target:winexe -platform:x86 -sdk:4.5 \
  -r:System.Windows.Forms -r:System.Drawing -r:System.Management -r:System.Security -win32icon:app.ico \
  -resource:App.ps1,App.ps1 -resource:Templates.ps1,Templates.ps1 -resource:ModernControls.cs,ModernControls.cs \
  -out:../dist/NursingHelper.exe Bootstrap.cs
cp ../dist/NursingHelper.exe ../dist/NursingHelperSetup.exe
