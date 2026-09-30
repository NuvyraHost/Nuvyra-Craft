# ============================================================
#  Nuvyra-Craft Mobile — Automated Portable APK Builder
#  Downloads portable JDK 17 + Android SDK & compiles APK
# ============================================================

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BuildEnv = Join-Path $ScriptDir ".build-env"
$JdkDir = Join-Path $BuildEnv "jdk17"
$SdkDir = Join-Path $BuildEnv "android-sdk"
$ApkOutDir = Join-Path $ScriptDir "apk"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Nuvyra-Craft Mobile — APK Build Engine  " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

if (-not (Test-Path $BuildEnv)) { New-Item -ItemType Directory -Path $BuildEnv -Force | Out-Null }
if (-not (Test-Path $ApkOutDir)) { New-Item -ItemType Directory -Path $ApkOutDir -Force | Out-Null }

# ── 1. Portable JDK 17 Setup ─────────────────────────────────
$javaExe = Get-ChildItem -Path $JdkDir -Filter "java.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $javaExe) {
    Write-Host "`n[1/5] Downloading Portable JDK 17 (Adoptium)..." -ForegroundColor Yellow
    $jdkZip = Join-Path $BuildEnv "jdk17.zip"
    $jdkUrl = "https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse?project=jdk"
    
    if (-not (Test-Path $jdkZip)) {
        & curl.exe -L -o $jdkZip $jdkUrl --progress-bar
    }
    
    Write-Host "Extracting JDK 17..." -ForegroundColor Yellow
    Expand-Archive -Path $jdkZip -DestinationPath $JdkDir -Force
    Remove-Item $jdkZip -Force -ErrorAction SilentlyContinue
    $javaExe = Get-ChildItem -Path $JdkDir -Filter "java.exe" -Recurse | Select-Object -First 1
}

$javaBinDir = $javaExe.Directory.FullName
$javaRootDir = $javaExe.Directory.Parent.FullName
$env:JAVA_HOME = $javaRootDir
$env:PATH = "$javaBinDir;$env:PATH"
Write-Host "JDK 17 Ready at: $javaRootDir" -ForegroundColor Green

# ── 2. Android Command-Line Tools Setup ──────────────────────
$sdkManager = Get-ChildItem -Path $SdkDir -Filter "sdkmanager.bat" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $sdkManager) {
    Write-Host "`n[2/5] Downloading Android Command-Line Tools..." -ForegroundColor Yellow
    $cmdZip = Join-Path $BuildEnv "cmdline-tools.zip"
    $cmdUrl = "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip"
    
    if (-not (Test-Path $cmdZip)) {
        & curl.exe -L -o $cmdZip $cmdUrl --progress-bar
    }
    
    Write-Host "Extracting Command-Line Tools..." -ForegroundColor Yellow
    $tempExtract = Join-Path $BuildEnv "cmdline-temp"
    Expand-Archive -Path $cmdZip -DestinationPath $tempExtract -Force
    
    $latestDir = Join-Path $SdkDir "cmdline-tools\latest"
    if (Test-Path $latestDir) { Remove-Item $latestDir -Recurse -Force }
    New-Item -ItemType Directory -Path (Join-Path $SdkDir "cmdline-tools") -Force | Out-Null
    Move-Item -Path (Join-Path $tempExtract "cmdline-tools\*") -Destination $latestDir -Force
    Remove-Item $tempExtract -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item $cmdZip -Force -ErrorAction SilentlyContinue
    
    $sdkManager = Join-Path $latestDir "bin\sdkmanager.bat"
}

$env:ANDROID_HOME = $SdkDir
$cmdlineBin = Split-Path -Parent $sdkManager
$env:PATH = "$cmdlineBin;$env:PATH"
Write-Host "Android SDK Tools Ready at: $SdkDir" -ForegroundColor Green

# ── 3. Accept Licenses & Install Android 34 Platform ─────────
$platform34 = Join-Path $SdkDir "platforms\android-34"
if (-not (Test-Path $platform34)) {
    Write-Host "`n[3/5] Installing Android 34 SDK Platform & Build-Tools..." -ForegroundColor Yellow
    $licenseInput = "y`ny`ny`ny`ny`ny`ny`ny`n"
    $licenseInput | & $sdkManager --licenses
    & $sdkManager --install "platforms;android-34" "build-tools;34.0.0"
}
Write-Host "Android SDK Platform 34 Installed" -ForegroundColor Green

# ── 4. Sync Web Assets to Android Project ───────────────────
Write-Host "`n[4/5] Syncing latest web assets to Android..." -ForegroundColor Yellow
$srcDir = Join-Path $ScriptDir "src"
$webAssets = Join-Path $ScriptDir "www"
if (Test-Path $srcDir) {
    Copy-Item -Path (Join-Path $srcDir "mobile-bridge.js") -Destination (Join-Path $webAssets "mobile-bridge.js") -Force -ErrorAction SilentlyContinue
    Copy-Item -Path (Join-Path $srcDir "mobile-patches.css") -Destination (Join-Path $webAssets "mobile-patches.css") -Force -ErrorAction SilentlyContinue
}
$updateManifest = Join-Path $ScriptDir "mobile-update-check.json"
if (Test-Path $updateManifest) {
    Copy-Item -Path $updateManifest -Destination (Join-Path $webAssets "mobile-update-check.json") -Force
}
$androidPublicAssets = Join-Path $ScriptDir "android\app\src\main\assets\public"
if (Test-Path $webAssets) {
    Copy-Item -Path "$webAssets\*" -Destination $androidPublicAssets -Recurse -Force
    Write-Host "Web assets synced to $androidPublicAssets" -ForegroundColor Green
}

# ── 4b. Write local.properties for Gradle ─────────────────────
Write-Host "`n[4b/5] Configuring Gradle environment..." -ForegroundColor Yellow
$escapedSdkDir = $SdkDir.Replace("\", "\\")
$localProps = Join-Path $ScriptDir "android\local.properties"
Set-Content -Path $localProps -Value "sdk.dir=$escapedSdkDir"
Write-Host "Configured $localProps" -ForegroundColor Green

# ── 5. Assemble Debug APK ────────────────────────────────────
$builtApk = Join-Path $ScriptDir "android\app\build\outputs\apk\debug\app-debug.apk"
if (Test-Path $builtApk) { Remove-Item $builtApk -Force }

$androidDir = Join-Path $ScriptDir "android"
Push-Location $androidDir
try {
    .\gradlew.bat assembleDebug --stacktrace
    if ($LASTEXITCODE -ne 0) {
        throw "Gradle build failed with exit code $LASTEXITCODE"
    }
} finally {
    Pop-Location
}

# ── 6. Copy Finished APK to mobile\apk\ ──────────────────────
$builtApk = Join-Path $ScriptDir "android\app\build\outputs\apk\debug\app-debug.apk"
if (Test-Path $builtApk) {
    $targetApk = Join-Path $ApkOutDir "nuvyra-craft-mobile-v1.apk"
    Copy-Item -Path $builtApk -Destination $targetApk -Force
    
    Write-Host "`n========================================================" -ForegroundColor Green
    Write-Host "  SUCCESS! APK Generated Successfully!" -ForegroundColor Green
    Write-Host "  File: $targetApk" -ForegroundColor White
    $fileInfo = Get-Item $targetApk
    $sizeMB = [math]::Round($fileInfo.Length / 1MB, 2)
    Write-Host "  Size: $sizeMB MB" -ForegroundColor White
    Write-Host "========================================================" -ForegroundColor Green
} else {
    Write-Host "Failed to locate generated APK at: $builtApk" -ForegroundColor Red
}
