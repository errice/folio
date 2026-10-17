import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const code=await readFile(new URL('./workspace.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const workspace={version:2,accounts:[],currency:'CAD'};
class Element {
  children=[];hidden=false;textContent='';
  setAttribute(){}
  prepend(child){this.children.unshift(child);}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;}
}
function boot({fetch,storage=new Map(),id='alice',state=workspace,revision=1}={}){
  const main=new Element(),indicator=new Element();
  const document={createElement:()=>new Element(),createTextNode:text=>({textContent:text}),querySelector:s=>s==='main'?main:s==='.local-status'?indicator:null,querySelectorAll:()=>[]};
  const window={folioBootstrap:{user:{id,name:'Test'},revision,state},addEventListener(){}};
  const context={window,document,state:structuredClone(state),page:'overview',render(){},validate:structuredClone,fetch,AbortSignal,sessionStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}};
  runInNewContext(code,context);
  return {context,window,banner:main.children[0],indicator,storage};
}
const text=banner=>banner.children.map(el=>el.textContent).join(' ');
const button=(banner,name)=>banner.children.find(el=>el.textContent===name);
const saved=revision=>Response.json({revision,updatedAt:'2026-10-17'});

test('HTML save errors preserve edits and retry the original revision',async()=>{
  const calls=[];let fail=true;
  const app=boot({fetch:async(path,options)=>{calls.push(JSON.parse(options.body));return fail?new Response('<!DOCTYPE html><h1>Unavailable</h1>'):saved(2);}});
  app.window.folioDatabase.save({...workspace,accounts:[{name:'Test account',balance:45}]});await tick();
  assert.match(text(app.banner),/hosting service returned a webpage/);assert.doesNotMatch(text(app.banner),/Unexpected token|DOCTYPE/);
  assert.equal(app.window.folioDatabase.hasUnsavedChanges(),true);assert.equal(app.indicator.textContent,'Changes not saved');
  assert.equal(JSON.parse(app.storage.get('folio-unsaved:alice')).revision,1);
  fail=false;button(app.banner,'Retry saving').onclick();await tick();
  assert.deepEqual(calls[1],calls[0]);assert.equal(app.window.folioDatabase.hasUnsavedChanges(),false);assert.equal(app.storage.size,0);
});

test('Cloudflare verification offers a separate page and retains the save',async()=>{
  const app=boot({fetch:async()=>new Response('<html>Verify</html>',{status:403,headers:{'cf-mitigated':'challenge'}})});
  app.window.folioDatabase.save(workspace);await tick();
  assert.match(text(app.banner),/browser verification/);
  assert.equal(button(app.banner,'Verify connection').href,'/');assert.equal(button(app.banner,'Verify connection').target,'_blank');
  assert.equal(app.window.folioDatabase.hasUnsavedChanges(),true);
});

test('successful HTTP status without a valid revision cannot mark edits saved',async()=>{
  const app=boot({fetch:async()=>Response.json({})});app.window.folioDatabase.save(workspace);await tick();
  assert.match(text(app.banner),/incomplete save response/);assert.equal(app.window.folioDatabase.hasUnsavedChanges(),true);
});

test('latest edits survive an in-flight failure and a same-user reload',async()=>{
  let respond;const app=boot({fetch:()=>new Promise(resolve=>{respond=resolve;})});
  app.window.folioDatabase.save({...workspace,currency:'USD'});app.window.folioDatabase.save({...workspace,currency:'NGN'});
  respond(new Response('offline',{status:502}));await tick();
  assert.equal(JSON.parse(JSON.parse(app.storage.get('folio-unsaved:alice')).payload).currency,'NGN');
  let body;const restored=boot({storage:app.storage,fetch:async(path,options)=>{body=JSON.parse(options.body);return saved(2);}});await tick();
  assert.equal(restored.context.state.currency,'NGN');assert.equal(body.state.currency,'NGN');assert.equal(body.revision,1);assert.equal(app.storage.size,0);
});

test('recovered edits never overwrite a newer revision or another account',async()=>{
  const storage=new Map([['folio-unsaved:alice',JSON.stringify({revision:1,payload:JSON.stringify({...workspace,currency:'NGN'})})]]);
  const fetch=()=>assert.fail('A conflicting or different-user recovery must not write');
  const conflict=boot({storage,revision:2,fetch});await tick();
  assert.match(text(conflict.banner),/Newer records/);assert.ok(button(conflict.banner,'Load saved records'));assert.equal(conflict.context.state.currency,'NGN');
  const bob=boot({storage,id:'bob',fetch});await tick();assert.equal(bob.context.state.currency,'CAD');assert.equal(bob.window.folioDatabase.hasUnsavedChanges(),false);
});

test('a response lost after committing is recognized on reload without a second write',async()=>{
  const storage=new Map([['folio-unsaved:alice',JSON.stringify({revision:1,payload:JSON.stringify(workspace)})]]);
  const app=boot({storage,revision:2,fetch:()=>assert.fail('Do not resubmit committed edits')});await tick();
  assert.equal(storage.size,0);assert.equal(app.window.folioDatabase.hasUnsavedChanges(),false);
});
