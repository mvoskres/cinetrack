/* ── GOOGLE DRIVE BACKUP ──
   Token model (GIS) + plain fetch to Drive REST v3, scope drive.file only (the app sees just the files it made).
   Nothing here touches the network until a Client ID is set and the user uses a Drive feature or was connected before. */
const GD_SCOPE='https://www.googleapis.com/auth/drive.file',GD_FOLDER='CineTrack Backups',GD_FMIME='application/vnd.google-apps.folder';
const GD_KEEP=3,GD_EVERY=3*864e5; /* copies kept; auto-backup interval */
/* the ~1h access token survives reloads: without it every reopen needs a popup, and browsers
   block popups that no tap started, so the "silent" refresh can't stand in for it */
let _gdTok=localStorage.getItem('ct_gd_tok'),_gdTokExp=+localStorage.getItem('ct_gd_tokexp')||0,_gdTokP=null,_gdLibP=null,_gdBusy=false,_gdTry=0,_gdPend=null,_gdMsg={t:'',c:''};
function _gdCid(){return(localStorage.getItem('ct_gclientid')||GDRIVE_CLIENT_ID||'').trim();}
function _gdOn(){return localStorage.getItem('ct_gd_on')==='1';}
function _gdHasData(){return !!(watched.length||watching.length||planned.length);}
function _gdFmt(ms){return new Date(ms).toLocaleString('uk-UA',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});}
/* cheap fingerprint of the user's own data only: caches change constantly and would make every check look "changed" */
function _gdFp(){const s=JSON.stringify([watched,watching,planned,hidden,_trackedPeople,_gameBestScore,_gameRoundBest]);let h=5381;for(let i=0;i<s.length;i++)h=(h*33^s.charCodeAt(i))>>>0;return h.toString(36)+'.'+s.length;}
function _gdLoadLib(){
  return _gdLibP||(_gdLibP=new Promise((res,rej)=>{
    const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;
    s.onload=res;s.onerror=()=>{_gdLibP=null;s.remove();rej(new Error('net'));};document.head.appendChild(s);
  }));
}
async function _gdTokFetch(prompt){
  const cid=_gdCid();if(!cid)throw new Error('noid');
  try{await _gdLoadLib();}catch(e){throw new Error('net');}
  const r=await new Promise((res,rej)=>{
    const to=setTimeout(()=>rej(new Error('timeout')),9e4); /* a blocked/ignored popup must not hang forever */
    google.accounts.oauth2.initTokenClient({client_id:cid,scope:GD_SCOPE,
      callback:x=>{clearTimeout(to);x.error?rej(new Error(x.error)):res(x);},
      error_callback:x=>{clearTimeout(to);rej(new Error(x&&x.type||'auth'));}
    }).requestAccessToken({prompt});
  });
  if(!google.accounts.oauth2.hasGrantedAllScopes(r,GD_SCOPE))throw new Error('scope');
  _gdTok=r.access_token;_gdTokExp=Date.now()+(+r.expires_in||3600)*1e3;
  _lsSet('ct_gd_tok',_gdTok);_lsSet('ct_gd_tokexp',String(_gdTokExp));
  return _gdTok;
}
function _gdTokClr(){_gdTok=null;_gdTokExp=0;localStorage.removeItem('ct_gd_tok');localStorage.removeItem('ct_gd_tokexp');}
function _gdTokOk(){return !!_gdTok&&Date.now()<_gdTokExp-6e4;}
/* cached token while valid; prompt:'' = no UI unless Google needs consent */
function _gdToken(prompt=''){
  if(_gdTok&&Date.now()<_gdTokExp-6e4)return Promise.resolve(_gdTok);
  if(_gdTokP)return _gdTokP;
  const p=_gdTokFetch(prompt);_gdTokP=p;const done=()=>{if(_gdTokP===p)_gdTokP=null;};p.then(done,done);return p;
}
async function _gdApi(path,opt={},base='https://www.googleapis.com/drive/v3/'){
  const t=await _gdToken('');let r;
  try{r=await fetch(base+path,{...opt,headers:{...opt.headers,Authorization:'Bearer '+t}});}catch(e){throw new Error('net');}
  if(r.status===401){_gdTokClr();throw new Error('401');}
  if(!r.ok)throw new Error(String(r.status));
  return r;
}
/* cached folder id; re-found (or recreated) if it was deleted or trashed */
async function _gdFolder(){
  let id=localStorage.getItem('ct_gd_folder');
  if(id){
    try{const j=await(await _gdApi(`files/${id}?fields=id,trashed`)).json();if(!j.trashed)return id;}
    catch(e){if(e.message!=='404')throw e;}
    localStorage.removeItem('ct_gd_folder');
  }
  const q=encodeURIComponent(`name='${GD_FOLDER}' and mimeType='${GD_FMIME}' and trashed=false`);
  id=(await(await _gdApi(`files?q=${q}&fields=files(id)&pageSize=1`)).json()).files?.[0]?.id;
  if(!id)id=(await(await _gdApi('files?fields=id',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:GD_FOLDER,mimeType:GD_FMIME})})).json()).id;
  _lsSet('ct_gd_folder',id);return id;
}
async function _gdList(fid,n){
  const q=encodeURIComponent(`'${fid}' in parents and trashed=false and name contains 'cinetrack-backup-'`);
  return(await(await _gdApi(`files?q=${q}&orderBy=createdTime%20desc&pageSize=${n}&fields=files(id,name,createdTime,size)`)).json()).files||[];
}
async function _gdUpload(fid,json){
  const d=new Date(),p=n=>String(n).padStart(2,'0'),b='ctb'+Date.now().toString(36);
  const name=`cinetrack-backup-${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
  const body=`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({name,parents:[fid],mimeType:'application/json'})}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${json}\r\n--${b}--`;
  return(await _gdApi('files?uploadType=multipart&fields=id,createdTime',{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${b}`},body},'https://www.googleapis.com/upload/drive/v3/')).json();
}
/* keep the newest GD_KEEP; a failed delete is harmless, the next backup prunes again */
async function _gdPrune(fid){
  const l=await _gdList(fid,100);
  for(const f of l.slice(GD_KEEP)){try{await _gdApi(`files/${f.id}`,{method:'DELETE'});}catch(e){}}
}
async function _gdDownload(id){return(await _gdApi(`files/${id}?alt=media`)).json();}
function _gdMsgSet(t,c){_gdMsg={t,c};const el=document.getElementById('gdMsg');if(el){el.textContent=t;el.style.color=c||'var(--muted)';}}
function _gdFail(e,quiet){
  const m=String(e&&e.message||e);let t;
  if(m==='401'){_gdTokClr();_gdNotice(true);t='Сесію Google завершено, увійди знову';}
  else if(m==='net')t='Немає зв\'язку з Google Drive';
  else if(m==='noid')t='Вкажи Google Client ID у Налаштуваннях → Дані';
  else if(m==='access_denied')t='Доступ до Drive не надано';
  else if(/popup|timeout/.test(m))t='Вхід у Google скасовано';
  else if(m==='scope')t='Потрібен доступ до Drive: дозволь його при вході';
  else if(m==='badfmt')t='Файл бекапу пошкоджено';
  else if(m==='403')t='Drive відмовив у доступі (403)';
  else if(m==='404')t='Бекап не знайдено на Drive';
  else t='Помилка Google Drive ('+m.slice(0,40)+')';
  console.warn('Drive:',e);_gdMsgSet(t,'var(--rose)');
  if(!quiet)toast(t,'err',5000);
}
/* unobtrusive pill instead of a surprise popup when the silent token fails */
function _gdNotice(on){
  let b=document.getElementById('gdNotice');
  if(!on){b?.remove();return;}
  if(b)return;
  b=document.createElement('button');b.id='gdNotice';b.className='gd-notice';b.innerHTML=ic('info')+'<span>Час оновити бекап на Drive</span>';
  b.onclick=()=>gdSignIn();document.body.appendChild(b);
}
function _gdPre(){
  if(location.protocol==='file:'){toast('Вхід через Google працює лише на https-сайті','err',5000);return false;}
  if(!_gdCid()){toast('Спершу встав Client ID у Налаштуваннях → Дані','err',5000);return false;}
  return true;
}
function _gdHtml(){
  const cid=localStorage.getItem('ct_gclientid')||'',on=_gdOn(),last=+localStorage.getItem('ct_gd_last')||0,em=localStorage.getItem('ct_gd_email')||'';
  if(_gdCid()&&location.protocol!=='file:')_gdLoadLib().catch(()=>{}); /* configured = intent: warm the library so the sign-in popup isn't blocked by the load delay */
  return `<div class="st-row-head"><span class="st-lbl">Google Drive</span></div>
    <p class="st-hint">Бекап у твій Google Drive, папка «${GD_FOLDER}», лишаються 3 останні копії. Автоматично раз на 3 дні, якщо щось змінилось.</p>
    ${location.protocol==='file:'?'<p class="st-hint" style="color:var(--gold)">Сторінку відкрито як файл (file://). Вхід через Google працює лише на https-сайті.</p>':''}
    <details${_gdCid()?'':' open'} style="margin-top:.45rem"><summary class="st-hint" style="cursor:pointer">Client ID</summary>
      <div style="display:flex;gap:.45rem;margin-top:.35rem">
        <input class="api-inp" id="gdCid" type="text" placeholder="…apps.googleusercontent.com" value="${esc(cid)}" style="flex:1" onkeydown="if(event.key==='Enter')gdSaveCid()">
        <button class="st-save-btn" onclick="gdSaveCid()">Зберегти</button>
      </div>
      <p class="st-hint">Створюється в Google Cloud Console (тип «Web application»), кроки в cinetrack-google-drive-setup.md.</p>
    </details>
    ${on?`<p class="st-hint" style="margin:.6rem 0 .1rem">Акаунт: <strong style="color:var(--text)">${esc(em||'…')}</strong></p>
      <p class="st-hint" style="margin:0 0 .5rem">${last?'Останній бекап: '+_gdFmt(last):'Бекапу на Drive ще не було'}</p>
      <button class="m-btn g" onclick="gdBackup()" style="padding:.5rem">${ic('save')}Зробити бекап зараз</button>
      <button class="m-btn can" onclick="gdRestoreList()" style="padding:.5rem;margin-top:.4rem">${ic('upload')}Відновити з Drive</button>
      <button class="w-btn rose" onclick="gdSignOut()" style="margin-top:.5rem;font-size:.73rem">Вийти</button>`
    :`<button class="m-btn g" onclick="gdSignIn()" style="padding:.5rem;margin-top:.6rem">Увійти через Google</button>`}
    <div id="gdMsg" style="font-size:.69rem;margin-top:.35rem;min-height:.8rem;color:${_gdMsg.c||'var(--muted)'}">${esc(_gdMsg.t)}</div>
    <div id="gdList"></div>`;
}
function _gdRender(){const b=document.getElementById('gdBox');if(b)b.innerHTML=_gdHtml();}
function gdSaveCid(){
  const v=(document.getElementById('gdCid')?.value||'').trim(),old=localStorage.getItem('ct_gclientid')||'';
  if(v)_lsSet('ct_gclientid',v);else localStorage.removeItem('ct_gclientid');
  if(v!==old){_gdTokClr();} /* a token belongs to the old client */
  _gdMsgSet(v?'Client ID збережено':'Client ID очищено','var(--jade-2)');_gdRender();
}
async function gdSignIn(){
  if(!_gdPre())return;
  const was=_gdOn();
  try{
    await _gdToken(was?'':'select_account');
    const u=await(await _gdApi('about?fields=user(emailAddress)')).json();
    _lsSet('ct_gd_on','1');_lsSet('ct_gd_email',u.user?.emailAddress||'');
    _gdNotice(false);_gdMsgSet('Підключено','var(--jade-2)');_gdRender();
    if(!was)toast('Google Drive підключено','ok');
    if(await _gdCheckRemote())return;
    await gdAuto(true);
  }catch(e){_gdFail(e);}
}
function gdSignOut(){
  try{if(_gdTok&&window.google?.accounts?.oauth2)google.accounts.oauth2.revoke(_gdTok);}catch(e){}
  _gdTokClr();
  ['ct_gd_on','ct_gd_email','ct_gd_folder','ct_gd_last','ct_gd_fp','ct_gd_seen'].forEach(k=>localStorage.removeItem(k));
  _gdNotice(false);_gdMsgSet('','');_gdRender();toast('Вийшов з Google Drive','ok');
}
async function gdBackup(auto){
  if(_gdBusy)return;
  if(!auto&&!_gdPre())return;
  _gdBusy=true;_gdMsgSet('Зберігаю на Drive…','var(--muted)');
  try{
    await _gdToken('');
    const json=JSON.stringify(_buildBackup(true)),fp=_gdFp(),fid=await _gdFolder(); /* keys included: a new device then works right after restore */
    await _gdUpload(fid,json);
    const now=Date.now();_lsSet('ct_gd_last',String(now));_lsSet('ct_gd_fp',fp);_lsSet('ct_last_export',String(now));
    _backupStateRender();_gdNotice(false);
    _gdPrune(fid).catch(()=>{});
    _gdMsgSet('Бекап збережено '+_gdFmt(now),'var(--jade-2)');_gdRender();
    if(!auto)toast('Бекап збережено на Drive','ok');
  }catch(e){_gdFail(e,auto);}
  finally{_gdBusy=false;}
}
/* true = an offer modal was shown */
async function _gdCheckRemote(){
  const l=await _gdList(await _gdFolder(),GD_KEEP);
  _lsSet('ct_gd_seen',String(Date.now()));
  if(!l.length)return false;
  const last=+localStorage.getItem('ct_gd_last')||0;
  if(_gdHasData()&&last&&Date.parse(l[0].createdTime)<=last)return false; /* our own newest copy */
  _gdOffer(await _gdDownload(l[0].id),true);return true;
}
function _gdOffer(d,found){
  if(!d||typeof d!=='object'||!(d.watched||d.watching||d.planned))throw new Error('badfmt');
  _gdPend=d;
  const n=k=>Array.isArray(d[k])?d[k].length:0,t=d.exportedAt?_gdFmt(Date.parse(d.exportedAt)):'невідомої дати';
  modal(`<h2 class="modal-title">Бекап на Google Drive</h2>
    <p style="font-size:.8rem;color:var(--text-2);line-height:1.55;margin:.4rem 0 1rem">${found?'Знайдено бекап':'Бекап'} від <strong style="color:var(--text)">${t}</strong> (${n('watched')} переглянуто, ${n('watching')} дивлюсь, ${n('planned')} заплановано). ${_gdHasData()?'Дані об\'єднаються з тими, що вже є тут: нічого не буде втрачено.':'Тут даних ще немає.'} Підтягнути?</p>
    <div style="display:flex;gap:.5rem"><button class="m-btn g" onclick="gdApplyPending()">Підтягнути</button><button class="m-btn can" onclick="_gdPend=null;closeModal()">Ні</button></div>`);
}
function gdApplyPending(){
  const d=_gdPend;_gdPend=null;closeModal();if(!d)return;
  try{const r=_applyBackup(d);_lsSet('ct_gd_seen',String(Date.now()));
    /* what was just pulled is already on Drive: don't count it as an unsaved change */
    const at=Date.parse(d.exportedAt)||Date.now();if(at>(+localStorage.getItem('ct_gd_last')||0))_lsSet('ct_gd_last',String(at));_lsSet('ct_gd_fp',_gdFp());_gdNotice(false);toast(`Підтягнуто: ${r.aw} переглянуто, ${r.awn} дивлюсь, ${r.apl} заплановано`,'ok',4200);}
  catch(e){toast('Не вдалося підтягнути: '+(e.message||'помилка'),'err',5000);}
}
async function gdRestoreList(){
  if(!_gdPre())return;
  const el=()=>document.getElementById('gdList');
  if(el())el().innerHTML='<p class="st-hint">Шукаю бекапи…</p>';
  try{
    await _gdToken('');
    const l=await _gdList(await _gdFolder(),GD_KEEP);
    if(el())el().innerHTML=l.length?l.map(f=>`<button class="w-btn" style="display:flex;width:100%;justify-content:space-between;margin-top:.35rem;font-size:.73rem" onclick="gdRestorePick('${f.id}')"><span>${_gdFmt(Date.parse(f.createdTime))}</span><span style="color:var(--muted)">${Math.round((+f.size||0)/1024)} КБ</span></button>`).join(''):'<p class="st-hint">У папці ще немає бекапів.</p>';
  }catch(e){if(el())el().innerHTML='';_gdFail(e);}
}
async function gdRestorePick(id){
  _gdMsgSet('Завантажую бекап…','var(--muted)');
  try{_gdOffer(await _gdDownload(id),false);_gdMsgSet('','');}catch(e){_gdFail(e);}
}
/* app load / tab visible: back up if 3 days passed AND the data changed; on a device that never synced, look for a remote copy first */
async function gdAuto(force){
  try{
    if(!_gdOn()||!_gdCid()||_gdBusy||location.protocol==='file:')return;
    if(!force&&(Date.now()-_gdTry<6e5||document.getElementById('mbox')?.innerHTML.trim()))return; /* throttled, or a modal is open */
    const last=+localStorage.getItem('ct_gd_last')||0,first=!last&&!localStorage.getItem('ct_gd_seen');
    const need=()=>(!last||Date.now()-last>=GD_EVERY)&&_gdHasData()&&_gdFp()!==localStorage.getItem('ct_gd_fp');
    if(!first&&!need())return;
    _gdTry=Date.now();
    /* no live token: a popup without a tap is blocked anyway, so only offer a one-tap backup when one is due */
    if(!_gdTokOk()){if(need())_gdNotice(true);return;}
    try{await _gdToken('');}catch(e){if(e.message!=='net'&&need())_gdNotice(true);return;}
    _gdNotice(false);
    if(first&&await _gdCheckRemote())return;
    if(need())await gdBackup(true);
  }catch(e){_gdFail(e,true);}
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)gdAuto();});
setTimeout(gdAuto,2500); /* never blocks startup */

