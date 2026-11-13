/* ── SETTINGS ──
   One scrolling page, no tabs. openIO(target): optional id of an element to scroll to and flash
   (the backup pill and the empty «Переглянуте» state open it straight at their block). */
function openIO(target){
  const key=_stKeys(),acc=`<div class="st-row" id="gdBox">${_gdHtml()}</div>`;
  modal(`
    <div class="st-head">
      <h2 class="modal-title">Налаштування</h2>
      <button class="st-x" data-act="closeModal" title="Закрити" aria-label="Закрити">✕</button>
    </div>
    <div class="st-body">
      ${API&&TMDB_KEY?acc+key:key+acc}
      ${_stAccentHtml()}
      ${_stViewHtml()}
      <div class="st-row">
        <div class="st-row-head"><span class="st-lbl">Файли й обслуговування</span></div>
        <button class="st-act" data-act="doExport">${ic('save')}<span><b>Зберегти бекап у файл</b><small>JSON з усіма списками й ключами</small></span></button>
        <label class="st-act" for="impFile">${ic('upload')}<span><b>Відновити з файлу: злити</b><small>backup.json, дані об'єднуються з наявними</small></span></label>
        <input type="file" id="impFile" accept=".json" data-change="doImport" data-args="[&quot;$ev&quot;]" hidden>
        <label class="st-act" for="impFileRep">${ic('upload')}<span><b>Відновити з файлу: замінити</b><small>списки стануть такими, як у файлі; перед цим зберігається знімок</small></span></label>
        <input type="file" id="impFileRep" accept=".json" data-change="doImport" data-args="[&quot;$ev&quot;,&quot;replace&quot;]" hidden>
        ${_snapshotRow()}
        <div id="impMsg" class="st-msg"></div>
        <label class="st-act" for="csvFile" id="stCsv">${ic('film')}<span><b>Імпорт з IMDb / Letterboxd</b><small>CSV з оцінками або watchlist</small></span></label>
        <input type="file" id="csvFile" accept=".csv,text/csv" data-change="doCsvImport" data-args="[&quot;$ev&quot;]" hidden>
        <div id="csvBox"></div>
        <button class="st-act" data-act="runCleanScan">${ic('check')}<span><b>Перевірка даних</b><small>Дублі й сумнівні категорії</small></span></button>
        <div id="cleanMsg" class="cl-msg"></div>
        <div id="cleanList"></div>
        ${_storageChars()/STORAGE_QUOTA_CHARS>=.7?`<div class="st-sto"><span class="st-lbl">Сховище браузера</span>
          <p class="st-hint" id="stoInfo">${_storageInfo()}</p>
          <button class="w-btn" data-act="clearCaches">Очистити кеші</button>
          <div id="stoMsg" class="st-msg"></div></div>`:''}
      </div>
      <div class="st-row" id="stVer"><button class="st-act" data-act="openChangelog">${ic('film')}<span><b>Версія ${APP_VERSION}</b><small>від ${CHANGELOG[0].d} · історія змін</small></span></button></div>
    </div>`);
  document.querySelector('.modal-bg')?.classList.add('st-bg');document.querySelector('.modal')?.classList.add('st-modal');
  const el=target&&document.getElementById(target);
  if(el){el.scrollIntoView({block:'center'});el.classList.add('st-flash');setTimeout(()=>el.classList.remove('st-flash'),1800);}
}
/* a key row is one compact line while the key exists; the input only shows after «Змінити» or when there is none */
function _stKeyRow(id,name,key,save,url,role,bad,hint){
  const has=!!key;
  return `<div class="st-key">
    <div class="st-key-line"><span class="st-key-n">${name}<em>${role}</em></span>
      ${has?`<span class="st-key-v${bad?' bad':''}">${bad?'✕ недоступний':'✓ '+esc(key.slice(0,4))+'••••'}</span><button class="st-chg" data-act="stKeyEdit" data-args="${A(id)}">Змінити</button>`:'<span class="st-key-v off">не встановлено</span>'}
      ${has?'':`<a href="${url}" target="_blank" rel="noopener" class="st-link">отримати ключ →</a>`}</div>
    ${bad?'<p class="st-hint" style="color:var(--rose)">TMDB недоступний з цієї мережі, спробуй VPN</p>':!has&&hint?`<p class="st-hint">${hint}</p>`:''}
    <div class="st-ed" id="${id}Ed"${has?' style="display:none"':''}>
      <input class="api-inp" id="${id}K" type="text" placeholder="Вставте ключ…" aria-label="Ключ ${name}" data-enter="${save}">
      <button class="st-save-btn" data-act="${save}">Зберегти</button>${has?`<a href="${url}" target="_blank" rel="noopener" class="st-link">отримати новий ключ →</a>`:''}</div>
    <div id="${id}Msg" class="st-msg"></div></div>`;
}
function _stKeys(){
  return `<div class="st-row" id="stKeys"><div class="st-row-head"><span class="st-lbl">Ключі API</span></div>
    ${_stKeyRow('tmdb','TMDB',TMDB_KEY,'saveTMDBKey','https://www.themoviedb.org/settings/api','назви, описи, пошук',_tmdbBlocked&&!!TMDB_KEY,'Головне джерело: українські назви й описи, пошук, сезони, рекомендації, франшизи, люди, статистика й гра. Без нього більшість сторінок порожні.')}
    ${_stKeyRow('api','OMDb',API,'saveKey','https://www.omdbapi.com/apikey.aspx','рейтинг IMDb',false,'Рейтинг IMDb і дані при додаванні в список, а також запасний пошук. Без нього не додати новий тайтл.')}
    <p class="st-hint">Обидва ключі безкоштовні й потрібні. Зберігаються лише в цьому браузері та у твоєму бекапі.</p></div>`;
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
  Object.keys(_gameCast).forEach(k=>delete _gameCast[k]);localStorage.removeItem('ct_game_cast');
  Object.keys(_gameTag).forEach(k=>delete _gameTag[k]);localStorage.removeItem('ct_game_tag_uk');
  Object.keys(_sxT).forEach(k=>delete _sxT[k]);Object.keys(_sxP).forEach(k=>delete _sxP[k]);localStorage.removeItem('ct_stats_tmdb');localStorage.removeItem('ct_stats_people');
  localStorage.removeItem('ct_recsrc');localStorage.removeItem('ct_rec_gtiles');_recTiles={};
  Object.keys(_personCache).forEach(k=>delete _personCache[k]);localStorage.removeItem('ct_personcache');
  Object.keys(_tsCache).forEach(k=>delete _tsCache[k]);localStorage.removeItem('ct_titlecache');
  const freed=before-_storageChars();
  const info=document.getElementById('stoInfo');if(info)info.innerHTML=_storageInfo();
  const m=document.getElementById('stoMsg');if(m){m.style.color='var(--jade-2)';m.textContent=`Звільнено ${(freed/1e6).toFixed(2)} млн символів`;}
}
function saveKey(){const v=(document.getElementById('apiK').value||'').trim(),m=document.getElementById('apiMsg');if(!v){m.style.color='var(--rose)';m.textContent='Введіть ключ';return;}API=v;_lsSet('ct_apikey',v);m.style.color='var(--jade-2)';m.textContent='Ключ збережено';openIO('stKeys');/* redraw: the row turns compact and OMDb leaves the top */}
function saveTMDBKey(){const v=(document.getElementById('tmdbK').value||'').trim(),m=document.getElementById('tmdbMsg');if(!v){m.style.color='var(--rose)';m.textContent='Введіть ключ';return;}TMDB_KEY=v;_tmdbBlocked=false;_tmdbNetFails=0;_lsSet('ct_tmdbkey',v);/* Clear TMDB cache so next fetch uses the new key */Object.keys(_tmdbCache).forEach(k=>delete _tmdbCache[k]);document.getElementById('tmdbK').value='';openIO('stKeys');setTimeout(()=>{const n=document.getElementById('tmdbMsg');if(n){n.style.color='var(--jade-2)';n.textContent='Ключ збережено';}},0);refreshRecs();}
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
    gameBestScore:_gameBest.frame.streak,gameRoundBest:_gameBest.frame.round,gameActorBest:_gameBest.actor.streak,gameActorRound:_gameBest.actor.round,gameQuoteBest:_gameBest.quote.streak,gameQuoteRound:_gameBest.quote.round,gameBackdropCache:_gameBackdropCache,
    personCache:(_personCachePrune(),_personCache),resolveCache:_resolveCache,tmdbFind:_findCache,
    statsTmdb:_sxT,statsPeople:_sxP,ukTitles:_ukList,accent:accentNow(),views:_viewDef}; /* no apiCache: it expires in 24h anyway */
}
async function doExport(){
  const btn=document.querySelector('[data-act="doExport"] small'),orig=btn?.textContent; /* the row's grey line doubles as progress */
  if(btn)btn.textContent='Готую…';
  const data=_buildBackup(true); /* keys always in: a restored file then works at once */
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`cinetrack-backup-${_todayISO()}.json`;a.click();URL.revokeObjectURL(url);
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
      <button class="w-btn cl-go" id="csvGo" data-act="runCsvImport">Імпортувати ${p.entries.length-known}</button>
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
/* ── BACKUP VALIDATION ──
   A backup file is outside input: it can be hand-edited, come from another version, or be hostile.
   Every record is rebuilt from known fields with checked types, so nothing from the file reaches the page
   as markup or as script. A record that cannot be made valid is dropped and listed in the report. */
const _IMDB_RE=/^tt\d{1,12}$/,_TMDBKEY_RE=/^(movie|tv):\d{1,9}$/,_TMDBPATH_RE=/^\/[\w.\-]+$/;
const _s=(v,max)=>typeof v==='string'?v.slice(0,max):typeof v==='number'&&isFinite(v)?String(v).slice(0,max):'';
/* a number inside [lo,hi] (numeric strings count), else null */
const _n=(v,lo,hi)=>{const n=typeof v==='number'?v:typeof v==='string'&&v.trim()!==''?Number(v):NaN;return Number.isFinite(n)&&n>=lo&&n<=hi?n:null;};
const _i=(v,lo,hi)=>{const n=_n(v,lo,hi);return n===null?null:Math.trunc(n);};
const _isoDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)?v:null;
function _normLive(l){
  if(!l||typeof l!=='object'||Array.isArray(l))return null;
  const ep=v=>{const n=_i(v,0,99999);return n===null?null:String(n);};
  const o={isEnded:!!l.isEnded,lastAiredSeason:_i(l.lastAiredSeason,0,999),lastAiredEp:ep(l.lastAiredEp),lastAiredDate:_isoDate(l.lastAiredDate),
    nextEpSeason:_i(l.nextEpSeason,0,999),nextEpNum:ep(l.nextEpNum),nextEpDate:_isoDate(l.nextEpDate),_cachedAt:_n(l._cachedAt,0,9e15)||0};
  if(l.src==='tvmaze'||l.src==='omdb')o.src=l.src; /* entries without src are re-asked once, keep them that way */
  return o;
}
/* -> {item} or {bad:reason}. `list` decides which list-only fields are kept/defaulted */
function _normItem(src,list){
  if(!src||typeof src!=='object'||Array.isArray(src))return{bad:'не запис'};
  const imdbID=typeof src.imdbID==='string'?src.imdbID.trim():'';
  if(!_IMDB_RE.test(imdbID))return{bad:'некоректний imdbID'};
  let id=null;
  if(src.id!==undefined&&src.id!==null){id=_n(src.id,1,9e15);if(id===null)return{bad:'некоректний id'};id=Math.trunc(id);}
  const o={id,imdbID,title:_s(src.title,300).trim()||imdbID,
    poster:safeUrl(_s(src.poster,2000).replace(/^http:\/\//i,'https://'),true),
    year:_s(src.year,12),type:['movie','series','episode','game'].includes(src.type)?src.type:'movie',
    genre:_s(src.genre,200),country:_s(src.country,200),imdbUrl:`https://www.imdb.com/title/${imdbID}/`};
  const r=_s(src.imdbRating,5);o.imdbRating=/^(10(\.0)?|\d(\.\d)?)$/.test(r)?r:null;
  if(typeof src.customCategory==='string'&&Object.hasOwn(CAT,src.customCategory))o.customCategory=src.customCategory;
  const at=_n(src.addedAt,0,9e15);if(at!==null)o.addedAt=at;
  const rt=_i(src.rating,0,10);if(rt!==null)o.rating=rt;else if(list==='watched')o.rating=0;
  if(typeof src.comment==='string')o.comment=src.comment.slice(0,4000);else if(list==='watched')o.comment='';
  if(Array.isArray(src.tags)){const t=[...new Set(src.tags.filter(x=>typeof x==='string').map(x=>x.trim().slice(0,60)).filter(Boolean))].slice(0,40);if(t.length)o.tags=t;}
  const su=safeUrl(_s(src.streamUrl,2000));if(su)o.streamUrl=su;
  if(src.runtime===null)o.runtime=null;else{const m=_i(src.runtime,0,2000);if(m!==null)o.runtime=m;}
  const rc=_n(src._ratingCheckedAt,0,9e15);if(rc!==null)o._ratingCheckedAt=rc;
  const sn=_i(src.season,1,500),ep=_i(src.episode,1,100000),ts=_i(src.totalSeasons,1,500);
  if(list==='watching'){o.season=sn||1;o.episode=ep||1;o.totalSeasons=ts||Math.max(1,o.season);if(src.rewatch===true)o.rewatch=true;}
  else{if(sn)o.season=sn;if(ep)o.episode=ep;if(ts)o.totalSeasons=ts;}
  if(src.prevEp&&typeof src.prevEp==='object'){const s=_i(src.prevEp.s,1,500),e=_i(src.prevEp.e,1,100000);if(s&&e)o.prevEp={s,e};}
  if(src.seasonEps&&typeof src.seasonEps==='object'&&!Array.isArray(src.seasonEps)){
    const eps={};for(const k of Object.keys(src.seasonEps)){const kk=_i(k,1,500),v=_i(src.seasonEps[k],1,100000);if(kk&&v)eps[kk]=v;}o.seasonEps=eps;}
  const tv=_i(src.tvmazeId,1,1e9);if(tv)o.tvmazeId=tv;
  const ls=_normLive(src.liveStatus);if(ls)o.liveStatus=ls;
  return{item:o};
}
function _normHidden(h){
  if(!h||typeof h!=='object'||Array.isArray(h))return null;
  const imdbID=_IMDB_RE.test(h.imdbID||'')?h.imdbID:'',tmdb=_TMDBKEY_RE.test(h.tmdb||'')?h.tmdb:'';
  if(!imdbID&&!tmdb)return null;
  return{imdbID,tmdb,title:_s(h.title,300),year:_s(h.year,12),poster:safeUrl(_s(h.poster,2000),true)};
}
function _normPerson(p){
  const id=_i(p&&p.id,1,1e9);if(id===null)return null;
  return{id,name:_s(p.name,200),profile:_TMDBPATH_RE.test(p.profile||'')?p.profile:'',dept:_s(p.dept,30)};
}
/* Caches are regenerable, so they are filtered rather than repaired: a key must look like its kind of key,
   and an entry carrying markup characters anywhere inside is dropped (it will be fetched again). */
const _SAFE_KEY=/^[\w:.\-|]{1,60}$/;
function _scrubOk(v,d=0){
  if(d>7)return false;
  if(v===null||typeof v==='boolean')return true;
  if(typeof v==='number')return Number.isFinite(v);
  if(typeof v==='string')return v.length<=3000&&!/[<>"`\\\u0000-\u0008\u000b-\u001f]/.test(v);
  if(Array.isArray(v))return v.length<=5000&&v.every(x=>_scrubOk(x,d+1));
  if(typeof v==='object')return Object.keys(v).length<=5000&&Object.keys(v).every(k=>_SAFE_KEY.test(k)&&k!=='__proto__'&&k!=='constructor'&&_scrubOk(v[k],d+1));
  return false;
}
function _scrubCache(src,keyRe,stat){
  const out={};
  if(!src||typeof src!=='object'||Array.isArray(src))return out;
  for(const k of Object.keys(src)){
    if(!keyRe.test(k)||!_scrubOk(src[k])||!src[k]||typeof src[k]!=='object'){stat.n++;continue;}
    out[k]=src[k];
  }
  return out;
}
/* Merges a parsed backup into the live state; shared by file import and Drive restore.
   Throws on a wrong shape before anything live is touched. */
function _applyBackup(data){
  if(!data||typeof data!=='object'||(!data.watched&&!data.watching&&!data.planned))throw new Error('Невірний формат');
  /* Phase 1: parse and validate everything into temp variables. Nothing live is touched until the whole
     file has been read without a throw, so a broken file can't leave a half-merged state. */
  const arr=v=>Array.isArray(v)?v:[];
  const rejected=[]; /* {list,title,reason}: records that could not be made valid */
  const skipped=[]; /* {list,title,why:'dup'|'pair',other}: valid records that were not taken, so the report can say it */
  let aw=0,awn=0,apl=0;
  /* Dedup is per list: a title may legitimately sit in Переглянуте and Дивлюсь at once (a rewatch, see addWn).
     The only pair that contradicts itself is Планую + Переглянуте; of those the local/earlier one stays.
     Lists are taken watched -> watching -> planned, so a planned record is checked against all watched ones. */
  const inList={watched:new Set(watched.map(x=>x.imdbID)),watching:new Set(watching.map(x=>x.imdbID)),planned:new Set(planned.map(x=>x.imdbID))};
  const PAIR={watched:'planned',planned:'watched'};
  const usedIds=new Set([...watched,...watching,...planned].map(x=>x.id));
  let idSeq=Date.now();
  const take=(src,list,inc)=>{const out=[];arr(src).forEach(raw=>{
    const r=_normItem(raw,list);
    if(r.bad){rejected.push({list,title:_s(raw&&raw.title,80)||'(без назви)',reason:r.bad});return;}
    const it=r.item;
    if(inList[list].has(it.imdbID)){skipped.push({list,title:it.title,why:'dup'});return;}
    if(PAIR[list]&&inList[PAIR[list]].has(it.imdbID)){skipped.push({list,title:it.title,why:'pair',other:PAIR[list]});return;}
    inList[list].add(it.imdbID);
    if(it.id===null||usedIds.has(it.id)){while(usedIds.has(idSeq))idSeq--;it.id=idSeq--;} /* a file without ids, or an id taken here already */
    usedIds.add(it.id);out.push(it);inc();});return out;};
  const nW=take(data.watched,'watched',()=>aw++),nWn=take(data.watching,'watching',()=>awn++),nPl=take(data.planned,'planned',()=>apl++);
  const nHidden=arr(data.hidden).map(_normHidden).filter(it=>{if(!it)return false;const key=it.imdbID||it.tmdb;return !hidden.find(x=>(x.imdbID||x.tmdb)===key);});
  const nPeople=arr(data.trackedPeople).map(_normPerson).filter(p=>p&&!_trackedPeople.find(t=>t.id===p.id));
  const cs={n:0};
  const pcIn=data.personCache?_scrubCache(data.personCache,/^\d{1,9}$/,cs):null;
  const nPerson={};
  if(pcIn)for(const id in pcIn){const c=pcIn[id];nPerson[id]={ts:_n(c.ts,0,9e15)||0,cast:_slimCredits(Array.isArray(c.cast)?c.cast:[]),crew:_slimCredits(Array.isArray(c.crew)?c.crew:[])};}
  const nColl=data.collCache?_scrubCache(data.collCache,_IMDB_RE,cs):null,nDet=data.collDetails?_scrubCache(data.collDetails,/^\d{1,9}$/,cs):null;
  const nSkip=data.skippedParts?_scrubCache(data.skippedParts,_IMDB_RE,cs):null,nUnres=data.unresolvable?_scrubCache(data.unresolvable,_TMDBKEY_RE,cs):null;
  const nGame=data.gameBackdropCache?_scrubCache(data.gameBackdropCache,_IMDB_RE,cs):null;
  const nRes=data.resolveCache?_scrubCache(data.resolveCache,_TMDBKEY_RE,cs):null,nFind=data.tmdbFind?_scrubCache(data.tmdbFind,_IMDB_RE,cs):null;
  /* keys: the file never replaces a key that already works here (a stale or foreign file used to swap them silently) */
  const keyOk=k=>typeof k==='string'&&/^[\w\-]{5,64}$/.test(k);
  const setApi=!API&&keyOk(data.apiKey),setTmdb=!TMDB_KEY&&keyOk(data.tmdbKey);
  /* Phase 2: apply (plain assignments only) */
  _lsBadRelease(); /* a damaged user key is about to be replaced: its text is kept as ct_damaged_* */
  /* unshift one by one reverses the order; same result as before */
  watched.unshift(...nW.reverse());watching.unshift(...nWn.reverse());planned.unshift(...nPl.reverse());
  nHidden.forEach(it=>hidden.push(it));
  const apeople=nPeople.length;
  nPeople.forEach(p=>_trackedPeople.push(p));
  if(apeople){_peopleSave();}
  if(nColl){Object.assign(_collCache,nColl);_collCacheSave();}
  if(nSkip){Object.assign(_skippedParts,nSkip);_skippedSave();}
  if(nUnres){Object.assign(_unresolvable,nUnres);_unresolvableSave();}
  for(const [t,ks,kr] of [['frame','gameBestScore','gameRoundBest'],['actor','gameActorBest','gameActorRound'],['quote','gameQuoteBest','gameQuoteRound']]){
    const gb=_i(data[ks],0,1e6),gr=_i(data[kr],0,1e6),b=_gameBest[t];
    if(gb!==null&&gb>b.streak)b.streak=gb;
    if(gr!==null&&gr>b.round)b.round=gr;
    _gameBestSave(t);
  }
  if(nGame){Object.assign(_gameBackdropCache,nGame);_gameCacheSave();}
  if(typeof data.accent==='string'&&_hexRgb(data.accent)&&data.accent.toLowerCase()!==accentNow())setAccent(data.accent); /* the colour travels with the backup */
  if(data.views&&typeof data.views==='object'&&!Array.isArray(data.views)){ /* default views travel with the backup too */
    let ch=0;for(const t in VIEW_LISTS)if(_okView(data.views[t])&&data.views[t]!==viewDefOf(t)){_viewDef[t]=data.views[t];delete _views[t];ch++;}
    if(ch)_lsSet('ct_views_def',JSON.stringify(_viewDef));
  }
  if(data.ukTitles&&typeof data.ukTitles==='object'&&!Array.isArray(data.ukTitles)){ /* Ukrainian list titles: a new device need not look them all up again */
    let nUk=0;for(const [k,v] of Object.entries(data.ukTitles))if(/^tt\d+$/.test(k)&&typeof v==='string'&&v.length<300&&!Object.hasOwn(_ukList,k)){_ukList[k]=v;nUk++;}
    if(nUk)_lsSet('ct_uk_titles',JSON.stringify(_ukList));
  }
  _sxRestore(data.statsTmdb,data.statsPeople); /* stats: collected cast/series data, so a new device does not collect it again */
  /* data.apiCache is deliberately ignored: 24 h of someone else's answers, and the biggest thing in the file */
  if(nDet){Object.assign(_collDetails,nDet);_collDetailsSave();}
  if(pcIn){Object.assign(_personCache,nPerson);_personCacheSave();} /* _personCacheSave prunes old non-followed people */
  if(nRes){Object.assign(_resolveCache,nRes);_resolveCacheSave();}
  if(nFind){Object.assign(_findCache,nFind);_findSave();}
  if(setApi){API=data.apiKey;_lsSet('ct_apikey',API);}
  if(setTmdb){TMDB_KEY=data.tmdbKey;_tmdbBlocked=false;_lsSet('ct_tmdbkey',TMDB_KEY);}
  /* lists changed: drop the cached shelves so Рекомендації rebuilds against the new lists (recsFetched was never read) */
  _recs=null;try{localStorage.removeItem('ct_recs');}catch(e){}
  save();['watched','watching','planned'].forEach(buildBar);
  rWatched();rWatching(true);rPlanned();rDash();updateStats();renderPeopleTab();
  return{aw,awn,apl,skip:skipped.length,skipped,apeople,rejected,cacheDropped:cs.n,keys:{api:setApi,tmdb:setTmdb}};
}
/* ── REPLACE MODE + LOCAL SNAPSHOT ──
   «Замінити» empties the lists and restores the file into them. Before that the current lists, hidden
   titles and tracked people are kept as one snapshot (ct_snapshot, one slot), and can be put back. */
const SNAP_KEY='ct_snapshot',SNAP_META='ct_snapshot_meta';
function _snapshotTake(){
  const meta={ts:Date.now(),w:watched.length,wn:watching.length,p:planned.length};
  const ok=_lsSet(SNAP_KEY,JSON.stringify({ts:meta.ts,watched,watching,planned,hidden,trackedPeople:_trackedPeople}));
  if(ok)_lsSet(SNAP_META,JSON.stringify(meta));
  return ok;
}
function _snapshotMeta(){return _lsJSON(SNAP_META,null);}
function _snapshotRow(){
  const m=_snapshotMeta();if(!m||!m.ts)return '';
  return `<button class="st-act" data-act="snapshotRestore">${ic('undo')}<span><b>Повернути знімок до заміни</b><small>${esc(_gdFmt(m.ts))}: ${m.w} переглянуто, ${m.wn} дивлюсь, ${m.p} заплановано</small></span></button>`;
}
function _redrawAll(){
  ['watched','watching','planned'].forEach(buildBar);
  rWatched();rWatching(true);rPlanned();rDash();updateStats();renderPeopleTab();
}
/* mode 'merge' (default) or 'replace' */
function _restoreBackup(data,mode){
  if(mode!=='replace')return _applyBackup(data);
  if(!data||typeof data!=='object'||(!data.watched&&!data.watching&&!data.planned))throw new Error('Невірний формат');
  if(!_snapshotTake())throw new Error('Не вдалося зберегти знімок поточних даних (сховище переповнене), заміну не виконано');
  const keep=[watched.slice(),watching.slice(),planned.slice(),hidden.slice(),_trackedPeople.slice()];
  watched.length=watching.length=planned.length=hidden.length=_trackedPeople.length=0;
  try{const r=_applyBackup(data);r.replaced=true;return r;}
  catch(e){watched.push(...keep[0]);watching.push(...keep[1]);planned.push(...keep[2]);hidden.push(...keep[3]);_trackedPeople.push(...keep[4]);throw e;}
}
function snapshotRestore(){
  const s=_lsJSON(SNAP_KEY,null);
  if(!s||!Array.isArray(s.watched)){toast('Знімка немає','err');return;}
  if(!confirm('Повернути списки до знімка? Поточні списки буде замінено.'))return;
  _lsBadRelease();
  watched.splice(0,watched.length,...s.watched);watching.splice(0,watching.length,...(s.watching||[]));planned.splice(0,planned.length,...(s.planned||[]));
  hidden.splice(0,hidden.length,...(s.hidden||[]));_trackedPeople.splice(0,_trackedPeople.length,...(s.trackedPeople||[]));
  _peopleSave();save();
  localStorage.removeItem(SNAP_KEY);localStorage.removeItem(SNAP_META);
  _redrawAll();closeModal();toast('Списки повернуто до знімка','ok',3200);
}
/* a toast with «Повернути» right after a replace */
function _snapshotToast(){
  document.querySelectorAll('.toast').forEach(t=>t.remove());
  const el=document.createElement('div');el.className='toast undo';
  const lbl=document.createElement('span');lbl.textContent='Дані замінено, знімок попереднього стану збережено';
  const btn=document.createElement('button');btn.className='t-undo';btn.innerHTML=ic('undo')+'Повернути';
  btn.onclick=()=>{el.remove();snapshotRestore();};
  lbl.addEventListener('click',()=>el.remove());lbl.style.cursor='pointer';lbl.title='Натисни, щоб закрити';
  el.append(lbl,btn);_toastMount(el);_toastTimer(el,8000,()=>el.remove());
}
/* one honest sentence block for the import report (file import and Drive both use it) */
function _backupReport(r){
  const L=[`${r.replaced?'Замінено. Знімок попереднього стану збережено. ':''}Імпортовано: ${r.aw} переглянуто, ${r.awn} дивлюсь, ${r.apl} заплановано${r.apeople?`, ${r.apeople} людей у стеженні`:''}`];
  const dup=r.skipped.filter(x=>x.why==='dup'),pair=r.skipped.filter(x=>x.why==='pair');
  if(dup.length)L.push(`Пропущено ${dup.length}: вже є в тому ж списку, лишилась твоя версія`);
  if(pair.length){
    const ex=pair.slice(0,4).map(x=>`«${x.title}»: у файлі ${LIST_L[x.list]}, але вже є в «${LIST_L[x.other]}»`).join('; ');
    L.push(`Не взято ${pair.length}, бо суперечить твоїм спискам (Планую і Переглянуте разом): ${ex}${pair.length>4?'…':''}`);
  }
  if(r.rejected.length){
    const ex=r.rejected.slice(0,4).map(x=>`«${x.title}» (${x.reason})`).join(', ');
    L.push(`Відкинуто ${r.rejected.length} пошкоджених записів: ${ex}${r.rejected.length>4?'…':''}`);
  }
  if(r.cacheDropped)L.push(`Відкинуто ${r.cacheDropped} підозрілих записів кешу, вони завантажаться заново`);
  return L;
}
function doImport(e,mode){
  const file=e.target.files[0];if(!file)return;
  if(mode==='replace'&&!confirm('Замінити поточні списки даними з файлу? Перед цим буде збережено знімок поточного стану, його можна повернути в Налаштуваннях.')){e.target.value='';return;}
  const msg=document.getElementById('impMsg');if(msg){msg.style.color='var(--muted)';msg.textContent='Читаю файл…';}
  const rd=new FileReader();
  rd.onload=ev=>{
    const show=(c,t)=>{const el=document.getElementById('impMsg');if(el){el.style.color=c;el.style.whiteSpace='pre-line';el.textContent=t;}};
    try{
      const r=_restoreBackup(JSON.parse(ev.target.result),mode);
      if(r.replaced)_snapshotToast();
      show(r.rejected.length?'var(--gold)':'var(--jade-2)',_backupReport(r).join('\n'));
      runMaintenance(); /* fresh titles arrive without country/rating */
    }catch(err){show('var(--rose)','✕ '+(err.message||'невірний файл'));}
  };
  rd.readAsText(file);e.target.value='';
}

/* ── VERSION and CHANGELOG: newest first; bump APP_VERSION and add an entry with every change pushed to the site ── */
const CHANGELOG=[
  {v:'1.32',d:'13.11.2026',n:['У встановленому застосунку вихід — лише двома «Назад» поспіль: перший показує підказку «Ще раз „Назад“ — щоб вийти», другий упродовж 2 секунд закриває застосунок. У вкладці браузера «Назад» працює як звичайно.']},
  {v:'1.31',d:'13.11.2026',n:['Кінопис можна встановити як застосунок: в Chrome на телефоні — меню ⋮ → «Установити застосунок» (або «Додати на головний екран»), на компʼютері — значок установки в адресному рядку; відкривається в окремому вікні, без адресного рядка','Кнопка «Назад» (жест) тепер закриває картку тайтлу, вікна з питаннями й гру, а не виходить із сайту; картка, відкрита з пошуку, закривається першою, пошук лишається','Клавіатура й екранні читці: плитки в «Дивлюсь» відкриваються Enter/Space, меню «⋯» керується стрілками, Home/End, Esc і повертає фокус на кнопку; шторки та вікна переносять фокус у себе й повертають назад, усе позаду недоступне Tab; є посилання «До вмісту» та головна область сторінки','Повідомлення озвучуються екранними читцями; помилки лишаються довше, а повідомлення зі «Скасувати» не зникає, поки на ньому курсор або фокус','На компʼютері горизонтальні стрічки без смуги прокручуються колесом миші','Шрифти тепер зберігаються разом із сайтом (без запитів до Google Fonts); адресний рядок і тло в темному кольорі застосунку; зображення дозволені лише з m.media-amazon.com та image.tmdb.org','Файл бекапу тепер називається за місцевою датою (раніше між 00:00 і 03:00 мав учорашню)']},
  {v:'1.30',d:'11.11.2026',n:['Пошук: поки нічого не введено, видно «Ти шукав» (останні запити), «Нещодавно додане» й людей, за якими стежиш','Пошук: під кожним знайденим тайтлом, якого ще немає у списках, кнопка «+ Додати» з вибором списку']},
  {v:'1.29.6',d:'11.11.2026',n:['Рекомендації: після «−» (Не цікаво) з\'являється «Скасувати» на 6 секунд — тайтл повертається на своє місце']},
  {v:'1.29.5',d:'11.11.2026',n:['Телефон: меню (☰) знову відкривається на весь екран і тоді, коли адресний рядок схований; під ним темне тло — сторінка не просвічує зверху й знизу']},
  {v:'1.29.4',d:'11.11.2026',n:['Телефон: нижнє меню знову спрацьовує після будь-якої шторки (серіал, теги, фільтри), коли адресний рядок схований — шторки більше не змушують Chrome показувати смугу жестів, через яку він губив справжню висоту екрана']},
  {v:'1.29.3',d:'11.11.2026',n:['Телефон: одразу після того, як стягнеш шторку вниз, меню знизу спрацьовує з першого дотику (раніше дотик у перші частки секунди з\'їдала шторка, що від\'їжджала)']},
  {v:'1.29.2',d:'11.11.2026',n:['Телефон: нижнє меню не підстрибує, коли відкриваєш і закриваєш меню, шторку серіалу, фільтри, теги чи картку, і після шторки спрацьовує з першого дотику','Комп\'ютер: плитки на фоні не змінюють розмір, коли відкривається шторка серіалу чи картка']},
  {v:'1.29.1',d:'10.11.2026',n:['Дивлюсь: сортування знову працює — порядок усередині кожної полиці; нове сортування за замовчуванням «За ефіром» (спершу нові серії й найближчі дати)']},
  {v:'1.29',d:'10.11.2026',n:['Дивлюсь: серіали розкладено полицями — «Дата наступної серії відома» (від найближчої), «Дата невідома», «Серіал завершено», «Фільми»; невідивлене першим','Фільтри в Дивлюсь: новий пункт «Стан ефіру» — Дата відома / Дата невідома / Завершено / Фільми']},
  {v:'1.28',d:'10.11.2026',n:['Дивлюсь — новий вигляд: постери сіткою, на постері великим S·E, мітки «сьогодні / 2 дні тому / ще N», «Триває + дата наступної серії» або «Завершено», смужка прогресу; під постером сезон N з M',
    'Дивлюсь: угорі перемикач Сьогодні / Нещодавно / Незабаром (порожні групи не показуються) і великі картки з тим, що вийшло і що вийде',
    'Дивлюсь: тап по постеру — шторка з усім про серіал, мінус і плюс серії, прогрес за сезонами, теги; свайп униз закриває, свайп угору від назви відкриває картку',
    'Фільтри: один рядок «Знайти в списку · Фільтри · сортування»; усе інше — у шторці з кнопкою «Показати N»; вибране видно золотими чипами з ✕',
    'Теги: шторка з усіма твоїми тегами (тап — додати/зняти) і полем для нового; тег видно міткою на постері, тап по ньому показує все з цим тегом',
    'Полиці: коли вибрано тип (напр. Фільм), полиці групуються за жанрами — перемикач Сітка/Полиці знову щось змінює']},
  {v:'1.27',d:'10.11.2026',n:['Швидше відкривається: код сайту вантажиться паралельно, а не файл за файлом (на повільному інтернеті ~2,6 с замість ~7 с)','Меню на телефоні відкривається й закривається плавно, без стрибків слів і ривків затемнення; після вибору розділу спершу закривається меню, потім будується сторінка','Нижня панель на телефоні не їздить, коли під час прокрутки ховається адресний рядок','Сховище браузера: кеш фільмографій тримає лише тих, за ким стежиш, і відкритих за останні 7 днів (було заповнено майже до межі)','Стіни постерів у меню й пошуку будуються після завантаження сторінки; банер статистики бере зменшені постери']},
  {v:'1.26',d:'10.11.2026',n:['Люди: поле вгорі тепер фільтрує тих, за ким стежиш (нових людей шукай у загальному пошуку — там і «Стежити»)','Люди: обличчя сіткою у два ряди з лічильником «Стежиш N»; останнє місце — «Ще N», розгортає всіх']},
  {v:'1.25.2',d:'09.11.2026',n:['Технічне: прибрано стилі старої бічної панелі, верхнього рядка й нижньої смуги (63 правила, файл стилів менший на 5%); вигляд не змінився']},
  {v:'1.25.1',d:'09.11.2026',n:['Знову: перехід на іншу сторінку відкриває її з самого верху (після нового меню на телефоні браузер повертав стару прокрутку)']},
  {v:'1.25',d:'09.11.2026',n:['Пошук у списках (Переглянуте, Дивлюсь, Планую, Франшизи, фільмографія): з’являється ✕, щоб одним дотиком скинути введене; на ПК також Esc']},
  {v:'1.24.2',d:'09.11.2026',n:['На телефоні більше ніде не показуються клавіші: у грі зникли «Enter» на кнопках «Далі» й «Ще раз» і цифри 1–4 на варіантах, у пошуку й меню — «Esc» і «/». На ПК підказки лишаються']},
  {v:'1.24.1',d:'09.11.2026',n:['Налаштування, ключі: TMDB більше не «необов’язковий» — він тепер головне джерело й стоїть першим. Біля кожного ключа коротко, для чого він; посилання «отримати ключ» показується, лише коли ключа немає або його змінюєш','Без ключа TMDB застосунок одразу підказує його додати']},
  {v:'1.24',d:'09.11.2026',n:['Повторний перегляд — окремий стан: у «Дивлюсь» біля назви пише «повторно» замість «дубль», а «Перевірка даних» у Налаштуваннях такі тайтли більше не пропонує прибрати. Стан зберігається в бекапі']},
  {v:'1.23',d:'09.11.2026',n:['Картка тайтлу: стан («Переглянуто», «Дивлюсь», «Заплановано») тепер кнопка ▾ — натисни й обери інший стан або видали. Окрему кнопку «Дивитись знову» прибрано','Новий перехід: з «Дивлюсь» у «Планую»']},
  {v:'1.22',d:'09.11.2026',n:['«Дивитись знову»: переглянутий фільм чи серіал можна повернути в «Дивлюсь» без видалення й нового пошуку — кнопка в картці тайтлу та в меню ⋯ картки в Переглянутому. У Переглянутому він теж лишається з твоєю оцінкою й коментарем','Під час повторного перегляду картка показує «Дивлюсь знову» і серії, а коли позначаєш «Переглянуто повністю», форма вже містить твою попередню оцінку й коментар']},
  {v:'1.21',d:'09.11.2026',n:['Меню на телефоні: угорі логотип і рядок пошуку, розділи посередині, налаштування й стан бекапу в нижньому рядку поруч із хрестиком — без порожнього місця']},
  {v:'1.20.3',d:'09.11.2026',n:['Гра на ПК тепер по центру екрана, а не притиснута вліво; на телефоні не показується підказка про клавіші']},
  {v:'1.20.2',d:'09.11.2026',n:['Пошук: картка фільму відкривається поверх результатів, вони не зникають і не блимають; після закриття позначки на постерах оновлюються. На ПК Esc закриває спершу картку, потім пошук','На телефоні підказка в пошуку більше не згадує клавіші, яких там немає']},
  {v:'1.20.1',d:'09.11.2026',n:['Пошук на телефоні: коли відкрита клавіатура, рядок пошуку більше не виїжджає за верх екрана']},
  {v:'1.20',d:'09.11.2026',n:['Пошук показує до 20 фільмів і серіалів (було 7) і до 4 людей']},
  {v:'1.19',d:'09.11.2026',n:['Пошук: рядок пошуку й кнопка «Скасувати» лишаються вгорі, коли гортаєш результати']},
  {v:'1.18.2',d:'09.11.2026',n:['Пошук: після закриття картки фільму повертаєшся до тих самих результатів, вводити назву заново не треба. Пошук закривається лише кнопкою, Esc, «Назад» або переходом на іншу сторінку']},
  {v:'1.18.1',d:'09.11.2026',n:['Пошук на телефоні більше не зсувається вбік: фонова стіна з постерів розширювала екран']},
  {v:'1.18',d:'09.11.2026',n:['Нове меню: замість бічної панелі на ПК і нижньої смуги на телефоні — один «док» із твоїх постерів. На ПК зверху: списки з числами, розділи, пошук і кнопка налаштувань зі станом бекапу (жовте кільце — бекап давно не робився); на вужчих екранах розділи ховаються в «Ще»','На телефоні: док унизу з трьома списками й кнопкою меню; меню розгортається на весь екран великими словами, налаштування там же; пошук — кнопкою вгорі праворуч','Пошук відкривається на весь екран, результати постерами з позначками «Переглянуто», «Дивлюсь», «Планую». Закрити: Esc чи «Закрити» на ПК, «Скасувати» або кнопка «Назад» на телефоні']},
  {v:'1.17.1',d:'09.11.2026',n:['Налаштування: вибір вигляду за замовчуванням більше не перезапускає вікно','Вигляд за замовчуванням тепер у бекапі; зміна кольору чи вигляду теж запускає автобекап на Drive (раніше колір у бекап потрапляв, лише якщо змінювались і списки)']},
  {v:'1.17',d:'08.11.2026',n:['Нова назва: Кінопис (замість CineTrack, якого в інтернеті безліч). Адреса сайту, дані й бекапи на Drive лишаються ті самі']},
  {v:'1.16.1',d:'08.11.2026',n:['Картки: роки й тип у першому рядку, оцінка IMDb окремим другим рядком; роки серіалів знову повністю («2011–2020»)']},
  {v:'1.16',d:'08.11.2026',n:['Вхід лише для запрошених: застосунок відкривається тільки після входу через Google поштою, яку додав власник; решта бачить лише екран входу','При переході між сторінками екран повертається нагору','Оцінка IMDb на картках серіалів більше не обрізається','Українські назви тепер у бекапі: на новому пристрої не треба шукати їх заново']},
  {v:'1.15',d:'08.11.2026',n:['Українські назви в Переглянутому, Дивлюсь і Планую (де TMDB має переклад); пошук у списках знаходить і за українською, і за оригінальною назвою']},
  {v:'1.14',d:'08.11.2026',n:['Українські назви у Франшизах, Людях і в рекомендаціях «Наступне у франшизах» та «Люди» (там, де TMDB має переклад; інакше лишається англійська)']},
  {v:'1.13',d:'08.11.2026',n:['Рекомендації в новому вигляді: жанри великими плитками з кадрами, полиці стрічками, «Додати» і «сховати» просто на постері','Нова перша полиця «Для тебе»: тайтли, які радять одразу кілька твоїх улюблених, з підписом «схоже на X і Y»','Назви українською; більше не пропонується переглянуте й сховане (звірка за кодом TMDB)','«Схоже на…» добирається з усього переглянутого з високим IMDb, а не за датою додавання; у «Свіжих» і жанрах з’явились серіали','«Оновити» справді оновлює всі полиці; полиці аніме й анімаційних серіалів; надійніше при збоях TMDB']},
  {v:'1.12.4',d:'08.11.2026',n:['Люди на ПК: фото — висока панель ліворуч на всю висоту портрета, текст посередині, стіна постерів лише праворуч']},
  {v:'1.12.3',d:'08.11.2026',n:['Люди: мʼякі краї фото в портреті замість різких']},
  {v:'1.12.2',d:'08.11.2026',n:['Люди: фото в портреті суцільне, постери крізь нього не просвічують; на телефоні показується весь портрет, обличчя не обрізається']},
  {v:'1.12.1',d:'08.11.2026',n:['Люди: на телефоні фото стоїть над текстом і обличчя не перекривається; на ПК порожнє місце в портреті заповнено стіною постерів із фільмографії']},
  {v:'1.12',d:'08.11.2026',n:['Нова вкладка «Люди»: круглі фото тих, за ким стежиш, великий портрет із «переглянуто N з M», уся кар\'єра за десятиліттями стрічками постерів; стан кожного фільму міткою на постері («Додати», «Заплановано», «Пропущено», «Вийде…»); фільтри типу й ролі сховано під кнопку «Тип, роль»']},
  {v:'1.11',d:'08.11.2026',n:['Нова сторінка гри «Великий екран»: вибір гри плитками з картинками (кадр, обличчя, цитата), великий екран із загадкою і кнопки «Серія» та «Раунд з 10» з рекордами']},
  {v:'1.10.1',d:'08.11.2026',n:['Акцентний колір зберігається в бекапі (файл і Drive) і відновлюється разом із даними']},
  {v:'1.10',d:'08.11.2026',n:['Акцентний колір на вибір: Налаштування → «Акцентний колір», вісім готових або свій']},
  {v:'1.9.2',d:'08.11.2026',n:['Картка фільму: кнопка «Пропустити» для частин франшиз (і «Скасувати», якщо вже пропущено)','Кнопки «Переглянуто / Дивлюсь / Запланувати» однакові: жодна більше не виглядає вже обраною']},
  {v:'1.9.1',d:'08.11.2026',n:['Франшизи: усі частини постерами, стан — міткою на постері: «Не переглянуто» (натиск додає), «Пропущено», «Заплановано», «Дивлюсь», «Вийде …»; переглянуті з зеленою галочкою. Пропущені частини, як і раніше, зараховуються до зібраних','Мітки «Заплановано» й «Дивлюсь» теж натискаються: можна змінити статус або пропустити частину просто з франшизи']},
  {v:'1.9',d:'08.11.2026',n:['Франшизи в новому дизайні «Альбом»: кожна франшиза як сторінка альбому, переглянуті частини постерами, відсутні порожніми клітинками з номером і кнопкою «+»; під кожною частиною назва, рік і IMDb','Статуси франшиз великими цифрами-вкладками; блок «Лишилась одна частина»']},
  {v:'1.8.1',d:'08.11.2026',n:['Зібрані для статистики актори, режисери й серії тепер у бекапі (файл і Drive): на новому пристрої не збираються вдруге','Статистика не перемальовується, якщо нічого не змінилось']},
  {v:'1.8',d:'08.11.2026',n:['Статистика в новому дизайні: стіна постерів і велика цифра часу, шість коротких фактів замість тексту, рекорди з підписами на постерах, обличчя з лічильником, десятиліття стовпчиками з постерів, жанри хмарою слів']},
  {v:'1.7',d:'08.11.2026',n:['Нова статистика: кінопортрет словами, час перед екраном разом із серіалами, рекорди й десятиліття постерами','Кого ти бачив найчастіше: актори, режисери й автори серіалів (дані збираються у фоні, поки сторінка відкрита)','Твої знахідки: високий IMDb при малій кількості голосів','Що далі: улюблений жанр, франшизи за крок до повної','Жанри й країни українською, довгі списки згорнуті']},
  {v:'1.6.1',d:'08.11.2026',n:['«Впізнай цитату»: лише українські цитати, тайтли без українського гасла пропускаються']},
  {v:'1.6',d:'08.11.2026',n:['Третя гра «Впізнай цитату»: гасло з картки переглянутого тайтлу, треба вгадати, звідки воно. Назва в самій цитаті прихована']},
  {v:'1.5',d:'08.11.2026',n:['Нова гра «Впізнай актора»: фото актора з головних ролей у переглянутому, треба вгадати, де він грав. Перемикач «Кадр / Актор» на вкладці гри, окремі рекорди']},
  {v:'1.4',d:'08.11.2026',n:['Вигляд за замовчуванням для Переглянутого й Планую: Налаштування → «Вигляд за замовчуванням» (сітка, список або полиці); перемикач над списком діє до наступного відкриття','Номер версії та історія змін у Налаштуваннях']},
  {v:'1.3',d:'07.11.2026',n:['Перемикач вигляду для Переглянутого й Планую: сітка, список, полиці за категоріями','Гра «Впізнай кадр»: українські назви, оригінал у дужках','Звіт після «Підтягнути» з Drive коротший; сповіщення закриваються дотиком']},
  {v:'1.2',d:'03.11.2026',n:['Безпека: перевірка бекапів при відновленні, захист від шкідливих даних','Відновлення: без дублів, повторні перегляди зберігаються, звіт про пропущене','Дві відкриті вкладки більше не перезаписують одна одну','Drive: 10 копій, захист від зменшеного автобекапу, відновлення із заміною та знімком','Доступність: клавіатура, підказки, зірки оцінки','Дрібні виправлення: сезони, ліміти API, постери, гра']},
  {v:'1.1',d:'28.10.2026',n:['Картка тайтлу: статус у списках під постерами схожих тайтлів']},
  {v:'1.0',d:'27.10.2026',n:['Бекап на Google Drive','Мобільні картки «Дивлюсь»: більший постер, кнопки на всю ширину','Виправлено відсутні постери через TMDB','Налаштування на одній сторінці, автоматичне обслуговування','Помаранчеві акценти']},
];
const APP_VERSION=CHANGELOG[0].v;
function openChangelog(){
  const groups=[];CHANGELOG.forEach(e=>{const k=e.v.split('.').slice(0,2).join('.'),g=groups[groups.length-1];if(g&&g.k===k)g.items.push(e);else groups.push({k,items:[e]});});
  const ver=e=>`${e.items.length>1?`<div class="cl-sub">${e.v}${e.v===APP_VERSION?' · поточна':''}<span>${e.d}</span></div>`:''}<ul>${e.n.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`;
  modal(`<div class="st-head"><h2 class="modal-title">Історія змін</h2><button class="st-x" data-act="closeModal" title="Закрити" aria-label="Закрити">✕</button></div>
    <div class="st-body">${groups.map((g,i)=>{const top=g.items[0],fx=g.items.length-1,cur=g.items.some(e=>e.v===APP_VERSION);
      return `<details class="st-row cl-ver"${i===0?' open':''}><summary class="st-row-head"><span class="st-lbl">Версія ${g.k}${fx?`<small> + ${fx} ${fx%10>=1&&fx%10<=4&&(fx%100<11||fx%100>14)?'виправлення':'виправлень'}</small>`:''}${cur?' · поточна':''}</span><span class="st-hint">${top.d}</span></summary>${g.items.map(e=>ver({...e,items:g.items})).join('')}</details>`;}).join('')}</div>`);
  document.querySelector('.modal')?.classList.add('st-modal');
  _lsSet('ct_seen_ver',APP_VERSION);
}
/* after an update: one toast that leads to the changelog (not on the very first visit) */
function _versionNotice(){
  const seen=localStorage.getItem('ct_seen_ver');
  if(seen===APP_VERSION)return;
  _lsSet('ct_seen_ver',APP_VERSION);
  if(seen||localStorage.getItem('ct_watched'))setTimeout(()=>{toast(`Оновлено до версії ${APP_VERSION}. Що нового — Налаштування → Версія`,'',7000);},1500);
}
