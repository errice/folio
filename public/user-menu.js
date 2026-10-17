(() => {
  const trigger=document.getElementById('user-menu-toggle');if(!trigger)return;
  let profile=null,busy=false,dialogBusy=false,returnFocus=trigger;
  const menu=document.createElement('div');menu.id='user-menu';menu.className='user-menu';menu.hidden=true;menu.setAttribute('role','menu');menu.setAttribute('aria-label','Your account');
  menu.innerHTML='<div class="user-menu-identity"><strong></strong><small></small></div><button type="button" role="menuitem" data-account-action="profile">Manage profile <span>↗</span></button><button type="button" role="menuitem" data-account-action="password">Change password <span>↗</span></button><button type="button" role="menuitem" data-account-action="logout" class="user-menu-logout">Log out <span>↪</span></button><p class="user-menu-error" role="alert" hidden></p>';
  trigger.setAttribute('aria-controls',menu.id);trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-haspopup','menu');trigger.closest('.header-right').append(menu);
  const dialog=document.createElement('dialog');dialog.id='account-dialog';dialog.className='account-dialog';document.body.append(dialog);
  function closeMenu(focus=false){menu.hidden=true;trigger.setAttribute('aria-expanded','false');if(focus)trigger.focus();}
  function showError(message){const el=menu.querySelector('.user-menu-error');el.textContent=message;el.hidden=false;}
  function showIdentity(){if(!profile)return;const user=profile.user;document.querySelectorAll('.avatar').forEach(el=>el.textContent=Array.from(user.name||user.email||'U')[0].toUpperCase());trigger.title=user.name;menu.querySelector('strong').textContent=user.name;menu.querySelector('small').textContent=user.email;const sidebar=document.querySelector('.profile');if(sidebar){sidebar.querySelector('span:nth-child(2)').firstChild.textContent=user.name;sidebar.title=user.email;}}
  async function load(){if(!window.folioAccount)throw Error('Account services are still loading. Please try again.');profile=await window.folioAccount.getProfile();showIdentity();return profile;}
  async function openMenu(focus=false){menu.hidden=false;trigger.setAttribute('aria-expanded','true');menu.querySelector('.user-menu-error').hidden=true;menu.querySelector('strong').textContent=profile?.user.name||'Your account';menu.querySelector('small').textContent=profile?.user.email||'Loading account details…';if(focus)menu.querySelector('[role="menuitem"]').focus();try{await load();}catch(error){showError(error.message||'Unable to load your account.');}}
  trigger.addEventListener('click',()=>menu.hidden?openMenu():closeMenu());
  trigger.addEventListener('keydown',event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();openMenu(true);}});
  document.addEventListener('click',event=>{if(!menu.contains(event.target)&&!trigger.contains(event.target))closeMenu();});
  document.addEventListener('keydown',event=>{
    if(menu.hidden)return;
    if(event.key==='Escape'){event.preventDefault();closeMenu(true);return;}
    const items=[...menu.querySelectorAll('[role="menuitem"]')];const at=items.indexOf(document.activeElement);
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?items.length-1:(at+(event.key==='ArrowUp'?-1:1)+items.length)%items.length;items[next].focus();}
    if(event.key==='Tab')closeMenu();
  });
  function showDialog(title,body,saveLabel,onSave){
    returnFocus=trigger;dialog.innerHTML='<form id="account-form"><div class="modal-heading"><h2 id="account-dialog-title"></h2><button type="button" class="icon-button" data-close-account aria-label="Close account dialog">✕</button></div><div class="account-dialog-body"></div><p id="account-error" role="alert" hidden></p><div class="modal-actions"><button type="button" class="secondary" data-close-account>Cancel</button><button type="submit" class="primary" id="account-save"></button></div></form>';
    dialog.setAttribute('aria-labelledby','account-dialog-title');dialog.querySelector('h2').textContent=title;dialog.querySelector('.account-dialog-body').innerHTML=body;
    const saveButton=dialog.querySelector('#account-save');saveButton.textContent=saveLabel;
    dialog.querySelectorAll('[data-close-account]').forEach(button=>button.onclick=()=>{if(!dialogBusy)dialog.close();});
    dialog.querySelector('form').onsubmit=async event=>{
      event.preventDefault();if(dialogBusy)return;dialogBusy=true;saveButton.disabled=true;saveButton.textContent='Saving…';dialog.querySelector('#account-error').hidden=true;
      try{await onSave(new FormData(event.currentTarget));dialog.close();}catch(error){const el=dialog.querySelector('#account-error');el.textContent=error.message||'Unable to save. Please try again.';el.hidden=false;saveButton.disabled=false;saveButton.textContent=saveLabel;}finally{dialogBusy=false;}
    };dialog.showModal();
  }
  dialog.addEventListener('cancel',event=>{if(dialogBusy)event.preventDefault();});
  dialog.addEventListener('close',()=>{dialog.replaceChildren();returnFocus.focus();});
  menu.addEventListener('click',async event=>{
    const button=event.target.closest('[data-account-action]');if(!button||busy)return;busy=true;
    try{
      if(button.dataset.accountAction==='logout'){button.disabled=true;await window.folioAccount.logout();return;}
      await load();closeMenu();
      if(button.dataset.accountAction==='profile'){
        showDialog('Manage profile','<label for="profile-name">Name or nickname</label><input id="profile-name" name="name" autocomplete="nickname" maxlength="50" required><label for="profile-email">Email address</label><input id="profile-email" type="email" readonly><p class="account-help">Your email is your sign-in address.</p>','Save profile',async data=>{profile=await window.folioAccount.updateProfile(data.get('name'));showIdentity();toast('Profile updated');});
        dialog.querySelector('#profile-name').value=profile.user.name;dialog.querySelector('#profile-email').value=profile.user.email;
      }else if(!profile.canChangePassword){
        showDialog('Change password','<p>This edition uses ChatGPT sign-in. Your password is managed by your sign-in provider. Change it in that provider’s account settings.</p>','Done',async()=>{});dialog.querySelector('.modal-actions .secondary').hidden=true;
      }else{
        showDialog('Change password','<label for="current-password">Current password</label><input id="current-password" name="currentPassword" type="password" autocomplete="current-password" maxlength="128" required><label for="new-password">New password</label><input id="new-password" name="newPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" required><label for="confirm-password">Confirm new password</label><input id="confirm-password" name="confirmPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" required><p class="account-help">Use 8–128 characters. No special characters required. Other signed-in sessions will be logged out.</p>','Change password',async data=>{if(data.get('newPassword')!==data.get('confirmPassword'))throw Error('The new passwords do not match.');await window.folioAccount.changePassword(data.get('currentPassword'),data.get('newPassword'));toast('Password changed. Other sessions have been logged out.');});
      }
    }catch(error){menu.hidden=false;trigger.setAttribute('aria-expanded','true');showError(error.message||'Unable to open your account.');}finally{busy=false;button.disabled=false;}
  });
  load().catch(()=>{});
})();
