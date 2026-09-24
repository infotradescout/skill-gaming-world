# Shared local build helpers. No remote-control agent, installs or account writes.
Set-StrictMode -Version 2.0

function Get-WildlifeEngineRoot {
    param([string]$Preferred, [string[]]$AdditionalRoots = @())
    $roots = New-Object 'System.Collections.Generic.List[string]'
    if ($Preferred) { $roots.Add($Preferred) }
    foreach ($p in $AdditionalRoots) { if ($p) { $roots.Add($p) } }
    if (-not $Preferred -and [Environment]::OSVersion.Platform -eq 'Win32NT') {
        $installed = Join-Path $env:ProgramData 'Epic\UnrealEngineLauncher\LauncherInstalled.dat'
        if (Test-Path -LiteralPath $installed) {
            try {
                $record = Get-Content -Raw -LiteralPath $installed | ConvertFrom-Json
                foreach ($app in $record.InstallationList) {
                    if ($app.AppName -eq 'UE_5.7') { $roots.Add($app.InstallLocation) }
                }
            } catch { Write-Warning 'Epic installation list could not be read.' }
        }
        foreach ($key in @('HKLM:\SOFTWARE\EpicGames\Unreal Engine\5.7', 'HKLM:\SOFTWARE\WOW6432Node\EpicGames\Unreal Engine\5.7')) {
            if (Test-Path $key) {
                $p = Get-ItemPropertyValue -Path $key -Name InstalledDirectory -ErrorAction SilentlyContinue
                if ($p) { $roots.Add($p) }
            }
        }
        if ($env:ProgramFiles) { $roots.Add((Join-Path $env:ProgramFiles 'Epic Games\UE_5.7')) }
    }
    foreach ($root in ($roots | Select-Object -Unique)) {
        try {
            $versionFile = Join-Path $root 'Engine/Build/Build.version'
            if (-not (Test-Path -LiteralPath $versionFile)) { continue }
            $v = Get-Content -Raw -LiteralPath $versionFile | ConvertFrom-Json
            if ($v.MajorVersion -ne 5 -or $v.MinorVersion -ne 7) { continue }
            $complete = $true
            foreach ($tool in @('Engine/Build/BatchFiles/Build.bat', 'Engine/Build/BatchFiles/RunUAT.bat', 'Engine/Binaries/Win64/UnrealEditor-Cmd.exe')) {
                if (-not (Test-Path -LiteralPath (Join-Path $root $tool))) { $complete = $false }
            }
            if ($complete) { return (Resolve-Path -LiteralPath $root).Path }
        } catch { Write-Warning 'An engine candidate was incomplete or unreadable.' }
    }
    throw 'Unreal Engine 5.7 with Win64 editor/build tools was not found. No engine or compiler has been installed by this launcher.'
}

function Test-WildlifeImportReceipt {
    param($Receipt, [string]$RunId, [string]$ManifestSha, [string]$ImporterSha)
    if ($null -eq $Receipt) { return $false }
    foreach ($name in @('run_id','transport_sha256','importer_sha256','import_completed','unreal_executed','map_reopened_verified','import_revision')) {
        if (-not $Receipt.PSObject.Properties[$name]) { return $false }
    }
    return ($Receipt.run_id -ceq $RunId -and $Receipt.transport_sha256 -ceq $ManifestSha -and
        $Receipt.importer_sha256 -ceq $ImporterSha -and $Receipt.import_revision -ceq 'native-import-02' -and
        $Receipt.import_completed -is [bool] -and $Receipt.import_completed -eq $true -and
        $Receipt.unreal_executed -is [bool] -and $Receipt.unreal_executed -eq $true -and
        $Receipt.map_reopened_verified -is [bool] -and $Receipt.map_reopened_verified -eq $true)
}

function Invoke-WildlifeStage {
    param([string]$Name, [string]$Executable, [string[]]$Arguments, [string]$LogPath)
    Write-Host "`n=== $Name ===" -ForegroundColor Cyan
    $old = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & $Executable @Arguments 2>&1 | Tee-Object -FilePath $LogPath | Out-Host
        $code = $LASTEXITCODE
    } finally { $ErrorActionPreference = $old }
    if ($code -ne 0) { throw "$Name failed (exit $code). Details: $LogPath" }
}
