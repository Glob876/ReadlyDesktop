$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding

try {
    foreach ($argument in $args) {
        if ($argument -notin @('--pack-only', '--help', '-h')) {
            throw 'Использование: build.cmd [--pack-only]. Флаг --windows нужен только в Linux.'
        }
    }
    if ($args -contains '--help' -or $args -contains '-h') {
        Write-Host 'build.cmd — сборка и установка Readly. build.cmd --pack-only — переносимая сборка.'
        exit 0
    }

    function Update-BuildPath {
        $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
        $user = [Environment]::GetEnvironmentVariable('Path', 'User')
        # New installations must be visible in this process, without restarting
        # Git Bash/Windows Terminal. Preserve other inherited development paths.
        $env:Path = "$machine;$user;$env:Path"
    }

    Write-Host 'Readly: проверяем инструменты сборки…'
    Update-BuildPath
    $nodeReady = $false
    if (Get-Command node.exe -ErrorAction SilentlyContinue) {
        & node.exe -e 'const [a,b]=process.versions.node.split(/[.]/).map(Number); process.exit(a>22 || (a===22 && b>=12) ? 0 : 1)'
        $nodeReady = $LASTEXITCODE -eq 0
    }
    if (-not $nodeReady) {
        if (-not (Get-Command winget.exe -ErrorAction SilentlyContinue)) {
            throw 'Не найден winget. Установите «Установщик приложений» от Microsoft из Microsoft Store и снова откройте build.cmd.'
        }
        Write-Host 'Устанавливаем Node.js LTS через winget. Подтвердите запрос Windows, если он появится…'
        & winget.exe install --exact --id OpenJS.NodeJS.LTS --source winget --accept-source-agreements --accept-package-agreements --disable-interactivity --silent
        if ($LASTEXITCODE -eq 3010) { throw 'Node.js установлен. Перезагрузите Windows и снова откройте build.cmd.' }
        if ($LASTEXITCODE -ne 0) { throw "Не удалось установить Node.js (код $LASTEXITCODE). Проверьте интернет и подтвердите запрос Windows. Затем снова откройте build.cmd." }
        Update-BuildPath
        & node.exe -e 'const [a,b]=process.versions.node.split(/[.]/).map(Number); process.exit(a>22 || (a===22 && b>=12) ? 0 : 1)'
        if ($LASTEXITCODE -ne 0) { throw 'Node.js 22.12+ пока недоступен. Перезагрузите Windows и снова откройте build.cmd.' }
    }
    & node.exe (Join-Path $PSScriptRoot 'build-local.mjs') @args
    exit $LASTEXITCODE
} catch {
    Write-Host "Readly: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
