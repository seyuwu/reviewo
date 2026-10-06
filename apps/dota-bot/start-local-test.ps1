param([switch]$Prepare)
$ErrorActionPreference = 'Stop'
$testRepo = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$testPython = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
$testNode = (Get-Command node -ErrorAction Stop).Source
$testScript = Join-Path $PSScriptRoot 'scripts/local_test.py'
$testState = Join-Path $PSScriptRoot '.local-test'
$env:PYTHONPATH = (Join-Path $testRepo 'tmp/bot-qa-deps') + ';' + $PSScriptRoot
& $testPython -X utf8 $testScript init
if ($LASTEXITCODE -ne 0) { throw 'Could not initialize the local test configuration.' }
if ($Prepare) {
    & $testPython -X utf8 $testScript prepare --node $testNode
    if ($LASTEXITCODE -ne 0) { throw 'Could not prepare the local test environment.' }
}
$testArgs = @('-X', 'utf8', ('"' + $testScript + '"'), 'run', '--node', ('"' + $testNode + '"'))
$testProcess = Start-Process -FilePath $testPython -ArgumentList $testArgs -WindowStyle Hidden -PassThru -WorkingDirectory $testRepo -RedirectStandardOutput (Join-Path $testState 'supervisor.log') -RedirectStandardError (Join-Path $testState 'supervisor-error.log')
Write-Output ('Local test supervisor PID: ' + $testProcess.Id)
Write-Output ('Token file: ' + (Join-Path $PSScriptRoot '.env.local-test'))
