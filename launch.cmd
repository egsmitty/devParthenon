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
cd /d "%~dp0"

echo Building Dev Parthenon (latest source)...
call npm run build
if errorlevel 1 (
  echo.
  echo Build FAILED - see the errors above.
  pause
  exit /b 1
)

echo Launching...
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0"
exit /b 0
