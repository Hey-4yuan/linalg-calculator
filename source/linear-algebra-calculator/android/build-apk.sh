#!/bin/bash
# 线性代数计算器 Android APK 构建脚本（Capacitor 6）
# 前置：JDK 17、Android SDK（platform-tools + platforms;android-34 + build-tools;34.0.0）
# 用法：JAVA_HOME=/path/to/jdk17 ANDROID_HOME=/path/to/Android/Sdk ./build-apk.sh
set -e
cd "$(dirname "$0")"

if [ -z "$JAVA_HOME" ]; then echo "请先设置 JAVA_HOME（指向 JDK 17）"; exit 1; fi
if [ -z "$ANDROID_HOME" ]; then echo "请先设置 ANDROID_HOME（指向 Android SDK）"; exit 1; fi
export PATH="$JAVA_HOME/bin:$PATH"

echo "==> 1/3 安装 Capacitor 依赖"
npm install

echo "==> 2/3 同步网页资源到 android 工程"
echo "sdk.dir=$ANDROID_HOME" > android/local.properties
npx cap sync android

echo "==> 3/3 Gradle 构建 debug APK"
cd android
chmod +x ./gradlew
./gradlew assembleDebug --no-daemon --console=plain
echo ""
echo "构建完成：android/app/build/outputs/apk/debug/app-debug.apk"
