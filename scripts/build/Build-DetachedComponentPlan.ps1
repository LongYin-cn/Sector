param([Parameter(Mandatory = $true)][string]$ZigPath)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$env:ZIG_GLOBAL_CACHE_DIR = Join-Path $projectRoot 'work/zig-cache'
$env:ZIG_LOCAL_CACHE_DIR = Join-Path $projectRoot 'work/zig-local-cache'
$output = Join-Path $projectRoot 'work/detached-component-fixture.exe'
& $ZigPath c++ -std=c++17 -O2 -Wall -Wextra -Werror -target x86_64-windows-gnu (Join-Path $projectRoot 'tests/native/detached_component_fixture.cpp') -o $output
if ($LASTEXITCODE -ne 0) { throw 'Detached component fixture build failed.' }
& $output
if ($LASTEXITCODE -ne 0) { throw 'Detached component fixture failed.' }
