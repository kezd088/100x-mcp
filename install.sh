#!/usr/bin/env bash
# 100x MCP / SKILL 安装器（macOS / Linux）。与 install.ps1 同一套检查：只调用 Codex 原生命令，
# 不安装全局软件、不改其他插件或模型配置、不启动 CLI 会话。
set -euo pipefail

SOURCE='kezd088/100x-mcp'
CONNECT=0

fail() { printf '%s\n' "$1" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --source) SOURCE="${2:-}"; shift 2 ;;
    --source=*) SOURCE="${1#*=}"; shift ;;
    --connect) CONNECT=1; shift ;;
    -h|--help) printf '用法：install.sh [--source <owner/repo 或本地目录>] [--connect]\n'; exit 0 ;;
    *) fail "未知参数：$1" ;;
  esac
done
[ -n "$SOURCE" ] || fail '--source 需要一个值。'

for name in node git codex; do
  command -v "$name" >/dev/null 2>&1 || fail "未找到 $name。请先安装所需工具，再重新运行；100x 不会自动改动全局软件。"
done

node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' \
  || fail "100x 需要 Node.js 22 或更新版本，当前 $(node --version)。"

codex plugin add --help >/dev/null 2>&1 || fail '请升级至支持 plugin 命令的 Codex CLI，然后重试。'
codex --version 2>/dev/null | node -e '
  let text = ""; process.stdin.on("data", d => text += d).on("end", () => {
    const found = /(\d+)\.(\d+)\.(\d+)/.exec(text); const min = [0, 155, 1];
    if (!found) process.exit(1);
    const version = [Number(found[1]), Number(found[2]), Number(found[3])];
    for (let i = 0; i < 3; i++) { if (version[i] > min[i]) process.exit(0); if (version[i] < min[i]) process.exit(1); }
    process.exit(0);
  });' || fail '100x 桌面端插件需要 Codex CLI 0.155.1 或更新版本。'

# 只从回执里取需要的字段；解析失败按失败处理，不猜测安装结果。
json_field() {
  node -e '
    let text = ""; process.stdin.on("data", d => text += d).on("end", () => {
      try { const value = JSON.parse(text);
        const found = process.argv[1].split(".").reduce((item, key) => item == null ? item : item[key], value);
        process.stdout.write(found == null ? "" : String(found));
      } catch { process.exit(1); }
    });' "$1"
}

printf '%s\n' '正在为 Codex 桌面端安装 100x MCP / SKILL…'
marketplace="$(codex plugin marketplace add "$SOURCE" --json)" || fail 'Codex 插件命令失败，未宣称安装成功。请查看上方错误。'
[ "$(printf '%s' "$marketplace" | json_field marketplaceName)" = '100x' ] || fail '来源不是 100x 插件目录，停止安装。'

installed="$(codex plugin add 100x@100x --json)" || fail 'Codex 插件命令失败，未宣称安装成功。请查看上方错误。'
plugin_id="$(printf '%s' "$installed" | json_field pluginId)"
plugin_path="$(printf '%s' "$installed" | json_field installedPath)"
plugin_version="$(printf '%s' "$installed" | json_field version)"
[ "$plugin_id" = '100x@100x' ] && [ -n "$plugin_path" ] || fail '未收到有效的 100x 安装回执。'

for file in plugin.json mcp.json .codex-plugin/plugin.json scripts/bridge.mjs skills/100x-creative/SKILL.md; do
  [ -f "$plugin_path/$file" ] || fail "插件文件缺失：$file"
done

codex plugin list --marketplace 100x --json | node -e '
  let text = ""; process.stdin.on("data", d => text += d).on("end", () => {
    try { const value = JSON.parse(text);
      const active = (value.installed || []).filter(item => item.pluginId === "100x@100x" && item.enabled);
      process.exit(active.length === 1 ? 0 : 1);
    } catch { process.exit(1); }
  });' || fail '100x 尚未启用，请在 Codex 插件页核对。'

printf '%s\n' "100x ${plugin_version} 已安装并启用。"

# macOS 的 Codex 桌面端由 Launchpad / Dock 启动时不继承终端 PATH，Homebrew 的 node 可能看不见。
if [ "$(uname -s)" = 'Darwin' ]; then
  node_path="$(command -v node)"
  case "$node_path" in
    /usr/bin/node|/usr/local/bin/node) ;;
    *) printf '%s\n' "提示：当前 node 在 ${node_path}。Codex 桌面端从 Dock 启动时不继承终端 PATH，可能找不到它。"
       printf '%s\n' "      若新任务里 100x 工具不出现，可自行执行：sudo ln -s \"${node_path}\" /usr/local/bin/node（安装器不会代你改系统）。" ;;
  esac
fi

if [ "$CONNECT" -eq 1 ]; then
  node "$plugin_path/scripts/connect.mjs" || fail '插件已安装，100x 连接配置未完成。'
else
  printf '%s\n' '在 Codex 中发送「连接 100x」，打开授权页确认即可。也可在安装命令加 --connect。'
fi
printf '%s\n' '回到 Codex 桌面端，新建任务后使用 $100x:100x-creative。安装器不会启动 CLI 聊天。'
printf '%s\n' '使用自己的 100x 账户授权，生成消耗该账户积分。'
