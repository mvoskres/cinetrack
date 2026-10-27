/* ── SETTINGS ──
   One scrolling page, no tabs. openIO(target): optional id of an element to scroll to and flash
   (the backup pill and the empty «Переглянуте» state open it straight at their block). */
function openIO(target){
  const key=_stKeys(),acc=`<div class="st-row" id="gdBox">${_gdHtml()}</div>`;
  modal(`
    <div class="st-head">
      <h2 class="modal-title">Налаштування</h2>
      <button class="st-x" onclick="closeModal()" title="Закрити" aria-label="Закрити">✕</button>
    </div>
    <div class="st-body">
      ${API?acc+key:key+acc}
      <div class="st-row">
        <div class="st-row-head"><span class="st-lbl">Файли й обслуговування</span></div>
        <button class="st-act" onclick="doExport()">${ic('save')}<span><b>Зберегти бекап у файл</b><small>JSON з усіма списками й ключами</small></span></button>
        <label class="st-act" for="impFile">${ic('upload')}<span><b>Відновити з файлу</b><small>backup.json, дані об'єднуються</small></span></label>
        <input type="file" id="impFile" accept=".json" onchange="doImport(event)" hidden>
        <div id="impMsg" class="st-msg"></div>
        <label class="st-act" for="csvFile" id="stCsv">${ic('film')}<span><b>Імпорт з IMDb / Letterboxd</b><small>CSV з оцінками або watchlist</small></span></label>
        <input type="file" id="csvFile" accept=".csv,text/csv" onchange="doCsvImport(event)" hidden>
        <div id="csvBox"></div>
        <button class="st-act" onclick="runCleanScan()">${ic('check')}<span><b>Перевірка даних</b><small>Дублі й сумнівні категорії</small></span></button>
        <div id="cleanMsg" class="cl-msg"></div>
        <div id="cleanList"></div>
        ${_storageChars()/STORAGE_QUOTA_CHARS>=.7?`<div class="st-sto"><span class="st-lbl">Сховище браузера</span>
          <p class="st-hint" id="stoInfo">${_storageInfo()}</p>
          <button class="w-btn" onclick="clearCaches()">Очистити кеші</button>
          <div id="stoMsg" class="st-msg"></div></div>`:''}
      </div>
    </div>`);
  document.querySelector('.modal-bg')?.classList.add('st-bg');document.querySelector('.modal')?.classList.add('st-modal');
  const el=target&&document.getElementById(target);
  if(el){el.scrollIntoView({block:'center'});el.classList.add('st-flash');setTimeout(()=>el.classList.remove('st-flash'),1800);}
}
/* a key row is one compact line while the key exists; the input only shows after «Змінити» or when there is none */
function _stKeyRow(id,name,key,save,url,opt,bad,hint){
  const has=!!key;
  return `<div class="st-key">
    <div class="st-key-line"><span class="st-key-n">${name}${opt?'<em>необов\'язковий</em>':''}</span>
      ${has?`<span class="st-key-v${bad?' bad':''}">${bad?'✕ недоступний':'✓ '+esc(key.slice(0,4))+'••••'}</span><button class="st-chg" onclick="stKeyEdit('${id}')">Змінити</button>`:'<span class="st-key-v off">не встановлено</span>'}
      <a href="${url}" target="_blank" rel="noopener" class="st-link">отримати ключ →</a></div>
    ${bad?'<p class="st-hint" style="color:var(--rose)">TMDB недоступний з цієї мережі, спробуй VPN</p>':!has&&hint?`<p class="st-hint">${hint}</p>`:''}
    <div class="st-ed" id="${id}Ed"${has?' style="display:none"':''}>
      <input class="api-inp" id="${id}K" type="text" placeholder="Вставте ключ…" onkeydown="if(event.key==='Enter')${save}()">
      <button class="st-save-btn" onclick="${save}()">Зберегти</button></div>
    <div id="${id}Msg" class="st-msg"></div></div>`;
}
function _stKeys(){
  return `<div class="st-row" id="stKeys"><div class="st-row-head"><span class="st-lbl">Ключі API</span></div>
    ${_stKeyRow('api','OMDb',API,'saveKey','https://www.omdbapi.com/apikey.aspx',false,false,'Для пошуку, постерів і метаданих. Без нього застосунок не працює.')}
    ${_stKeyRow('tmdb','TMDB',TMDB_KEY,'saveTMDBKey','https://www.themoviedb.org/settings/api',true,_tmdbBlocked&&!!TMDB_KEY,'Покращує рекомендації. Без ключа вони працюють через OMDb.')}</div>`;
}
function stKeyEdit(id){const e=document.getElementById(id+'Ed');if(!e)return;e.style.display='flex';document.getElementById(id+'K')?.focus();}
const STORAGE_QUOTA_CHARS=5e6; /* Chrome/Edge/Firefox: ~5M chars per origin */
function _storageInfo(){
  const n=_storageChars(),pct=Math.round(n/STORAGE_QUOTA_CHARS*100);
  return `Зайнято ${(n/1e6).toFixed(2)} млн символів із ~5 (${pct}%). Списки не чіпаються, очищаються лише кеші, які перезавантажаться з мережі за потреби.${pct>=80?' <strong style="color:var(--rose)">Майже заповнено — зроби бекап.</strong>':''}`;
}
/* Clears only what is cheap to refetch. Collections/TMDB-id caches stay:
   rebuilding those costs hundreds of requests. */
