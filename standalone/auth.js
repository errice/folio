(() => {
  const registering=location.pathname==='/register';
  const $=selector=>document.querySelector(selector);
  document.title=registering?'Create account · Folio':'Sign in · Folio';
  $(registering?'#register-tab':'#login-tab').setAttribute('aria-current','page');
  $('#auth-title').textContent=registering?'Make room for what matters':'Welcome back';
  $('#auth-description').textContent=registering?'Create your own financial workspace.':'Sign in to your financial workspace.';
  $('#name-field').hidden=!registering;$('#name').required=registering;
  $('#password').autocomplete=registering?'new-password':'current-password';
  $('#password').minLength=registering?12:1;$('#password-help').hidden=!registering;
  $('#auth-submit').textContent=registering?'Create account':'Sign in';
  $('#show-password').addEventListener('click',()=>{
    const show=$('#password').type==='password';$('#password').type=show?'text':'password';
    $('#show-password').textContent=show?'Hide':'Show';$('#show-password').setAttribute('aria-label',show?'Hide password':'Show password');$('#show-password').setAttribute('aria-pressed',String(show));
  });
  $('#auth-form').addEventListener('submit',async event=>{
    event.preventDefault();const button=$('#auth-submit');button.disabled=true;button.textContent=registering?'Creating your account…':'Signing in…';$('#auth-error').hidden=true;
    try{
      const response=await fetch('/api/auth/'+(registering?'register':'login'),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:$('#email').value,name:$('#name').value,password:$('#password').value}),signal:AbortSignal.timeout(30000)});
      const data=await response.json();if(!response.ok)throw Error(data.error||'Please try again.');
      $('#password').value='';try{localStorage.setItem('folio-auth-change',String(Date.now())+Math.random());}catch{}location.replace('/');
    }catch(error){$('#auth-error').textContent=error.name==='TimeoutError'?'The connection took too long. Please try again.':error.message||'Unable to connect. Please try again.';$('#auth-error').hidden=false;button.disabled=false;button.textContent=registering?'Create account':'Sign in';}
  });
})();
