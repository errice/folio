import test from 'node:test';
import assert from 'node:assert/strict';
await import('./scram.js');
const origin=process.env.FOLIO_TEST_URL||'http://127.0.0.1:4176';
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)&&process.env.FOLIO_REMOTE_TEST!=='true')throw Error('Remote tests require explicit FOLIO_REMOTE_TEST=true. Use disposable accounts only.');
const suffix=Date.now(),password='Temporary-test-password-42',nextPassword='Replacement-test-password-43';
async function call(path,{method='GET',body,cookie,user,requestOrigin=origin}={}){
 let expectedSignature;
 if(path==='/api/auth/register'&&body?.password){const {password,...rest}=body;body={...rest,credential:await folioScram.credentials(password)};}
 if((path==='/api/auth/login'&&body?.password)||(path==='/api/account/password'&&body?.currentPassword)){
  const changing=path.endsWith('/password'),email=changing?(await call('/api/auth/me',{cookie})).data.user.email:body.email,nonce=btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24))));
  const challenge=await call('/api/auth/challenge',{method:'POST',body:{email,nonce,purpose:changing?'password':'login'},cookie,user,requestOrigin});
  if(challenge.status!==200)return challenge;
  const proof=await folioScram.proofFor(changing?body.currentPassword:body.password,challenge.data);expectedSignature=proof.serverSignature;
  body=changing?{challengeId:challenge.data.id,proof:proof.proof,credential:await folioScram.credentials(body.newPassword)}:{email,challengeId:challenge.data.id,proof:proof.proof};
 }
 const response=await fetch(origin+path,{method,redirect:'manual',headers:{...(cookie?{Cookie:cookie}:{}),...(user?{'X-Folio-User':user}:{}),...(body?{'Content-Type':'application/json',Origin:requestOrigin}:{})},body:body?JSON.stringify(body):undefined});
 const text=await response.text();let data;try{data=JSON.parse(text);}catch{data=text;}if(response.ok&&expectedSignature)assert.equal(data.serverSignature,expectedSignature);return {status:response.status,data,cookie:response.headers.get('set-cookie')?.split(';')[0],headers:response.headers};
}
test('Cloudflare accounts persist, isolate records, protect writes, and revoke old passwords and sessions',async()=>{
 const aliceEmail=`cf-qa-${suffix}-a@example.test`,bobEmail=`cf-qa-${suffix}-b@example.test`;
 assert.equal((await call('/')).status,303);
 console.log('Disposable QA accounts:',aliceEmail,bobEmail);
 const a=await call('/api/auth/register',{method:'POST',body:{email:aliceEmail,name:'Test Alice',password}});assert.equal(a.status,201,JSON.stringify(a.data));
 const b=await call('/api/auth/register',{method:'POST',body:{email:bobEmail,name:'Test Bob',password}});assert.equal(b.status,201,JSON.stringify(b.data));
 const actor={cookie:a.cookie,user:a.data.user.id};
 assert.match(a.headers.get('set-cookie'),/HttpOnly/);
 assert.match(a.headers.get('set-cookie'),/SameSite=Lax/);
 if(origin.startsWith('https:'))assert.match(a.headers.get('set-cookie'),/; Secure/);
 assert.equal((await call('/api/state')).status,401);
 assert.equal((await call('/api/state',{...actor,user:b.data.user.id})).status,401);
 const saved=await call('/api/state',actor);assert.equal(saved.status,200);assert.equal(saved.data.state.demo,false);
 const state={...saved.data.state,currency:'CAD'};
 assert.equal((await call('/api/state',{...actor,method:'PUT',body:{state,revision:1},requestOrigin:'https://attacker.test'})).status,403);
 assert.equal((await call('/api/state',{...actor,method:'PUT',body:{state,revision:1}})).status,200);
 assert.equal((await call('/api/state',{...actor,method:'PUT',body:{state,revision:1}})).status,409);
 assert.equal((await call('/api/state',{cookie:b.cookie,user:b.data.user.id})).data.state.currency,'USD');
 assert.equal((await call('/api/state',actor)).data.state.currency,'CAD');
 assert.equal((await call('/api/account/profile',{...actor,method:'PUT',body:{name:'Updated Alice'}})).data.user.name,'Updated Alice');
 assert.equal((await call('/api/account/profile',actor)).data.user.name,'Updated Alice');
 const nonce=btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24))));
 const challenge=await call('/api/auth/challenge',{method:'POST',body:{email:aliceEmail,nonce,purpose:'login'}});assert.equal(challenge.status,200);
 const proof=await folioScram.proofFor(password,challenge.data),loginBody={email:aliceEmail,challengeId:challenge.data.id,proof:proof.proof};
 const proven=await call('/api/auth/login',{method:'POST',body:loginBody});assert.equal(proven.status,200);assert.equal(proven.data.serverSignature,proof.serverSignature);
 assert.equal((await call('/api/auth/login',{method:'POST',body:loginBody})).status,401,'A captured proof must not be replayed');
 const oldSession=await call('/api/auth/login',{method:'POST',body:{email:aliceEmail,password}});assert.equal(oldSession.status,200);
 assert.equal((await call('/api/account/password',{...actor,method:'POST',body:{currentPassword:'incorrect',newPassword:nextPassword}})).status,400);
 const changed=await call('/api/account/password',{...actor,method:'POST',body:{currentPassword:password,newPassword:nextPassword}});assert.equal(changed.status,200,JSON.stringify(changed.data));
 assert.equal((await call('/api/auth/me',{cookie:a.cookie})).status,401);
 assert.equal((await call('/api/auth/me',{cookie:oldSession.cookie})).status,401);
 assert.equal((await call('/api/auth/me',{cookie:changed.cookie})).status,200);
 assert.equal((await call('/api/auth/login',{method:'POST',body:{email:aliceEmail,password}})).status,401);
 const fresh=await call('/api/auth/login',{method:'POST',body:{email:aliceEmail,password:nextPassword}});assert.equal(fresh.status,200);
 assert.equal((await call('/api/state',{cookie:fresh.cookie,user:a.data.user.id})).data.state.currency,'CAD');
 assert.equal((await call('/api/auth/logout',{cookie:fresh.cookie,method:'POST',body:{}})).status,200);
 assert.equal((await call('/api/auth/me',{cookie:fresh.cookie})).status,401);
 assert.equal((await call('/database.js')).status,404);
 console.log('Disposable QA accounts:',aliceEmail,bobEmail);
});