function clearCaches(){
  const before=_storageChars();
  Object.keys(_apiCache).forEach(k=>delete _apiCache[k]);_cacheFlush();
  Object.keys(_gameBackdropCache).forEach(k=>delete _gameBackdropCache[k]);localStorage.removeItem('ct_gamebackdrops');
  Object.keys(_personCache).forEach(k=>delete _personCache[k]);localStorage.removeItem('ct_personcache');
  Object.keys(_tsCache).forEach(k=>delete _tsCache[k]);localStorage.removeItem('ct_titlecache');
  const freed=before-_storageChars();
  const info=document.getElementById('stoInfo');if(info)info.innerHTML=_storageInfo();
  const m=document.getElementById('stoMsg');if(m){m.style.color='var(--jade-2)';m.textContent=`Звільнено ${(freed/1e6).toFixed(2)} млн символів`;}
}
function saveKey(){const v=(document.getElementById('apiK').value||'').trim(),m=document.getElementById('apiMsg');if(!v){m.style.color='var(--rose)';m.textContent='Введіть ключ';return;}API=v;_lsSet('ct_apikey',v);m.style.color='var(--jade-2)';m.textContent='Ключ збережено';openIO('stKeys');/* redraw: the row turns compact and OMDb leaves the top */}
function saveTMDBKey(){const v=(document.getElementById('tmdbK').value||'').trim(),m=document.getElementById('tmdbMsg');if(!v){m.style.color='var(--rose)';m.textContent='Введіть ключ';return;}TMDB_KEY=v;_lsSet('ct_tmdbkey',v);/* Clear TMDB cache so next fetch uses the new key */Object.keys(_tmdbCache).forEach(k=>delete _tmdbCache[k]);m.style.color='var(--jade-2)';m.textContent='Ключ збережено. Оновлюємо рекомендації…';document.getElementById('tmdbK').value='';setTimeout(()=>{closeModal();refreshRecs();},400);}
/* Quiet maintenance: both fixers touch no DOM and return how many titles they changed.
   They run by themselves (after an import, and weekly), see runMaintenance. */
