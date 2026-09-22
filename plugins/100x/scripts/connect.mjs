import { DeviceConnection } from './device-auth.mjs';
import { ConnectionError } from './connection.mjs';
import { execFile } from 'node:child_process';
const connection=new DeviceConnection();
try {
  const state=await connection.connect();
  console.log('100x · 请在网页核对连接码：'+state.user_code);
  console.log(state.verification_uri);
  // Only a validated 100x / loopback URL reaches the system URL handler.
  const opener=process.platform==='win32'?['rundll32.exe',['url.dll,FileProtocolHandler',state.verification_uri]]
    :process.platform==='darwin'?['/usr/bin/open',[state.verification_uri]]:null;
  if(opener) { const child=execFile(opener[0],opener[1],{windowsHide:true},()=>{}); child.unref(); }
  while(Date.parse(state.expires_at)>Date.now()) {
    await new Promise(resolve=>setTimeout(resolve,3200));
    const result=await connection.status();
    if(result.status==='connected') { console.log('100x 已连接，凭据已在本机加密保存。'); process.exit(0); }
    if(['denied','expired'].includes(result.status)) throw new ConnectionError('100X_NOT_CONNECTED','本次连接未完成，请重新连接。');
  }
  throw new ConnectionError('100X_EXPIRED','连接已过期，请重试。');
} catch(error) { console.error(error instanceof ConnectionError?error.message:'100x 连接未完成，请稍后重试。'); process.exitCode=1; }
