(() => {
  const sidebar=document.querySelector('.sidebar'),app=document.querySelector('.app'),mainNav=document.getElementById('nav');
  if(!sidebar||!app||!mainNav)return;
  const mobile=matchMedia('(max-width:850px)');
  let opened=false;
  sidebar.id='workspace-navigation';
  const trigger=document.createElement('button');
  trigger.type='button';trigger.className='mobile-menu-button';trigger.setAttribute('aria-label','Open navigation');trigger.setAttribute('aria-controls',sidebar.id);trigger.setAttribute('aria-expanded','false');
  trigger.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
  app.querySelector('header').prepend(trigger);
  const dismiss=document.createElement('button');dismiss.type='button';dismiss.className='mobile-menu-close';dismiss.setAttribute('aria-label','Close navigation');dismiss.innerHTML='<span aria-hidden="true">×</span>';sidebar.prepend(dismiss);
  const backdrop=document.createElement('button');backdrop.type='button';backdrop.className='mobile-nav-backdrop';backdrop.setAttribute('aria-label','Close navigation');backdrop.tabIndex=-1;backdrop.hidden=true;document.body.append(backdrop);
  const dock=document.createElement('nav');dock.className='mobile-dock';dock.setAttribute('aria-label','Quick navigation');
  for(const page of ['overview','accounts','transactions','settings']){
    const source=mainNav.querySelector(`a[href="#${page}"]`);if(source)dock.append(source.cloneNode(true));
  }
  document.body.append(dock);
  function sync(){
    const active=mainNav.querySelector('a.active')?.getAttribute('href');
    dock.querySelectorAll('a').forEach(link=>{const selected=link.getAttribute('href')===active;link.classList.toggle('active',selected);if(selected)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
  }
  function setOpen(value,{restore=false}={}){
    opened=mobile.matches&&value;
    document.body.classList.toggle('mobile-nav-open',opened);
    trigger.setAttribute('aria-expanded',String(opened));trigger.setAttribute('aria-label',opened?'Close navigation':'Open navigation');
    backdrop.hidden=!opened;sidebar.inert=mobile.matches&&!opened;app.inert=opened;dock.inert=opened;
    if(mobile.matches){sidebar.setAttribute('aria-hidden',String(!opened));sidebar.setAttribute('role','dialog');sidebar.setAttribute('aria-label','Workspace navigation');if(opened)sidebar.setAttribute('aria-modal','true');else sidebar.removeAttribute('aria-modal');}
    else{for(const attribute of ['aria-hidden','role','aria-label','aria-modal'])sidebar.removeAttribute(attribute);}
    if(opened)dismiss.focus({preventScroll:true});else if(restore&&mobile.matches)trigger.focus({preventScroll:true});
  }
  trigger.addEventListener('click',()=>setOpen(!opened,{restore:opened}));
  dismiss.addEventListener('click',()=>setOpen(false,{restore:true}));
  backdrop.addEventListener('click',()=>setOpen(false,{restore:true}));
  sidebar.addEventListener('click',event=>{if(mobile.matches&&event.target.closest('a[href],button[data-page]')){setOpen(false);requestAnimationFrame(()=>{const title=document.getElementById('title');title.tabIndex=-1;title.focus({preventScroll:true});});}});
  document.addEventListener('keydown',event=>{
    if(!opened)return;
    if(event.key==='Escape'){event.preventDefault();setOpen(false,{restore:true});return;}
    if(event.key!=='Tab')return;
    const focusable=[...sidebar.querySelectorAll('a[href],button:not(:disabled),[tabindex="0"]')].filter(el=>el.getClientRects().length);
    const first=focusable[0],last=focusable.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  });
  window.addEventListener('hashchange',()=>{setOpen(false);sync();});
  mobile.addEventListener('change',()=>setOpen(false));
  setOpen(false);sync();
})();