async function fixAnime(){
  const cands=[...watched,...planned].filter(i=>i.customCategory==='cartoon'&&!i.country);
  const seen=new Set(),unique=cands.filter(i=>seen.has(i.imdbID)?false:(seen.add(i.imdbID),true));
  let fixed=0;
  for(let i=0;i<unique.length;i++){
    await new Promise(r=>setTimeout(r,350));
    try{
      const info=await aFetch(`i=${unique[i].imdbID}`);
      if(info.Response==='False'){if(/limit|key/i.test(info.Error||''))break;continue;} /* limit: stop, don't write empty countries */
      const co=info.Country||'',gn=(info.Genre||'').toLowerCase(),isJA=gn.includes('animation')&&isAnimeCountry(co);
      [watched,planned].forEach(l=>{const it=l.find(x=>x.imdbID===unique[i].imdbID);if(!it)return;it.country=co;if(isJA)it.customCategory='anime';});
      if(isJA)fixed++;
    }catch(e){if(e.status>=400&&e.status<500)break;}
  }
  if(unique.length){save();if(fixed){rWatched();rPlanned();}}
  return fixed;
}
/* Some titles (unreleased movies, very fresh episodes) genuinely have no
   IMDb rating YET — OMDb will keep returning nothing for them, which used
   to make "Завантажити відсутні дані" re-fetch the exact same handful of
   titles on every single click, forever. We now remember when a title was
   last checked and only retry it again after RATING_RECHECK_MS — long
   enough for an unreleased film to actually come out and get rated. */
