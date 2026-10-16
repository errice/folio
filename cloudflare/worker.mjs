import { pbkdf2, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { validateFinance, MAX_STATE_BYTES } from '../lib/finance-store.mjs';
import { dashboard, auth } from './dist/templates.mjs';

const derive=promisify(pbkdf2),hash=value=>createHash('sha256').update(value).digest('hex');
const lifetime=7*24*60*60*1000,iterations=600000;
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const safeUser=u=>({id:u.id,email:u.email,name:u.name});
const emptyWorkspace=()=>({version:2,currency:'USD',demo:false,accounts:[],transactions:[],budgets:[],categories:[{name:'Salary',type:'income',icon:'income'},{name:'Other income',type:'income',icon:'work'},{name:'Housing',type:'expense',icon:'home'},{name:'Groceries',type:'expense',icon:'groceries'},{name:'Dining',type:'expense',icon:'dining'},{name:'Shopping',type:'expense',icon:'shopping'},{name:'Transport',type:'expense',icon:'transport'},{name:'Utilities',type:'expense',icon:'utilities'},{name:'Health',type:'expense',icon:'health'},{name:'Other',type:'expense',icon:'other'}]});
const nameOf=value=>{const n=typeof value==='string'?value.trim():'';if(!n||n.length>50||/[\u0000-\u001f\u007f]/.test(n))fail(400,'Enter a name or nickname up to 50 characters.');return n;};
const passwordHash=(password,salt)=>derive(password,salt,iterations,32,'sha256');
let ratesCache=null,ratesPending=null;

export default {
 async fetch(request,env,ctx){
  const headers=new Headers({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});
  const url=new URL(request.url),path=url.pathname,method=request.method;
  if(url.protocol==='https:')headers.set('Strict-Transport-Security','max-age=31536000');
  const cookieName=url.protocol==='https:'?'__Host-folio_session':'folio_session';
  const token=(request.headers.get('cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='))?.slice(cookieName.length+1);
  const db=env.DB;
  const stmt=(sql,...args)=>db.prepare(sql).bind(...args);
  const json=(data,status=200)=>{headers.set('Content-Type','application/json; charset=utf-8');return new Response(JSON.stringify(data),{status,headers});};
  const html=text=>{headers.set('Content-Type','text/html; charset=utf-8');return new Response(text,{headers});};
  const redirect=to=>{headers.set('Location',to);return new Response(null,{status:303,headers});};
  function setCookie(value,maxAge=lifetime/1000){headers.set('Set-Cookie',`${cookieName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${url.protocol==='https:'?'; Secure':''}`);}
  async function body(max=16384){
   if(!request.headers.get('content-type')?.startsWith('application/json'))fail(415,'Expected JSON.');
   if(Number(request.headers.get('content-length')||0)>max)fail(413,'Request is too large.');
   const reader=request.body?.getReader();if(!reader)fail(400,'Invalid request.');
   const chunks=[];let size=0;
   while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();fail(413,'Request is too large.');}chunks.push(value);}
   const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
   try{return JSON.parse(new TextDecoder().decode(bytes));}catch{fail(400,'Invalid request.');}
  }
  async function limit(key,max,windowMs){
   const now=Date.now();const row=await stmt('INSERT INTO app_attempts(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END,expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING count',hash(key),now+windowMs,now,now).first();
   if(row.count>max)fail(429,'Too many attempts. Please try again later.');
  }
  async function workspace(id){const row=await stmt('SELECT data_json,revision,updated_at FROM app_workspaces WHERE user_id=?',id).first();if(!row)fail(500,'Workspace unavailable.');return {state:JSON.parse(row.data_json),revision:row.revision,updatedAt:row.updated_at};}
  const revoke=()=>token?stmt('DELETE FROM app_sessions WHERE token_hash=?',hash(token)).run():Promise.resolve();
  async function newSession(user,expectedHash){
   const next=randomBytes(32).toString('base64url');
   const result=await db.batch([
    stmt('DELETE FROM app_sessions WHERE token_hash=?',hash(token||'')),
    stmt('INSERT INTO app_sessions(token_hash,user_id,auth_version,expires_at) SELECT ?,id,auth_version,? FROM app_users WHERE id=? AND password_hash=?',hash(next),Date.now()+lifetime,user.id,expectedHash)
   ]);
   if(!result[1].meta.changes)fail(401,'Your password changed. Sign in again.');setCookie(next);
  }
  try{
   if(!['GET','POST','PUT','HEAD'].includes(method))fail(405,'Method not allowed.');
   // PUBLIC_ORIGIN pins the deployment; same-origin protection also covers preview hosts.
   const origin=env.PUBLIC_ORIGIN||url.origin;
   if(['POST','PUT'].includes(method)&&(url.origin!==origin||request.headers.get('origin')!==origin||request.headers.get('sec-fetch-site')==='cross-site'))fail(403,'This request is not allowed.');
   if(path==='/healthz'){if(method!=='GET')fail(405,'Method not allowed.');return json({ok:true});}
   if(/^\/[a-zA-Z0-9-]+\.(css|js|svg|png)$/.test(path)&&!['/bootstrap.js','/app.js','/workspace.js'].includes(path)){
    if(!['GET','HEAD'].includes(method)||['/database.js','/account.js'].includes(path))fail(404,'Not found.');
    const asset=await env.ASSETS.fetch(request);const merged=new Headers(asset.headers);for(const [key,value] of headers)merged.set(key,value);return new Response(asset.body,{status:asset.status,headers:merged});
   }
   if(!db)fail(503,'Database setup is not complete.');
   const user=token&&/^[A-Za-z0-9_-]{43}$/.test(token)?await stmt('SELECT u.id,u.email,u.name,u.auth_version FROM app_sessions s JOIN app_users u ON u.id=s.user_id AND u.auth_version=s.auth_version WHERE s.token_hash=? AND s.expires_at>?',hash(token),Date.now()).first():null;
   if(path==='/api/auth/register'||path==='/api/auth/login'){
    if(method!=='POST')fail(405,'Method not allowed.');
    const registering=path.endsWith('register');if(registering&&env.ALLOW_REGISTRATION==='false')fail(403,'New registrations are currently closed.');
    // CF-Connecting-IP is supplied by Cloudflare, not a client forwarding header.
    const ip=request.headers.get('CF-Connecting-IP')||'local';await limit('ip:'+ip,40,900000);if(registering)await limit('register:'+ip,5,3600000);
    const input=await body(),email=typeof input?.email==='string'?input.email.trim().toLowerCase():'';
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)fail(400,'Enter a valid email address.');
    if(typeof input.password!=='string'||input.password.length>128||input.password.length<(registering?12:1))fail(400,registering?'Use a password between 12 and 128 characters.':'Email or password is incorrect.');
    await limit('email:'+email,10,900000);
    if(registering){
     const name=nameOf(input.name),salt=randomBytes(16).toString('hex'),password_hash=(await passwordHash(input.password,salt)).toString('hex'),id=crypto.randomUUID(),now=new Date().toISOString();
     try{await db.batch([stmt('INSERT INTO app_users(id,email,name,password_hash,salt,created_at) VALUES(?,?,?,?,?,?)',id,email,name,password_hash,salt,now),stmt('INSERT INTO app_workspaces(user_id,data_json,revision,updated_at) VALUES(?,?,1,?)',id,validateFinance(emptyWorkspace()),now)]);}catch(error){if(/UNIQUE/.test(error.message))fail(409,'Unable to create this account. Try signing in with this email.');throw error;}
     await newSession({id},password_hash);return json({user:{id,email,name}},201);
    }
    const found=await stmt('SELECT * FROM app_users WHERE email=?',email).first();
    const candidate=await passwordHash(input.password,found?.salt||'00000000000000000000000000000000');
    if(!found||!timingSafeEqual(candidate,Buffer.from(found.password_hash,'hex')))fail(401,'Email or password is incorrect.');
    await newSession(found,found.password_hash);return json({user:safeUser(found)});
   }
   if(path==='/api/auth/logout'){if(method!=='POST')fail(405,'Method not allowed.');await revoke();setCookie('',0);return json({ok:true});}
   if(path==='/login'||path==='/register'){if(method!=='GET')fail(405,'Method not allowed.');return user?redirect('/'):html(auth);}
   if(path==='/api/auth/me'){if(method!=='GET')fail(405,'Method not allowed.');if(!user)fail(401,'Please sign in.');return json({user:safeUser(user)});}
   if(path==='/'){if(method!=='GET')fail(405,'Method not allowed.');return user?html(dashboard):redirect('/login');}
   if(!user)fail(401,'Your session has ended. Please sign in again.');
   if(['/api/state','/api/account/profile','/api/account/password'].includes(path)&&request.headers.get('X-Folio-User')!==user.id)fail(401,'The signed-in account changed. Reload this tab before continuing.');
   if(path==='/api/account/profile'){
    if(method==='GET')return json({user:safeUser(user),canChangePassword:true});
    if(method!=='PUT')fail(405,'Method not allowed.');const name=nameOf((await body())?.name);await stmt('UPDATE app_users SET name=? WHERE id=?',name,user.id).run();return json({user:{...safeUser(user),name}});
   }
   if(path==='/api/account/password'){
    if(method!=='POST')fail(405,'Method not allowed.');await limit('password:'+user.id,6,900000);const input=await body();
    if(typeof input?.currentPassword!=='string'||!input.currentPassword||input.currentPassword.length>128)fail(400,'Enter your current password.');
    if(typeof input.newPassword!=='string'||input.newPassword.length<12||input.newPassword.length>128)fail(400,'Use a new password between 12 and 128 characters.');
    if(input.currentPassword===input.newPassword)fail(400,'Choose a password different from your current password.');
    const found=await stmt('SELECT password_hash,salt,auth_version FROM app_users WHERE id=?',user.id).first();
    if(!timingSafeEqual(await passwordHash(input.currentPassword,found.salt),Buffer.from(found.password_hash,'hex')))fail(400,'Your current password is incorrect.');
    const salt=randomBytes(16).toString('hex'),nextHash=(await passwordHash(input.newPassword,salt)).toString('hex'),next=randomBytes(32).toString('base64url');
    const results=await db.batch([
     stmt('UPDATE app_users SET password_hash=?,salt=?,auth_version=auth_version+1 WHERE id=? AND password_hash=? AND auth_version=?',nextHash,salt,user.id,found.password_hash,found.auth_version),
     stmt('INSERT INTO app_sessions(token_hash,user_id,auth_version,expires_at) SELECT ?,id,auth_version,? FROM app_users WHERE id=? AND password_hash=? AND auth_version=?',hash(next),Date.now()+lifetime,user.id,nextHash,found.auth_version+1),
     stmt('DELETE FROM app_sessions WHERE user_id=? AND auth_version<>(SELECT auth_version FROM app_users WHERE id=?)',user.id,user.id)
    ]);
    if(!results[0].meta.changes)fail(409,'Your password changed in another session. Sign in again.');setCookie(next);return json({ok:true,user:safeUser(user)});
   }
   if(path==='/api/state'){
    if(method==='GET')return json(await workspace(user.id));if(method!=='PUT')fail(405,'Method not allowed.');const input=await body(MAX_STATE_BYTES+10000);
    if(!Number.isSafeInteger(input?.revision)||input.revision<1)fail(400,'Invalid workspace revision.');let data;try{data=validateFinance(input.state);}catch(error){fail(400,error.message);}
    const now=new Date().toISOString();const saved=await stmt('UPDATE app_workspaces SET data_json=?,revision=revision+1,updated_at=? WHERE user_id=? AND revision=? RETURNING revision,updated_at',data,now,user.id,input.revision).first();
    if(!saved)fail(409,'Newer records were saved in another tab. Export your changes before loading the saved version.');return json({revision:saved.revision,updatedAt:saved.updated_at});
   }
   if(path==='/api/rates'){
    if(method!=='GET')fail(405,'Method not allowed.');
    if(!ratesCache||ratesCache.until<Date.now()){
     ratesPending??=(async()=>{const upstream=await fetch('https://api.frankfurter.dev/v2/rates?base=USD',{signal:AbortSignal.timeout(10000)});if(!upstream.ok)throw Error('Rates unavailable');const rows=await upstream.json(),rates={USD:1},dates={};if(!Array.isArray(rows))throw Error('Invalid rates');for(const row of rows)if(row.base==='USD'&&/^[A-Z]{3}$/.test(row.quote)&&Number.isFinite(row.rate)&&row.rate>0&&/^\d{4}-\d{2}-\d{2}$/.test(row.date)){rates[row.quote]=row.rate;dates[row.quote]=row.date;}if(!rates.CAD||!rates.NGN)throw Error('Missing rates');ratesCache={until:Date.now()+3600000,data:{base:'USD',rates,dates,fetchedAt:new Date().toISOString(),source:'Frankfurter',sourceUrl:'https://frankfurter.dev/'}};})().finally(()=>{ratesPending=null;});
     try{await ratesPending;}catch{fail(503,'Reference rates are temporarily unavailable.');}
    }return json(ratesCache.data);
   }
   if(path==='/bootstrap.js'){
    if(method!=='GET')fail(405,'Method not allowed.');headers.set('Content-Type','text/javascript; charset=utf-8');return new Response('window.folioBootstrap='+JSON.stringify({...await workspace(user.id),user:safeUser(user)}).replace(/</g,'\\u003c')+';',{headers});
   }
   if(['/app.js','/workspace.js'].includes(path)&&['GET','HEAD'].includes(method)){const asset=await env.ASSETS.fetch(request);const merged=new Headers(asset.headers);for(const [key,value] of headers)merged.set(key,value);return new Response(asset.body,{status:asset.status,headers:merged});}
   fail(404,'Not found.');
  }catch(error){const status=error.status||500;if(status===429)headers.set('Retry-After','900');return json({error:status===500?'Something went wrong. Please try again.':error.message},status);}
 },
 async scheduled(event,env){await env.DB.batch([env.DB.prepare('DELETE FROM app_sessions WHERE expires_at<=?').bind(Date.now()),env.DB.prepare('DELETE FROM app_attempts WHERE expires_at<=?').bind(Date.now())]);}
};
