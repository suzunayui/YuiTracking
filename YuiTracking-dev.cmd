@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\dev.ps1"
if errorlevel 1 (
  echo.
  echo Build failed. See the messages above.
  pause
)
