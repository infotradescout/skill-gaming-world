# Runs on an authorized Windows UE5.7 build machine, without Desktop Commander.
# Does not install Unreal, accept license terms, or change system/account settings.
param([string]$EngineRoot=$env:UE_ROOT,[switch]$Package)
$ErrorActionPreference='Stop'
if (-not $EngineRoot) {
  $candidate='C:\Program Files\Epic Games\UE_5.7'
  if (Test-Path "$candidate\Engine\Build\Build.version") { $EngineRoot=$candidate }
}
if (-not $EngineRoot) { throw 'UE_ROOT must point to an existing authorized UE5.7 installation.' }
$version=Get-Content "$EngineRoot\Engine\Build\Build.version" | ConvertFrom-Json
if ($version.MajorVersion -ne 5 -or $version.MinorVersion -ne 7) { throw 'Expected Frontline-aligned UE5.7.' }
$project=Join-Path $PSScriptRoot 'WildlifeReserve\WildlifeReserve.uproject'
$bundle=Join-Path $PSScriptRoot 'WildlifeReserve\InputBundle\district.json'
if (-not (Test-Path $bundle)) { throw 'Use the generated Unreal handoff package: InputBundle is missing.' }
$build=Join-Path $EngineRoot 'Engine\Build\BatchFiles\Build.bat'
$editor=Join-Path $EngineRoot 'Engine\Binaries\Win64\UnrealEditor-Cmd.exe'
$uat=Join-Path $EngineRoot 'Engine\Build\BatchFiles\RunUAT.bat'
foreach($file in @($build,$editor,$uat)) { if(-not (Test-Path $file)){ throw "Missing tool: $file" } }
& $build WildlifeReserveEditor Win64 Development "-Project=$project" -WaitMutex
if ($LASTEXITCODE -ne 0) { throw 'Unreal editor-module build failed.' }
$script=Join-Path $PSScriptRoot 'Tools\import_district.py'
& $editor $project "-ExecutePythonScript=$script" -unattended -nullrhi -nosound -nop4 -UTF8Output
if ($LASTEXITCODE -ne 0) { throw 'Unreal import process failed.' }
$receiptPath=Join-Path $PSScriptRoot 'WildlifeReserve\Saved\UnrealDistrictImport.json'
if (-not (Test-Path $receiptPath)) {throw 'No Unreal execution receipt. Python exit code alone is insufficient.'}
$r=Get-Content $receiptPath|ConvertFrom-Json
$actual=(Get-FileHash $bundle -Algorithm SHA256).Hash.ToLower()
if (-not $r.import_completed -or $r.transport_sha256 -ne $actual) { throw 'Missing or stale Unreal import proof.' }
if ($Package) {
  $output=Join-Path $PSScriptRoot 'Packaged'
  & $uat BuildCookRun "-project=$project" -noP4 -platform=Win64 -clientconfig=Development -build -cook -stage -pak -archive "-archivedirectory=$output" -utf8output
  if ($LASTEXITCODE -ne 0) { throw 'Windows packaging failed.' }
  $exe=Get-ChildItem $output -Filter WildlifeReserve.exe -Recurse | Select-Object -First 1
  if(-not $exe){throw 'Packaging returned success but no expected executable was found.'}
  [ordered]@{scope='Windows compilation/cook/package only; gameplay and visual acceptance not run';transport_sha256=$actual;exe=$exe.FullName;exe_sha256=(Get-FileHash $exe.FullName -Algorithm SHA256).Hash;walkthrough_verified=$false}|ConvertTo-Json|Set-Content (Join-Path $output 'package-receipt.json')
}
