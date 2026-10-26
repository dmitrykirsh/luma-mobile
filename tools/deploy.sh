#!/usr/bin/env bash
# Сборка debug-APK, установка на телефон и запуск: tools/deploy.sh (адрес телефона: PHONE=ip:порт)
set -e
cd "$(dirname "$0")/.."
export JAVA_HOME="${JAVA_HOME:-/c/Program Files/Microsoft/jdk-17.0.20.101-hotspot}"
GR="${GRADLE:-/c/Users/dkirs/.gradle/wrapper/dists/gradle-8.14.3-bin/cv11ve7ro1n3o1j4so8xd9n66/gradle-8.14.3/bin/gradle}"
ADB="${ADB:-/c/Android/sdk/platform-tools/adb.exe}"; DEV="${PHONE:-192.168.0.67:38789}"
if ! "$GR" -q assembleDebug > /tmp/mobile-build.log 2>&1; then grep -E "^e:|What went wrong" -A3 /tmp/mobile-build.log | head -20; echo "СБОРКА УПАЛА"; exit 1; fi
"$ADB" -s "$DEV" install -r app/build/outputs/apk/debug/app-debug.apk | tail -1
"$ADB" -s "$DEV" shell am force-stop ws.luma.mobile
"$ADB" -s "$DEV" shell monkey -p ws.luma.mobile -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
echo started
