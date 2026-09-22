// 手动连接入口（macOS / Linux）：与 Windows 的 connect.ps1 对应，只在网页授权不可用时使用。
// 常规路径是 connect.mjs 的网页授权；这里只接受管理员给出的 100x 地址与本人令牌。
import { createInterface } from 'node:readline';
import { saveConnection } from './connection.mjs';

async function readAll(stream) {
  let text = '';
  for await (const chunk of stream) text += chunk;
  return text;
}

function ask(query, hidden = false) {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  // 隐藏输入：只回显提示语本身，令牌不落在终端与滚动历史里。
  if (hidden) rl._writeToOutput = value => { if (value.includes(query)) rl.output.write(query); };
  return new Promise(resolve => rl.question(query, answer => { rl.output.write('\n'); rl.close(); resolve(answer.trim()); }));
}

try {
  let url, token;
  if (process.argv.includes('--from-stdin')) {
    const record = JSON.parse(await readAll(process.stdin));
    url = record.url; token = record.token;
  } else {
    if (!process.stdin.isTTY) throw new Error('需要终端输入或 --from-stdin。');
    console.log('100x 连接 / 只填写管理员提供的 100x 地址与本人令牌。不要填写模型厂商密钥。');
    url = await ask('100x MCP 地址（含 /api/mcp）：');
    token = await ask('100x 访问令牌（隐藏输入）：', true);
  }
  await saveConnection({ url, token });
  console.log('100x 凭据已在本机加密保存。回到 Codex 桌面端，在新任务中检查 100x 连接。');
} catch {
  // 不输出异常原文：解析与请求错误可能带着凭据。
  console.error('100x 连接未保存。请检查当前系统账户、100x MCP 地址及访问令牌。');
  process.exitCode = 1;
}
