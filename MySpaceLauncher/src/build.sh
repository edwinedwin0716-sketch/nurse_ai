#!/bin/sh
# Build MySpaceLauncher.exe / MySpaceSetup.exe with the Mono C# compiler (mono-mcs).
set -e
cd "$(dirname "$0")"
mkdir -p ../dist
mcs -langversion:5 -target:winexe -platform:x86 -sdk:4.5 \
  -r:System.Windows.Forms -r:System.Drawing -r:System.Management -win32icon:app.ico \
  -resource:Launcher.ps1,Launcher.ps1 -resource:Discovery.ps1,Discovery.ps1 -resource:ModernControls.cs,ModernControls.cs \
  -out:../dist/MySpaceLauncher.exe Bootstrap.cs
cp ../dist/MySpaceLauncher.exe ../dist/MySpaceSetup.exe
