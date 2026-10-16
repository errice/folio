// Run the shared account service on cPanel/Passenger with a local SQLite file.
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../cloudflare/worker.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
export async function createCpanelServer({origin=process.env.PUBLIC_ORIGIN,dbPath=process.env.DATABASE_PATH||resolve(root,'data/folio-cpanel.sqlite'),mailer}={}){
 if(!origin||new URL(origin).origin!==origin)throw Error('Set PUBLIC_ORIGIN to the public origin.');
 if(!origin.startsWith('https:')&&!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin))throw Error('Public hosting requires HTTPS.');
 if(dbPath!==':memory:')await mkdir(dirname(dbPath),{recursive:true});
 const db=new DatabaseSync(dbPath);db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
 for(const name of ['0001_accounts.sql','0002_challenges.sql','0003_password_reset.sql'])db.exec(await readFile(resolve(root,'cloudflare/migrations',name),'utf8'));
 class Statement{
  constructor(sql,args=[]){this.sql=sql;this.args=args;}
  bind(...args){return new Statement(this.sql,args);}
  first(){return Promise.resolve(db.prepare(this.sql).get(...this.args)||null);}
  run(){const r=db.prepare(this.sql).run(...this.args);return Promise.resolve({meta:{changes:Number(r.changes)}});}
 }
 const binding={prepare:sql=>new Statement(sql),batch(statements){
  // No awaits inside a transaction: another request must never enter it.
  db.exec('BEGIN IMMEDIATE');try{const results=statements.map(s=>{const r=db.prepare(s.sql).run(...s.args);return {meta:{changes:Number(r.changes)}};});db.exec('COMMIT');return Promise.resolve(results);}catch(error){db.exec('ROLLBACK');throw error;}
 }};
 const env={DB:binding,PUBLIC_ORIGIN:origin,ALLOW_REGISTRATION:process.env.ALLOW_REGISTRATION,EMAIL_FROM:process.env.EMAIL_FROM,RESEND_API_KEY:process.env.RESEND_API_KEY,RESET_MAILER:mailer,ASSETS:{async fetch(request){
  const path=new URL(request.url).pathname;
  if(!/^\/[a-zA-Z0-9-]+\.(css|js|svg|png)$/.test(path))return new Response('Not found',{status:404});
  try{const bytes=await readFile(resolve(root,'cloudflare/dist/assets',path.slice(1)));return new Response(request.method==='HEAD'?null:bytes,{headers:{'Content-Type':{'.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png'}[extname(path)]}});}catch(error){if(error.code==='ENOENT')return new Response('Not found',{status:404});throw error;}
 }}};
 const jobs=new Set();const context={waitUntil(promise){jobs.add(promise);promise.catch(()=>console.error('Folio background task failed.')).finally(()=>jobs.delete(promise));}};
 const server=createServer(async(incoming,outgoing)=>{
  try{
   // Pin URL and origin rather than trusting Host or forwarded headers.
   if(!incoming.url.startsWith('/')||incoming.url.startsWith('//')){outgoing.writeHead(400);outgoing.end();return;}
   const headers=new Headers();for(const [key,value] of Object.entries(incoming.headers))if(value!==undefined&&!['host','cf-connecting-ip','x-forwarded-for','connection','transfer-encoding'].includes(key))headers.set(key,Array.isArray(value)?value.join(', '):value);
   // Passenger may share a proxy address. A conservative shared limit is safer
   // than allowing clients to choose the rate-limit identity via HTTP headers.
   headers.set('CF-Connecting-IP',incoming.socket.remoteAddress||'local');
   const method=incoming.method||'GET';
   const request=new Request(origin+incoming.url,{method,headers,...(!['GET','HEAD'].includes(method)?{body:incoming,duplex:'half'}:{})});
   const response=await worker.fetch(request,env,context);
   outgoing.writeHead(response.status,Object.fromEntries(response.headers));
   if(method==='HEAD'||!response.body){outgoing.end();return;}
   for await(const chunk of response.body)if(!outgoing.destroyed)outgoing.write(chunk);
   outgoing.end();
  }catch{if(!outgoing.headersSent)outgoing.writeHead(500,{'Content-Type':'application/json'});outgoing.end('{"error":"Unable to complete this request."}');}
 });
 server.requestTimeout=30000;server.headersTimeout=15000;
 const cleanup=setInterval(()=>context.waitUntil(worker.scheduled(null,env)),900000);cleanup.unref();
 server.on('close',()=>{clearInterval(cleanup);Promise.allSettled([...jobs]).finally(()=>db.close());});
 return server;
}
