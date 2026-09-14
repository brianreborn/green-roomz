@echo off
REM Portable QEMU (7-Zip extract of weilnetz installer) + VM kit.
set "QEMU=%USERPROFILE%\qemu"
set "KIT=%~dp0..\..\dist\vm"
if not exist "%QEMU%\qemu-system-x86_64.exe" (
  echo missing %QEMU%\qemu-system-x86_64.exe
  exit /b 1
)
if not exist "%KIT%\green-roomz.qcow2" (
  echo missing kit disk under %KIT%
  exit /b 1
)
REM Host :8080 is often GRZ on Windows; guest HTTP is 18080. SSH 2222.
"%QEMU%\qemu-system-x86_64.exe" -machine q35 -accel tcg -m 2048 -smp 2 ^
  -drive "file=%KIT%\green-roomz.qcow2,if=virtio,format=qcow2" ^
  -drive "file=%KIT%\seed.iso,media=cdrom,readonly=on" ^
  -netdev user,id=n0,hostfwd=tcp::18080-:8080,hostfwd=tcp::2222-:22 ^
  -device virtio-net-pci,netdev=n0 ^
  -display gtk
