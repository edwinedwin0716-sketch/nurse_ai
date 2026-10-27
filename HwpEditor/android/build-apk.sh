#!/bin/sh
# Build HWP 편집기 APK with Ubuntu's Android SDK packages:
#   apt-get install android-sdk-platform-23 aapt dalvik-exchange apksigner zipalign
set -e
# web app is bundled into assets/ by ../build.py (run it first)
cd "$(dirname "$0")"
SDK=/usr/lib/android-sdk
JAR=$SDK/platforms/android-23/android.jar
rm -rf build && mkdir -p build/gen build/obj build/bin ../dist
aapt package -f -m -J build/gen -M AndroidManifest.xml -S res -I "$JAR"
javac -nowarn --release 8 -encoding UTF-8 -classpath "$JAR" -d build/obj $(find src build/gen -name '*.java') 2>&1 | grep -v "^warning\|^Note\|^1 warning" || true
dalvik-exchange --dex --output=build/bin/classes.dex build/obj
aapt package -f -M AndroidManifest.xml -S res -A assets -I "$JAR" -F build/unsigned.apk build/bin
zipalign -f 4 build/unsigned.apk build/aligned.apk
# The signing key stays out of git (see .gitignore); updates need the same key.
if [ ! -f release.keystore ]; then
  keytool -genkeypair -keystore release.keystore -storepass hwpeditor -keypass hwpeditor -alias helper \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=HWP Editor" >/dev/null 2>&1
fi
apksigner sign --ks release.keystore --ks-pass pass:hwpeditor --key-pass pass:hwpeditor --ks-key-alias helper \
  --out ../dist/HwpEditor.apk build/aligned.apk
apksigner verify ../dist/HwpEditor.apk && echo "APK ready: ../dist/HwpEditor.apk"
