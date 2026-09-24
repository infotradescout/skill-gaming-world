# Parser and synthetic helper tests. No UE, compiler or Windows process is mocked
# into a success claim; fixture executables are never executed.
param([string]$Root = (Split-Path $PSScriptRoot -Parent))
$ErrorActionPreference = 'Stop'
$checks = New-Object 'System.Collections.Generic.List[string]'
function Check([bool]$Passed,[string]$Label) { if (-not $Passed) { throw "TEST FAILED: $Label" }; $checks.Add($Label) }
foreach ($name in @('BuildSupport.ps1','Build-Windows.ps1','Start-Wildlife.ps1.in')) {
    $text = Get-Content -Raw -LiteralPath (Join-Path $Root $name)
    $text = $text.Replace('@@KIT_URL@@','https://example.invalid/fixture.zip').Replace('@@KIT_SHA@@',('a'*64)).Replace('@@KIT_BYTES@@','200')
    $tokens=$null;$errors=$null
    $parsed=[System.Management.Automation.Language.Parser]::ParseInput($text,[ref]$tokens,[ref]$errors)
    Check ($errors.Count -eq 0) "PowerShell syntax: $name"
    if ($name -eq 'Start-Wildlife.ps1.in') {
        $f=$parsed.Find({param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Expand-WildlifeZip'},$true)
        . ([scriptblock]::Create($f.Extent.Text))
    }
}
. (Join-Path $Root 'BuildSupport.ps1')
$r=[pscustomobject]@{run_id='current';transport_sha256='manifest';importer_sha256='importer';import_revision='native-import-02';import_completed=$true;unreal_executed=$true;map_reopened_verified=$true}
Check (Test-WildlifeImportReceipt $r 'current' 'manifest' 'importer') 'matching typed receipt'
Check (-not (Test-WildlifeImportReceipt $r 'older' 'manifest' 'importer')) 'old invocation rejected'
Check (-not (Test-WildlifeImportReceipt $r 'current' 'manifest' 'changed')) 'different importer rejected'
$r.import_completed='true';Check (-not (Test-WildlifeImportReceipt $r 'current' 'manifest' 'importer')) 'string true rejected'
Check (-not (Test-WildlifeImportReceipt $null 'r' 'm' 'i')) 'null receipt rejected'
Check (-not (Test-WildlifeImportReceipt ([pscustomobject]@{}) 'r' 'm' 'i')) 'missing fields rejected'
$temp=Join-Path ([IO.Path]::GetTempPath()) ('wildlife-tests-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($temp)|Out-Null
try {
    $engine=Join-Path $temp 'UE 5.7 fixture'
    foreach($tool in @('Engine/Build/BatchFiles/Build.bat','Engine/Build/BatchFiles/RunUAT.bat','Engine/Binaries/Win64/UnrealEditor-Cmd.exe')) {
        $p=Join-Path $engine $tool;[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($p))|Out-Null
        [IO.File]::WriteAllText($p,'fixture only - not executable')
    }
    $version=Join-Path $engine 'Engine/Build/Build.version'
    [IO.File]::WriteAllText($version,'{"MajorVersion":5,"MinorVersion":7}')
    Check ((Get-WildlifeEngineRoot -Preferred $engine) -eq (Resolve-Path $engine).Path) 'space-containing engine path'
    [IO.File]::WriteAllText($version,'{"MajorVersion":5,"MinorVersion":6}')
    $refused=$false;try{Get-WildlifeEngineRoot -Preferred $engine|Out-Null}catch{$refused=$true}
    Check $refused 'wrong engine version rejected'
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip=Join-Path $temp 'safe.zip';$z=[IO.Compression.ZipFile]::Open($zip,'Create')
    $e=$z.CreateEntry('Tools/check.txt');$writer=New-Object IO.StreamWriter($e.Open());$writer.Write('fixture');$writer.Dispose();$z.Dispose()
    $dest=Join-Path $temp 'safe';Expand-WildlifeZip $zip $dest
    Check ((Get-Content -Raw (Join-Path $dest 'Tools/check.txt')) -eq 'fixture') 'safe extraction'
    $refused=$false;try{Expand-WildlifeZip $zip $dest}catch{$refused=$true};Check $refused 'existing attempt preserved'
    foreach($name in @('../outside.txt','Tools/../../outside.txt','Tools\..\..\outside.txt','C:/outside.txt')){
        $bad=Join-Path $temp ([Guid]::NewGuid().ToString('N')+'.zip');$z=[IO.Compression.ZipFile]::Open($bad,'Create');$z.CreateEntry($name)|Out-Null;$z.Dispose()
        $refused=$false;try{Expand-WildlifeZip $bad (Join-Path $temp ([Guid]::NewGuid().ToString('N')))}catch{$refused=$true};Check $refused "unsafe archive rejected: $name"
    }
} finally { Remove-Item -LiteralPath $temp -Recurse -Force }
[ordered]@{scope='PowerShell parser and synthetic helper tests on disposable Linux runner';passed=$true;checks=$checks;unreal_compiled=$false;windows_build_run=$false}|ConvertTo-Json -Depth 5
