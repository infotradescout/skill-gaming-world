# Uses an existing authorized UE5.7 installation. No installs or security changes.
param([string]$EngineRoot = $env:UE_ROOT, [switch]$Package, [switch]$Play)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
. (Join-Path $PSScriptRoot 'BuildSupport.ps1')
if ([Environment]::OSVersion.Platform -ne 'Win32NT') { throw 'The native Windows build must run on Windows.' }
$run = [Guid]::NewGuid().ToString('N')
$logs = Join-Path $PSScriptRoot ('BuildReports/' + $run)
New-Item -ItemType Directory -Force -Path $logs | Out-Null
$state = [ordered]@{ run_id=$run; engine_found=$false; compiled=$false; imported=$false; packaged=$false; process_started=$false; walkthrough_verified=$false; visual_quality_accepted=$false; error=$null }
$lock = $null
$oldRun = $env:WILDLIFE_BUILD_RUN_ID
try {
    $lock = [IO.File]::Open((Join-Path $PSScriptRoot '.build.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    $EngineRoot = Get-WildlifeEngineRoot -Preferred $EngineRoot
    $state.engine_found = $true
    Write-Host "Engine found: $EngineRoot"
    $project = Join-Path $PSScriptRoot 'WildlifeReserve/WildlifeReserve.uproject'
    $bundle = Join-Path $PSScriptRoot 'WildlifeReserve/InputBundle/district.json'
    $script = Join-Path $PSScriptRoot 'Tools/import_district.py'
    foreach ($file in @($project,$bundle,$script)) { if (-not (Test-Path -LiteralPath $file)) { throw "Required project file missing: $file" } }
    $manifestSha = (Get-FileHash -LiteralPath $bundle -Algorithm SHA256).Hash.ToLowerInvariant()
    $importerSha = (Get-FileHash -LiteralPath $script -Algorithm SHA256).Hash.ToLowerInvariant()
    $state['transport_sha256'] = $manifestSha
    $state['importer_sha256'] = $importerSha
    $env:WILDLIFE_BUILD_RUN_ID = $run
    $build = Join-Path $EngineRoot 'Engine/Build/BatchFiles/Build.bat'
    $editor = Join-Path $EngineRoot 'Engine/Binaries/Win64/UnrealEditor-Cmd.exe'
    $uat = Join-Path $EngineRoot 'Engine/Build/BatchFiles/RunUAT.bat'
    Invoke-WildlifeStage 'Compile Unreal project' $build @('WildlifeReserveEditor','Win64','Development',"-Project=$project",'-WaitMutex') (Join-Path $logs '01-compile.log')
    $state.compiled = $true
    Invoke-WildlifeStage 'Import the Blender district' $editor @($project,"-ExecutePythonScript=$script",'-unattended','-RenderOffscreen','-nosound','-nop4','-UTF8Output') (Join-Path $logs '02-import.log')
    $receiptPath = Join-Path $PSScriptRoot 'WildlifeReserve/Saved/UnrealDistrictImport.json'
    if (-not (Test-Path -LiteralPath $receiptPath)) { throw 'Unreal produced no import receipt.' }
    $r = Get-Content -Raw -LiteralPath $receiptPath | ConvertFrom-Json
    if (-not (Test-WildlifeImportReceipt $r $run $manifestSha $importerSha)) { throw 'Import was incomplete or its receipt belongs to a different build.' }
    $state.imported = $true
    Copy-Item -LiteralPath $receiptPath -Destination (Join-Path $logs 'import-receipt.json')
    if ($Package -or $Play) {
        # A unique archive prevents an old executable from satisfying this run.
        $output = Join-Path $PSScriptRoot ('Packaged/' + $run)
        Invoke-WildlifeStage 'Build the Windows game' $uat @('BuildCookRun',"-project=$project",'-noP4','-platform=Win64','-clientconfig=Development','-build','-cook','-stage','-pak','-archive',"-archivedirectory=$output",'-utf8output') (Join-Path $logs '03-package.log')
        $exes = @(Get-ChildItem -LiteralPath $output -Filter WildlifeReserve.exe -File -Recurse)
        $launchers = @($exes | Where-Object { $_.Directory.Name -ne 'Win64' })
        if ($launchers.Count -eq 1) { $exe = $launchers[0] }
        elseif ($exes.Count -eq 1) { $exe = $exes[0] }
        else { throw 'Package does not contain one unambiguous game launcher.' }
        $state.packaged = $true
        $state['executable_sha256'] = (Get-FileHash -LiteralPath $exe.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        $state['executable'] = $exe.FullName
        $shortcut = Join-Path $PSScriptRoot 'PLAY-WILDLIFE.cmd'
        # Keep paths out of batch expansion: resolve from a relative owned path.
        $relative = $exe.FullName.Substring($PSScriptRoot.Length).TrimStart([char[]]'/\')
        if ($relative -match '[%\r\n]') { throw 'Unsafe path for a Play shortcut.' }
        [IO.File]::WriteAllText($shortcut, "@echo off`r`nstart `"Wildlife Reserve`" /D `"%~dp0$($exe.Directory.FullName.Substring($PSScriptRoot.Length).TrimStart([char[]]'/\'))`" `"%~dp0$relative`"`r`n")
        Write-Host "`nWindows package created. Future launch: $shortcut" -ForegroundColor Green
        if ($Play) {
            $p = Start-Process -FilePath $exe.FullName -WorkingDirectory $exe.Directory.FullName -PassThru
            $state.process_started = $true
            $state['process_id'] = $p.Id
            Write-Host 'Game process started. Gameplay, materials and performance still require inspection.'
        }
    }
} catch {
    $state.error = $_.Exception.Message
    Write-Host "`nBUILD NOT COMPLETED: $($state.error)" -ForegroundColor Red
    Write-Host "Local diagnostics: $logs"
    throw
} finally {
    $env:WILDLIFE_BUILD_RUN_ID = $oldRun
    if ($lock) { $lock.Dispose() }
    $state | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $logs 'build-result.json') -Encoding UTF8
}
