# Reuse Japanglify's command-line SDK (ANDROID_HOME / C:\Android\Sdk).
# Installs the NDK + CMake versions pinned by llama.cpp examples/llama.android.
$ErrorActionPreference = 'Stop'
$Sdk = $env:ANDROID_SDK_ROOT
if (-not $Sdk) { $Sdk = $env:ANDROID_HOME }
if (-not $Sdk) { $Sdk = 'C:\Android\Sdk' }
if (-not $env:JAVA_HOME) { $env:JAVA_HOME = 'C:\Program Files\Java\jdk-22.0.1' }

$NdkVer = '29.0.13113456'
$CmakeVer = '3.31.6'
$SdkManager = Join-Path $Sdk 'cmdline-tools\latest\bin\sdkmanager.bat'
if (-not (Test-Path -LiteralPath $SdkManager)) {
    throw "sdkmanager missing: $SdkManager (Japanglify bootstrap: contributions/japanglify/scripts/bootstrap-android-sdk.sh)"
}

$NdkRoot = Join-Path $Sdk "ndk\$NdkVer"
$CmakeRoot = Join-Path $Sdk "cmake\$CmakeVer"
if ((Test-Path -LiteralPath $NdkRoot) -and (Test-Path -LiteralPath $CmakeRoot)) {
    Write-Output "already-installed ndk=$NdkVer cmake=$CmakeVer sdk=$Sdk"
    exit 0
}

$yesFile = New-TemporaryFile
try {
    $yes = $yesFile.FullName
    1..200 | ForEach-Object { 'y' } | Set-Content -Path $yes -Encoding ASCII
    cmd /c "type `"$yes`" | `"$SdkManager`" --sdk_root=`"$Sdk`" --licenses" | Out-Host
} finally {
    Remove-Item -Force -LiteralPath $yesFile.FullName -ErrorAction SilentlyContinue
}
cmd /c "`"$SdkManager`" --sdk_root=`"$Sdk`" `"ndk;$NdkVer`" `"cmake;$CmakeVer`"" | Out-Host

if (-not (Test-Path -LiteralPath $NdkRoot)) { throw "NDK install failed: $NdkRoot" }
if (-not (Test-Path -LiteralPath $CmakeRoot)) { throw "CMake install failed: $CmakeRoot" }
Write-Output "installed ndk=$NdkVer cmake=$CmakeVer sdk=$Sdk"
