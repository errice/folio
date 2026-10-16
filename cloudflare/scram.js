// SCRAM-SHA-256 proof calculation (RFC 7677), transported over same-origin HTTPS.
// Passwords use their exact UTF-8 bytes; no password or derived key is cached.
(() => {
 const enc=new TextEncoder(),bytes=s=>enc.encode(s),b64=a=>btoa(String.fromCharCode(...new Uint8Array(a))),unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
 const digest=a=>crypto.subtle.digest('SHA-256',a);
 async function hmac(key,message){const k=await crypto.subtle.importKey('raw',key,{name:'HMAC',hash:'SHA-256'},false,['sign']);return crypto.subtle.sign('HMAC',k,bytes(message));}
 const username=email=>email.replace(/=/g,'=3D').replace(/,/g,'=2C');
 async function keys(password,salt,iterations){
  const input=await crypto.subtle.importKey('raw',bytes(password),'PBKDF2',false,['deriveBits']);
  const salted=await crypto.subtle.deriveBits({name:'PBKDF2',salt:unb64(salt),iterations,hash:'SHA-256'},input,256);
  const clientKey=await hmac(salted,'Client Key');return {clientKey,storedKey:await digest(clientKey),serverKey:await hmac(salted,'Server Key')};
 }
 async function credentials(password){
  if(typeof password!=='string'||password.length<12||password.length>128)throw Error('Use a password between 12 and 128 characters.');
  const salt=b64(crypto.getRandomValues(new Uint8Array(16))),k=await keys(password,salt,600000);
  return {scheme:'scram-sha-256',iterations:600000,salt,storedKey:b64(k.storedKey),serverKey:b64(k.serverKey)};
 }
 async function proofFor(password,challenge){
  const k=await keys(password,challenge.salt,challenge.iterations),final='c=biws,r='+challenge.nonce;
  const message=challenge.clientFirst+','+challenge.serverFirst+','+final,signature=new Uint8Array(await hmac(k.storedKey,message)),key=new Uint8Array(k.clientKey);
  const proof=Uint8Array.from(key,(v,i)=>v^signature[i]);return {proof:b64(proof),serverSignature:b64(await hmac(k.serverKey,message))};
 }
 async function begin(email,password,purpose='login',user){
  const canonical=email.trim().toLowerCase(),nonce=b64(crypto.getRandomValues(new Uint8Array(24))),clientFirst='n='+username(canonical)+',r='+nonce;
  const response=await fetch('/api/auth/challenge',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',...(user?{'X-Folio-User':user}:{})},body:JSON.stringify({email:canonical,nonce,purpose}),signal:AbortSignal.timeout(30000)});
  const challenge=await response.json();if(!response.ok)throw Error(challenge.error||'Unable to start sign-in.');
  if(challenge.iterations!==600000||challenge.clientFirst!==clientFirst||!challenge.nonce.startsWith(nonce)||challenge.nonce.length<=nonce.length||challenge.serverFirst!==`r=${challenge.nonce},s=${challenge.salt},i=600000`)throw Error('Invalid sign-in challenge.');
  const proof=await proofFor(password,challenge);
  return {payload:{challengeId:challenge.id,proof:proof.proof},verify(result){if(result.serverSignature!==proof.serverSignature)throw Error('Unable to verify sign-in. Please try again.');}};
 }
 globalThis.folioScram={credentials,begin,proofFor};
})();
