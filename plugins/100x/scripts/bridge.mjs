import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { ConnectionError, readConnection, request } from './connection.mjs';

const tools = JSON.parse(await readFile(new URL('./tools.json', import.meta.url), 'utf8'));
const names = new Set(tools.map(tool => tool.name));
const statusTool = {
  name: '100x_connection_status', description: '检查本机 100x 连接是否已配置，不生成、不扣积分、不输出访问令牌。',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
};
function output(id, result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n'); }
function rpcError(id, code, message) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n'); }
function toolResult(value, isError = false) { return { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value, ...(isError ? { isError: true } : {}) }; }
async function handle(line) {
  let message;
  try { message = JSON.parse(line); } catch { return rpcError(null, -32700, 'Invalid JSON'); }
  const { id, method, params } = message || {};
  if (id === undefined) return;
  if (message.jsonrpc !== '2.0' || !['string', 'number'].includes(typeof id)) return rpcError(id ?? null, -32600, 'Invalid request');
  if (method === 'initialize') return output(id, {
    protocolVersion: ['2025-03-26', '2025-06-18', '2024-11-05'].includes(params?.protocolVersion) ? params.protocolVersion : '2025-03-26',
    capabilities: { tools: {} }, serverInfo: { name: '100x', version: '0.2.0' },
    instructions: '使用 100x 工具查型号、先报价并遵守用户预算。生成是异步任务，按 poll_after_ms 查询。令牌不进入对话。',
  });
  if (method === 'ping') return output(id, {});
  if (method === 'tools/list') return output(id, { tools: [statusTool, ...tools] });
  if (method !== 'tools/call') return rpcError(id, -32601, 'Method not found');
  if (params?.name !== statusTool.name && !names.has(params?.name)) return rpcError(id, -32602, 'Unknown 100x tool');
  try {
    const connection = await readConnection();
    if (params.name === statusTool.name) return output(id, toolResult({ configured: true, endpoint: connection.url, connection_checked: false, note: '凭据已配置；调用型号或余额工具验证服务连接。' }));
    const result = await request(connection, { jsonrpc: '2.0', id, method: 'tools/call', params: { name: params.name, arguments: params.arguments || {} } });
    output(id, result);
  } catch (error) {
    output(id, toolResult({ error: { code: error instanceof ConnectionError ? error.code : '100X_CLIENT_ERROR', message: error instanceof ConnectionError ? error.message : '100x 客户端未能完成请求。' } }, true));
  }
}
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of lines) {
  if (Buffer.byteLength(line) > 29 * 1024 * 1024) { rpcError(null, -32600, 'Request too large'); continue; }
  // Independent queries may overlap. Paid requests are never retried here.
  void handle(line).catch(() => rpcError(null, -32603, '100x client error'));
}
