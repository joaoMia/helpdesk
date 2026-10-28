param([string]$TestDirectory, [Parameter(Mandatory = $true)][string]$RepositoryRoot)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Set-StrictMode -Version Latest
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$stream = $null
$created = $false
$ready = $false
$bytes = $null
$payload = $null
$text = $null
$file = $null

function Assert-PrivateAcl($acl, $sid) {
    if (-not $acl.AreAccessRulesProtected -or $acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -ne $sid.Value) {
        throw 'ACL owner or inheritance mismatch.'
    }
    $rules = @($acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]))
    if ($rules.Count -ne 1 -or $rules[0].IdentityReference.Value -ne $sid.Value -or
        $rules[0].AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow -or
        $rules[0].FileSystemRights -ne [System.Security.AccessControl.FileSystemRights]::FullControl -or
        $rules[0].IsInherited) { throw 'ACL permissions mismatch.' }
}

function Assert-NoReparse([string]$path) {
    $cursor = $path
    while ($cursor) {
        if (Test-Path -LiteralPath $cursor) {
            if (([System.IO.File]::GetAttributes($cursor) -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw 'Reparse point refused.'
            }
        }
        $parent = [System.IO.Path]::GetDirectoryName($cursor)
        if ($parent -eq $cursor) { break }
        $cursor = $parent
    }
}

try {
    $sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    $root = [System.IO.Path]::GetFullPath($RepositoryRoot)
    if ($TestDirectory) {
        $directory = [System.IO.Path]::GetFullPath($TestDirectory)
        $parent = [System.IO.Path]::GetDirectoryName($directory)
        if ($env:NODE_ENV -ne 'test' -or $parent -ne (Join-Path $root '.local') -or
            [System.IO.Path]::GetFileName($directory) -notmatch '^dev0051-acl-[a-f0-9]{32}$') {
            throw 'Test path refused.'
        }
    } else {
        $local = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
        if (-not $local -or $local.StartsWith('\\')) { throw 'Local profile required.' }
        if ([System.IO.Path]::GetFullPath($env:LOCALAPPDATA) -ne [System.IO.Path]::GetFullPath($local)) { throw 'Executor profile path mismatch.' }
        $directory = [System.IO.Path]::GetFullPath((Join-Path $local 'HelpDesk'))
    }
    Assert-NoReparse $directory
    if ($directory.StartsWith($root + '\', [StringComparison]::OrdinalIgnoreCase) -and -not $TestDirectory) {
        throw 'Credentials cannot be inside repository.'
    }
    $file = Join-Path $directory 'credenciais-iniciais-dev.txt'
    if (Test-Path -LiteralPath $file) { throw 'Existing file refused.' }

    $directoryAcl = New-Object System.Security.AccessControl.DirectorySecurity
    $directoryAcl.SetOwner($sid)
    $directoryAcl.SetAccessRuleProtection($true, $false)
    $directoryRule = New-Object System.Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'ContainerInherit, ObjectInherit', 'None', 'Allow')
    $directoryAcl.AddAccessRule($directoryRule)
    if (-not (Test-Path -LiteralPath $directory)) {
        # ACL is supplied at creation, never applied after writing secrets.
        [void][System.IO.Directory]::CreateDirectory($directory, $directoryAcl)
    }
    Assert-PrivateAcl ([System.IO.Directory]::GetAccessControl($directory)) $sid

    $fileAcl = New-Object System.Security.AccessControl.FileSecurity
    $fileAcl.SetOwner($sid)
    $fileAcl.SetAccessRuleProtection($true, $false)
    $fileAcl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'Allow')))
    $stream = New-Object System.IO.FileStream($file, [System.IO.FileMode]::CreateNew,
        [System.Security.AccessControl.FileSystemRights]::FullControl, [System.IO.FileShare]::None,
        4096, [System.IO.FileOptions]::WriteThrough, $fileAcl)
    $created = $true
    Assert-PrivateAcl ($stream.GetAccessControl()) $sid

    # Only anonymous stdin carries the payload. No credentials in process args,
    # stdout, stderr, command history, temporary project files or environment.
    $line = [Console]::ReadLine()
    if (-not $line -or $line.Length -gt 16384) { throw 'Invalid payload.' }
    $payload = ConvertFrom-Json -InputObject $line
    $line = $null
    if (@($payload.accounts).Count -ne 4) { throw 'Invalid account count.' }
    $text = "HelpDesk - credenciais PROVISORIAS exclusivamente de desenvolvimento`r`nTroque cada senha no primeiro acesso e apague este arquivo depois.`r`n`r`n"
    foreach ($account in $payload.accounts) {
        if ($account.password -notmatch '^[A-Za-z0-9_-]{32}$' -or
            $account.email -notmatch '^[a-z0-9.]+@helpdesk\.test$' -or
            $account.role -notin @('ADMIN', 'TECHNICIAN')) { throw 'Invalid account.' }
        $text += "$($account.name) | $($account.role)`r`nE-mail: $($account.email)`r`nSenha provisoria: $($account.password)`r`n`r`n"
    }
    $encoding = New-Object System.Text.UTF8Encoding($true)
    $bytes = $encoding.GetBytes($text)
    $preamble = $encoding.GetPreamble()
    $stream.Write($preamble, 0, $preamble.Length)
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Flush($true)
    Assert-PrivateAcl ($stream.GetAccessControl()) $sid
    $ready = $true
    [Console]::WriteLine((@{ ready = $true; path = $file } | ConvertTo-Json -Compress))
    # Keep the exclusive handle until PostgreSQL reports the transaction result.
    $outcome = [Console]::ReadLine()
    $stream.Dispose()
    $stream = $null
    if ($outcome -eq 'abort') {
        # Only the exact file created by this invocation; never preexisting data.
        Assert-NoReparse $directory
        [System.IO.File]::Delete($file)
    } elseif ($outcome -ne 'commit') {
        # EOF/crash is ambiguous: retain restricted credentials for reconciliation.
        throw 'Unconfirmed transaction; protected file retained.'
    }
    if ($outcome -eq 'commit') {
        Assert-PrivateAcl ([System.IO.File]::GetAccessControl($file)) $sid
        $probe = [System.IO.File]::Open($file, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
        $probe.Dispose()
    }
    [Console]::WriteLine('{"done":true}')
} catch {
    $failureLine = $_.InvocationInfo.ScriptLineNumber
    if ($stream) { $stream.Dispose(); $stream = $null }
    if ($created -and -not $ready) {
        try { Assert-NoReparse $directory; [System.IO.File]::Delete($file) } catch {}
    }
    [Console]::Error.WriteLine("Protected credential delivery failed at helper line $failureLine. Existing files and accounts must be reviewed locally; sensitive details omitted.")
    exit 1
} finally {
    if ($stream) { $stream.Dispose() }
    if ($bytes) { [Array]::Clear($bytes, 0, $bytes.Length) }
    $payload = $null
    $text = $null
}
