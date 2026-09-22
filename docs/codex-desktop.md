# 100x for Codex Desktop · 接入与使用指南

本文档为 Windows 上的 Codex Desktop 用户提供安装、凭据管理、日常使用、版本更新与故障排错说明。

---

## 1. 运行环境前提

在安装 100x 插件前，请确保系统已具备以下基础环境：

- **操作系统**：Windows 10 / 11（x64）
- **Node.js**：`v22.0.0` 或更高版本
- **Git**：已加入系统 PATH
- **Codex CLI**：0.155.1 或更新版本（支持插件）
- **100x 接入凭据**：内测管理员提供的有效 100x MCP 访问地址与访问令牌（Token）

> 注：目前以 Windows 为主入口。实测说明：Windows Codex Desktop 0.155.1 运行时已成功加载 8 个 100x 工具与 100x:100x-creative，安装器隔离配置实测通过；实际桌面点按生成待用户体验。macOS 与 Linux 客户端适配暂未完成配套验收。

---

## 2. 安装方式

### 方式 A：在 Codex 桌面端直接对话安装（推荐首选）

在 Codex Desktop 中打开任意任务对话框，复制并发送以下自然语言指令：

```text
请阅读 https://github.com/kezd088/100x-mcp/blob/main/INSTALL.md，按说明安装 100x MCP + Skill 到本机 Codex，检查安装结果。不要在对话里索取或显示访问令牌。
```

Codex 会自动读取安装规范并在后台完成初始化配置。

### 方式 B：Windows PowerShell 一键脚本安装

打开 Windows PowerShell，运行以下单行命令：

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/kezd088/100x-mcp/main/install.ps1))) -Connect
```

- **`-Connect` 选项**：会在终端提示隐藏输入令牌（`Read-Host -AsSecureString`，不显示明文），并通过 **Windows DPAPI** 在本地加密保存在 `%LOCALAPPDATA%/100x/connection.json`。
- **本地开发测试**：若进行插件本地开发，可指定本地源目录：
  ```powershell
  powershell -ExecutionPolicy Bypass -File .\install.ps1 -Source "C:\your-folder\100x-mcp" -Connect
  ```

### 方式 C：Codex 原生插件命令安装

```powershell
# 1. 注册 100x 市场源
codex plugin marketplace add kezd088/100x-mcp --json

# 2. 安装 100x 插件包（含 MCP 与 Skill）
codex plugin add 100x@100x --json
```

> **注意**：命令关键字为 `plugin add`，而非 `plugin install`。安装完成后不会自动开启聊天对话，请打开 Codex 桌面端新建任务开始使用。

---

## 3. 凭据管理与安全说明

1. **DPAPI 本地密文存储**：令牌通过 Windows 操作系统级数据保护 API 加密保存在当前用户目录下（`%LOCALAPPDATA%/100x/connection.json`），文件设置仅当前用户及系统拥有权限。
2. **禁止对话暴露**：不要在 Codex 聊天窗口内索取、粘贴或输出完整 Token。
3. **无需手动修改配置**：安装器会自动配置 MCP 入口，无需手动编辑 `config.toml`。

---

## 4. 日常使用与 Skill 调度

由于 Codex 桌面端在会话初始化时加载 Skill，**新安装或更新后的插件在「新建任务」后生效**。

### 触发创作 Skill

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

> 注：卸载插件不会自动删除加密凭据文件。如需彻底清除凭据，请自行删除 `%LOCALAPPDATA%/100x/connection.json`。

---

## 6. 常见问题排错 (Troubleshooting)

### Q1: 对话提示「未找到 100x 工具或 Skill」
- **解决**：Codex 桌面端配置变更需要创建**新任务**（New Task）生效。请在新建任务的对话输入框中尝试 `$100x:100x-creative`。

### Q2: 报错 `100X_BUDGET_EXCEEDED`
- **原因**：所选模型、分辨率或时长所需积分超过设定的预算上限。
- **解决**：在对话中适当提高预算，或调低生成规格（如调整分辨率或视频时长）。

### Q3: 报错连接失败或 127.0.0.1 拒绝连接
- **原因**：误设为本地回环地址，但本机并未运行私有 100x 服务。
- **解决**：客户端本身不包含远程公共算力。请联系 100x 内测管理员获取正确的远程 MCP 服务地址，并重新运行带有 `-Connect` 的命令配置连接。
