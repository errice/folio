import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import worker from './worker.mjs';
await import('./scram.js');

test('email reset links are private, single use, expire, preserve finances, and revoke sessions',async()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 for(const name of ['0001_accounts.sql','0002_challenges.sql','0003_password_reset.sql'])db.exec(readFileSync(new URL('./migrations/'+name,import.meta.url),'utf8'));
 class Statement{
  constructor(sql,args=[]){this.sql=sql;this.args=args;}bind(...args){return new Statement(this.sql,args);}
  async first(){return db.prepare(this.sql).get(...this.args)||null;}
  async run(){const r=db.prepare(this.sql).run(...this.args);return {meta:{changes:Number(r.changes)}};}
 }
 const binding={prepare:sql=>new Statement(sql),async batch(statements){db.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());db.exec('COMMIT');return results;}catch(error){db.exec('ROLLBACK');throw error;}}};
 const inbox=[],jobs=[],origin='https://folio.example.test',env={DB:binding,PUBLIC_ORIGIN:origin,EMAIL_FROM:'Folio <noreply@folio.example.test>',RESET_MAILER:{async send(message){inbox.push(message);}}};
 async function call(path,{body,cookie,user,customEnv=env,requestOrigin=origin}={}){
  const request=new Request(origin+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json',Origin:requestOrigin}:{}),...(cookie?{Cookie:cookie}:{}),...(user?{'X-Folio-User':user}:{})},body:body?JSON.stringify(body):undefined});
  const response=await worker.fetch(request,customEnv,{waitUntil:promise=>jobs.push(promise)});await Promise.all(jobs.splice(0));let data;try{data=await response.json();}catch{}return {status:response.status,data,cookie:response.headers.get('set-cookie')?.split(';')[0]};
 }
 async function login(password){const nonce=btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24)))),c=await call('/api/auth/challenge',{body:{email:'reset-qa@example.test',nonce,purpose:'login'}}),p=await folioScram.proofFor(password,c.data);return call('/api/auth/login',{body:{email:'reset-qa@example.test',challengeId:c.data.id,proof:p.proof}});}
 const oldPassword='Temporary-original-password-42',newPassword='Temporary-replacement-password-43';
 const registered=await call('/api/auth/register',{body:{email:'reset-qa@example.test',name:'Reset QA',credential:await folioScram.credentials(oldPassword)}});assert.equal(registered.status,201);
 const id=registered.data.user.id;const before=db.prepare('SELECT data_json FROM app_workspaces WHERE user_id=?').get(id).data_json;
 assert.equal((await call('/api/auth/password-reset/request',{body:{email:'reset-qa@example.test'},customEnv:{...env,EMAIL_FROM:undefined,RESET_MAILER:undefined}})).status,503);
 const requested=await call('/api/auth/password-reset/request',{body:{email:'reset-qa@example.test'}});assert.equal(requested.status,202);assert.equal(inbox.length,1);
 assert.equal(inbox[0].from,env.EMAIL_FROM);assert.deepEqual(inbox[0].to,['reset-qa@example.test']);
 const link=inbox[0].text.match(/https:\/\/\S+/)[0],token=new URLSearchParams(new URL(link).hash.slice(1)).get('token');assert.equal(new URL(link).search,'');
 const record=db.prepare('SELECT * FROM app_password_resets WHERE user_id=?').get(id);assert.equal(record.token_hash,createHash('sha256').update(token).digest('hex'));assert.ok(record.expires_at-Date.now()<=900000);assert.ok(record.expires_at-Date.now()>890000);
 const unknown=await call('/api/auth/password-reset/request',{body:{email:'missing-qa@example.test'}});assert.equal(unknown.status,202);assert.deepEqual(unknown.data,requested.data);assert.equal(inbox.length,1);
 assert.equal((await call('/api/auth/password-reset/complete',{body:{token,credential:await folioScram.credentials(newPassword)},requestOrigin:'https://attacker.test'})).status,403);
 const credential=await folioScram.credentials(newPassword);
 assert.equal((await call('/api/auth/password-reset/complete',{body:{token,credential}})).status,200);
 assert.equal((await call('/api/auth/password-reset/complete',{body:{token,credential}})).status,400);
 assert.equal((await call('/api/auth/me',{cookie:registered.cookie})).status,401);
 assert.equal((await login(oldPassword)).status,401);assert.equal((await login(newPassword)).status,200);
 assert.equal(db.prepare('SELECT data_json FROM app_workspaces WHERE user_id=?').get(id).data_json,before);
 await call('/api/auth/password-reset/request',{body:{email:'reset-qa@example.test'}});
 const expiredToken=new URLSearchParams(new URL(inbox.at(-1).text.match(/https:\/\/\S+/)[0]).hash.slice(1)).get('token');db.prepare('UPDATE app_password_resets SET expires_at=? WHERE user_id=?').run(Date.now()-1,id);
 assert.equal((await call('/api/auth/password-reset/complete',{body:{token:expiredToken,credential}})).status,400);
 await call('/api/auth/password-reset/request',{body:{email:'reset-qa@example.test'}});
 assert.equal((await call('/api/auth/password-reset/request',{body:{email:'reset-qa@example.test'}})).status,429);
 db.close();
});
