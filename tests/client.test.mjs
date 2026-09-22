import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { validateEndpoint, readConnection, request } from '../plugins/100x/scripts/connection.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const plugin = resolve(root, 'plugins/100x');
await mkdir(resolve(root, 'work/tests'), { recursive: true });
const folder = await mkdtemp(resolve(root, 'work/tests/中文 路径-'));
const token = randomBytes(24).toString('hex');
function start(handler) {
  return new Promise(resolve => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve({ server, url: 'http://127.0.0.1:' + server.address().port + '/mcp' }));
  });
}
function run(file, args, env, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { cwd: folder, env: { ...process.env, ...env }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', b => stdout += b); child.stderr.on('data', b => stderr += b);
    child.on('error', reject); child.on('exit', code => resolve({ code, stdout, stderr }));
    child.stdin.on('error', () => {}); child.stdin.end(input || '');
  });
}

test('only 100x HTTPS or explicit loopback MCP addresses are accepted', () => {
  assert.equal(validateEndpoint('https://100xspeed.app/mcp'), 'https://100xspeed.app/mcp');
  assert.equal(validateEndpoint('https://mcp.100xspeed.app/mcp'), 'https://mcp.100xspeed.app/mcp');
  assert.equal(validateEndpoint('http://[::1]:4196/mcp'), 'http://[::1]:4196/mcp');
  for (const url of ['http://100xspeed.app/mcp', 'https://100xspeed.app.attacker.test/mcp', 'https://attacker.test/mcp', 'https://u:p@100xspeed.app/mcp', 'https://100xspeed.app/mcp?token=x', 'https://100xspeed.app/mcp#x', 'https://100xspeed.app/other', 'file:///mcp']) {
    assert.throws(() => validateEndpoint(url), { code: '100X_INVALID_URL' });
  }
});

test('fresh stdio starts without credentials and exposes actionable connection status', async () => {
  const child = spawn(process.execPath, [resolve(plugin, 'scripts/bridge.mjs')], { cwd: folder, env: { ...process.env, HUNDREDX_TOKEN: '', HUNDREDX_CONFIG_PATH: resolve(folder, 'missing.json') }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map(); let id = 0; let errorOutput = '';
  const lines = createInterface({ input: child.stdout });
  lines.on('line', line => { const m = JSON.parse(line); pending.get(m.id)?.(m); });
  child.stderr.on('data', b => errorOutput += b);
  function call(method, params = {}) {
    return new Promise((res, rej) => {
      const n = ++id, timer = setTimeout(() => rej(new Error('stdio timeout')), 5000);
      pending.set(n, r => { clearTimeout(timer); pending.delete(n); res(r); });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: n, method, params }) + '\n');
    });
  }
  try {
    const init = await call('initialize', { protocolVersion: '2025-03-26' });
    assert.equal(init.result.serverInfo.name, '100x');
    assert.equal((await call('tools/list')).result.tools.length, 8);
    const status = await call('tools/call', { name: '100x_connection_status', arguments: {} });
    assert.equal(status.result.structuredContent.error.code, '100X_NOT_CONNECTED');
    assert.equal((await call('tools/call', { name: 'arbitrary_request' })).error.code, -32602);
    assert.equal(errorOutput, '');
  } finally { child.kill(); }
});

test('HTTP proxy forwards budget and idempotency exactly once', async () => {
  const calls = [];
  const { server, url } = await start(async (req, res) => {
    let text = ''; for await (const c of req) text += c;
    calls.push({ auth: req.headers.authorization, body: JSON.parse(text) });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: calls[0].body.id, result: { content: [{ type: 'text', text: 'accepted' }] } }));
  });
  try {
    const body = { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: '100x_generate_image', arguments: { quote_id: '100x_quote_' + 'a'.repeat(32), max_credits: 0.5, idempotency_key: 'same-request-1234' } } };
    await request({ url, token }, body);
    assert.equal(calls.length, 1); assert.deepEqual(calls[0].body, body); assert.equal(calls[0].auth, 'Bearer ' + token);
  } finally { server.closeAllConnections(); server.close(); }
});

test('auth failures do not disclose response text', async () => {
  const { server, url } = await start((req, res) => { res.writeHead(401); res.end('private details ' + token); });
  try { await assert.rejects(request({ url, token }, { id: 1 }), e => e.code === '100X_AUTH_FAILED' && !e.message.includes(token)); }
  finally { server.closeAllConnections(); server.close(); }
});

test('timed out generation is not automatically retried', async () => {
  let calls = 0;
  const { server, url } = await start(() => { calls++; });
  try {
    await assert.rejects(request({ url, token }, { id: 1 }, { timeoutMs: 80 }), { code: '100X_CONNECTION_FAILED' });
    assert.equal(calls, 1);
  } finally { server.closeAllConnections(); server.close(); }
});

test('redirects are never followed with credentials', async () => {
  let destinationCalls = 0;
  const target = await start((req, res) => { destinationCalls++; res.end('bad'); });
  const redirect = await start((req, res) => { res.writeHead(307, { location: target.url }); res.end(); });
  try {
    await assert.rejects(request({ url: redirect.url, token }, { id: 1 }), { code: '100X_CONNECTION_FAILED' });
    assert.equal(destinationCalls, 0);
  } finally { for (const s of [target.server, redirect.server]) { s.closeAllConnections(); s.close(); } }
});

test('Windows protected storage roundtrips without token in output or file', { skip: process.platform !== 'win32' }, async () => {
  const configPath = resolve(folder, 'connection.json');
  const url = 'http://127.0.0.1:4196/mcp';
  const result = await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', resolve(plugin, 'scripts/connect.ps1'), '-FromStdin'], { HUNDREDX_CONFIG_PATH: configPath }, JSON.stringify({ url, token }));
  assert.equal(result.code, 0, result.stderr);
  assert.equal((result.stdout + result.stderr).includes(token), false);
  const text = await readFile(configPath, 'utf8'); assert.equal(text.includes(token), false);
  assert.deepEqual(await readConnection({ HUNDREDX_CONFIG_PATH: configPath }), { url, token });
  const again = await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', resolve(plugin, 'scripts/connect.ps1'), '-FromStdin'], { HUNDREDX_CONFIG_PATH: configPath }, JSON.stringify({ url, token }));
  assert.equal(again.code, 0, 'Reconnecting must preserve the existing file owner and support protected files');
});

test('media download from current 100x endpoint cannot overwrite files', async () => {
  const { server, url } = await start((req, res) => { res.writeHead(200, { 'content-type': 'image/png' }); res.end(Buffer.from('png-test')); });
  const saved = resolve(folder, 'already.png'); await writeFile(saved, 'keep');
  try {
    const result = await run(process.execPath, [resolve(plugin, 'scripts/media.mjs'), 'download', url.replace('/mcp', '/media/100x_asset_' + 'a'.repeat(32)), saved], { HUNDREDX_URL: url, HUNDREDX_TOKEN: token });
    assert.equal(result.code, 1); assert.equal(await readFile(saved, 'utf8'), 'keep'); assert.match(result.stderr, /已存在/);
  } finally { server.closeAllConnections(); server.close(); }
});
