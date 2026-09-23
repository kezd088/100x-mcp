import { readFile, mkdir, writeFile, rename, chmod } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';

export class ConnectionError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export function validateEndpoint(value) {
  let url;
  try { url = new URL(value); } catch { throw new ConnectionError('100X_INVALID_URL', '100x 连接地址无效，请重新连接。'); }
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  const own = url.hostname === '100xspeed.app' || url.hostname.endsWith('.100xspeed.app');
  if (url.username || url.password || url.search || url.hash || !['/mcp', '/api/mcp'].includes(url.pathname) ||
      !(local && ['http:', 'https:'].includes(url.protocol) || own && url.protocol === 'https:')) {
    throw new ConnectionError('100X_INVALID_URL', '仅支持 100x 的 HTTPS MCP 地址；本机测试可使用 localhost。');
  }
  return url.href;
}

// 每个系统只认自己的操作系统级保护。DPAPI 与钥匙串都绑当前用户，配置文件复制到别的机器同样解不开。
const PROTECTIONS = { win32: 'windows-dpapi', darwin: 'macos-keychain' };
const KEYCHAIN_SERVICE = '100x-codex';

export function protectionFor(target = process.platform) {
  const name = PROTECTIONS[target];
  if (!name) throw new ConnectionError('100X_CONFIG_PLATFORM', '自动安全保存目前支持 Windows 与 macOS；其他系统可使用受保护的环境变量连接。');
  return name;
}

export function connectionPath(env = process.env, target = process.platform) {
  if (env.HUNDREDX_CONFIG_PATH) return env.HUNDREDX_CONFIG_PATH;
  if (target === 'darwin') return join(homedir(), 'Library', 'Application Support', '100x', 'connection.json');
  if (target === 'win32') return join(env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), '100x', 'connection.json');
  return join(env.XDG_CONFIG_HOME || join(homedir(), '.config'), '100x', 'connection.json');
}

// 同一台机器上的多份配置（正式、本机测试）各自独立，钥匙串条目不互相覆盖。
function keychainAccount(path, scope) {
  return scope + '-' + createHash('sha256').update(path).digest('hex').slice(0, 16);
}

function runSecurity(args, input, options = {}) {
  const bin = options.securityBin || '/usr/bin/security';
  const prefix = options.securityArgs || [];
  return new Promise((resolve, reject) => {
    const child = execFile(bin, [...prefix, ...args], { timeout: 10000, maxBuffer: 1024 * 1024 }, (error, stdout) => error ? reject(error) : resolve(stdout));
    child.stdin.on('error', () => {});
    child.stdin.end(input || '');
  });
}

async function keychainProtect(value, options) {
  const path = options.path || connectionPath(options.env || process.env, 'darwin');
  const account = keychainAccount(path, options.scope || 'connection');
  // 明文只走 stdin：security -i 从标准输入读子命令，凭据不进入进程参数表；base64 保证内容没有空白和引号。
  const payload = Buffer.from(value, 'utf8').toString('base64');
  const cipher = 'keychain:1:' + account;
  try { await runSecurity(['-i'], 'add-generic-password -a ' + account + ' -s ' + KEYCHAIN_SERVICE + ' -T /usr/bin/security -U -w ' + payload + '\n', options); }
  catch { throw new ConnectionError('100X_SAVE_FAILED', '无法写入 macOS 钥匙串，请重试保存。'); }
  // security -i 的退出码不区分子命令失败，读回来比对才算真的存住了。
  const stored = await keychainUnprotect(cipher, options).catch(() => null);
  if (stored !== value) throw new ConnectionError('100X_SAVE_FAILED', 'macOS 钥匙串没有确认保存结果，请重试保存。');
  return cipher;
}

async function keychainUnprotect(cipher, options) {
  const account = /^keychain:1:([A-Za-z0-9-]+)$/.exec(String(cipher))?.[1];
  if (!account) throw new ConnectionError('100X_INVALID_CONFIG', '100x 连接配置无效，请重新运行连接脚本。');
  let stdout;
  try { stdout = await runSecurity(['find-generic-password', '-a', account, '-s', KEYCHAIN_SERVICE, '-w'], null, options); }
  catch { throw new ConnectionError('100X_CREDENTIAL_UNREADABLE', '100x 凭据无法从钥匙串读取，请在当前 macOS 用户下重新连接。'); }
  const text = stdout.trim();
  const value = Buffer.from(text, 'base64').toString('utf8');
  if (Buffer.from(value, 'utf8').toString('base64') !== text) throw new ConnectionError('100X_CREDENTIAL_UNREADABLE', '钥匙串中的 100x 凭据已损坏，请重新连接。');
  return value;
}

