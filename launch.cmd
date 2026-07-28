@echo off
rem ============================================================
rem  Dev Parthenon — build-and-launch
rem  Double-click (or run from a terminal) to ALWAYS open the
rem  latest version: it compiles the current source first, then
rem  launches the app detached (this window closes on its own).
rem
rem  This is what the Desktop shortcut points at, so a single
rem  double-click is always up to date — no manual build needed.
rem ============================================================
setlocal
cd /d "%~dp0"

echo Building Dev Parthenon (latest source)...
call npm run build
if errorlevel 1 (
  echo.
  echo Build FAILED - see the errors above.
  pause
  exit /b 1
)

rem %~dp0 ends with a backslash; strip it so the path passed to
rem Electron is not "...\devParthenon\" (the trailing \" mangles the arg).
set "APPDIR=%~dp0"
set "APPDIR=%APPDIR:~0,-1%"

echo Launching...
start "Dev Parthenon" "%APPDIR%\node_modules\electron\dist\electron.exe" "%APPDIR%"
exit /b 0
