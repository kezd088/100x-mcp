# 100x for Codex Desktop · 接入与使用指南

本文档为 Windows 与 macOS 上的 Codex Desktop 用户提供安装、凭据管理、日常使用、版本更新与故障排错说明。

---

## 1. 运行环境前提

在安装 100x 插件前，请确保系统已具备以下基础环境：

- **操作系统**：Windows 10 / 11（x64），或 macOS 13 及以上（Apple Silicon / Intel）
- **Node.js**：`v22.0.0` 或更高版本
- **Git**：已加入系统 PATH
- **Codex CLI**：0.155.1 或更新版本（支持插件）
- **100x 账户**：登录后授权当前设备；v0.3.0 起默认使用 100x 官方授权服务。

> 注：实测说明：v0.2.0 已在 Windows Codex Desktop 0.155.1 验证 8 个工具和 SKILL。v0.3.0 新增网页授权工具，已在 Windows 验证完整网页授权、加密保存与撤销。v0.3.1 补齐 macOS：钥匙串加密保存、`install.sh` 安装器与手动连接入口，客户端测试用替身钥匙串在 Windows 上全绿，**但尚未在真实 macOS 机器上跑过一次完整安装与授权**，属于待验收状态。Linux 只能安装插件，凭据保存会明确报错，不退回明文。

---

## 2. 安装方式

### 方式 A：在 Codex 桌面端直接对话安装（推荐首选）

在 Codex Desktop 中打开任意任务对话框，复制并发送以下自然语言指令：

```text
请阅读 https://github.com/kezd088/100x-mcp/blob/main/INSTALL.md，按说明安装 100x MCP + SKILL 到本机 Codex，检查安装结果。不要在对话里索取或显示访问令牌。
```

Codex 会自动读取安装规范并在后台完成初始化配置。

### 方式 B：一键脚本安装

Windows PowerShell，运行以下单行命令：

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/kezd088/100x-mcp/main/install.ps1))) -Connect
```

macOS 终端，运行以下单行命令：

```bash
curl -fsSL https://raw.githubusercontent.com/kezd088/100x-mcp/main/install.sh | bash -s -- --connect
```

- **`-Connect` / `--connect` 选项**：打开 100x 授权页面，核对连接码并允许后自动加密保存——Windows 走 **DPAPI** 存到 `%LOCALAPPDATA%/100x/connection.json`，macOS 走 **钥匙串**（服务名 `100x-codex`）、配置文件 `~/Library/Application Support/100x/connection.json` 里只留条目引用。凭据不会出现在终端或对话中。
- **本地开发测试**：若进行插件本地开发，可指定本地源目录：
  ```powershell
  powershell -ExecutionPolicy Bypass -File .\install.ps1 -Source "C:\your-folder\100x-mcp" -Connect
  ```
  ```bash
  ./install.sh --source "/your-folder/100x-mcp" --connect
  ```

### 方式 C：Codex 原生插件命令安装

```powershell
# 1. 注册 100x 市场源
codex plugin marketplace add kezd088/100x-mcp --json

