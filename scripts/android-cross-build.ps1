# Cross-compile llama.cpp CLI (llama-server/cli/bench) for arm64-v8a.
# Toolchain: Japanglify SDK + llama.android NDK 29.0.13113456 / CMake 3.31.6.
# CPU-only, GGML_CPU_ALL_VARIANTS so one ELF covers Android-legacy phone (API 28, 4K pages)
# and Pixel 8 (16K pages via flexible page sizes). No GPU backend in this pack.
$ErrorActionPreference = 'Stop'
$Sdk = $env:ANDROID_SDK_ROOT
if (-not $Sdk) { $Sdk = $env:ANDROID_HOME }
if (-not $Sdk) { $Sdk = 'C:\Android\Sdk' }
$NdkVer = '29.0.13113456'
$CmakeVer = '3.31.6'
$Ndk = Join-Path $Sdk "ndk\$NdkVer"
$Cmake = Join-Path $Sdk "cmake\$CmakeVer\bin\cmake.exe"
$Src = 'C:\LocalAI\llama.cpp-0.3.0'
$Build = Join-Path $Src 'build-android-arm64'
$Prefix = 'C:\LocalAI\android-pack\arm64-v8a'

if (-not (Test-Path -LiteralPath (Join-Path $Ndk 'build\cmake\android.toolchain.cmake'))) {
    throw "NDK $NdkVer missing. Run scripts\android-sdk-ndk.ps1 first."
}
if (-not (Test-Path -LiteralPath $Cmake)) { throw "CMake $CmakeVer missing. Run scripts\android-sdk-ndk.ps1 first." }
if (-not (Test-Path -LiteralPath (Join-Path $Src 'CMakeLists.txt'))) { throw "llama.cpp source missing: $Src" }

# Keep object files across reconfigures (UI stub, flag tweaks).
New-Item -ItemType Directory -Force -Path $Build, $Prefix | Out-Null

$env:ANDROID_NDK = $Ndk
$env:ANDROID_NDK_HOME = $Ndk
$Ninja = Join-Path $Sdk "cmake\$CmakeVer\bin\ninja.exe"
$ToolchainFile = Join-Path $Ndk 'build\cmake\android.toolchain.cmake'
$cmakeArgs = @(
    '-G', 'Ninja',
    '-S', $Src,
    '-B', $Build,
    "-DCMAKE_MAKE_PROGRAM=$Ninja",
    "-DCMAKE_TOOLCHAIN_FILE=$ToolchainFile",
    '-DANDROID_ABI=arm64-v8a',
    '-DANDROID_PLATFORM=android-28',
    '-DANDROID_STL=c++_shared',
    '-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON',
    '-DCMAKE_BUILD_TYPE=Release',
    "-DCMAKE_INSTALL_PREFIX=$Prefix",
    '-DBUILD_SHARED_LIBS=ON',
    '-DGGML_NATIVE=OFF',
    '-DGGML_BACKEND_DL=ON',
    '-DGGML_CPU_ALL_VARIANTS=ON',
    '-DGGML_CPU_KLEIDIAI=ON',
    '-DGGML_LLAMAFILE=OFF',
    '-DGGML_OPENMP=OFF',
    '-DLLAMA_BUILD_TESTS=OFF',
    '-DLLAMA_BUILD_EXAMPLES=OFF',
    '-DLLAMA_BUILD_TOOLS=ON',
    '-DLLAMA_BUILD_SERVER=ON',
    '-DLLAMA_BUILD_APP=OFF',
    '-DLLAMA_BUILD_UI=OFF',
    '-DLLAMA_OPENSSL=OFF'
)
& $Cmake @cmakeArgs
if ($LASTEXITCODE -ne 0) { throw "cmake configure failed ($LASTEXITCODE)" }

& $Cmake --build $Build --config Release --target llama-server llama-cli llama-bench -j 8
if ($LASTEXITCODE -ne 0) { throw "cmake build failed ($LASTEXITCODE)" }

& $Cmake --install $Build --prefix $Prefix --config Release
if ($LASTEXITCODE -ne 0) { throw "cmake install failed ($LASTEXITCODE)" }

Write-Output "installed $Prefix"
Get-ChildItem (Join-Path $Prefix 'bin') -ErrorAction SilentlyContinue | Select-Object Name, Length
