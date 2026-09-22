// macOS 真机冒烟：验证钥匙串保存与读回这条链路本身。
// 不需要 100x 账号、不联网、不扣积分。用法：node tests/macos-smoke.mjs
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { readConnection, saveConnection } from '../plugins/100x/scripts/connection.mjs';

if (process.platform !== 'darwin') {
  console.error('这个冒烟脚本只在 macOS 上有意义；其他系统请跑 node --test tests/*.test.mjs。');
  process.exit(1);
}

const run = promisify(execFile);
const folder = await mkdtemp(join(tmpdir(), '100x-smoke-'));
const env = { HUNDREDX_CONFIG_PATH: join(folder, 'connection.json'), HUNDREDX_TOKEN: '' };
const url = 'https://100xspeed.app/api/mcp';
const token = '100x_smoke_' + randomBytes(24).toString('hex');
let account = '';

try {
  await saveConnection({ url, token }, env);
  const text = await readFile(env.HUNDREDX_CONFIG_PATH, 'utf8');
  const record = JSON.parse(text);
  account = String(record.token).replace('keychain:1:', '');

  assert.equal(record.protection, 'macos-keychain', '配置文件应标记为 macos-keychain');
  assert.equal(text.includes(token), false, '配置文件里不能出现令牌明文');
  assert.match(record.token, /^keychain:1:connection-[a-f0-9]{16}$/, '配置文件只应保存钥匙串条目引用');

  const mode = (await stat(env.HUNDREDX_CONFIG_PATH)).mode & 0o777;
  assert.equal(mode, 0o600, '凭据文件权限应为 600，实际 ' + mode.toString(8));

  assert.deepEqual(await readConnection(env), { url, token }, '应能从钥匙串原样读回令牌');
  console.log('✔ 钥匙串保存与读回通过，条目 ' + account);
  console.log('✔ 配置文件 ' + env.HUNDREDX_CONFIG_PATH + ' 权限 600 且不含明文');
  console.log('下一步真机验收：install.sh 安装 → Codex 新任务发送「连接 100x」→ 网页核对连接码 → 允许 → 看到「已连接」。');
} catch (error) {
  console.error('✘ 冒烟未通过：' + (error.code || '') + ' ' + error.message);
  process.exitCode = 1;
} finally {
  // 冒烟用的条目不留在钥匙串里。
  if (account) await run('/usr/bin/security', ['delete-generic-password', '-a', account, '-s', '100x-codex']).catch(() => {
    console.error('提示：请手动删除钥匙串条目 ' + account + '（服务名 100x-codex）。');
  });
  await rm(folder, { recursive: true, force: true });
}
