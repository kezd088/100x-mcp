import { readFile, stat, mkdir, open } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ConnectionError, readConnection } from './connection.mjs';
const [action,input,output]=process.argv.slice(2);
try {
  const connection=await readConnection();
  const base=new URL(connection.url);
  if(base.protocol!=='https:'&&!['127.0.0.1','localhost','[::1]'].includes(base.hostname))throw new Error('100x 连接必须使用 HTTPS。');
  if(action==='upload'){
    const path=resolve(input||''),info=await stat(path);
    if(!info.isFile()||!info.size||info.size>20*1024*1024)throw new Error('素材须为 0–20 MB 的非空文件。');
    const bytes=await readFile(path),head=bytes.subarray(0,16);
    // Detect image bytes: a downloaded file can have a misleading extension.
    const mime=head[0]===255&&head[1]===216&&head[2]===255?'image/jpeg':head.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':head.toString('ascii',0,4)==='RIFF'&&head.toString('ascii',8,12)==='WEBP'?'image/webp':{'.mp4':'video/mp4','.mp3':'audio/mpeg','.wav':'audio/wav'}[extname(path).toLowerCase()];
    if(!mime)throw new Error('不支持该素材格式。');
    const duration=output===undefined?undefined:Number(output);
    if(duration!==undefined&&(!Number.isFinite(duration)||duration<=0||duration>600))throw new Error('时长须为实际秒数，范围 0–600。');
    if(!mime.startsWith('image/')&&duration===undefined)throw new Error('上传视频或音频请附实际秒数。');
    const response=await fetch(new URL(base.pathname==='/api/mcp'?'/api/mcp/upload':'/upload',base),{method:'POST',redirect:'error',headers:{authorization:'Bearer '+connection.token,'content-type':'application/json'},body:JSON.stringify({content_base64:bytes.toString('base64'),mime_type:mime,duration_seconds:duration}),signal:AbortSignal.timeout(120000)});
    const result=await response.json();
    if(!response.ok)throw new Error(result.error?.message||'100x 素材上传失败。');
    if(!/^100x_asset_[a-f0-9]{32}$/.test(result.asset_id))throw new Error('100x 素材回执无效。');
    console.log(JSON.stringify({asset_id:result.asset_id,kind:result.kind,size_bytes:result.size_bytes}));
  }else if(action==='download'){
    const url=new URL(input),target=resolve(output||'');
    if(!output||url.username||url.password||url.origin!==base.origin||!(base.pathname==='/api/mcp'?/^\/api\/mcp\/media\/100x_asset_[a-f0-9]{32}$/:/^\/media\/100x_asset_[a-f0-9]{32}$/).test(url.pathname))throw new Error('请选择当前 100x 服务返回的下载链接和输出文件。');
    const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(120000)});
    if(!response.ok||!response.body)throw new Error('100x 下载失败；链接过期时请重新查询任务。');
    await mkdir(dirname(target),{recursive:true});
    const file=await open(target,'wx');
    try{await pipeline(Readable.fromWeb(response.body),file.createWriteStream());}finally{await file.close();}
    console.log(JSON.stringify({saved:target}));
  }else throw new Error('用法：media.mjs upload <文件> [秒数]，或 download <100x链接> <输出文件>。');
}catch(error){console.error(error.code==='EEXIST'?'输出文件已存在，请选择新文件名。':error instanceof ConnectionError||error.message?.startsWith('100x')||error.message?.startsWith('请')||error.message?.startsWith('用法')?error.message:'100x 素材操作失败，请检查文件和连接。');process.exitCode=1;}
