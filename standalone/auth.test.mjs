import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createFolioServer } from './server.mjs';

test('independent accounts, private workspaces, and session protections',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'folio-auth-test-')),dbPath=join(directory,'test.sqlite'),origin='http://127.0.0.1:4188';
  let server;const identities=new Map();
  async function start(){server=await createFolioServer({dbPath,origin});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));}
  async function stop(){await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
  async function call(path,{method='GET',data,cookie,identity=identities.get(cookie),requestOrigin=origin}={}){
    const response=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{method,redirect:'manual',headers:{...(data!==undefined?{'Content-Type':'application/json',Origin:requestOrigin}:{}),...(cookie?{Cookie:cookie}:{}),...(identity?{'X-Folio-User':identity}:{})},body:data!==undefined?JSON.stringify(data):undefined});
    const text=await response.text(),result={status:response.status,headers:response.headers,text,json:response.headers.get('content-type')?.includes('application/json')?JSON.parse(text):null,cookie:response.headers.get('set-cookie')?.split(';')[0]};
    if(result.cookie&&result.json?.user)identities.set(result.cookie,result.json.user.id);return result;
  }
  try{
    await start();
    assert.equal((await call('/')).headers.get('location'),'/login');
    for(const path of ['/api/state','/bootstrap.js','/api/rates','/app.js'])assert.equal((await call(path)).status,401);
    assert.equal((await call('/register')).status,200);
    assert.equal((await call('/api/auth/register',{method:'POST',data:{email:'a@example.test',name:'A',password:'long test password'},requestOrigin:'https://other.example'})).status,403);
    assert.equal((await call('/api/auth/register',{method:'POST',data:{email:'a@example.test',name:'A',password:'short'}})).status,400);
    assert.equal((await call('/api/auth/login',{method:'POST',data:null})).status,400);
    const alice=await call('/api/auth/register',{method:'POST',data:{email:'Alice@Example.test ',name:'Alice',password:'Alice test passphrase 123'}});
    assert.equal(alice.status,201);assert.equal(alice.json.user.email,'alice@example.test');assert.ok(alice.cookie);assert.match(alice.headers.get('set-cookie'),/HttpOnly/);assert.match(alice.headers.get('set-cookie'),/SameSite=Lax/);
    assert.deepEqual(Object.keys(alice.json.user).sort(),['email','id','name']);
    const bob=await call('/api/auth/register',{method:'POST',data:{email:'bob@example.test',name:'<img src=x onerror=alert(1)>',password:'Bob test passphrase 123'}});assert.equal(bob.status,201);
    const duplicate=await call('/api/auth/register',{method:'POST',data:{email:'ALICE@example.test',name:'Fake Alice',password:'Another passphrase 123'}});assert.equal(duplicate.status,409);
    const inspect=new DatabaseSync(dbPath);
    const stored=inspect.prepare('SELECT * FROM app_users WHERE id=?').get(alice.json.user.id);
    assert.notEqual(stored.password_hash,'Alice test passphrase 123');assert.equal(stored.password_hash.length,128);assert.equal(stored.salt.length,32);
    assert.equal(inspect.prepare('SELECT token_hash FROM app_sessions WHERE user_id=?').get(stored.id).token_hash.length,64);
    const initial=await call('/api/state',{cookie:alice.cookie});assert.equal(initial.json.state.demo,false);assert.equal(initial.json.state.accounts.length,0);
    const finance=initial.json.state;finance.accounts.push({id:'private-alice',type:'bank',name:'Alice private bank',institution:'Test',balance:12345,currency:'USD'});
    const saved=await call('/api/state',{method:'PUT',cookie:alice.cookie,data:{state:finance,revision:initial.json.revision,userId:bob.json.user.id}});assert.equal(saved.status,200);
    assert.equal((await call('/api/state',{cookie:bob.cookie})).json.state.accounts.length,0);
    assert.equal((await call('/api/state?userId='+alice.json.user.id,{cookie:bob.cookie})).json.state.accounts.length,0);
    assert.equal((await call('/api/state',{method:'PUT',cookie:bob.cookie,identity:alice.json.user.id,data:{state:finance,revision:1}})).status,401,'Old Alice tab cannot write into Bob after an account switch');
    assert.equal((await call('/api/state',{cookie:alice.cookie})).json.state.accounts[0].balance,12345);
    assert.equal((await call('/api/state',{method:'PUT',cookie:alice.cookie,data:{state:finance,revision:initial.json.revision}})).status,409);
    assert.equal((await call('/api/state',{method:'PUT',cookie:alice.cookie,requestOrigin:'https://evil.example',data:{state:finance,revision:saved.json.revision}})).status,403);
    const script=await call('/bootstrap.js',{cookie:bob.cookie});assert.ok(script.text.includes('\\u003cimg'));assert.ok(!script.text.includes('Alice private bank'));assert.ok(!script.text.includes('<img'));
    const app=await call('/app.js',{cookie:alice.cookie});assert.ok(app.text.includes('state=validate(window.folioBootstrap.state)'));assert.ok(!app.text.includes("localStorage.getItem('folio-finance-v1')"));assert.ok(!app.text.includes("localStorage.setItem('folio-finance-v1'"));
    const shell=await call('/',{cookie:alice.cookie});assert.ok(shell.text.includes('workspace.js'));assert.ok(!shell.text.includes('src="database.js"'));
    assert.match(shell.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.equal(shell.headers.get('cache-control'),'no-store');
    assert.equal((await call('/api/auth/login',{method:'POST',data:{email:'alice@example.test',password:'incorrect password'}})).status,401);
    const loggedIn=await call('/api/auth/login',{method:'POST',data:{email:'alice@example.test',password:'Alice test passphrase 123'}});assert.equal(loggedIn.status,200);assert.notEqual(loggedIn.cookie,alice.cookie);
    assert.equal((await call('/api/auth/logout',{method:'POST',cookie:loggedIn.cookie,data:{}})).status,200);
    assert.equal((await call('/api/state',{cookie:loggedIn.cookie})).status,401);
    inspect.prepare('UPDATE app_sessions SET expires_at=0 WHERE user_id=?').run(alice.json.user.id);
    assert.equal((await call('/api/state',{cookie:alice.cookie})).status,401);
    inspect.close();await stop();await start();
    assert.equal((await call('/api/auth/me',{cookie:bob.cookie})).json.user.email,'bob@example.test');
    const restored=await call('/api/auth/login',{method:'POST',data:{email:'alice@example.test',password:'Alice test passphrase 123'}});assert.equal((await call('/api/state',{cookie:restored.cookie})).json.state.accounts[0].balance,12345);
    for(let i=0;i<10;i++)await call('/api/auth/login',{method:'POST',data:{email:'nobody@example.test',password:'incorrect password'}});
    const limited=await call('/api/auth/login',{method:'POST',data:{email:'nobody@example.test',password:'incorrect password'}});assert.equal(limited.status,429);assert.equal(limited.headers.get('retry-after'),'900');
  }finally{if(server?.listening)await stop();await rm(directory,{recursive:true,force:true});}
});

