(() => {
  let revision=0,ready=false,running=false,pending=null,errorKind='',status='connecting',lastSaved='';
  const localRender=render;
  const overlay=document.createElement('div');overlay.id='database-overlay';overlay.className='database-overlay';overlay.setAttribute('role','status');document.body.append(overlay);
  function paint(){
    const indicator=$('.local-status');if(indicator)indicator.innerHTML=`<i style="background:${status==='saved'?'#47a88b':status==='error'?'#d78a8a':'#d0ad6b'}"></i> ${status==='saved'?'Saved to database':status==='saving'?'Saving to database…':status==='error'?'Changes not saved':'Connecting to database…'}`;
    overlay.hidden=ready&&status!=='error';
    if(!ready||status==='error')overlay.innerHTML=`<section class="database-message"><span class="stat-icon">${icon('shield')}</span><h2>${status==='error'?'Your records need attention':'Opening your financial workspace'}</h2><p>${status==='error'?escapeHtml(errorKind==='conflict'?'Newer records were saved in another tab or device. Your unsaved changes are still in this browser. Export them before loading the saved records.':errorKind==='auth'?'Sign in to access your saved financial records.':lastSaved||'We could not reach your database. Your browser copy has been kept. Please retry.'): 'Connecting securely to your saved accounts and transactions…'}</p><div class="database-actions">${status==='error'?`<button class="primary" data-database-action="${errorKind==='auth'?'signin':errorKind==='conflict'?'reload':'retry'}">${errorKind==='auth'?'Sign in':errorKind==='conflict'?'Load saved records':'Retry connection'}</button><button class="secondary" data-database-action="export">Export browser backup</button>`:''}</div></section>`;
  }
  render=function(){localRender();paint();};
  const cache=()=>{try{localStorage.setItem('folio-finance-v1',JSON.stringify(state));}catch{}};
  const preserve=()=>{try{if(!localStorage.getItem('folio-before-database'))localStorage.setItem('folio-before-database',JSON.stringify(state));}catch{}};
  const rememberPending=()=>{try{if(pending)sessionStorage.setItem('folio-database-pending',JSON.stringify({revision,payload:pending}));else sessionStorage.removeItem('folio-database-pending');}catch{}};
  const recoverPending=()=>{try{const record=JSON.parse(sessionStorage.getItem('folio-database-pending'));return record&&typeof record.payload==='string'&&Number.isSafeInteger(record.revision)?record:null;}catch{return null;}};
  async function request(method,body){
    let response;try{response=await fetch('/api/state',{method,credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});}catch{throw {kind:'network',message:'The database could not be reached. Your changes are kept in this browser. Retry to save them.'};}
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw {kind:response.status===409?'conflict':response.status===401?'auth':'network',message:data.error||'Could not save your records. Please retry.'};return data;
  }
  function failed(error){status='error';errorKind=error.kind||'network';lastSaved=error.message||'Unable to connect. Your browser copy is still available.';paint();}
  async function flush(){
    if(!ready||running||status==='error'||!pending)return;
    running=true;status='saving';paint();
    try{while(pending){const payload=pending;pending=null;try{const result=await request('PUT',{state:JSON.parse(payload),revision});revision=result.revision;lastSaved=result.updatedAt;rememberPending();}catch(error){if(!pending)pending=payload;rememberPending();throw error;}}status='saved';paint();}catch(error){failed(error);}finally{running=false;}
  }
  window.folioDatabase={save(data){pending=JSON.stringify(data);rememberPending();flush();},hasUnsavedChanges(){return Boolean(pending||running);},waitForSave(){return new Promise((resolve,reject)=>{const started=Date.now();function check(){if(status==='error'){reject(Error(lastSaved||'Unable to save your profile.'));return;}if(ready&&!pending&&!running&&status==='saved'){resolve();return;}if(Date.now()-started>25000){reject(Error('Saving took too long. Your changes are kept in this browser.'));return;}setTimeout(check,100);}check();});}};
  async function boot(){
    ready=false;status='connecting';errorKind='';paint();
    try{const recovered=recoverPending(),saved=await request('GET');revision=saved.revision;
      if(recovered&&(!saved.state||JSON.stringify(saved.state)!==recovered.payload)){
        state=validate(JSON.parse(recovered.payload));pending=recovered.payload;cache();ready=true;
        if(recovered.revision!==revision)throw {kind:'conflict'};
        status='saving';render();await flush();return;
      }
      pending=null;rememberPending();
      if(saved.state){const data=validate(saved.state);preserve();state=data;pending=null;cache();ready=true;status='saved';lastSaved=saved.updatedAt;render();}
      else{preserve();ready=true;pending=JSON.stringify(state);rememberPending();status='saving';render();await flush();}
    }catch(error){failed(error);}
  }
  document.addEventListener('click',async e=>{const button=e.target.closest('[data-database-action]');if(!button)return;const action=button.dataset.databaseAction;
    if(action==='export'){download(`folio-browser-backup-${today()}.json`,JSON.stringify(state,null,2),'application/json');return;}
    if(action==='signin'){location.href='/signin-with-chatgpt?return_to=%2F';return;}
    if(action==='reload'){if(!window.confirm('Load the records saved in the database? This replaces the unsaved view on this browser. Export a backup first if you want to keep those changes.'))return;pending=null;rememberPending();await boot();return;}
    if(ready&&pending){status='saving';errorKind='';await flush();}else await boot();
  });
  window.addEventListener('beforeunload',event=>{if(pending||running){event.preventDefault();event.returnValue='';}});
  window.addEventListener('focus',async()=>{if(!ready||running||pending||status==='error')return;const known=revision;try{const result=await request('GET');if(result.state&&result.revision>known&&revision===known&&!pending&&!running){state=validate(result.state);revision=result.revision;cache();render();}}catch{}});
  boot();
})();
