import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execFile } from 'node:child_process';

export class ConnectionError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export function validateEndpoint(value) {
  let url;
  try { url = new URL(value); } catch { throw new ConnectionError('100X_INVALID_URL', '请使用管理员提供的 100x MCP 地址。'); }
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  const own = url.hostname === '100xspeed.app' || url.hostname.endsWith('.100xspeed.app');
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/mcp' ||
      !(local && ['http:', 'https:'].includes(url.protocol) || own && url.protocol === 'https:')) {
    throw new ConnectionError('100X_INVALID_URL', '仅支持 100x 的 HTTPS /mcp 地址；本机测试可使用 localhost。');
  }
  return url.href;
}

export function connectionPath(env = process.env) {
  return env.HUNDREDX_CONFIG_PATH || join(env.LOCALAPPDATA || join(homedir(), '.config'), '100x', 'connection.json');
}

export function unprotect(cipher) {
  if (process.platform !== 'win32') throw new ConnectionError('100X_CONFIG_PLATFORM', 'Windows 加密凭据只能在原 Windows 用户下使用。');
  return new Promise((resolve, reject) => {
    const script = "$ErrorActionPreference='Stop'; Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1'); $v=[Console]::In.ReadToEnd(); $s=ConvertTo-SecureString $v; $p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); try { [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); [Console]::Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($p)) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p) }";
    const child = execFile('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, timeout: 10000, maxBuffer: 16384 }, (err, stdout) => {
        if (err) reject(new ConnectionError('100X_CREDENTIAL_UNREADABLE', '100x 凭据无法解密，请在当前 Windows 用户下重新连接。'));
        else resolve(stdout);
      });
    child.stdin.on('error', () => {});
    child.stdin.end(cipher);
  });
}

let cachedCipher;
let cachedToken;
export async function readConnection(env = process.env) {
  if (env.HUNDREDX_TOKEN) {
    if (!env.HUNDREDX_URL) throw new ConnectionError('100X_NOT_CONNECTED', '设置 HUNDREDX_URL，或运行 100x 的连接脚本。');
    return { url: validateEndpoint(env.HUNDREDX_URL), token: checkToken(env.HUNDREDX_TOKEN) };
  }
  let record;
  try { record = JSON.parse(await readFile(connectionPath(env), 'utf8')); }
  catch { throw new ConnectionError('100X_NOT_CONNECTED', '100x 已安装，但尚未连接。请运行安装器 -Connect，在安全输入框配置 100x 地址和令牌；不要将令牌发送到聊天。'); }
  const url = validateEndpoint(record.url);
  if (record.version !== 1 || record.protection !== 'windows-dpapi' || typeof record.token !== 'string') {
    throw new ConnectionError('100X_INVALID_CONFIG', '100x 连接配置无效，请重新运行连接脚本。');
  }
  if (cachedCipher !== record.token) { cachedToken = checkToken(await unprotect(record.token)); cachedCipher = record.token; }
  return { url, token: cachedToken };
}

function checkToken(token) {
  if (typeof token !== 'string' || token.length < 8 || token.length > 8192 || /\s/.test(token)) {
    throw new ConnectionError('100X_INVALID_TOKEN', '100x 访问令牌格式无效，请重新配置。');
  }
  return token;
}

export async function request(connection, payload, { timeoutMs = 120000, fetchImpl = fetch } = {}) {
  const endpoint = validateEndpoint(connection.url);
  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2025-03-26', authorization: 'Bearer ' + connection.token },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new ConnectionError('100X_CONNECTION_FAILED', '100x 请求未取得确定响应。未自动重试；生成请求请保留原报价和幂等编号，先查询任务。');
  }
  if (response.status === 401 || response.status === 403) throw new ConnectionError('100X_AUTH_FAILED', '100x 令牌无效或没有访问权限，请重新连接。');
  if (!response.ok) throw new ConnectionError('100X_SERVICE_UNAVAILABLE', '100x 服务暂不可用。未自动重新提交生成请求。');
  if (!response.headers.get('content-type')?.includes('application/json')) throw new ConnectionError('100X_PROTOCOL_ERROR', '100x 服务返回了不兼容的响应。');
  let result;
  try {
    const body = await response.text();
    if (body.length > 4 * 1024 * 1024) throw new Error('size');
    result = JSON.parse(body);
  } catch { throw new ConnectionError('100X_PROTOCOL_ERROR', '100x 服务响应格式无效。'); }
  if (result.jsonrpc !== '2.0' || result.id !== payload.id || !result.result || result.error) {
    throw new ConnectionError('100X_PROTOCOL_ERROR', '100x 服务没有返回有效的工具回执。');
  }
  return result.result;
}
