@echo off
rem =============================================================
rem  Linear Algebra Calculator - Android APK builder (Capacitor 6)
rem  Requires: JDK 17 (JAVA_HOME) + Android SDK 34 (ANDROID_HOME)
rem  Output:   android\app\build\outputs\apk\debug\app-debug.apk
rem  Note: web assets are already synced into app\src\main\assets\public
rem        so Node.js / npm is NOT required.
rem =============================================================
setlocal
cd /d "%~dp0"

echo [1/4] Checking JAVA_HOME ...
if "%JAVA_HOME%"=="" goto no_java
if not exist "%JAVA_HOME%\bin\java.exe" goto no_java
"%JAVA_HOME%\bin\java.exe" -version
echo.

echo [2/4] Checking Android SDK ...
set "SDKDIR=%ANDROID_HOME%"
if "%SDKDIR%"=="" set "SDKDIR=%ANDROID_SDK_ROOT%"
if "%SDKDIR%"=="" goto no_sdk
if not exist "%SDKDIR%" goto no_sdk
echo ANDROID_HOME=%SDKDIR%
if not exist "%SDKDIR%\platforms\android-34" echo [WARN] platforms;android-34 not found - build may fail.
if not exist "%SDKDIR%\build-tools\34.0.0" echo [WARN] build-tools;34.0.0 not found - build may fail.
echo.

echo [3/4] Building debug APK (first run downloads Gradle, 5-15 min) ...
cd android
if not exist "gradlew.bat" goto no_gradle
call gradlew.bat assembleDebug --no-daemon --console=plain
if errorlevel 1 goto build_failed
cd ..
echo.

echo [4/4] Done.
set "APK=%~dp0android\app\build\outputs\apk\debug\app-debug.apk"
if exist "%APK%" (
  echo APK: %APK%
  dir "%APK%"
) else (
  echo [ERROR] APK not found at %APK%
  goto build_failed
)
goto end

:no_java
echo [ERROR] JAVA_HOME is not set or invalid.
echo         Install JDK 17, then: setx JAVA_HOME "C:\Program Files\Java\jdk-17"
echo         Open a NEW cmd window after setx.
goto build_failed

:no_sdk
echo [ERROR] Android SDK not found.
echo         Set ANDROID_HOME to your SDK folder, e.g.
echo         setx ANDROID_HOME "%%LOCALAPPDATA%%\Android\Sdk"
echo         and install platforms;android-34 + build-tools;34.0.0.
goto build_failed

:no_gradle
echo [ERROR] android\gradlew.bat is missing - the package was not extracted completely.
goto build_failed

:build_failed
echo.
echo BUILD FAILED. See messages above.
if "%~1"=="" pause
exit /b 1

:end
echo.
echo BUILD OK.
if "%~1"=="" pause
exit /b 0
