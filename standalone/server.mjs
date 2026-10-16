import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { readFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateFinance, MAX_STATE_BYTES } from '../lib/finance-store.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const derive=promisify(scrypt),hash=value=>createHash('sha256').update(value).digest('hex');
const passwordOptions={N:131072,r:8,p:1,maxmem:192*1024*1024};
const sessionLifetime=7*24*60*60*1000;
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const safeUser=user=>({id:user.id,email:user.email,name:user.name});
const emptyWorkspace=()=>({version:2,currency:'USD',demo:false,accounts:[],transactions:[],budgets:[],categories:[{name:'Salary',type:'income',icon:'income'},{name:'Other income',type:'income',icon:'work'},{name:'Housing',type:'expense',icon:'home'},{name:'Groceries',type:'expense',icon:'groceries'},{name:'Dining',type:'expense',icon:'dining'},{name:'Shopping',type:'expense',icon:'shopping'},{name:'Transport',type:'expense',icon:'transport'},{name:'Utilities',type:'expense',icon:'utilities'},{name:'Health',type:'expense',icon:'health'},{name:'Other',type:'expense',icon:'other'}]});
const cookies=request=>Object.fromEntries((request.headers.cookie||'').split(';').map(v=>v.trim().split('=')).filter(v=>v.length===2));

