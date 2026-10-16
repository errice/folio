(() => {
 const $=selector=>document.querySelector(selector),finishing=location.pathname==='/reset-password';
 let token=finishing?new URLSearchParams(location.hash.slice(1)).get('token'):null;
 if(finishing){
  history.replaceState(null,'','/reset-password');
  $('#reset-title').textContent='Choose a new password';$('#reset-description').textContent='Make it memorable for you and difficult for anyone else to guess.';
  $('#reset-email-field').hidden=true;$('#reset-email').required=false;$('#reset-password-fields').hidden=false;
  $('#reset-password').required=true;$('#reset-confirm').required=true;$('#reset-submit').textContent='Reset password';
  if(!token||!/^[A-Za-z0-9_-]{43}$/.test(token)){$('#reset-form').hidden=true;$('#reset-error').textContent='This reset link is missing or invalid. Request a new link from Forgot password.';$('#reset-error').hidden=false;const link=document.createElement('a');link.href='/forgot-password';link.className='primary reset-signin';link.textContent='Request a new link';$('#reset-status').after(link);}
 }
 $('#reset-form').addEventListener('submit',async event=>{
  event.preventDefault();const button=$('#reset-submit');button.disabled=true;button.textContent=finishing?'Resetting…':'Sending…';$('#reset-error').hidden=true;
  try{
   let input;if(finishing){if($('#reset-password').value!==$('#reset-confirm').value)throw Error('The passwords do not match.');input={token,credential:await folioScram.credentials($('#reset-password').value)};}else input={email:$('#reset-email').value};
   const response=await fetch('/api/auth/password-reset/'+(finishing?'complete':'request'),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.timeout(30000)});
   const result=await response.json();if(!response.ok)throw Error(result.error||'Unable to reset your password. Please try again.');
   $('#reset-form').reset();$('#reset-form').hidden=true;$('#reset-status').hidden=false;$('#reset-status').textContent=finishing?'Your password has been reset. Sign in with your new password.':result.message;
   $('#reset-signin').hidden=false;if(finishing){token=null;try{localStorage.setItem('folio-auth-change',String(Date.now())+Math.random());}catch{}}
  }catch(error){$('#reset-error').textContent=error.message||'Unable to connect. Please try again.';$('#reset-error').hidden=false;button.disabled=false;button.textContent=finishing?'Reset password':'Send reset link';}
 });
})();