const RATING_RECHECK_MS=14*24*60*60*1000; /* 14 days */
async function _enrichMissingRatings(onProgress){
  const seen=new Set(),tasks=[];const now=Date.now();
  [...watched,...watching,...planned].forEach(it=>{
    if(!it.imdbID||seen.has(it.imdbID))return;
    if(it.imdbRating&&it.genre&&it.country)return; /* already complete */
    if(it._ratingCheckedAt&&(now-it._ratingCheckedAt<RATING_RECHECK_MS))return; /* checked recently, still nothing — don't hammer */
    seen.add(it.imdbID);tasks.push(it.imdbID);
  });
  let upd=0;
  for(let i=0;i<tasks.length;i++){
    if(onProgress)onProgress(i,tasks.length);
    await new Promise(r=>setTimeout(r,300));
    const targets=[];[watched,watching,planned].forEach(l=>{const it=l.find(x=>x.imdbID===tasks[i]);if(it)targets.push(it);});
    try{
      const info=await aFetch(`i=${tasks[i]}`);
      if(info.Response==='False'&&/limit|key/i.test(info.Error||''))break; /* daily limit: nothing below would succeed, and marking titles checked would hide them for 14 days */
      if(info.Response==='False'){targets.forEach(it=>it._ratingCheckedAt=now);continue;}
      let ch=false;
      targets.forEach(it=>{
        if(info.imdbRating&&info.imdbRating!=='N/A'&&!it.imdbRating){it.imdbRating=info.imdbRating;ch=true;}
        if(info.Genre&&info.Genre!=='N/A'&&!it.genre){it.genre=info.Genre;ch=true;}
        if(info.Country&&info.Country!=='N/A'&&!it.country){it.country=info.Country;ch=true;}
        it._ratingCheckedAt=now;
      });
      if(ch)upd++;
    }catch(e){ if(e.status>=400&&e.status<500)break; /* OMDb answers the daily limit and a bad key with 401 */ /* network hiccup: don't mark checked, worth retrying next time */ }
  }
  if(tasks.length)save();
  return{checked:tasks.length,updated:upd};
}
async function fixRatings(){
  const res=await _enrichMissingRatings();
  if(res.updated){rWatched();rWatching();rPlanned();}
  return res.updated;
}
/* Both fixers in the background, one toast only if something changed. Not before the OMDb key exists. */
const MAINT_EVERY=7*864e5;let _maintBusy=false;
async function runMaintenance(){
  if(_maintBusy||!API)return 0;
  _maintBusy=true;let n=0;
  try{n=await fixAnime()+await fixRatings();}catch(e){console.warn('Maintenance:',e);}
  _maintBusy=false;
  if(n){const t=n%10,h=n%100;toast(`Оновлено дані ${n} ${t===1&&h!==11?'фільму':'фільмів'}`,'ok',3200);}
  return n;
}
/* weekly, ~20 s after start, and only while the tab is visible (a hidden tab waits until it is shown) */
function _maintAuto(){
  if(!API)return;
  if(document.hidden){document.addEventListener('visibilitychange',_maintAuto,{once:true});return;}
  if(Date.now()-(+localStorage.getItem('ct_maint_last')||0)<MAINT_EVERY)return;
  _lsSet('ct_maint_last',String(Date.now()));runMaintenance();
}
setTimeout(_maintAuto,2e4);
/* Backup object, shared by the file export and the Drive upload */
function _buildBackup(incK){
  return{version:1,exportedAt:new Date().toISOString(),...(incK?{apiKey:API,tmdbKey:TMDB_KEY}:{}),
    watched,watching,planned,hidden,
    trackedPeople:_trackedPeople,
    collCache:_collCache,collDetails:_collDetails,skippedParts:_skippedParts,unresolvable:_unresolvable,
    gameBestScore:_gameBestScore,gameRoundBest:_gameRoundBest,gameBackdropCache:_gameBackdropCache,
    personCache:_personCache,resolveCache:_resolveCache,tmdbFind:_findCache}; /* no apiCache: it expires in 24h anyway */
}
async function doExport(){
  const btn=document.querySelector('[onclick="doExport()"] small'),orig=btn?.textContent; /* the row's grey line doubles as progress */
  if(btn)btn.textContent='Готую…';
  const data=_buildBackup(true); /* keys always in: a restored file then works at once */
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`cinetrack-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(url);
  _lsSet('ct_last_export',String(Date.now()));
  _backupStateRender();
  /* the file is already saved: the slow OMDb top-up (300 ms per title, may fail) must never delay or block a backup;
     it only fills gaps for the next one */
  try{
    await _enrichMissingRatings((i,total)=>{if(btn)btn.textContent=`Дані IMDb ${i+1}/${total}`;});
    rWatched();rWatching();rPlanned();
  }catch(e){console.warn('Rating top-up:',e);}
  if(btn)btn.textContent=orig;
}
/* ── CSV IMPORT: IMDb (ratings / watchlist) and Letterboxd exports ──
   IMDb rows carry the IMDb id; Letterboxd rows are resolved by name + year on TMDB.
   Details come from TMDB in English so the items look like every other one. */
function parseCsv(t){
  const rows=[];let row=[],f='',q=false;t=t.replace(/^\uFEFF/,'');
  for(let i=0;i<t.length;i++){const c=t[i];
    if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i++;}else q=false;}else f+=c;}
    else if(c==='"')q=true;
    else if(c===','){row.push(f);f='';}
    else if(c==='\n'||c==='\r'){if(c==='\r'&&t[i+1]==='\n')i++;row.push(f);rows.push(row);row=[];f='';}
    else f+=c;}
  if(f||row.length){row.push(f);rows.push(row);}
  return rows.filter(r=>r.some(x=>x.trim()));
}
function _csvEntries(rows,fname){
  const h=rows[0].map(x=>x.trim()),col=r=>n=>{const k=h.indexOf(n);return k<0?'':(r[k]||'').trim();};
  if(h.includes('Const')){
    const rated=h.includes('Your Rating');
    const entries=rows.slice(1).map(r=>{const c=col(r),tt=c('Title Type').toLowerCase().replace(/\s/g,'');
      if(/episode|game|podcast/.test(tt)||!/^tt\d+$/.test(c('Const')))return null;
      return{imdbID:c('Const'),title:c('Title')||c('Original Title'),year:c('Year'),series:tt.includes('series'),
        rating:parseInt(c('Your Rating'))||0,imdbRating:c('IMDb Rating'),genres:c('Genres'),runtime:parseInt(c('Runtime (mins)'))||0};}).filter(Boolean);
    return{src:rated?'IMDb, оцінки':'IMDb, watchlist',list:rated?'watched':'planned',entries};
  }
  if(h.includes('Letterboxd URI')){
    const wl=/watchlist/i.test(fname);
    const entries=rows.slice(1).map(r=>{const c=col(r);if(!c('Name'))return null;
      const st=parseFloat(c('Rating'));return{title:c('Name'),year:c('Year'),series:false,rating:st>0?Math.min(10,Math.round(st*2)):0};}).filter(Boolean);
    /* diary.csv repeats rewatches: one row per film */
    const seen=new Set(),uniq=entries.filter(e=>{const k=e.title+'|'+e.year;return seen.has(k)?false:(seen.add(k),true);});
    return{src:wl?'Letterboxd, watchlist':'Letterboxd',list:wl?'planned':'watched',entries:uniq,needsTmdb:true};
  }
  return null;
}
let _csv=null;
function doCsvImport(e){
  const file=e.target.files[0];if(!file)return;
  const box=document.getElementById('csvBox');
  const rd=new FileReader();
  rd.onload=ev=>{
    let p=null;try{const rows=parseCsv(ev.target.result);if(rows.length>1)p=_csvEntries(rows,file.name);}catch(err){}
    if(!p){box.innerHTML='<p class="cl-msg" style="color:var(--rose)">Не впізнаю файл. Потрібен CSV-експорт з IMDb (ratings або watchlist) чи Letterboxd</p>';return;}
    if(p.needsTmdb&&!TMDB_KEY){box.innerHTML='<p class="cl-msg" style="color:var(--rose)">Для Letterboxd потрібен ключ TMDB: фільми шукаються за назвою й роком</p>';return;}
    const inLists=new Set([...watched,...watching,...planned].map(i=>i.imdbID));
    const known=p.entries.filter(x=>x.imdbID&&inLists.has(x.imdbID)).length;
    _csv=p;
    const rated=p.entries.filter(x=>x.rating).length;
    box.innerHTML=`<div class="cl-grp csv-prev">
      <div class="cl-h">${esc(p.src)} <span class="num">${p.entries.length}</span></div>
      <p class="csv-line">${known?`${known} вже є у твоїх списках, їх пропущу. `:''}${p.needsTmdb?'Кожен фільм шукаю на TMDB за назвою й роком; ті, що вже є у списках, теж пропущу.':''}</p>
      <label class="csv-line">Куди додати <select id="csvList" class="csv-sel">${Object.entries(LIST_L).map(([k,l])=>`<option value="${k}"${k===p.list?' selected':''}>${l}</option>`).join('')}</select></label>
      ${rated?`<label class="cl-row"><input type="checkbox" id="csvRatings" checked><span><b>Перенести оцінки (${rated})</b><small>${p.src.startsWith('Letterboxd')?'зірки 0,5–5 стають 1–10':'твої оцінки 1–10 з IMDb'}, лише для «Переглянуте»</small></span></label>`:''}
      <button class="w-btn cl-go" id="csvGo" onclick="runCsvImport()">Імпортувати ${p.entries.length-known}</button>
      <div id="csvMsg" class="cl-msg"></div></div>`;
  };
  rd.readAsText(file);e.target.value='';
}
async function _csvResolve(e){
  let imdb=e.imdbID||'',m=null;
  if(TMDB_KEY&&!_tmdbBlocked){
    try{
      let mt=null,id=0;
      if(imdb){const f=await tmdbFindIds(imdb);mt=e.series?(f.t?'tv':f.m?'movie':null):(f.m?'movie':f.t?'tv':null);id=mt==='tv'?f.t:f.m;}
      else{const q=`/search/movie?query=${encodeURIComponent(e.title)}&language=en-US`;
        let r=await tmdbFetch(q+(e.year?`&year=${e.year}`:''));
        if(!r?.results?.length&&e.year)r=await tmdbFetch(q); /* Letterboxd and TMDB disagree on the year now and then */
        const hit=r?.results?.[0];if(hit){mt='movie';id=hit.id;}}
      if(id){const en=await tmdbFetch(`/${mt}/${id}?language=en-US&append_to_response=external_ids`);
        imdb=imdb||en.external_ids?.imdb_id||en.imdb_id||'';m=_shapeFromTmdb(mt,en);}
    }catch(err){}
  }
  if(!imdb)return null;
  /* no TMDB: an IMDb row still has title, year, genres and runtime of its own */
  m=m||{Response:'True',Title:e.title,Year:e.year,Type:e.series?'series':'movie',Genre:e.genres,Country:'',Poster:'',Runtime:e.runtime?`${e.runtime} min`:'N/A',totalSeasons:'1'};
  if(e.imdbRating)m.imdbRating=e.imdbRating;
  return{imdb,m};
}
async function runCsvImport(){
  const p=_csv;if(!p)return;
  const list=document.getElementById('csvList').value,withRatings=document.getElementById('csvRatings')?.checked;
  const btn=document.getElementById('csvGo');btn.disabled=true;
  const msg=t=>{const el=document.getElementById('csvMsg');if(el)el.textContent=t;};
  const have=()=>new Set([...watched,...watching,...planned].map(i=>i.imdbID));
  let inLists=have();
  const todo=p.entries.filter(x=>!(x.imdbID&&inLists.has(x.imdbID)));
  const out=new Array(todo.length),missed=[];let done=0,next=0;
  const worker=async()=>{while(next<todo.length){const k=next++;
    out[k]=await _csvResolve(todo[k]);if(!out[k])missed.push(todo[k].title+(todo[k].year?` (${todo[k].year})`:''));
    done++;if(done%5===0||done===todo.length)msg(`${done} з ${todo.length}…`);}};
  await Promise.all([worker(),worker(),worker(),worker()]);
  inLists=have();
  const id0=Date.now(),target=tList(list),added=[];
  out.forEach((r,k)=>{
    if(!r||inLists.has(r.imdb))return;inLists.add(r.imdb);
    const m=r.m,it={id:id0-k,imdbID:r.imdb,title:m.Title,poster:ps(m.Poster),year:m.Year,type:m.Type,genre:m.Genre||'',country:m.Country||'',
      imdbUrl:`https://www.imdb.com/title/${r.imdb}/`,imdbRating:(m.imdbRating&&m.imdbRating!=='N/A')?m.imdbRating:null,runtime:parseRuntime(m.Runtime),
      customCategory:gc(m),addedAt:id0-k};
    if(list==='watched')Object.assign(it,{rating:withRatings?todo[k].rating||0:0,comment:''});
    if(list==='watching')Object.assign(it,{season:1,episode:1,totalSeasons:parseInt(m.totalSeasons)||1});
    added.push(it);
  });
  target.unshift(...added);
  saveAll();rWatched();rWatching();rPlanned();updateStats();
  _csv=null;
  const box=document.getElementById('csvBox');
  if(box)box.innerHTML=`<p class="cl-msg ok">Додано ${added.length} у «${LIST_L[list]}»${missed.length?`, не знайдено ${missed.length}`:''}</p>
    ${missed.length?`<details class="csv-miss"><summary>Що не знайшлося</summary><p>${missed.map(esc).join(', ')}</p></details>`:''}`;
  toast(`Імпорт: додано ${added.length}`,'ok',2600);
  if(added.length)runMaintenance();
}
/* Merges a parsed backup into the live state; shared by file import and Drive restore.
   Throws on a wrong shape before anything live is touched. */