function dpapiUnprotect(cipher) {
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

export async function unprotect(cipher, options = {}) {
  const target = options.platform || process.platform;
  protectionFor(target);
  return target === 'win32' ? dpapiUnprotect(cipher) : keychainUnprotect(cipher, options);
}

let cachedCipher;
let cachedToken;
export async function readConnection(env = process.env, options = {}) {
  if (env.HUNDREDX_TOKEN) {
    if (!env.HUNDREDX_URL) throw new ConnectionError('100X_NOT_CONNECTED', '设置 HUNDREDX_URL，或运行 100x 的连接脚本。');
    return { url: validateEndpoint(env.HUNDREDX_URL), token: checkToken(env.HUNDREDX_TOKEN) };
  }
  const target = options.platform || process.platform;
  let record;
  try { record = JSON.parse(await readFile(connectionPath(env, target), 'utf8')); }
  catch { throw new ConnectionError('100X_NOT_CONNECTED', '100x 尚未连接。调用 100x_connect，在网页确认授权即可。'); }
  const url = validateEndpoint(record.url);
  if (record.version !== 1 || record.protection !== protectionFor(target) || typeof record.token !== 'string') {
    throw new ConnectionError('100X_INVALID_CONFIG', '100x 连接配置无效，请重新运行连接脚本。');
  }
  if (cachedCipher !== record.token) { cachedToken = checkToken(await unprotect(record.token, { ...options, platform: target })); cachedCipher = record.token; }
  return { url, token: cachedToken };
}

function dpapiProtect(value) {
  return new Promise((resolve, reject) => {
    const script = "$ErrorActionPreference='Stop'; Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1'); [Console]::InputEncoding=[Text.UTF8Encoding]::new($false); $v=[Console]::In.ReadToEnd(); $s=ConvertTo-SecureString $v -AsPlainText -Force; [Console]::Write((ConvertFrom-SecureString $s))";
    const child = execFile('powershell.exe', ['-NoLogo','-NoProfile','-NonInteractive','-Command',script], { windowsHide:true,timeout:10000,maxBuffer:32768 }, (error,stdout) => error ? reject(new ConnectionError('100X_SAVE_FAILED','无法加密凭据，请重试保存。')) : resolve(stdout));
    child.stdin.on('error',()=>{}); child.stdin.end(value);
  });
}

export async function protect(value, options = {}) {
  const target = options.platform || process.platform;
  protectionFor(target);
  return target === 'win32' ? dpapiProtect(value) : keychainProtect(value, options);
}

function lockDownWindowsFile(path) {
  return new Promise((resolve,reject)=>{
    const script = "$ErrorActionPreference='Stop'; [Console]::InputEncoding=[Text.UTF8Encoding]::new($false); $p=[Console]::In.ReadToEnd(); $acl=[Security.AccessControl.FileSecurity]::new(); $acl.SetAccessRuleProtection($true,$false); $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User; $acl.SetAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','Allow')); $acl.SetAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-5-18'),'FullControl','Allow')); [IO.File]::SetAccessControl($p,$acl)";
    const child=execFile('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout:10000},error=>error?reject(new ConnectionError('100X_SAVE_FAILED','无法保护本机凭据文件，请重试保存。')):resolve());
    child.stdin.on('error',()=>{}); child.stdin.end(path);
  });
}

export async function saveProtected(path, record, options = {}) {
  const target = options.platform || process.platform;
  await mkdir(dirname(path), {recursive:true,mode:0o700});
  const temp = path + '.new-' + process.pid;
  await writeFile(temp, JSON.stringify(record), {mode:0o600});
  if (target === 'win32') await lockDownWindowsFile(temp);
  else {
    // 目录可能是更早建的：显式收紧，别让同机其他账户读到密文引用。
    await chmod(dirname(path), 0o700).catch(() => {});
    try { await chmod(temp, 0o600); } catch { throw new ConnectionError('100X_SAVE_FAILED', '无法保护本机凭据文件，请重试保存。'); }
  }
  await rename(temp,path);
}

export async function saveConnection({url,token}, env=process.env, options={}) {
  const target = options.platform || process.platform;
  const path = connectionPath(env, target);
  const protection = { ...options, platform: target, env, path, scope: 'connection' };
  const record={version:1,protection:protectionFor(target),url:validateEndpoint(url),token:await protect(checkToken(token),protection)};
  await saveProtected(path,record,{...options,platform:target});
  // Confirm the durable file is decryptable before acknowledging to the server.
  await readConnection({...env,HUNDREDX_TOKEN:''},{...options,platform:target});
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
