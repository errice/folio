(() => {
  let revision=window.folioBootstrap.revision,pending=null,inflight=null,running=false,error=null;
  const user=window.folioBootstrap.user;
  const pendingKey='folio-unsaved:'+user.id;
  function rememberPending(){try{const payload=pending??inflight;if(payload)sessionStorage.setItem(pendingKey,JSON.stringify({revision,payload}));else sessionStorage.removeItem(pendingKey);}catch{}}
  try{const recovered=JSON.parse(sessionStorage.getItem(pendingKey));if(recovered&&Number.isSafeInteger(recovered.revision)&&typeof recovered.payload==='string'){
    const restored=validate(JSON.parse(recovered.payload));
    if(JSON.stringify(window.folioBootstrap.state)===recovered.payload)sessionStorage.removeItem(pendingKey);
    else{state=restored;pending=recovered.payload;if(recovered.revision!==revision)error={status:409,message:'Newer records were saved while this tab was away. Export your unsaved backup before loading saved records.'};}
  }}catch{}
  const banner=document.createElement('div');banner.className='auth-sync-banner';banner.hidden=true;banner.setAttribute('role','alert');document.querySelector('main').prepend(banner);
  const baseRender=render;
  function paint(){
    const indicator=document.querySelector('.local-status');
    indicator.textContent=error?'Changes not saved':running||pending?'Saving…':'Saved to database';
    document.querySelectorAll('.avatar').forEach(el=>el.textContent=user.name.slice(0,1).toUpperCase());
    const profile=document.querySelector('.profile');
    if(profile){profile.querySelector('span:nth-child(2)').firstChild.textContent=user.name;profile.title=user.email;}
    if(page==='settings'&&!document.getElementById('auth-profile-details')){
      const details=document.createElement('div');details.id='auth-profile-details';details.className='auth-profile-details';
      const name=document.createElement('strong'),email=document.createElement('small');name.textContent=user.name;email.textContent=user.email;details.append(name,email);document.querySelector('.settings-panel')?.prepend(details);
      const savedText=[...document.querySelectorAll('.settings-row p')].find(el=>el.textContent.startsWith('Records are saved'));
      if(savedText)savedText.textContent='Your records are saved to your private SQLite workspace. Export backups whenever you need a portable copy.';
    }
    banner.hidden=!error;if(!error)return;
    banner.replaceChildren(document.createTextNode(error.message+' '));
    if(error.kind==='verification'){const verify=document.createElement('a');verify.href='/';verify.target='_blank';verify.rel='noopener';verify.className='secondary';verify.textContent='Verify connection';banner.append(verify);}
    if(error.status===401){const link=document.createElement('a');link.href='/login';link.className='secondary';link.textContent='Sign in again';banner.append(link);}
    else{const retry=document.createElement('button');retry.className='secondary';retry.textContent=error.status===409?'Load saved records':'Retry saving';retry.onclick=async()=>{if(error.status===409){if(!confirm('Load saved records and replace these unsaved changes? Export your backup first if you need to keep them.'))return;try{const saved=await request('GET');state=validate(saved.state);revision=saved.revision;pending=null;rememberPending();error=null;render();}catch(e){error=e;paint();}}else{error=null;flush();}};banner.append(retry);}
    const backup=document.createElement('button');backup.className='secondary';backup.textContent='Export unsaved backup';backup.onclick=()=>download(`folio-unsaved-${today()}.json`,JSON.stringify(state,null,2),'application/json');banner.append(backup);
  }
  render=function(){baseRender();paint();};
  async function request(method,body){
    let response;try{response=await fetch('/api/state',{method,credentials:'same-origin',cache:'no-store',headers:{'X-Folio-User':user.id,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});}catch{throw {message:'Could not connect. Your changes are still in this tab. Retry or export a backup.'};}
    const data=await readResponse(response);
    if(!Number.isSafeInteger(data.revision)||data.revision<1||(method==='GET'&&(!data.state||typeof data.state!=='object')))throw {message:'The server returned an incomplete save response. Your changes are still in this tab. Retry or export a backup.'};return data;
  }
  async function readResponse(response){
    if(response.headers.get('cf-mitigated')==='challenge')throw {kind:'verification',message:'The hosting service needs browser verification before it can save. Open Verify connection, complete the check, then return here and retry saving. Your changes are still in this tab.'};
    let data;try{data=await response.json();}catch{throw {status:response.status===401?401:undefined,message:response.status===401?'Your session has ended. Sign in again after exporting your unsaved backup.':'The hosting service returned a webpage instead of a save response. Your changes are still in this tab. Retry or export a backup.'};}
    if(!response.ok)throw {status:response.status,message:data?.error||'Unable to save your records.'};
    if(!data||typeof data!=='object'||Array.isArray(data))throw {message:'The server returned an invalid response. Your changes are still in this tab. Retry or export a backup.'};return data;
  }
  async function flush(){
    if(running||error||!pending)return;running=true;paint();
    try{while(pending){const payload=pending;inflight=payload;pending=null;rememberPending();try{const result=await request('PUT',{state:JSON.parse(payload),revision});revision=result.revision;inflight=null;rememberPending();}catch(e){pending??=payload;inflight=null;rememberPending();throw e;}}}catch(e){error=e;}finally{running=false;paint();}
  }
  window.folioDatabase={save(data){pending=JSON.stringify(data);rememberPending();flush();},hasUnsavedChanges(){return Boolean(pending||running);}};
  async function accountRequest(path,method='GET',body){
    const response=await fetch(path,{method,credentials:'same-origin',cache:'no-store',headers:{'X-Folio-User':user.id,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
    return readResponse(response);
  }
  window.folioAccount={
    getProfile(){return accountRequest('/api/account/profile');},
    async updateProfile(name){const result=await accountRequest('/api/account/profile','PUT',{name});Object.assign(user,result.user);render();return result;},
    async changePassword(currentPassword,newPassword){if(pending||running)throw Error('Please save your financial changes before changing your password.');return accountRequest('/api/account/password','POST',{currentPassword,newPassword});},
    async logout(){
      if(pending||running)throw Error('Please save your changes or export a backup before logging out.');
      await accountRequest('/api/auth/logout','POST',{});
      try{localStorage.setItem('folio-auth-change',String(Date.now())+Math.random());}catch{}
      state=null;window.folioBootstrap=null;location.replace('/login');
    }
  };
  window.addEventListener('storage',event=>{
    if(event.key!=='folio-auth-change')return;
    if(pending||running){error={status:401,message:'The signed-in account changed. Export your unsaved backup before signing in again.'};paint();return;}
    state=null;window.folioBootstrap=null;location.replace('/login');
  });
  window.addEventListener('beforeunload',event=>{if(pending||running){event.preventDefault();event.returnValue='';}});
  window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
  window.addEventListener('focus',async()=>{
    if(running||pending||error)return;const known=revision;
    try{const saved=await request('GET');if(!pending&&!running&&known===revision&&saved.revision>revision){state=validate(saved.state);revision=saved.revision;render();}}catch(e){if(e.status===401){error=e;paint();}}
  });
  render();if(pending&&!error)flush();
})();
