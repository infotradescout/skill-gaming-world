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
  echo Install Blender 5.2 LTS or place blender.exe on PATH.
  exit /b 2
)

if not exist "%CAPTURE%" (
  echo ERROR: Capture script was not found at "%CAPTURE%".
  exit /b 3
)

if not defined SGW_ROBOT_COMBAT_OUTPUT (
  set "SGW_ROBOT_COMBAT_OUTPUT=%~dp0..\..\..\generated\robot-combat"
)

if not defined SGW_STORY_EVIDENCE (
  set "SGW_STORY_EVIDENCE=%~dp0..\..\..\docs\evidence\bay13-scrapyard-story-blockout"
)

echo Blender: %BLENDER_EXE%
echo Capture: %CAPTURE%
echo Output:  %SGW_ROBOT_COMBAT_OUTPUT%
echo Evidence:%SGW_STORY_EVIDENCE%

"%BLENDER_EXE%" --background --factory-startup --python "%CAPTURE%" -- "%SGW_ROBOT_COMBAT_OUTPUT%" "%SGW_STORY_EVIDENCE%" --story
exit /b %ERRORLEVEL%