test('HTTPS cookie and closed registration',async()=>{
  const server=await createFolioServer({dbPath:':memory:',origin:'https://folio.example',registrationEnabled:false});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{const response=await fetch(`http://127.0.0.1:${server.address().port}/api/auth/register`,{method:'POST',headers:{Origin:'https://folio.example','Content-Type':'application/json'},body:'{}'});assert.equal(response.status,403);assert.match(response.headers.get('strict-transport-security'),/max-age/);}finally{await new Promise(resolve=>server.close(resolve));}
  const open=await createFolioServer({dbPath:':memory:',origin:'https://folio.example'});await new Promise(resolve=>open.listen(0,'127.0.0.1',resolve));
  try{const response=await fetch(`http://127.0.0.1:${open.address().port}/api/auth/register`,{method:'POST',headers:{Origin:'https://folio.example','Content-Type':'application/json'},body:JSON.stringify({email:'secure@example.test',name:'Secure',password:'A secure test passphrase'})});assert.equal(response.status,201);assert.match(response.headers.get('set-cookie'),/^__Host-folio_session=/);assert.match(response.headers.get('set-cookie'),/; Secure/);}finally{await new Promise(resolve=>open.close(resolve));}
  await assert.rejects(()=>createFolioServer({dbPath:':memory:',origin:'http://folio.example'}),/HTTPS/);
});