export async function createFolioServer({dbPath=resolve(root,'data/folio.sqlite'),origin='http://127.0.0.1:4175',registrationEnabled=true}={}){
  const expected=new URL(origin);
  if(expected.origin!==origin)throw Error('PUBLIC_ORIGIN must be an origin without a trailing slash or path.');
  if(expected.protocol!=='https:'&&!['127.0.0.1','localhost','[::1]'].includes(expected.hostname))throw Error('Public hosting requires an HTTPS PUBLIC_ORIGIN.');
  if(dbPath!==':memory:')await mkdir(dirname(dbPath),{recursive:true});
  const db=new DatabaseSync(dbPath);db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  // This standalone database is independent from the hosted Sites D1 database.
  db.exec(`CREATE TABLE IF NOT EXISTS app_users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,password_hash TEXT NOT NULL,salt TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS app_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS app_sessions_expiry ON app_sessions(expires_at);
    CREATE TABLE IF NOT EXISTS app_workspaces(user_id TEXT PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,data_json TEXT NOT NULL,revision INTEGER NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS app_attempts(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at INTEGER NOT NULL);`);
  const cookieName=expected.protocol==='https:'?'__Host-folio_session':'folio_session';
  let hashing=0,ratesCache=null,ratesPending=null;
  async function passwordHash(password,salt){
    if(hashing>=2)fail(503,'Sign-in is busy. Please try again shortly.');
    hashing++;try{return await derive(password,salt,64,passwordOptions);}finally{hashing--;}
  }
  function limit(key,max,windowMs){
    const now=Date.now();
    const row=db.prepare('INSERT INTO app_attempts(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END,expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING count').get(hash(key),now+windowMs,now,now);
    if(row.count>max)fail(429,'Too many attempts. Please try again later.');
  }
  function session(request){
    const token=cookies(request)[cookieName];if(!token||!/^[A-Za-z0-9_-]{43}$/.test(token))return null;
    return db.prepare('SELECT u.id,u.email,u.name FROM app_sessions s JOIN app_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').get(hash(token),Date.now())||null;
  }
  function revoke(request){const token=cookies(request)[cookieName];if(token)db.prepare('DELETE FROM app_sessions WHERE token_hash=?').run(hash(token));}
  function setSession(request,response,userId){
    revoke(request);const token=randomBytes(32).toString('base64url');
    db.prepare('INSERT INTO app_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(hash(token),userId,Date.now()+sessionLifetime);
    response.setHeader('Set-Cookie',`${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionLifetime/1000}${expected.protocol==='https:'?'; Secure':''}`);
  }
  function workspace(userId){const row=db.prepare('SELECT data_json,revision,updated_at FROM app_workspaces WHERE user_id=?').get(userId);return {state:JSON.parse(row.data_json),revision:row.revision,updatedAt:row.updated_at};}
  async function body(request,max=16384){
    if(!request.headers['content-type']?.startsWith('application/json'))fail(415,'Expected JSON.');
    if(Number(request.headers['content-length']||0)>max)fail(413,'Request is too large.');
    const chunks=[];let size=0;for await(const chunk of request){size+=chunk.length;if(size>max)fail(413,'Request is too large.');chunks.push(chunk);}
    try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail(400,'Invalid request.');}
  }
  function json(response,data,status=200){response.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});response.end(JSON.stringify(data));}
  function redirect(response,path){response.writeHead(303,{Location:path});response.end();}
  const template=await readFile(resolve(root,'app/frontend.html'),'utf8');
  let appCode=await readFile(resolve(root,'public/app.js'),'utf8');
  const initial="try{const raw=localStorage.getItem('folio-finance-v1');state=raw?validate(JSON.parse(raw)):sample();}catch{state=sample();}";
  if(!appCode.includes(initial))throw Error('Dashboard initialization changed; update the standalone adapter before starting.');
  appCode=appCode.replace(initial,'state=validate(window.folioBootstrap.state);').replace("localStorage.setItem('folio-finance-v1',JSON.stringify(state));",'');
  const dashboard=template.replace('<script src="app.js" defer>','<script src="/bootstrap.js" defer></script><script src="app.js" defer>').replace('src="database.js"','src="workspace.js"').replace('</head>','<link rel="stylesheet" href="/auth.css"></head>');
  const server=createServer(async(request,response)=>{
    response.setHeader('Cache-Control','no-store');response.setHeader('X-Content-Type-Options','nosniff');response.setHeader('Referrer-Policy','same-origin');response.setHeader('X-Frame-Options','DENY');
    response.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    if(expected.protocol==='https:')response.setHeader('Strict-Transport-Security','max-age=31536000');
    try{
      const url=new URL(request.url,origin),path=url.pathname,method=request.method,user=session(request);
      if(!['GET','POST','PUT','HEAD'].includes(method))fail(405,'Method not allowed.');
      if(['POST','PUT'].includes(method)&&(request.headers.origin!==origin||request.headers['sec-fetch-site']==='cross-site'))fail(403,'This request is not allowed.');
      if(path==='/healthz'){if(method!=='GET')fail(405,'Method not allowed.');return json(response,{ok:true});}
      if(path==='/api/auth/register'||path==='/api/auth/login'){
        if(method!=='POST')fail(405,'Method not allowed.');
        const registering=path.endsWith('register');if(registering&&!registrationEnabled)fail(403,'New registrations are currently closed.');
        // Do not trust X-Forwarded-For; a public proxy shares the conservative IP limit.
        const ip=request.socket.remoteAddress||'unknown';limit('ip:'+ip,40,15*60*1000);
        if(registering)limit('register:'+ip,5,60*60*1000);
        const input=await body(request),email=typeof input?.email==='string'?input.email.trim().toLowerCase():'';
        if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)fail(400,'Enter a valid email address.');
        if(typeof input?.password!=='string'||input.password.length>128||input.password.length<(registering?12:1))fail(400,registering?'Use a password between 12 and 128 characters.':'Email or password is incorrect.');
        limit('email:'+email,10,15*60*1000);
        if(registering){
          const name=typeof input.name==='string'?input.name.trim():'';
          if(!name||name.length>50||/[\u0000-\u001f\u007f]/.test(name))fail(400,'Enter a name or nickname up to 50 characters.');
          const salt=randomBytes(16).toString('hex'),password_hash=(await passwordHash(input.password,salt)).toString('hex'),id=randomUUID(),now=new Date().toISOString();
          db.exec('BEGIN IMMEDIATE');
          try{db.prepare('INSERT INTO app_users(id,email,name,password_hash,salt,created_at) VALUES(?,?,?,?,?,?)').run(id,email,name,password_hash,salt,now);db.prepare('INSERT INTO app_workspaces(user_id,data_json,revision,updated_at) VALUES(?,?,1,?)').run(id,validateFinance(emptyWorkspace()),now);db.exec('COMMIT');}
          catch(error){db.exec('ROLLBACK');if(String(error.message).includes('UNIQUE'))fail(409,'Unable to create this account. Try signing in with this email.');throw error;}
          setSession(request,response,id);return json(response,{user:{id,email,name}},201);
        }
        const found=db.prepare('SELECT * FROM app_users WHERE email=?').get(email);
        const candidate=await passwordHash(input.password,found?.salt||'00000000000000000000000000000000');
        if(!found||!timingSafeEqual(candidate,Buffer.from(found.password_hash,'hex')))fail(401,'Email or password is incorrect.');
        setSession(request,response,found.id);return json(response,{user:safeUser(found)});
      }
      if(path==='/api/auth/logout'){
        if(method!=='POST')fail(405,'Method not allowed.');revoke(request);
        response.setHeader('Set-Cookie',`${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${expected.protocol==='https:'?'; Secure':''}`);return json(response,{ok:true});
      }
      if(path==='/login'||path==='/register'){
        if(method!=='GET')fail(405,'Method not allowed.');if(user)return redirect(response,'/');
        response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return response.end(await readFile(resolve(root,'standalone/auth.html')));
      }
      if(path==='/api/auth/me'){if(method!=='GET')fail(405,'Method not allowed.');if(!user)fail(401,'Please sign in.');return json(response,{user:safeUser(user)});}
      if(path==='/api/state'){
        if(!user)fail(401,'Your session has ended. Please sign in again.');
        if(request.headers['x-folio-user']!==user.id)fail(401,'The signed-in account changed. Reload this tab before continuing.');
        if(method==='GET')return json(response,workspace(user.id));
        if(method!=='PUT')fail(405,'Method not allowed.');
        const input=await body(request,MAX_STATE_BYTES+10000);
        if(!Number.isSafeInteger(input?.revision)||input.revision<1)fail(400,'Invalid workspace revision.');
        let data;try{data=validateFinance(input.state);}catch(error){fail(400,error.message);}
        const now=new Date().toISOString();const saved=db.prepare('UPDATE app_workspaces SET data_json=?,revision=revision+1,updated_at=? WHERE user_id=? AND revision=? RETURNING revision,updated_at').get(data,now,user.id,input.revision);
        if(!saved)fail(409,'Newer records were saved in another tab. Export your changes before loading the saved version.');
        return json(response,{revision:saved.revision,updatedAt:saved.updated_at});
      }
      if(path==='/api/rates'){
        if(method!=='GET')fail(405,'Method not allowed.');if(!user)fail(401,'Please sign in.');
        if(!ratesCache||ratesCache.until<Date.now()){
          ratesPending??=(async()=>{const upstream=await fetch('https://api.frankfurter.dev/v2/rates?base=USD',{signal:AbortSignal.timeout(10000)});if(!upstream.ok)throw Error('Rates unavailable');const rows=await upstream.json(),rates={USD:1},dates={};if(!Array.isArray(rows))throw Error('Invalid rates');for(const row of rows)if(row.base==='USD'&&/^[A-Z]{3}$/.test(row.quote)&&Number.isFinite(row.rate)&&row.rate>0&&/^\d{4}-\d{2}-\d{2}$/.test(row.date)){rates[row.quote]=row.rate;dates[row.quote]=row.date;}if(!rates.CAD||!rates.NGN)throw Error('Missing rates');ratesCache={until:Date.now()+3600000,data:{base:'USD',rates,dates,fetchedAt:new Date().toISOString(),source:'Frankfurter',sourceUrl:'https://frankfurter.dev/'}};})().finally(()=>{ratesPending=null;});
          try{await ratesPending;}catch{fail(503,'Reference rates are temporarily unavailable.');}
        }
        return json(response,ratesCache.data);
      }
      if(path==='/bootstrap.js'){
        if(method!=='GET')fail(405,'Method not allowed.');if(!user)fail(401,'Please sign in.');
        response.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});return response.end('window.folioBootstrap='+JSON.stringify({...workspace(user.id),user:safeUser(user)}).replace(/</g,'\\u003c')+';');
      }
      if(path==='/'){
        if(method!=='GET')fail(405,'Method not allowed.');if(!user)return redirect(response,'/login');
        response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return response.end(dashboard);
      }
      if(path.startsWith('/api/'))fail(404,'Not found.');
      if(!['GET','HEAD'].includes(method))fail(405,'Method not allowed.');
      if(!/^\/[a-zA-Z0-9-]+\.(css|js|svg|png)$/.test(path)||path==='/database.js')fail(404,'Not found.');
      const name=path.slice(1),own=['auth.css','auth.js','workspace.js'].includes(name);
      if(['workspace.js','app.js'].includes(name)&&!user)fail(401,'Please sign in.');
      const content=name==='app.js'?appCode:await readFile(resolve(root,own?'standalone':'public',name));
      response.writeHead(200,{'Content-Type':{'.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png'}[extname(name)]});response.end(method==='HEAD'?undefined:content);
    }catch(error){
      if(response.headersSent){response.destroy();return;}
      const status=error.status||(error.code==='ENOENT'?404:500);
      if(status===429)response.setHeader('Retry-After','900');
      json(response,{error:status===500?'Something went wrong. Please try again.':error.message},status);
    }
  });
  server.requestTimeout=30000;server.headersTimeout=15000;
  const cleanup=setInterval(()=>{db.prepare('DELETE FROM app_sessions WHERE expires_at<=?').run(Date.now());db.prepare('DELETE FROM app_attempts WHERE expires_at<=?').run(Date.now());},15*60*1000);cleanup.unref();
  server.on('close',()=>{clearInterval(cleanup);db.close();});
  return server;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const port=Number(process.env.PORT||4175),host=process.env.HOST||'127.0.0.1';
  if(process.env.NODE_ENV==='production'&&!process.env.PUBLIC_ORIGIN?.startsWith('https://'))throw Error('Set PUBLIC_ORIGIN to your public HTTPS URL before production hosting.');
  const origin=process.env.PUBLIC_ORIGIN||`http://127.0.0.1:${port}`;
  const server=await createFolioServer({dbPath:process.env.DATABASE_PATH||resolve(root,'data/folio.sqlite'),origin,registrationEnabled:process.env.ALLOW_REGISTRATION!=='false'});
  server.listen(port,host,()=>console.log(`Folio email/password edition: ${origin}`));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
}
