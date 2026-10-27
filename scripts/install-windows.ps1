$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# This script is also shipped beside Readly.exe; Node.js is not needed to install it.
$source = $PSScriptRoot
$target = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Programs\Readly'
$marker = Join-Path $target '.readly-install.json'
$staged = "$target-stage-$([Guid]::NewGuid().ToString('N'))"
$backup = "$target-backup-$([Guid]::NewGuid().ToString('N'))"
try {
    if (-not (Test-Path -LiteralPath (Join-Path $source 'Readly.exe')) -or
        -not (Test-Path -LiteralPath (Join-Path $source 'resources\readly-core.exe'))) {
        throw 'Readly.exe or resources\readly-core.exe is missing. Keep the entire release folder together.'
    }
    if ([IO.Path]::GetFullPath($source) -ne [IO.Path]::GetFullPath($target)) {
        if (Test-Path -LiteralPath $target) {
            if (((Get-Item -LiteralPath $target).Attributes -band [IO.FileAttributes]::ReparsePoint) -or
                -not (Test-Path -LiteralPath $marker) -or
                (Get-Content -LiteralPath $marker -Raw | ConvertFrom-Json).name -ne 'readly-desktop') {
                throw "Refusing to overwrite an unrelated directory: $target"
            }
        }
        New-Item -ItemType Directory -Path $staged -Force | Out-Null
        Get-ChildItem -LiteralPath $source -Force | ForEach-Object {
            Copy-Item -LiteralPath $_.FullName -Destination $staged -Recurse -Force
        }
        '{"name":"readly-desktop"}' | Set-Content -LiteralPath (Join-Path $staged '.readly-install.json') -Encoding UTF8
        $updating = Test-Path -LiteralPath $target
        if ($updating) { Move-Item -LiteralPath $target -Destination $backup }
        try { Move-Item -LiteralPath $staged -Destination $target }
        catch {
            if ($updating) { Move-Item -LiteralPath $backup -Destination $target }
            throw
        }
    }
    $executable = Join-Path $target 'Readly.exe'
    $programs = [Environment]::GetFolderPath('Programs')
    New-Item -ItemType Directory -Path $programs -Force | Out-Null
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut((Join-Path $programs 'Readly.lnk'))
    $shortcut.TargetPath = $executable
    $shortcut.WorkingDirectory = $target
    $shortcut.IconLocation = $executable
    $shortcut.Save()

    $legacyExecutable = Join-Path $target 'resources\legacy\ReadlyLegacy.exe'
    $legacyShortcut = Join-Path $programs 'Readly Legacy.lnk'
    if (Test-Path -LiteralPath $legacyExecutable) {
        $shortcut = $shell.CreateShortcut($legacyShortcut)
        $shortcut.TargetPath = $legacyExecutable
        $shortcut.WorkingDirectory = $target
        $shortcut.IconLocation = $executable
        $shortcut.Save()
    } elseif (Test-Path -LiteralPath $legacyShortcut) {
        $existing = $shell.CreateShortcut($legacyShortcut)
        if ($existing.TargetPath -eq $legacyExecutable) { Remove-Item -LiteralPath $legacyShortcut }
    }

    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $entries = @($userPath -split ';' | Where-Object { $_ })
    if (-not ($entries | Where-Object { $_.TrimEnd('\') -ieq $target.TrimEnd('\') })) {
        [Environment]::SetEnvironmentVariable('Path', (($entries + $target) -join ';'), 'User')
    }
    # Notify Explorer and newly launched terminals about the updated user environment.
    Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class ReadlyEnvironment {
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern IntPtr SendMessageTimeout(IntPtr window, uint message,
        UIntPtr wParam, string lParam, uint flags, uint timeout, out UIntPtr result);
}
'@
    $result = [UIntPtr]::Zero
    [ReadlyEnvironment]::SendMessageTimeout([IntPtr]0xffff, 0x1a, [UIntPtr]::Zero,
        'Environment', 2, 2000, [ref]$result) | Out-Null
    if (Test-Path -LiteralPath $backup) { Remove-Item -LiteralPath $backup -Recurse -Force }
    Write-Host "Installed: $executable"
    Write-Host 'Launch Readly from the Start menu or run readly in a new terminal.'
} catch {
    Write-Error "Readly installation failed. Close Readly before updating. $($_.Exception.Message)"
    exit 1
} finally {
    if (Test-Path -LiteralPath $staged) { Remove-Item -LiteralPath $staged -Recurse -Force }
}