function _applyBackup(data){
  if(!data||typeof data!=='object'||(!data.watched&&!data.watching&&!data.planned))throw new Error('Невірний формат');
  /* Phase 1: parse and validate everything into temp variables. Nothing live is touched until the whole
     file has been read without a throw, so a broken file can't leave a half-merged state. */
  const arr=v=>Array.isArray(v)?v.filter(x=>x&&typeof x==='object'):[];
  const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:null;
  let aw=0,awn=0,apl=0,skip=0;
  /* A title already in ANY local list is skipped: merging per-list used to
     put the same film into watched and planned at once (the main source of
     cross-list duplicates). The local state wins. */
  const have=new Set([...watched,...watching,...planned].map(x=>x.imdbID));
  const take=(src,inc)=>{const out=[];arr(src).forEach(it=>{if(!it.imdbID)return;if(have.has(it.imdbID)){skip++;return;}have.add(it.imdbID);out.push(it);inc();});return out;};
  const nW=take(data.watched,()=>aw++),nWn=take(data.watching,()=>awn++),nPl=take(data.planned,()=>apl++);
  const nHidden=arr(data.hidden).filter(it=>{const key=it.imdbID||it.tmdb;return key&&!hidden.find(x=>(x.imdbID||x.tmdb)===key);});
  const nPeople=arr(data.trackedPeople).filter(p=>p.id&&!_trackedPeople.find(t=>t.id===p.id));
  const nPerson={};const pcIn=obj(data.personCache);
  if(pcIn)for(const id in pcIn){const c=pcIn[id];if(c&&typeof c==='object')nPerson[id]={...c,cast:_slimCredits(c.cast),crew:_slimCredits(c.crew)};}
  /* Phase 2: apply (plain assignments only) */
  /* unshift one by one reverses the order; same result as before */
  watched.unshift(...nW.reverse());watching.unshift(...nWn.reverse());planned.unshift(...nPl.reverse());
  nHidden.forEach(it=>hidden.push(it));
  const apeople=nPeople.length;
  nPeople.forEach(p=>_trackedPeople.push(p));
  if(apeople){_peopleSave();}
  if(data.collCache){Object.assign(_collCache,data.collCache);_collCacheSave();}
  if(data.skippedParts){Object.assign(_skippedParts,data.skippedParts);_skippedSave();}
  if(data.unresolvable){Object.assign(_unresolvable,data.unresolvable);_unresolvableSave();}
  if(typeof data.gameBestScore==='number'&&data.gameBestScore>_gameBestScore){_gameBestScore=data.gameBestScore;_gameBestSave();}
  if(typeof data.gameRoundBest==='number'&&data.gameRoundBest>_gameRoundBest){_gameRoundBest=data.gameRoundBest;_gameBestSave();}
  if(data.gameBackdropCache){Object.assign(_gameBackdropCache,data.gameBackdropCache);_gameCacheSave();}
  if(data.apiCache){Object.assign(_apiCache,data.apiCache);_cacheSave();}
  if(data.collDetails){Object.assign(_collDetails,data.collDetails);_collDetailsSave();}
  if(pcIn){Object.assign(_personCache,nPerson);_personCacheSave();}
  if(data.resolveCache){Object.assign(_resolveCache,data.resolveCache);_resolveCacheSave();}
  if(data.tmdbFind){Object.assign(_findCache,data.tmdbFind);_findSave();}
  if(data.apiKey&&data.apiKey.length>4){API=data.apiKey;_lsSet('ct_apikey',data.apiKey);}
  if(data.tmdbKey&&data.tmdbKey.length>4){TMDB_KEY=data.tmdbKey;_lsSet('ct_tmdbkey',data.tmdbKey);}
  /* lists changed: drop the cached shelves so Рекомендації rebuilds against the new lists (recsFetched was never read) */
  _recs=null;try{localStorage.removeItem('ct_recs');}catch(e){}
  save();['watched','watching','planned'].forEach(buildBar);
  rWatched();rWatching(true);rPlanned();rDash();updateStats();renderPeopleTab();
  return{aw,awn,apl,skip,apeople};
}
function doImport(e){
  const file=e.target.files[0];if(!file)return;
  const msg=document.getElementById('impMsg');if(msg){msg.style.color='var(--muted)';msg.textContent='Читаю файл…';}
  const rd=new FileReader();
  rd.onload=ev=>{
    const show=(c,t)=>{const el=document.getElementById('impMsg');if(el){el.style.color=c;el.textContent=t;}};
    try{
      const {aw,awn,apl,skip,apeople}=_applyBackup(JSON.parse(ev.target.result));
      show('var(--jade-2)',`Імпортовано: ${aw} переглянуто, ${awn} дивлюсь, ${apl} заплановано${apeople?`, ${apeople} людей у стеженні`:''}${skip?` · ${skip} пропущено (вже є у твоїх списках)`:''}`);
      runMaintenance(); /* fresh titles arrive without country/rating */
    }catch(err){show('var(--rose)','✕ '+(err.message||'невірний файл'));}
  };
  rd.readAsText(file);e.target.value='';
}

