@echo off
setlocal EnableExtensions

set "INSPECT=%~dp0inspect_generated_scene.py"
set "BLENDER_EXE="

for %%P in (
  "%ProgramFiles%\Blender Foundation\Blender 5.2\blender.exe"
  "%ProgramFiles%\Blender Foundation\Blender 5.2 LTS\blender.exe"
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

"%BLENDER_EXE%" --background --factory-startup --python "%INSPECT%" -- "%SGW_ROBOT_COMBAT_OUTPUT%"
exit /b %ERRORLEVEL%
