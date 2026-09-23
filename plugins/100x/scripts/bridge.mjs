import { DeviceConnection } from './device-auth.mjs';
const deviceConnection = new DeviceConnection();
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { ConnectionError, readConnection, request } from './connection.mjs';

const tools = JSON.parse(await readFile(new URL('./tools.json', import.meta.url), 'utf8'));
const names = new Set(tools.map(tool => tool.name));
const connectTool={name:'100x_connect',description:'连接本机 Codex 与 100x。返回网页授权地址和核对码；用户确认后自动安全保存凭据，不在对话中传递令牌。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:true}};
const statusTool = {
  name: '100x_connection_status', description: '查询 100x 授权进度及真实连接状态，不生成、不扣积分、不输出访问令牌。',
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
    capabilities: { tools: {} }, serverInfo: { name: '100x', version: '0.3.1' },
    instructions: '使用 100x 工具查型号、先报价并遵守用户预算。生成是异步任务，按 poll_after_ms 查询。令牌不进入对话。',
  });
  if (method === 'ping') return output(id, {});
  if (method === 'tools/list') return output(id, { tools: [connectTool, statusTool, ...tools] });
  if (method !== 'tools/call') return rpcError(id, -32601, 'Method not found');
  if (params?.name !== connectTool.name && params?.name !== statusTool.name && !names.has(params?.name)) return rpcError(id, -32602, 'Unknown 100x tool');
  try {
    if (params.name === connectTool.name) return output(id,toolResult(await deviceConnection.connect()));
    if (params.name === statusTool.name) return output(id,toolResult(await deviceConnection.status()));
    const connection = await readConnection();
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
