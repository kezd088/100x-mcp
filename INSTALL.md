# 安装 100x 到 Codex 桌面端

本文用于用户将仓库交给 Codex 安装。只安装公开客户端插件和 Skill，不部署服务器。

## 按顺序执行

1. 检查本机 `node --version`（22+）、`git --version`、`codex plugin add --help`。缺少依赖时说明缺项，不自动全局安装或修改系统设置。
2. 从 `https://github.com/kezd088/100x-mcp` 下载或克隆到持久目录，先阅读 `install.ps1` 与 `plugins/100x/.mcp.json`。不要把临时目录当长期插件来源。
3. Windows 执行 `powershell -NoProfile -ExecutionPolicy Bypass -File ./install.ps1`。这里的 Bypass 只影响此进程，不修改系统执行策略。安装器使用 Codex 原生命令注册 GitHub 插件目录并安装 `100x@100x`；不启动 CLI 会话、不改其他插件或模型配置。
4. 检查 `codex plugin list --marketplace 100x --json`：`100x@100x` 必须已安装且 `enabled: true`。检查 `codex mcp list --json` 中出现 `100x`，并检查安装目录内 `skills/100x-creative/SKILL.md` 存在。仅文件存在不代表服务连接成功。
5. 如尚未连接，告诉用户在自己的 PowerShell 中运行同一安装脚本并添加 `-Connect`，安全输入管理员提供的 **100x MCP 地址和 100x 令牌**。**不要索取令牌到聊天，不把令牌写入命令行参数、Codex TOML、README 或日志。** Windows 向导使用当前用户的 DPAPI 加密保存凭据。
6. 提醒用户回到 Codex 桌面端新建任务，输入 `$100x:100x-creative 检查 100x 连接，列出可用型号和余额，不生成。` Skill 和 MCP 工具在新任务中加载。此命令不扣生成积分。
7. 首次生成先查型号、报价，并按用户已授权的预算提交；保存返回的 100x 产物，在对话中展示本地绝对路径的图片或视频。失败保留任务号，不能换新幂等编号自动重复付费。

## Windows 一条安装命令

在 PowerShell 中执行（可以先浏览本仓库的 `install.ps1`）：

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/kezd088/100x-mcp/main/install.ps1))) -Connect
```

如果交给 Codex 执行，省略 `-Connect`，让用户自行完成安全输入。之后的生成都在桌面端对话中进行。

## 手动安装 / 其他平台

```sh
codex plugin marketplace add kezd088/100x-mcp --json
codex plugin add 100x@100x --json
```

macOS / Linux 的加密凭据向导尚未提供和验收。开发者可通过 `HUNDREDX_URL`（完整 `/mcp` 地址）及 `HUNDREDX_TOKEN` 环境变量接入，但桌面端必须实际继承这些变量；终端临时赋值不等于 GUI 已配置。普通桌面用户当前以 Windows 安装向导为准。

## 状态与更新

这是公开客户端，当前服务接入仍需内测邀请，不提供开放的默认公共 MCP 地址或免费额度。生产模型、规格与费用以 100x 实时目录及报价为准。更新可运行 `codex plugin marketplace upgrade 100x` 后重新执行安装器。卸载执行 `codex plugin remove 100x@100x`；加密凭据不会随之删除，需要清除时由用户自行管理 `%LOCALAPPDATA%/100x/connection.json` 及其备份。

开发验证可使用 `./install.ps1 -Source <本地仓库绝对路径>`；这只应连接本机测试服务。不要把 localhost 地址作为其他用户的公网接入地址。
