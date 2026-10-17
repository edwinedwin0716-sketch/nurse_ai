#!/bin/sh
# Build 간호과정 도우미 APK with Ubuntu's Android SDK packages:
#   apt-get install android-sdk-platform-23 aapt dalvik-exchange apksigner zipalign
set -e
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
  keytool -genkeypair -keystore release.keystore -storepass nursinghelper -keypass nursinghelper -alias helper \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Nursing Helper" >/dev/null 2>&1
fi
apksigner sign --ks release.keystore --ks-pass pass:nursinghelper --key-pass pass:nursinghelper --ks-key-alias helper \
  --out ../dist/NursingHelper.apk build/aligned.apk
apksigner verify ../dist/NursingHelper.apk && echo "APK ready: ../dist/NursingHelper.apk"
