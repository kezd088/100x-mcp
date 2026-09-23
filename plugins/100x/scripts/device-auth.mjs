import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { ConnectionError, connectionPath, protect, unprotect, saveProtected, saveConnection, readConnection, validateEndpoint, request } from './connection.mjs';

const SYSTEM_NAMES = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' };

export class DeviceConnection {
  constructor(env=process.env, dependencies={}) {
    this.env=env; this.fetch=dependencies.fetch || fetch; this.save=dependencies.save || saveConnection;
    this.protection=dependencies.protection || {};
    this.pending=null; this.flight=null; this.loaded=false; this.timer=null; this.state=null;
  }
  get platform() { return this.protection.platform || process.platform; }
  pendingPath() { return connectionPath(this.env,this.platform)+'.pending'; }
  async call(url,path,{body,token}={}) {
    const base=new URL(validateEndpoint(url));
    const endpoint=new URL('/api/mcp/'+path,base);
    let response;
    try { response=await this.fetch(endpoint,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(12000),headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})}); }
    catch { throw new ConnectionError('100X_NETWORK','暂时未能连接，恢复网络后可重试。'); }
    let value; try { value=await response.json(); } catch { throw new ConnectionError('100X_PROTOCOL_ERROR','100x 服务响应无效。'); }
    if(!response.ok) throw new ConnectionError(value.code || (response.status===401?'100X_AUTH_FAILED':'100X_SERVICE_UNAVAILABLE'), response.status===401?'授权已失效，请重新连接。':'100x 暂不可用，请稍后重试。');
    return value;
  }
  async load() {
    if(this.loaded) return; this.loaded=true;
    try { const record=JSON.parse(await readFile(this.pendingPath(),'utf8')); const data=JSON.parse(await unprotect(record.cipher,this.protection)); if(data && data.deviceCode && new Date(data.expires_at).getTime()>Date.now()) { validateEndpoint(data.url); this.pending=data; } }
    catch(error) { if(error.code!=='ENOENT') this.state={status:'unavailable',message:'上次连接未恢复，请重新连接。'}; }
  }
  async persist() {
    const path=this.pendingPath();
    await saveProtected(path,{cipher:await protect(JSON.stringify(this.pending || {}),{...this.protection,platform:this.platform,env:this.env,path,scope:'pending'})},this.protection);
  }
  async connect() {
    await this.load();
    if(this.flight) return this.flight;
    this.flight=(async()=>{
      if(this.pending && Date.parse(this.pending.expires_at)>Date.now()) { this.schedule(); return this.publicState(); }
      const url=validateEndpoint(this.env.HUNDREDX_URL || 'https://100xspeed.app/api/mcp');
      const deviceCode=randomBytes(32).toString('hex');
      const result=await this.call(url,'device',{body:{device_code:deviceCode,device_name:'Codex · '+(SYSTEM_NAMES[this.platform] || this.platform)}});
      const verification=new URL(result.verification_uri);
      const local=['127.0.0.1','localhost','[::1]'].includes(new URL(url).hostname);
      if((!local && verification.origin!==new URL(url).origin) || (local && !['127.0.0.1','localhost','[::1]'].includes(verification.hostname))) throw new ConnectionError('100X_PROTOCOL_ERROR','授权页面地址无效。');
      this.pending={url,deviceCode,user_code:result.user_code,verification_uri:verification.href,expires_at:result.expires_at};
      await this.persist(); this.state={status:'waiting'}; this.schedule(); return this.publicState();
    })().finally(()=>this.flight=null);
    return this.flight;
  }
  schedule() {
    if(this.timer || !this.pending) return;
    this.timer=setTimeout(()=>{ this.timer=null; void this.advance().catch(()=>{}); },this.delay || 3100); this.timer.unref();
  }
  publicState() {
    return {...(this.state || {status:'waiting'}),...(this.pending?{user_code:this.pending.user_code,verification_uri:this.pending.verification_uri,expires_at:this.pending.expires_at,poll_after_ms:3100}:{})};
  }
  async advance() {
    if(this.advancing) return this.advancing;
    this.advancing=(async()=>{
      try {
        if(!this.pending) return;
        if(Date.parse(this.pending.expires_at)<Date.now()) { this.state={status:'expired',message:'连接已过期，请重新连接。'}; this.pending=null; await this.persist(); return; }
        const p=this.pending;
        if(!p.token) {
          const result=await this.call(p.url,'token',{body:{device_code:p.deviceCode}});
          if(result.status==='denied') { this.state={status:'denied',message:'本次授权已取消。'}; this.pending=null; await this.persist(); return; }
          if(result.status==='pending') { this.state={status:'waiting'}; return; }
          if(result.status==='connected') {
            const saved=await readConnection(this.env,this.protection); await this.call(saved.url,'connection',{token:saved.token});
            this.state={status:'connected'}; this.pending=null; await this.persist(); return;
          }
          if(result.status!=='approved' || typeof result.access_token!=='string') throw new ConnectionError('100X_PROTOCOL_ERROR','授权响应无效。');
          p.token=result.access_token; await this.persist();
        }
        this.state={status:'saving'};
        await this.save({url:p.url,token:p.token},this.env,this.protection);
        await this.call(p.url,'ack',{body:{saved:true},token:p.token});
        this.state={status:'connected'}; this.pending=null; await this.persist();
      } catch(error) {
        const code=error.code || '100X_SAVE_FAILED';
        if(['expired_token','access_denied','100X_AUTH_FAILED'].includes(code)) { this.pending=null; this.state={status:'expired',message:'授权已失效，请重新连接。'}; await this.persist(); }
        else if(code==='slow_down') this.delay=Math.min(15000,(this.delay || 3100)+3000);
        else this.state={status:code==='100X_SAVE_FAILED'?'save_error':'offline',message:error instanceof ConnectionError?error.message:'本机保存未完成，请重试。'};
      } finally { this.schedule(); }
    })().finally(()=>this.advancing=null);
    return this.advancing;
  }
  async status() {
    await this.load();
    if(this.pending) { this.schedule(); return this.publicState(); }
    if(['denied','expired'].includes(this.state?.status)) return this.publicState();
    const saved=await readConnection(this.env,this.protection);
    if(new URL(saved.url).pathname==='/mcp') { await request(saved,{jsonrpc:'2.0',id:'connection-check',method:'tools/call',params:{name:'100x_get_balance',arguments:{}}}); return {status:'connected',configured:true,connection_checked:true}; }
    const result=await this.call(saved.url,'connection',{token:saved.token});
    return {...result,configured:true,connection_checked:true};
  }
}
