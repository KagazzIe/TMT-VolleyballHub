/* TMT: Volleyball Hub: "Save to GitHub".
   Commits a file straight to the team's repo with the viewer's own fine-grained GitHub token.
   The repo comes from team/site.json, which the deploy workflow writes. Without it (the demo, or a
   local copy) TMTGitHub.ready resolves to null and pages keep their Save buttons hidden.
   The token is kept in this browser only (sessionStorage, or localStorage if "Remember" is checked),
   keyed by the site's base path, and is only ever sent to api.github.com. See AGENTS.md. */
(function(){
  const API='https://api.github.com';
  const BASE=new URL('../',document.currentScript.src);          // assets/../ is the site root
  const KEY='tmt:github@'+BASE.pathname, SAVED='tmt:github-saved@'+BASE.pathname;
  let site=null,conn=null;
  const statusEls=[];

  const store={
    get(){for(const s of[localStorage,sessionStorage]){try{const v=JSON.parse(s.getItem(KEY)||'null');if(v&&v.token)return v}catch(e){}}return null},
    set(v,remember){try{localStorage.removeItem(KEY);sessionStorage.removeItem(KEY);(remember?localStorage:sessionStorage).setItem(KEY,JSON.stringify(v))}catch(e){}},
    clear(){try{localStorage.removeItem(KEY);sessionStorage.removeItem(KEY)}catch(e){}}
  };
  // What this browser last saved to each path, so our own earlier save never counts as "someone else changed it"
  const lastSaved={
    get(p){try{return(JSON.parse(sessionStorage.getItem(SAVED)||'{}'))[p]}catch(e){}},
    set(p,t){try{const o=JSON.parse(sessionStorage.getItem(SAVED)||'{}');o[p]=t;sessionStorage.setItem(SAVED,JSON.stringify(o))}catch(e){}}
  };

  const enc=t=>{const b=new TextEncoder().encode(t);let s='';for(let i=0;i<b.length;i+=0x8000)s+=String.fromCharCode.apply(null,b.subarray(i,i+0x8000));return btoa(s)};
  const dec=b=>{const s=atob(b.replace(/\s/g,''));const u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return new TextDecoder().decode(u)};
  const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const pathUrl=p=>p.split('/').map(encodeURIComponent).join('/');
  class GHError extends Error{constructor(msg,status){super(msg);this.status=status}}

  async function api(method,url,token,body){
    let r;
    try{
      r=await fetch(API+url,{method,cache:'no-store',headers:Object.assign({Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',Authorization:'Bearer '+token},body?{'Content-Type':'application/json'}:{}),body:body?JSON.stringify(body):undefined});
    }catch(e){throw new GHError("Couldn't reach GitHub. Check your internet connection and try again.",0)}
    let d=null;try{d=await r.json()}catch(e){}
    if(!r.ok){const e=new GHError((d&&d.message)||('GitHub error '+r.status),r.status);e.limited=r.headers.get('x-ratelimit-remaining')==='0';throw e}
    return d;
  }
  // Plain-language messages for the errors people actually hit
  function explain(e,what){
    const repo=site?site.repo:'your team repository';
    if(e.status===401)return 'Your GitHub token stopped working (it may have expired or been deleted). Connect again with a new one.';
    if(e.status===403&&e.limited)return 'GitHub says too many requests. Wait a few minutes and try again.';
    if(e.status===403)return `This token can't change files in ${repo}. Make a new token with Contents set to "Read and write". If the repository belongs to an organization, you also need Write access to it, and an owner may need to approve your token first.`;
    if(e.status===404)return `This token can't see ${repo}. Make a new token and pick ${repo} under "Repository access".`;
    if(e.status===409||e.status===422)return `${what} changed on GitHub while you were saving. Try again.`;
    return e.message;
  }

  /* ---------- connect dialog ---------- */
  const css=`
.ghdlg{background:var(--card);color:var(--ink);border:0;border-radius:var(--r);padding:16px 18px;width:min(520px,calc(100vw - 24px));max-height:90vh;overflow:auto;box-shadow:var(--shadow);font:400 15px/1.45 var(--font)}
.ghdlg::backdrop{background:rgba(10,18,30,.55)}
.ghdlg h2{font:700 24px/1.1 var(--font-display);margin:0 0 8px}
.ghdlg p{margin:0 0 10px}.ghdlg ol{margin:0 0 12px;padding-left:22px}.ghdlg li{margin:4px 0}
.ghdlg a{color:var(--accent);font-weight:600}
.ghdlg .ghlab{display:block;font:600 13px var(--font);text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:0 0 6px}
.ghdlg input[type=password]{font:inherit;color:inherit;width:100%;background:var(--bg);border:1px solid var(--edge);border-radius:var(--r-sm);padding:9px 11px;min-height:44px}
.ghdlg .ghchk{display:flex;gap:8px;align-items:center;margin:10px 0 2px;font:600 15px var(--font);text-transform:none;letter-spacing:normal;color:var(--ink)}
.ghdlg .ghchk input{width:20px;height:20px;min-height:0;margin:0;padding:0}
.ghdlg .ghhint{color:var(--muted);font-size:14px}
.ghdlg .gherr{color:var(--alert);font-weight:600;min-height:1.4em}
.ghdlg .ghrow{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
.ghdlg button,.ghstat button{font:600 15px var(--font);color:var(--ink);background:var(--chip);border:0;border-radius:var(--r-sm);min-height:44px;padding:0 16px;cursor:pointer}
.ghdlg button:not(:disabled):hover,.ghstat button:not(:disabled):hover{background:var(--edge)}
.ghdlg button.ghpri,.ghdlg button.ghpri:hover{background:var(--on);color:var(--onink)}
.ghdlg button:disabled{opacity:.5;cursor:default}
.ghstat{color:var(--muted);font-size:14px;margin:6px 0 0}
.ghstat button{font-size:14px;min-height:30px;padding:0 10px;margin-left:6px}`;
  let dlg=null;
  function tokenLink(){
    const owner=site.repo.split('/')[0];
    const q=new URLSearchParams({name:'Volleyball hub: '+site.repo,description:'Lets the volleyball hub save files to '+site.repo,target_name:owner,expires_in:'366',contents:'write'});
    return 'https://github.com/settings/personal-access-tokens/new?'+q;
  }
  function buildDialog(){
    dlg=document.createElement('dialog');dlg.className='ghdlg';dlg.setAttribute('aria-labelledby','ghtitle');
    const repo=esc(site.repo);
    dlg.innerHTML=`<h2 id="ghtitle">Connect to GitHub</h2>
<p>To save straight to <b>${repo}</b>, this browser needs a GitHub token: a password-like key that can only change files in that one repository. You do this once.</p>
<ol>
<li><a id="ghlink" target="_blank" rel="noopener">Open GitHub's new token page</a> (sign in if asked). The name, permission and expiration are filled in.</li>
<li>Under <b>Repository access</b>, choose <b>Only select repositories</b> and pick <b>${repo}</b>.</li>
<li>Click <b>Generate token</b>, then copy the token and paste it here.</li>
</ol>
<p class="ghhint">Only the repository's owner can make this token, unless the repository belongs to a GitHub organization you're a member of. There, an organization owner may need to approve the token before it can save.</p>
<label class="ghlab" for="ghtok">Token</label>
<input id="ghtok" type="password" autocomplete="off" spellcheck="false" placeholder="github_pat_...">
<label class="ghchk"><input id="ghrem" type="checkbox"> Remember on this device</label>
<p class="ghhint">Leave this off on shared computers. The token stays in this browser and is only sent to GitHub. You can disconnect any time.</p>
<p class="gherr" id="gherr" role="status"></p>
<div class="ghrow"><button id="ghcancel" type="button">Cancel</button><button id="ghgo" class="ghpri" type="button">Connect</button></div>`;
    document.body.appendChild(dlg);
    dlg.querySelector('#ghlink').href=tokenLink();
  }
  // Opens the dialog; resolves with the connection, or null if cancelled
  function connect(){
    if(!site)return Promise.resolve(null);
    if(!dlg)buildDialog();
    const $=s=>dlg.querySelector(s);
    $('#ghtok').value='';$('#gherr').textContent='';$('#ghgo').disabled=false;
    return new Promise(res=>{
      let done=false;
      const finish=v=>{if(done)return;done=true;if(dlg.open)dlg.close();res(v)};
      $('#ghcancel').onclick=()=>finish(null);
      dlg.oncancel=()=>finish(null);
      dlg.onclose=()=>finish(null);
      $('#ghgo').onclick=async()=>{
        const token=$('#ghtok').value.trim();
        if(!token){$('#gherr').textContent='Paste your token first.';$('#ghtok').focus();return}
        $('#ghgo').disabled=true;$('#gherr').textContent='Checking…';
        try{
          const u=await api('GET','/user',token);
          await api('GET','/repos/'+site.repo,token);
          conn={token,login:u.login,repo:site.repo};
          store.set(conn,$('#ghrem').checked);renderStatus();finish(conn);
        }catch(e){
          $('#ghgo').disabled=false;
          $('#gherr').textContent=e.status===401?"GitHub didn't accept that token. Check you copied all of it.":explain(e,'');
        }
      };
      dlg.showModal();$('#ghtok').focus();
    });
  }
  function disconnect(){conn=null;store.clear();renderStatus()}

  function renderStatus(){
    statusEls.forEach(el=>{
      if(!site){el.hidden=true;return}
      el.hidden=false;
      el.innerHTML=conn?`Saving to <b>${esc(site.repo)}</b> as @${esc(conn.login)}.<button type="button" data-gh="off">Disconnect</button>`
        :`Save to GitHub connects this browser to <b>${esc(site.repo)}</b> the first time.`;
    });
  }

  /* ---------- save ---------- */
  // opts: path, text, message, isSafe(remoteText) -> true when overwriting the current file is fine,
  // conflict: question to ask when it isn't. Resolves {commitUrl, actionsUrl}, or null if the user cancelled.
  async function save(opts){
    if(!site)throw new GHError('Saving to GitHub is only available on a team site.');
    if(!conn&&!(await connect()))return null;
    const what=opts.path.split('/').pop(),url='/repos/'+site.repo+'/contents/'+pathUrl(opts.path);
    try{
      let sha;
      try{
        const cur=await api('GET',url,conn.token);
        sha=cur.sha;
        let remote=null;try{if(cur.encoding==='base64')remote=dec(cur.content)}catch(e){}
        const same=remote!==null&&(remote===opts.text||remote===lastSaved.get(opts.path)||(opts.isSafe&&opts.isSafe(remote)));
        if(!same&&!confirm(opts.conflict||`${what} was changed on GitHub since you opened this page, maybe by someone else. Replace it with your version?`))return null;
      }catch(e){if(e.status!==404)throw e}
      const body={message:opts.message,content:enc(opts.text)};if(sha)body.sha=sha;
      const r=await api('PUT',url,conn.token,body);
      lastSaved.set(opts.path,opts.text);
      return{commitUrl:r&&r.commit&&r.commit.html_url,actionsUrl:'https://github.com/'+site.repo+'/actions'};
    }catch(e){
      if(e.status===401)disconnect();
      throw new GHError(explain(e,what),e.status);
    }
  }

  const st=document.createElement('style');st.textContent=css;document.head.appendChild(st);
  document.addEventListener('click',e=>{if(e.target.closest&&e.target.closest('[data-gh="off"]'))disconnect()});
  const ready=fetch(new URL('team/site.json',BASE),{cache:'no-cache'}).then(r=>r.ok?r.json():null).catch(()=>null).then(d=>{
    if(d&&typeof d.repo==='string'&&/^[\w.-]+\/[\w.-]+$/.test(d.repo)){
      site={repo:d.repo};
      const c=store.get();conn=c&&c.repo===site.repo?c:null;
    }
    renderStatus();
    return site;
  });
  window.TMTGitHub={
    ready,save,connect,disconnect,
    get repo(){return site&&site.repo},
    get connected(){return!!conn},
    // Shows "Saving to owner/repo as @name. Disconnect" (or a hint before connecting) in el
    status(el){statusEls.push(el);el.classList.add('ghstat');renderStatus()}
  };
})();
