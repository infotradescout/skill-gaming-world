@echo off
setlocal
rem Local Godot 4.7.1 stable (verified on this machine). Override with GODOT_EXE if needed.
if not defined GODOT_EXE set "GODOT_EXE=C:\Users\flavo\Downloads\Godot_v4.7.1-stable_win64.exe\Godot_v4.7.1-stable_win64.exe"
if not exist "%GODOT_EXE%" (
  echo Godot not found at:
  echo   %GODOT_EXE%
  echo Set GODOT_EXE to the editor binary, or re-extract Godot_v4.7.1-stable_win64.
  exit /b 1
)
cd /d "%~dp0"
"%GODOT_EXE%" --path "%cd%" %*
endlocal
