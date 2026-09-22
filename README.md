# 100x for Codex Desktop

<p align="center">
  <img src="./assets/readme/100x-codex-hero.svg" width="100%" alt="100x for Codex Desktop - 官方插件与创作 Skill 概览">
</p>

让 Codex 对话接入 100x 图片与视频生成。

<p align="center">
  <img src="./assets/readme/100x-generated-cube.jpg" width="420" alt="通过 Codex 桌面端运行时调用 100x 实际生成的 1K 蓝色玻璃立方体">
</p>

实际生成示例。安装与运行时验证见 [验证记录](./docs/verification.md)。

**版本**：v0.2.0 · **Marketplace**：`100x` · **Plugin**：`100x` · **Skill**：`100x:100x-creative` · **官网**：[100xspeed.app/mcp](https://100xspeed.app/mcp/)

---

## 服务状态与接入须知

- **定向内测阶段**：客户端插件公开不等于公共生成服务开放。当前接入需使用 100x 内测管理员分发的服务地址与访问令牌。
- **环境地址约定**：`127.0.0.1` 仅限本机自行运行私有 100x 服务开发时使用，不能作为远程服务地址。

---

## 首次安装与接入

### 方式 A：在 Codex 桌面端直接对话安装（推荐首选）

在 Codex Desktop 任意任务中复制并发送以下自然语言指令：

```text
请阅读 https://github.com/kezd088/100x-mcp/blob/main/INSTALL.md，按说明安装 100x MCP + Skill 到本机 Codex，检查安装结果。不要在对话里索取或显示访问令牌。
```

### 方式 B：Windows PowerShell 一键安装

在 Windows PowerShell 中运行单行命令：

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/kezd088/100x-mcp/main/install.ps1))) -Connect
```

- `-Connect` 会在终端提示隐藏输入令牌，通过 **Windows DPAPI** 在本地加密保存（位于 `%LOCALAPPDATA%/100x/connection.json`），不在聊天窗口暴露，不手动改写配置文件。
- 本地开发可指定源码目录：`.\install.ps1 -Source "C:\your-folder\100x-mcp" -Connect`。

### 方式 C：Codex 原生插件管理命令

```powershell
codex plugin marketplace add kezd088/100x-mcp --json
codex plugin add 100x@100x --json
```

> **系统前提与实测**：Node.js 22+、Git、Codex CLI 0.155.1+（支持插件）。Windows Codex Desktop 0.155.1 运行时已成功加载 8 个 100x 工具与 100x:100x-creative，安装器隔离配置实测通过；实际桌面点按生成待用户体验。macOS / Linux 暂未完成配套验收。安装完成后请在 Codex Desktop 打开**新任务**开始使用。

---

## 生成流程

完整生成过程包含 5 个清晰阶段，先查后报、确认预算后再提交：

<p align="center">
  <img src="./assets/readme/100x-creative-workflow.svg" width="100%" alt="100x 生成流程图解：查型号、查报价、预算提交、异步生成到保存交付">
</p>

1. **查型号** (`100x_list_models`)：查询当前账户实时可用型号与模式。
2. **查报价** (`100x_quote`)：获取单次准确积分，报价单有效期 15 分钟；若价格调整会提示重新报价。
3. **预算提交** (`100x_generate_*`)：传入报价号、`max_credits` 上限与请求单号，返回后台任务号。
4. **异步生成** (`100x_get_task`)：根据服务端返回的建议间隔（`poll_after_ms`）查询。耗时取决于模型后台渲染进度，不宣传瞬时成片。
5. **保存交付**：成品自动下载到本地工作区绝对路径。下载预览受宿主媒体权限约束，不保证所有宿主无条件自动预览。

---

## 开始创作：提示词范例

在 Codex 桌面端**新建任务**，输入 `$100x:100x-creative` 触发 Skill，也可直接使用自然语言：

### 检查连接状态（不扣积分）

```text
$100x:100x-creative 检查 100x 连接，列出可用型号和余额，不生成。
```

*自然语言替代：请使用 100x 检查连接状态并列出当前可用型号，先不要生成。*

### 范例 1：带预算上限的图片生成（先报价）

```text
$100x:100x-creative 先列出当前可用的图片型号。我想生成一张 1K 分辨率的极简科技品牌海报，预算不超过 2 积分，请先告诉我具体报价，确认后再生成。
```

*自然语言替代：用 100x 生成一张 1K 极简科技品牌海报，预算不超过 2 积分，先报价。*

### 范例 2：严格确认费用的视频生成（先报不扣）

```text
$100x:100x-creative 参考素材文件 D:/assets/product.png，设计一段 5 秒的产品旋转镜头。请先查询可用视频型号并给出积分报价，未获确认前不要自动扣费提交。
```

*自然语言替代：参考素材 D:/assets/product.png，用 100x 做一段 5 秒产品旋转视频，先报积分费用，确认后再做。*

> **素材与产物路径**：参考本地素材时请提供真实绝对路径；生成完毕后，文件直接下载至当前工作目录绝对路径。下载预览受 Codex 宿主媒体权限约束，不保证所有宿主无条件自动预览。

---

## 安全机制与控制

- **本地凭据安全**：Windows DPAPI 系统级加密，禁止在对话窗口索取或回显 Token。
- **预算上限控制**：实际费用超出预设上限时自动中止，防止意外扣费。
- **网络重试防重复**：重试同一意图时复用原报价编号与单号，避免重复计费。

---

## 支持模型概览与计费原则

支持通过 MCP 访问主流生成引擎：

- **Google**：Nano Banana 2 / Pro、Omni
- **OpenAI**：GPT Image 2.5（1K / Flare / Sunburst）
- **xAI**：Grok Image 1.5 / 2、Grok Video 1.5
- **MiniMax**：H3（480P / 1080P）

> **说明**：账户实际可用模型以 `100x_list_models` 实时返回的目录为准（Grok 视频等型号依赖账户实时权限）。积分扣减以提交前 `100x_quote` 即时报价为准，公示页价格为内测基准价。

---

## 详细文档与链接

- [Windows 详细安装、配置、更新与排错指南](./docs/codex-desktop.md)
- [100x 官方网站与 MCP 介绍](https://100xspeed.app/mcp/)
