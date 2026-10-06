$ErrorActionPreference = 'Stop'
$testPython = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
$testRepo = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$env:PYTHONPATH = (Join-Path $testRepo 'tmp/bot-qa-deps') + ';' + $PSScriptRoot
& $testPython -X utf8 (Join-Path $PSScriptRoot 'scripts/local_test.py') stop
