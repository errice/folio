(() => {
  let revision=window.folioBootstrap.revision,pending=null,running=false,error=null;
  const user=window.folioBootstrap.user;
  const banner=document.createElement('div');banner.className='auth-sync-banner';banner.hidden=true;banner.setAttribute('role','alert');document.querySelector('main').prepend(banner);
  const logout=document.createElement('button');logout.type='button';logout.className='secondary auth-signout';logout.textContent='Sign out';document.querySelector('.header-right').append(logout);
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
    if(error.status===401){const link=document.createElement('a');link.href='/login';link.className='secondary';link.textContent='Sign in again';banner.append(link);}
    else{const retry=document.createElement('button');retry.className='secondary';retry.textContent=error.status===409?'Load saved records':'Retry saving';retry.onclick=async()=>{if(error.status===409){if(!confirm('Load saved records and replace these unsaved changes? Export your backup first if you need to keep them.'))return;try{const saved=await request('GET');state=validate(saved.state);revision=saved.revision;pending=null;error=null;render();}catch(e){error=e;paint();}}else{error=null;flush();}};banner.append(retry);}
    const backup=document.createElement('button');backup.className='secondary';backup.textContent='Export unsaved backup';backup.onclick=()=>download(`folio-unsaved-${today()}.json`,JSON.stringify(state,null,2),'application/json');banner.append(backup);
  }
  render=function(){baseRender();paint();};
  async function request(method,body){
    let response;try{response=await fetch('/api/state',{method,credentials:'same-origin',cache:'no-store',headers:{'X-Folio-User':user.id,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});}catch{throw {message:'Could not connect. Your changes are still in this tab. Retry or export a backup.'};}
    const data=await response.json();if(!response.ok)throw {status:response.status,message:data.error||'Unable to save your records.'};return data;
  }
  async function flush(){
    if(running||error||!pending)return;running=true;paint();
    try{while(pending){const payload=pending;pending=null;try{const result=await request('PUT',{state:JSON.parse(payload),revision});revision=result.revision;}catch(e){pending??=payload;throw e;}}}catch(e){error=e;}finally{running=false;paint();}
  }
  window.folioDatabase={save(data){pending=JSON.stringify(data);flush();}};
  logout.addEventListener('click',async()=>{
    if(pending||running){alert('Please save your changes or export a backup before signing out.');return;}
    logout.disabled=true;
    try{const response=await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'{}'});if(!response.ok)throw Error();try{localStorage.setItem('folio-auth-change',String(Date.now())+Math.random());}catch{}state=null;window.folioBootstrap=null;location.replace('/login');}catch{logout.disabled=false;toast('Unable to sign out. Please try again.');}
  });
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
  render();
})();
