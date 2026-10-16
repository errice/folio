// The independent edition installs its own account adapter in workspace.js.
(() => {
  if(window.folioAccount)return;
  let identity=null;
  async function getProfile(){
    if(!identity){const response=await fetch('/api/profile',{credentials:'same-origin',cache:'no-store'});if(!response.ok)throw Error('Please sign in to manage your profile.');identity=(await response.json()).user;}
    return {user:{...identity,name:state.profile?.displayName||identity.name},canChangePassword:false};
  }
  window.folioAccount={getProfile,
    async updateProfile(name){name=String(name||'').trim();if(!name||name.length>50||/[\u0000-\u001f\u007f]/.test(name))throw Error('Enter a name or nickname up to 50 characters.');if(!window.folioDatabase?.waitForSave)throw Error('Your workspace is still connecting. Please try again.');state.profile={displayName:name};save();await window.folioDatabase.waitForSave();return getProfile();},
    async logout(){if(window.folioDatabase?.hasUnsavedChanges())throw Error('Please save your changes or export a backup before logging out.');location.href='/signout-with-chatgpt?return_to=%2F';}
  };
})();
