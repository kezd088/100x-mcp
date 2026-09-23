// install.sh 的检查链测试：用替身 codex 与隔离的 CODEX_HOME，不碰本机真实 Codex 配置。
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const installer = resolve(root, 'install.sh');

function bashAvailable() {
  try { execFileSync('bash', ['-c', 'exit 0'], { stdio: 'ignore' }); return true; } catch { return false; }
}
// bash 的 PATH 只认 POSIX 形式，Windows 盘符里的冒号会被当成分隔符。
const posix = path => path.replace(/^([A-Za-z]):/, (_, drive) => '/' + drive.toLowerCase()).replace(/\\/g, '/');

const enabled = bashAvailable();
await mkdir(resolve(root, 'work/tests'), { recursive: true });
const folder = enabled ? await mkdtemp(resolve(root, 'work/tests/install-')) : '';
const plugin = resolve(folder, 'plugin');

if (enabled) {
  for (const dir of ['bin', 'codex-home', 'plugin/.codex-plugin', 'plugin/scripts', 'plugin/skills/100x-creative']) {
    await mkdir(resolve(folder, dir), { recursive: true });
  }
  for (const file of ['plugin.json', 'mcp.json', '.codex-plugin/plugin.json', 'skills/100x-creative/SKILL.md']) {
    await writeFile(resolve(plugin, file), '{}');
  }
  await writeFile(resolve(plugin, 'scripts/bridge.mjs'), '');
  await writeFile(resolve(plugin, 'scripts/connect.mjs'), 'console.log("[stub] 授权向导已启动");');
  const stub = ['#!/usr/bin/env bash', 'case "$*" in',
    '  "--version") echo "codex-cli ${STUB_CODEX_VERSION:-0.155.1}" ;;',
    '  "plugin add --help") exit 0 ;;',
    '  "plugin marketplace add "*) echo "{\\"marketplaceName\\":\\"${STUB_MARKETPLACE:-100x}\\"}" ;;',
    `  "plugin add 100x@100x --json") echo "{\\"pluginId\\":\\"100x@100x\\",\\"installedPath\\":\\"${posix(plugin)}\\",\\"version\\":\\"9.9.9\\"}" ;;`,
    '  "plugin list --marketplace 100x --json") echo "{\\"installed\\":[{\\"pluginId\\":\\"100x@100x\\",\\"enabled\\":${STUB_ENABLED:-true}}]}" ;;',
    '  *) echo "stub: unexpected $*" >&2; exit 1 ;;', 'esac', ''].join('\n');
  await writeFile(resolve(folder, 'bin/codex'), stub);
  await chmod(resolve(folder, 'bin/codex'), 0o755);
}

function install(args = [], env = {}) {
  return spawnSync('bash', [posix(installer), ...args], {
    encoding: 'utf8',
    env: { ...process.env, PATH: posix(resolve(folder, 'bin')) + ':' + process.env.PATH, CODEX_HOME: resolve(folder, 'codex-home'), ...env },
  });
}

test('安装成功时回读版本与启用状态', { skip: !enabled && '需要 bash' }, () => {
  const result = install();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /100x 9\.9\.9 已安装并启用。/);
  assert.match(result.stdout, /发送「连接 100x」/);
});

test('--connect 在安装成功后才进入授权向导', { skip: !enabled && '需要 bash' }, () => {
  const result = install(['--connect']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\[stub\] 授权向导已启动/);
});

test('来源不是 100x 插件目录就停下', { skip: !enabled && '需要 bash' }, () => {
  const result = install([], { STUB_MARKETPLACE: 'attacker' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /来源不是 100x 插件目录/);
});

test('Codex 版本低于 0.155.1 不安装', { skip: !enabled && '需要 bash' }, () => {
  const result = install([], { STUB_CODEX_VERSION: '0.155.0' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /0\.155\.1 或更新版本/);
});

test('插件没启用不算安装成功', { skip: !enabled && '需要 bash' }, () => {
  const result = install([], { STUB_ENABLED: 'false' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /尚未启用/);
});

test('未知参数不吞掉，直接报错退出', { skip: !enabled && '需要 bash' }, () => {
  const result = install(['--oops']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /未知参数/);
});
