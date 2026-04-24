@echo off
setlocal

set "PATH=C:\Users\310283426\.local\bin;%PATH%"
set "PYTHONUTF8=1"

cd /d "%~dp0behave-demo"

echo ============================================================
echo  Running AutoGenesis - Activate.feature
echo ============================================================
echo.

uv run behave features/Activate.feature

echo.
echo ============================================================
echo  Done. Press any key to close this window.
echo ============================================================
pause >nul
