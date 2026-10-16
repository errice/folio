export async function sendResetEmail(env,to,resetUrl){
 const message={from:env.EMAIL_FROM,to:[to],subject:'Reset your Folio password',text:`You requested a password reset for Folio.\n\nChoose a new password using this link:\n${resetUrl}\n\nThis link expires in 15 minutes and can only be used once. If you did not request this, you can ignore this email. Your password has not changed.\n\nFolio`};
 if(env.RESET_MAILER){await env.RESET_MAILER.send(message);return;}
 const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(message),signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('Reset email delivery failed with status '+response.status);
}