# 2. 安装 100x 插件包（含 MCP 与 SKILL）
codex plugin add 100x@100x --json
```

> **注意**：命令关键字为 `plugin add`，而非 `plugin install`。安装完成后不会自动开启聊天对话，请打开 Codex 桌面端新建任务开始使用。

---

## 3. 账户授权与设备管理

Codex 中发送「连接 100x」即可打开授权流程。允许后先显示「正在连接」，插件完成本机保存并确认后才显示「已连接」。连接码 10 分钟有效，设备授权 90 天有效。网络异常时查询原连接状态；过期后重新连接。

在 100xspeed 侧栏「充值中心」下方点击 **MCP / SKILL** 查看设备。绿点代表授权有效，不代表设备在线。撤销后后续调用立即失效，已提交的生成任务继续处理。

凭据保存：

1. **操作系统级密文存储**：
   - **Windows**：令牌通过 DPAPI 加密后保存在 `%LOCALAPPDATA%/100x/connection.json`，文件权限收紧为仅当前用户与系统。
   - **macOS**：令牌存入当前登录用户的钥匙串（服务名 `100x-codex`），写入时只通过标准输入传递、不进入进程参数表；`~/Library/Application Support/100x/connection.json` 只保存 `keychain:1:<条目名>` 这样的引用，目录与文件权限为 `700 / 600`。
   - 两边都绑定当前系统账户：配置文件复制到另一台机器或另一个用户下同样解不开，会报 `100X_CREDENTIAL_UNREADABLE`。
2. **禁止对话暴露**：不要在 Codex 聊天窗口内索取、粘贴或输出完整 Token。
3. **无需手动修改配置**：安装器会自动配置 MCP 入口，无需手动编辑 `config.toml`。
4. **网页授权不可用时**：可运行 `node <插件目录>/scripts/connect-manual.mjs`（macOS / Linux）或 `scripts/connect.ps1`（Windows）手动录入地址与令牌，输入过程隐藏、不回显。

---

## 4. 日常使用与 SKILL 调度

由于 Codex 桌面端在会话初始化时加载 SKILL，**新安装或更新后的插件在「新建任务」后生效**。

### 触发创作 SKILL

在 Codex 桌面端新建任务，输入 `$100x:100x-creative` 或直接使用自然语言：

```text
$100x:100x-creative 先列出当前可用的图片型号。我想生成一张 1K 分辨率的极简科技品牌海报，预算不超过 2 积分，请先告诉我具体报价，确认后再生成。
```

也可以直接说：
`使用 100x 生成一张 1K 科技品牌海报，预算不超过 2 积分，先报价。`

### 连接检查（不扣积分）

```text
$100x:100x-creative 检查 100x 连接，列出可用型号和余额，不生成。
```

### 预算与确认机制

- **事前报价**：若提示词中未给出明确预算上限或确认意图，会在报价步骤停下，汇报本次预计消耗积分。
- **报价有效期**：报价单有效期为 15 分钟。若此期间服务价格发生变动，会按新价格提示重新确认。
- **超支拦截**：若实际报价高于设定的 `max_credits`，自动返回 `100X_BUDGET_EXCEEDED` 并在对话中说明，不执行扣费。
- **重试防重复**：重试同一意图时复用原报价编号与请求单号，避免重复计费。

### 本地素材引用与交付

- **参考素材**：支持以本地文件绝对路径（如 `D:/project/sketch.png`）作为参考图或首尾帧。
- **交付落地**：生成完毕后，产物自动下载至当前工作空间绝对路径。下载预览受 Codex 宿主媒体权限约束，不保证所有宿主无条件自动预览。

---

## 5. 版本更新与卸载

### 检查更新

```powershell
codex plugin list --marketplace 100x --json
```

### 更新插件

```powershell
codex plugin marketplace upgrade 100x
```

### 卸载插件

```powershell
# 1. 移除插件实例
codex plugin remove 100x@100x

# 2. 移除市场源
codex plugin marketplace remove 100x
```

> 注：卸载插件不会自动删除加密凭据。如需彻底清除：Windows 删除 `%LOCALAPPDATA%/100x/connection.json` 及其 `.bak-*` 备份；macOS 删除 `~/Library/Application Support/100x/connection.json`，再到「钥匙串访问」搜索 `100x-codex` 删除对应条目（或执行 `security delete-generic-password -s 100x-codex`）。

---

## 6. 常见问题排错 (Troubleshooting)

### Q1: 对话提示「未找到 100x 工具或 SKILL」
- **解决**：Codex 桌面端配置变更需要创建**新任务**（New Task）生效。请在新建任务的对话输入框中尝试 `$100x:100x-creative`。

### Q2: 报错 `100X_BUDGET_EXCEEDED`
- **原因**：所选模型、分辨率或时长所需积分超过设定的预算上限。
- **解决**：在对话中适当提高预算，或调低生成规格（如调整分辨率或视频时长）。

### Q3: 报错连接失败或 127.0.0.1 拒绝连接
- **原因**：误设为本地回环地址，但本机并未运行私有 100x 服务。
- **解决**：客户端本身不包含远程公共算力。请联系 100x 内测管理员获取正确的远程 MCP 服务地址，并重新运行带有 `-Connect` 的命令配置连接。

### Q4: macOS 安装成功，但新任务里没有 100x 工具
- **原因**：Codex 桌面端从 Dock / Launchpad 启动时不继承终端的 PATH。若 Node 装在 Homebrew 目录（`/opt/homebrew/bin/node` 或 `/usr/local/Cellar/...`），插件配置里的 `node` 命令可能找不到。安装器检测到这种情况会在末尾提示。
- **解决**：把 node 暴露到 GUI 可见的位置，例如 `sudo ln -s "$(command -v node)" /usr/local/bin/node`；或从终端执行 `open -a Codex` 启动桌面端（这样会继承当前 shell 的 PATH）。改完新建任务再试。

### Q5: macOS 报 `100X_CREDENTIAL_UNREADABLE`
- **原因**：钥匙串条目不在当前登录用户下，或配置文件是从另一台机器 / 另一个账户复制过来的。
- **解决**：在本机当前用户下重新发送「连接 100x」走一遍网页授权。若系统弹出钥匙串访问确认框，选择「始终允许」；点「拒绝」会导致读取失败。

### Q6: macOS 提示 `100X_CONFIG_PLATFORM`
- **原因**：当前系统不是 Windows 或 macOS（例如 Linux）。100x 不会在没有操作系统级保护的平台上退回明文保存。
- **解决**：改用 `HUNDREDX_URL` 与 `HUNDREDX_TOKEN` 环境变量接入，并确认桌面端进程确实继承了这两个变量。
