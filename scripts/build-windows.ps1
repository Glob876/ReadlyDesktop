$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding

try {
    foreach ($argument in $args) {
        if ($argument -notin @('--pack-only', '--no-legacy', '--help', '-h')) {
            throw 'Использование: build.cmd [--pack-only] [--no-legacy]. Флаг --windows нужен только в Linux.'
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
    if ($args -notcontains '--no-legacy') {
        $pythonReady = $false
        if (Get-Command python.exe -ErrorAction SilentlyContinue) {
            & python.exe -c 'import sys, tkinter; sys.exit(0 if sys.version_info >= (3, 12) else 1)'
            $pythonReady = $LASTEXITCODE -eq 0
        }
        if (-not $pythonReady) {
            if (-not (Get-Command winget.exe -ErrorAction SilentlyContinue)) {
                throw 'Для Legacy нужен Python 3.12 с Tkinter. Установите Python или используйте --no-legacy.'
            }
            & winget.exe install --exact --id Python.Python.3.12 --source winget --scope user --accept-source-agreements --accept-package-agreements --disable-interactivity --silent
            if ($LASTEXITCODE -ne 0) { throw "Не удалось установить Python для Legacy (код $LASTEXITCODE)." }
            Update-BuildPath
            & python.exe -c 'import tkinter'
            if ($LASTEXITCODE -ne 0) { throw 'Python с Tkinter пока недоступен. Перезапустите терминал или используйте --no-legacy.' }
        }
    }
    & node.exe (Join-Path $PSScriptRoot 'build-local.mjs') @args
    exit $LASTEXITCODE
} catch {
    Write-Host "Readly: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
