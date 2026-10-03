$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinMove {
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@
$proc = Get-Process -Name Taskmgr | Select-Object -First 1
if (-not $proc) {
  Start-Process taskmgr
  Start-Sleep -Seconds 2
  $proc = Get-Process -Name Taskmgr | Select-Object -First 1
}
$hwnd = [IntPtr]::Zero
if ($proc -and $proc.MainWindowHandle -ne [IntPtr]::Zero) {
  $hwnd = $proc.MainWindowHandle
}
$wa = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$w = 420
if ($w -gt [int]($wa.Width / 2)) { $w = [int]($wa.Width / 3) }
$h = $wa.Height
$x = $wa.X + $wa.Width - $w
$y = $wa.Y
if ($hwnd -ne [IntPtr]::Zero) {
  [WinMove]::ShowWindow($hwnd, 9) | Out-Null
  [WinMove]::SetWindowPos($hwnd, [IntPtr]::Zero, $x, $y, $w, $h, 0x0040) | Out-Null
  "taskmgr-moved handle=$hwnd x=$x y=$y w=$w h=$h"
} else {
  'taskmgr-no-hwnd'
}
