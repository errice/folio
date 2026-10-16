import { randomBytes, timingSafeEqual, createHash, createHmac } from 'node:crypto';
import { validateFinance, MAX_STATE_BYTES } from '../lib/finance-store.mjs';
import { dashboard, auth, reset } from './dist/templates.mjs';
import { sendResetEmail } from './reset-mail.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const lifetime=7*24*60*60*1000;
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const safeUser=u=>({id:u.id,email:u.email,name:u.name});
const emptyWorkspace=()=>({version:2,currency:'USD',demo:false,accounts:[],transactions:[],budgets:[],categories:[{name:'Salary',type:'income',icon:'income'},{name:'Other income',type:'income',icon:'work'},{name:'Housing',type:'expense',icon:'home'},{name:'Groceries',type:'expense',icon:'groceries'},{name:'Dining',type:'expense',icon:'dining'},{name:'Shopping',type:'expense',icon:'shopping'},{name:'Transport',type:'expense',icon:'transport'},{name:'Utilities',type:'expense',icon:'utilities'},{name:'Health',type:'expense',icon:'health'},{name:'Other',type:'expense',icon:'other'}]});
const nameOf=value=>{const n=typeof value==='string'?value.trim():'';if(!n||n.length>50||/[\u0000-\u001f\u007f]/.test(n))fail(400,'Enter a name or nickname up to 50 characters.');return n;};
const mac=(key,message)=>createHmac('sha256',Buffer.from(key,'base64')).update(message).digest();
function credentialOf(value){
 if(value?.scheme!=='scram-sha-256'||value.iterations!==600000||!/^([A-Za-z0-9+/]{22}==)$/.test(value.salt)||!/^([A-Za-z0-9+/]{43}=)$/.test(value.storedKey)||!/^([A-Za-z0-9+/]{43}=)$/.test(value.serverKey))fail(400,'Invalid password verifier. Reload and try again.');
 return {scheme:value.scheme,iterations:600000,salt:value.salt,storedKey:value.storedKey,serverKey:value.serverKey};
}
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
  async function verifyProof(input,purpose,expectedUser){
   if(typeof input?.challengeId!=='string'||input.challengeId.length>50||typeof input.proof!=='string'||!/^([A-Za-z0-9+/]{43}=)$/.test(input.proof))fail(400,'Invalid sign-in proof.');
   const challenge=await stmt('DELETE FROM app_challenges WHERE id=? RETURNING *',input.challengeId).first();
   if(!challenge||challenge.expires_at<=Date.now()||challenge.purpose!==purpose||(purpose==='password'&&(challenge.user_id!==expectedUser?.id||challenge.session_hash!==hash(token||''))))fail(401,'Your sign-in challenge expired. Please try again.');
   const found=challenge.user_id?await stmt('SELECT * FROM app_users WHERE id=?',challenge.user_id).first():null;
   if(!found||found.auth_version!==challenge.auth_version)fail(purpose==='password'?400:401,purpose==='password'?'Your current password is incorrect.':'Email or password is incorrect.');
   const verifier=credentialOf(JSON.parse(found.password_hash)),message=challenge.client_first+','+challenge.server_first+',c=biws,r='+challenge.nonce;
   const signature=mac(verifier.storedKey,message),proof=Buffer.from(input.proof,'base64'),clientKey=Buffer.from(proof.map((v,i)=>v^signature[i]));
   if(!timingSafeEqual(createHash('sha256').update(clientKey).digest(),Buffer.from(verifier.storedKey,'base64')))fail(purpose==='password'?400:401,purpose==='password'?'Your current password is incorrect.':'Email or password is incorrect.');
   return {found,serverSignature:mac(verifier.serverKey,message).toString('base64')};
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
   if(path==='/forgot-password'||path==='/reset-password'){if(method!=='GET')fail(405,'Method not allowed.');return html(reset);}
   if(path==='/api/auth/password-reset/request'){
    if(method!=='POST')fail(405,'Method not allowed.');
    if(!env.EMAIL_FROM||(!env.RESEND_API_KEY&&!env.RESET_MAILER))fail(503,'Password reset emails are not available yet. Please try again later.');
    const input=await body(),email=typeof input?.email==='string'?input.email.trim().toLowerCase():'';
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)fail(400,'Enter a valid email address.');
    const ip=request.headers.get('CF-Connecting-IP')||'local';await limit('reset-ip:'+ip,10,3600000);await limit('reset-email:'+email,3,3600000);
    const found=await stmt('SELECT id,email,auth_version FROM app_users WHERE email=?',email).first();
    if(found){
     const resetToken=randomBytes(32).toString('base64url'),resetHash=hash(resetToken);
     await stmt('INSERT INTO app_password_resets(token_hash,user_id,auth_version,expires_at) VALUES(?,?,?,?)',resetHash,found.id,found.auth_version,Date.now()+900000).run();
     const resetUrl=new URL('/reset-password',origin).href+'#token='+resetToken;
     ctx.waitUntil(sendResetEmail(env,found.email,resetUrl).catch(async()=>{console.error('Folio password reset email could not be delivered.');await stmt('DELETE FROM app_password_resets WHERE token_hash=?',resetHash).run();}));
    }
    return json({message:'If an account matches that email, you’ll receive a password-reset link. Check your inbox and spam folder. The link expires in 15 minutes.'},202);
   }
   if(path==='/api/auth/password-reset/complete'){
    if(method!=='POST')fail(405,'Method not allowed.');
    await limit('reset-complete-ip:'+(request.headers.get('CF-Connecting-IP')||'local'),20,900000);
    const input=await body();if(typeof input?.token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(input.token))fail(400,'This reset link is invalid or has expired. Request a new link.');
    const resetHash=hash(input.token),record=await stmt('SELECT r.user_id,r.auth_version FROM app_password_resets r JOIN app_users u ON u.id=r.user_id AND u.auth_version=r.auth_version WHERE r.token_hash=? AND r.expires_at>?',resetHash,Date.now()).first();
    if(!record)fail(400,'This reset link is invalid or has expired. Request a new link.');
    const credential=credentialOf(input.credential),nextHash=JSON.stringify(credential);
    const results=await db.batch([
     stmt('UPDATE app_users SET password_hash=?,salt=?,auth_version=auth_version+1 WHERE id=? AND auth_version=? AND EXISTS(SELECT 1 FROM app_password_resets WHERE token_hash=? AND user_id=? AND auth_version=? AND expires_at>?)',nextHash,credential.salt,record.user_id,record.auth_version,resetHash,record.user_id,record.auth_version,Date.now()),
     stmt('DELETE FROM app_sessions WHERE user_id=? AND auth_version<>(SELECT auth_version FROM app_users WHERE id=?)',record.user_id,record.user_id),
     stmt('DELETE FROM app_password_resets WHERE user_id=? AND auth_version<=?',record.user_id,record.auth_version),
     stmt('DELETE FROM app_challenges WHERE user_id=? AND auth_version<=?',record.user_id,record.auth_version)
    ]);
    if(!results[0].meta.changes)fail(400,'This reset link is invalid or has expired. Request a new link.');setCookie('',0);return json({ok:true});
   }
   if(path==='/api/auth/challenge'){
    if(method!=='POST')fail(405,'Method not allowed.');const input=await body(),email=typeof input?.email==='string'?input.email.trim().toLowerCase():'';
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||typeof input.nonce!=='string'||!/^[A-Za-z0-9+/]{32}$/.test(input.nonce)||!['login','password'].includes(input.purpose))fail(400,'Invalid sign-in request.');
    const ip=request.headers.get('CF-Connecting-IP')||'local';await limit('challenge-ip:'+ip,40,900000);await limit('challenge-email:'+email,10,900000);
    if(input.purpose==='password'&&(!user||user.email!==email||request.headers.get('X-Folio-User')!==user.id))fail(401,'Please sign in again.');
    const found=await stmt('SELECT * FROM app_users WHERE email=?',email).first();
    const verifier=found?credentialOf(JSON.parse(found.password_hash)):null;
    const salt=verifier?.salt||randomBytes(16).toString('base64'),nonce=input.nonce+randomBytes(24).toString('base64'),id=crypto.randomUUID();
    const clientFirst='n='+email.replace(/=/g,'=3D').replace(/,/g,'=2C')+',r='+input.nonce,serverFirst=`r=${nonce},s=${salt},i=600000`;
    await stmt('INSERT INTO app_challenges(id,user_id,auth_version,purpose,session_hash,client_first,server_first,nonce,expires_at) VALUES(?,?,?,?,?,?,?,?,?)',id,found?.id||null,found?.auth_version||0,input.purpose,input.purpose==='password'?hash(token):'',clientFirst,serverFirst,nonce,Date.now()+120000).run();
    return json({id,salt,nonce,iterations:600000,clientFirst,serverFirst});
   }
   if(path==='/api/auth/register'||path==='/api/auth/login'){
    if(method!=='POST')fail(405,'Method not allowed.');
    const registering=path.endsWith('register');if(registering&&env.ALLOW_REGISTRATION==='false')fail(403,'New registrations are currently closed.');
    // CF-Connecting-IP is supplied by Cloudflare, not a client forwarding header.
    const ip=request.headers.get('CF-Connecting-IP')||'local';await limit('ip:'+ip,40,900000);if(registering)await limit('register:'+ip,5,3600000);
    const input=await body(),email=typeof input?.email==='string'?input.email.trim().toLowerCase():'';
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)fail(400,'Enter a valid email address.');
    await limit('email:'+email,10,900000);
    if(registering){
     const name=nameOf(input.name),credential=credentialOf(input.credential),salt=credential.salt,password_hash=JSON.stringify(credential),id=crypto.randomUUID(),now=new Date().toISOString();
     try{await db.batch([stmt('INSERT INTO app_users(id,email,name,password_hash,salt,created_at) VALUES(?,?,?,?,?,?)',id,email,name,password_hash,salt,now),stmt('INSERT INTO app_workspaces(user_id,data_json,revision,updated_at) VALUES(?,?,1,?)',id,validateFinance(emptyWorkspace()),now)]);}catch(error){if(/UNIQUE/.test(error.message))fail(409,'Unable to create this account. Try signing in with this email.');throw error;}
     await newSession({id},password_hash);return json({user:{id,email,name}},201);
    }
    const {found,serverSignature}=await verifyProof(input,'login');if(found.email!==email)fail(401,'Email or password is incorrect.');
    await newSession(found,found.password_hash);return json({user:safeUser(found),serverSignature});
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
    const {found,serverSignature}=await verifyProof(input,'password',user),credential=credentialOf(input.credential);
    const salt=credential.salt,nextHash=JSON.stringify(credential),next=randomBytes(32).toString('base64url');
    const results=await db.batch([
     stmt('UPDATE app_users SET password_hash=?,salt=?,auth_version=auth_version+1 WHERE id=? AND password_hash=? AND auth_version=?',nextHash,salt,user.id,found.password_hash,found.auth_version),
     stmt('INSERT INTO app_sessions(token_hash,user_id,auth_version,expires_at) SELECT ?,id,auth_version,? FROM app_users WHERE id=? AND password_hash=? AND auth_version=?',hash(next),Date.now()+lifetime,user.id,nextHash,found.auth_version+1),
     stmt('DELETE FROM app_sessions WHERE user_id=? AND auth_version<>(SELECT auth_version FROM app_users WHERE id=?)',user.id,user.id)
    ]);
    if(!results[0].meta.changes)fail(409,'Your password changed in another session. Sign in again.');setCookie(next);return json({ok:true,user:safeUser(user),serverSignature});
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
  }catch(error){const status=error.status||500;if(status===500)console.error('Folio runtime failure:',error.name,String(error.message).slice(0,250));if(status===429)headers.set('Retry-After','900');return json({error:status===500?'Something went wrong. Please try again.':error.message},status);}
 },
 async scheduled(event,env){await env.DB.batch([env.DB.prepare('DELETE FROM app_sessions WHERE expires_at<=?').bind(Date.now()),env.DB.prepare('DELETE FROM app_attempts WHERE expires_at<=?').bind(Date.now()),env.DB.prepare('DELETE FROM app_challenges WHERE expires_at<=?').bind(Date.now()),env.DB.prepare('DELETE FROM app_password_resets WHERE expires_at<=?').bind(Date.now())]);}
};
