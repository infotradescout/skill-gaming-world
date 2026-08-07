@echo off
setlocal EnableExtensions

set "CAPTURE=%~dp0capture_evidence_screenshots.py"
set "BLENDER_EXE="

for %%P in (
  "%ProgramFiles%\Blender Foundation\Blender 5.2\blender.exe"
  "%ProgramFiles%\Blender Foundation\Blender 5.2 LTS\blender.exe"
  "%ProgramFiles%\Blender Foundation\Blender\blender.exe"
  "%LOCALAPPDATA%\Programs\Blender Foundation\Blender 5.2\blender.exe"
) do (
  if exist "%%~P" if not defined BLENDER_EXE set "BLENDER_EXE=%%~P"
)

if not defined BLENDER_EXE (
  where blender.exe >nul 2>nul
  if not errorlevel 1 set "BLENDER_EXE=blender.exe"
)

if not defined BLENDER_EXE (
  echo ERROR: Blender 5.2 LTS was not found.
  exit /b 2
)

if not defined SGW_ROBOT_COMBAT_OUTPUT (
  set "SGW_ROBOT_COMBAT_OUTPUT=%~dp0..\..\..\generated\robot-combat"
)

if not defined SGW_FOUNDATION_EVIDENCE (
  set "SGW_FOUNDATION_EVIDENCE=%~dp0..\..\..\docs\evidence\robot-combat-foundation-20260807"
)

echo Blender: %BLENDER_EXE%
echo Capture: %CAPTURE%
echo Output:  %SGW_ROBOT_COMBAT_OUTPUT%
echo Evidence:%SGW_FOUNDATION_EVIDENCE%

"%BLENDER_EXE%" --background --factory-startup --python "%CAPTURE%" -- "%SGW_ROBOT_COMBAT_OUTPUT%" "%SGW_FOUNDATION_EVIDENCE%" --foundation
exit /b %ERRORLEVEL%
