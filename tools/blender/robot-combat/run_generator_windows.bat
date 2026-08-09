@echo off
setlocal EnableExtensions

set "SCRIPT=%~dp0sgw_robot_combat_arena.py"
set "VALIDATOR=%~dp0validate_generated_bundle.py"
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

if not exist "%SCRIPT%" (
  echo ERROR: Generator script was not found at "%SCRIPT%".
  exit /b 3
)

if not defined SGW_ROBOT_COMBAT_OUTPUT (
  set "SGW_ROBOT_COMBAT_OUTPUT=%~dp0..\..\..\generated\robot-combat"
)

echo Blender: %BLENDER_EXE%
echo Script:  %SCRIPT%
echo Output:  %SGW_ROBOT_COMBAT_OUTPUT%

"%BLENDER_EXE%" --background --factory-startup --python "%SCRIPT%"
set "RESULT=%ERRORLEVEL%"

if not "%RESULT%"=="0" (
  echo ERROR: The SGW Robot Combat generator failed with exit code %RESULT%.
  exit /b %RESULT%
)

echo Generator completed successfully.
"%BLENDER_EXE%" --background --factory-startup --python "%VALIDATOR%" -- "%SGW_ROBOT_COMBAT_OUTPUT%"
set "VALIDATION_RESULT=%ERRORLEVEL%"
if not "%VALIDATION_RESULT%"=="0" (
  echo ERROR: Generated bundle validation failed with exit code %VALIDATION_RESULT%.
  exit /b %VALIDATION_RESULT%
)

echo Generated bundle validation completed successfully.
exit /b 0
