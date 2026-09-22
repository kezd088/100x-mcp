[CmdletBinding()]
param([string]$Endpoint, [switch]$FromStdin)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)

try {
    if ($env:OS -ne 'Windows_NT') { throw '此连接向导仅支持 Windows。' }
    Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1') -ErrorAction Stop
    if ($FromStdin) {
        $record = [Console]::In.ReadToEnd() | ConvertFrom-Json
        $Endpoint = $record.url
        $secureToken = ConvertTo-SecureString $record.token -AsPlainText -Force
        $record = $null
    } else {
        Write-Host '100x 连接 / 仅填写管理员提供的 100x 地址与令牌。不要填写模型厂商密钥。'
        if (-not $Endpoint) { $Endpoint = Read-Host '100x MCP 地址（包含 /mcp）' }
        $secureToken = Read-Host '100x 访问令牌（隐藏输入）' -AsSecureString
    }
    $uri = [Uri]$Endpoint
    $isLocal = $uri.Host -in @('localhost', '127.0.0.1', '[::1]', '::1')
    $is100x = $uri.Host -eq '100xspeed.app' -or $uri.Host.EndsWith('.100xspeed.app')
    if (-not $uri.IsAbsoluteUri -or $uri.AbsolutePath -cne '/mcp' -or $uri.UserInfo -or $uri.Query -or $uri.Fragment -or
        -not (($isLocal -and $uri.Scheme -in @('http','https')) -or ($is100x -and $uri.Scheme -eq 'https'))) {
        throw '地址必须是 100x 的 HTTPS /mcp 入口；本机测试可使用 localhost。'
    }
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
    try {
        $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
        if ($plain.Length -lt 8 -or $plain.Length -gt 8192 -or $plain -match '\s') { throw '令牌格式无效。' }
        $plain = $null
    } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
    $path = if ($env:HUNDREDX_CONFIG_PATH) { $env:HUNDREDX_CONFIG_PATH } else { Join-Path $env:LOCALAPPDATA '100x/connection.json' }
    $folder = [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($path))
    [IO.Directory]::CreateDirectory($folder) | Out-Null
    $json = @{version=1;url=$uri.AbsoluteUri;protection='windows-dpapi';token=($secureToken | ConvertFrom-SecureString)} | ConvertTo-Json
    if (Test-Path -LiteralPath $path) { Copy-Item -LiteralPath $path -Destination ($path + '.bak-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfff')) }
    [IO.File]::WriteAllText($path, $json, [Text.UTF8Encoding]::new($false))
    $acl = Get-Acl -LiteralPath $path
    $acl.SetAccessRuleProtection($true, $false)
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl.SetAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', 'Allow'))
    $acl.SetAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-5-18'), 'FullControl', 'Allow'))
    $accessOnly = [Security.AccessControl.FileSecurity]::new()
    $accessOnly.SetSecurityDescriptorSddlForm($acl.GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::Access), [Security.AccessControl.AccessControlSections]::Access)
    if ($PSVersionTable.PSVersion.Major -ge 6) {
        [IO.FileSystemAclExtensions]::SetAccessControl([IO.FileInfo]::new($path), $accessOnly)
    } else {
        [IO.File]::SetAccessControl($path, $accessOnly)
    }
    Write-Host '100x 凭据已加密保存。回到 Codex 桌面端，在新任务中检查 100x 连接。'
} catch {
    # Do not include exception text: request or parser errors may contain credentials.
    Write-Error '100x 连接未保存。请检查 Windows 用户、100x MCP 地址及访问令牌。'
    exit 1
}
