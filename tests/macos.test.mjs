import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { connectionPath, protect, readConnection, saveConnection, unprotect } from '../plugins/100x/scripts/connection.mjs';
import { DeviceConnection } from '../plugins/100x/scripts/device-auth.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const stub = resolve(root, 'tests/support/security-stub.mjs');
await mkdir(resolve(root, 'work/tests'), { recursive: true });
const folder = await mkdtemp(resolve(root, 'work/tests/macos-'));
const url = 'https://100xspeed.app/api/mcp';

let counter = 0;
// macOS 的钥匙串换成受控替身：真实 /usr/bin/security 的行为仍待 macOS 真机验收。
function mac(overrides = {}) {
  const name = 'case-' + ++counter;
  const env = { HUNDREDX_CONFIG_PATH: resolve(folder, name + '.json'), HUNDREDX_TOKEN: '' };
  const options = {
    platform: 'darwin', securityBin: process.execPath, securityArgs: [stub],
    keychain: resolve(folder, name + '-keychain.json'), argv: resolve(folder, name + '-argv.log'),
  };
  process.env.STUB_KEYCHAIN_STORE = options.keychain;
  process.env.STUB_KEYCHAIN_ARGV = options.argv;
  process.env.STUB_KEYCHAIN_MODE = overrides.mode || 'normal';
  return { env, options };
}

test('macOS 保存走钥匙串，配置文件与进程参数里都没有令牌', async () => {
  const { env, options } = mac();
  const token = '100x_' + randomBytes(24).toString('hex');
  await saveConnection({ url, token }, env, options);

  const text = await readFile(env.HUNDREDX_CONFIG_PATH, 'utf8');
  assert.equal(text.includes(token), false);
  const record = JSON.parse(text);
  assert.equal(record.protection, 'macos-keychain');
  assert.match(record.token, /^keychain:1:connection-[a-f0-9]{16}$/);

  // 令牌与它的 base64 都不能出现在命令行参数里：ps 能看到参数，看不到 stdin。
  const argv = await readFile(options.argv, 'utf8');
  assert.equal(argv.includes(token), false);
  assert.equal(argv.includes(Buffer.from(token, 'utf8').toString('base64')), false);
  assert.match(argv, /"-i"/);

  assert.deepEqual(await readConnection(env, options), { url, token });
});

test('Windows 写的配置在 macOS 上不被接受', async () => {
  const { env, options } = mac();
  await writeFile(env.HUNDREDX_CONFIG_PATH, JSON.stringify({ version: 1, protection: 'windows-dpapi', url, token: 'AQAAA...' }));
  await assert.rejects(readConnection(env, options), { code: '100X_INVALID_CONFIG' });
});

test('钥匙串里没有条目时明确报无法读取，不退回任何默认值', async () => {
  const { env, options } = mac();
  await writeFile(env.HUNDREDX_CONFIG_PATH, JSON.stringify({ version: 1, protection: 'macos-keychain', url, token: 'keychain:1:connection-' + 'a'.repeat(16) }));
  await assert.rejects(readConnection(env, options), { code: '100X_CREDENTIAL_UNREADABLE' });
});

test('钥匙串没真的存住时保存失败，不会当成已连接', async () => {
  const { env, options } = mac({ mode: 'silent-drop' });
  await assert.rejects(saveConnection({ url, token: '100x_' + 'b'.repeat(40) }, env, options), { code: '100X_SAVE_FAILED' });
});

test('钥匙串内容被改坏时报损坏，不返回乱码令牌', async () => {
  const { env, options } = mac({ mode: 'corrupt' });
  await assert.rejects(saveConnection({ url, token: '100x_' + 'c'.repeat(40) }, env, options), { code: '100X_SAVE_FAILED' });
});

test('未支持的系统大声报错，不静默降级为明文保存', async () => {
  await assert.rejects(protect('100x_' + 'd'.repeat(40), { platform: 'linux' }), { code: '100X_CONFIG_PLATFORM' });
  await assert.rejects(unprotect('keychain:1:connection-x', { platform: 'freebsd' }), { code: '100X_CONFIG_PLATFORM' });
});

test('macOS 默认配置落在 Library/Application Support，Windows 路径不变', () => {
  assert.match(connectionPath({}, 'darwin'), /Library[\\/]Application Support[\\/]100x[\\/]connection\.json$/);
  assert.match(connectionPath({ LOCALAPPDATA: 'C:/Users/x/AppData/Local' }, 'win32'), /100x[\\/]connection\.json$/);
  assert.equal(connectionPath({ HUNDREDX_CONFIG_PATH: '/tmp/x.json' }, 'darwin'), '/tmp/x.json');
});

test('macOS 设备名进授权请求，待授权数据与令牌分开存放', async () => {
  const { env, options } = mac();
  const token = '100x_' + randomBytes(24).toString('hex');
  const requests = [];
  const connection = new DeviceConnection(env, {
    protection: options,
    fetch: async (endpoint, init) => {
      const body = init.body ? JSON.parse(init.body) : null;
      requests.push({ path: new URL(endpoint).pathname, body });
      if (String(endpoint).endsWith('/device')) return Response.json({ user_code: 'MAC1234567', verification_uri: 'https://100xspeed.app/?connect_100x=MAC1234567', expires_at: new Date(Date.now() + 600000).toISOString() });
      if (String(endpoint).endsWith('/token')) return Response.json({ status: 'approved', access_token: token });
      return Response.json({ status: 'connected' });
    },
  });
  const state = await connection.connect();
  assert.equal(state.user_code, 'MAC1234567');
  assert.equal(requests[0].body.device_name, 'Codex · macOS');

  await connection.advance();
  clearTimeout(connection.timer);
  assert.equal(connection.publicState().status, 'connected');
  assert.deepEqual(await readConnection(env, options), { url, token });

  // 待授权数据与令牌是两条钥匙串条目，互不覆盖。
  const items = Object.keys(JSON.parse(await readFile(options.keychain, 'utf8')));
  assert.equal(items.length, 2);
  assert.equal(items.filter(key => key.includes('pending-')).length, 1);
  assert.equal(items.filter(key => key.includes('connection-')).length, 1);
  const pendingText = await readFile(env.HUNDREDX_CONFIG_PATH + '.pending', 'utf8');
  assert.equal(pendingText.includes(token), false);
});

