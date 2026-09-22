[CmdletBinding()]
param([string]$Source = 'kezd088/100x-mcp', [switch]$Connect)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)

function Invoke-CodexJson {
    param([string[]]$Arguments)
    $result = & codex @Arguments
    if ($LASTEXITCODE -ne 0) { throw 'Codex 插件命令失败，未宣称安装成功。请查看上方错误。' }
    return ($result -join "`n" | ConvertFrom-Json)
}

foreach ($name in @('node','git','codex')) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) { throw "未找到 $name。请先安装所需工具，再重新运行；100x 不会自动改动全局软件。" }
}
$nodeVersion = & node --version
if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v(\d+)\.' -or [int]$Matches[1] -lt 22) { throw '100x 需要 Node.js 22 或更新版本。' }
& codex plugin add --help | Out-Null
if ($LASTEXITCODE -ne 0) { throw '请升级至支持 plugin 命令的 Codex CLI，然后重试。' }
$codexVersion = & codex --version
if ($LASTEXITCODE -ne 0 -or $codexVersion -notmatch '(\d+\.\d+\.\d+)' -or [version]$Matches[1] -lt [version]'0.155.1') {
    throw '100x 桌面端插件需要 Codex CLI 0.155.1 或更新版本。'
}

Write-Host '正在为 Codex 桌面端安装 100x MCP / SKILL…'
$marketplace = Invoke-CodexJson -Arguments @('plugin','marketplace','add',$Source,'--json')
if ($marketplace.marketplaceName -ne '100x') { throw '来源不是 100x 插件目录，停止安装。' }
$installed = Invoke-CodexJson -Arguments @('plugin','add','100x@100x','--json')
if ($installed.pluginId -ne '100x@100x' -or -not $installed.installedPath) { throw '未收到有效的 100x 安装回执。' }
$pluginPath = $installed.installedPath
foreach ($file in @('plugin.json','mcp.json','.codex-plugin/plugin.json','scripts/bridge.mjs','skills/100x-creative/SKILL.md')) {
    if (-not (Test-Path -LiteralPath (Join-Path $pluginPath $file) -PathType Leaf)) { throw "插件文件缺失：$file" }
}
$list = Invoke-CodexJson -Arguments @('plugin','list','--marketplace','100x','--json')
$active = @($list.installed | Where-Object { $_.pluginId -eq '100x@100x' -and $_.enabled })
if ($active.Count -ne 1) { throw '100x 尚未启用，请在 Codex 插件页核对。' }
Write-Host ('100x ' + $installed.version + ' 已安装并启用。')
if ($Connect) {
    if ($env:OS -ne 'Windows_NT') { throw '-Connect 向导目前支持 Windows；其他平台接入方式见文档。' }
    & node (Join-Path $pluginPath 'scripts/connect.mjs')
    if ($LASTEXITCODE -ne 0) { throw '插件已安装，100x 连接配置未完成。' }
} else {
    Write-Host '在 Codex 中发送「连接 100x」，打开授权页确认即可。也可在安装命令加 -Connect。'
}
Write-Host '回到 Codex 桌面端，新建任务后使用 $100x:100x-creative。安装器不会启动 CLI 聊天。'
Write-Host '使用自己的 100x 账户授权，生成消耗该账户积分。'
