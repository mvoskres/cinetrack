/* Pause the animated aurora background while the tab is hidden — no visible cost, saves GPU work */
document.addEventListener('visibilitychange',()=>{document.querySelector('.bg-fx')?.classList.toggle('paused',document.hidden);});

/* ── SAFE STORAGE ──
   localStorage holds ~5M chars per origin, and every file:// page shares that
   one origin. A full store makes setItem throw, which used to abort whatever
   was saving (inside aFetch that even failed adding a movie). Now a failed
   write first frees space by dropping regenerable caches, then retries; the
   user's own lists are never pruned. */
let _quotaWarned=false;
const _LIST_KEYS=['ct_watched','ct_watching','ct_hidden','ct_planned'];
function _lsSet(k,v){
  try{localStorage.setItem(k,v);return true;}catch(e){}
  _freeCacheSpace();
  if(k==='ct_apicache')return true; /* _freeCacheSpace just wrote the pruned cache */
  try{localStorage.setItem(k,v);return true;}catch(e){
    /* a failed list write = data not on disk: tell the user every time, not once per session */
    const isList=_LIST_KEYS.includes(k);
    if(isList||!_quotaWarned){_quotaWarned=true;try{toast(isList?'Не вдалося зберегти списки: сховище браузера переповнене. Зроби бекап і очисти кеші: Налаштування → Дані':'Сховище браузера переповнене. Зроби бекап і очисти кеші: Налаштування → Дані','err',9000);}catch(_){}}
    return false;
  }
}
function _freeCacheSpace(){
  _pruneApiCache(200);
  try{localStorage.setItem('ct_apicache',JSON.stringify(_apiCache));}catch(e){localStorage.removeItem('ct_apicache');}
  /* pure caches only (all refetched on demand); lists, tracked people, collections, game progress stay */
  ['ct_gamebackdrops','ct_titlecache','ct_personcache','ct_recs'].forEach(k=>localStorage.removeItem(k));
}
function _pruneApiCache(max){
  const now=Date.now();let n=0;
  for(const k in _apiCache)if(!(now-_apiCache[k].ts<_apiTTL)){delete _apiCache[k];n++;}
  const ks=Object.keys(_apiCache);
  if(ks.length>max){ks.sort((a,b)=>_apiCache[a].ts-_apiCache[b].ts).slice(0,ks.length-max).forEach(k=>delete _apiCache[k]);n+=ks.length-max;}
  return n;
}
function _storageChars(){let n=0;for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);n+=k.length+(localStorage.getItem(k)||'').length;}return n;}

/* ── STATE ── */
let API=localStorage.getItem('ct_apikey')||'';
let watched =JSON.parse(localStorage.getItem('ct_watched') ||'[]');
let watching=JSON.parse(localStorage.getItem('ct_watching')||'[]');
let hidden  =JSON.parse(localStorage.getItem('ct_hidden')  ||'[]');
let planned =JSON.parse(localStorage.getItem('ct_planned') ||'[]');
const _pendingMap={};
function _pmSet(k,v){const ks=Object.keys(_pendingMap);if(ks.length>=100)delete _pendingMap[ks[0]];_pendingMap[k]=v;}let recsFetched=0;
let TMDB_KEY=localStorage.getItem('ct_tmdbkey')||'';
const GDRIVE_CLIENT_ID='736522220888-jt1nuelrnm81684kgs0krup3sv6p4d2d.apps.googleusercontent.com'; /* OAuth Client ID (Web application); can be pasted in Settings → Дані instead (ct_gclientid) */
let _tmdbBlocked=false;

/* ── PERSISTENT API CACHE (24h TTL) ── */
const _apiCache=JSON.parse(localStorage.getItem('ct_apicache')||'{}');
const _apiTTL    = 86400000;  /* 24h in ms */
const OMDB_TIMEOUT = 8000;    /* aFetch per-request timeout (ms) */
const RETRY_DELAY  = 1000;    /* aFetch base retry backoff (ms) */
const LIVE_STAGGER = 650;     /* ms between _startLive fetchLive calls */
const SIX_HOURS    = 216e5;   /* live status cache TTL (ms) */
/* Debounced: aFetch runs in batches, and re-serialising the whole cache after
   every single response was the hottest path in bulk scans. */
let _cacheSaveT=null;
function _cacheSave(){clearTimeout(_cacheSaveT);_cacheSaveT=setTimeout(_cacheFlush,1500);}
function _cacheFlush(){
  clearTimeout(_cacheSaveT);_cacheSaveT=null;
  /* s=/t= are typed search queries: useful for the session, noise on disk */
  const keep={};for(const k in _apiCache)if(!/^[st]=/.test(k))keep[k]=_apiCache[k];
  _lsSet('ct_apicache',JSON.stringify(keep));
}
window.addEventListener('pagehide',_cacheFlush);
/* Expired entries are never served (aFetch checks the TTL), so they only ate space */
if(_pruneApiCache(1500))_cacheFlush();

/* ── PERSISTENT TVMAZE LIVE CACHE ── */
/* ct_livecache used to hold rendered HTML per show, a copy of item.liveStatus.
   Superseded; drop the stored leftovers. */
localStorage.removeItem('ct_livecache');

/* ── PERSISTENT TMDB→IMDb RESOLVE CACHE ──
   Used by resolveImdbIds to avoid re-hitting /external_ids for TMDB ids we've
   already resolved. Movies and ended series are permanent (the imdb_id mapping
   never changes); series still airing are refreshed every 2 days in case a show
   we thought was "ended" later got renewed, or status data was unknown at
   first resolve. Ended-status is taken from the item's liveStatus when we track the show
   in "Дивлюсь", otherwise defaults to "series → refresh every 2 days". */
let _resolveCache=JSON.parse(localStorage.getItem('ct_resolvecache')||'{}');
const RESOLVE_TV_TTL=2*24*60*60*1000; /* 2 days */
function _resolveCacheSave(){
  const ks=Object.keys(_resolveCache);
  if(ks.length>2000){ /* soft cap: drop oldest 500 entries */
    ks.sort((a,b)=>(_resolveCache[a].ts||0)-(_resolveCache[b].ts||0))
      .slice(0,500).forEach(k=>delete _resolveCache[k]);
  }
  _lsSet('ct_resolvecache',JSON.stringify(_resolveCache));
}
function _resolveFresh(entry){
  if(!entry)return false;
  if(entry.ended)return true; /* movies, or series known-ended: never expire */
  return Date.now()-entry.ts<RESOLVE_TV_TTL;
}

/* ── FILTER STATE ── */
const F={
  watched: {q:'',cats:[],genres:[],decades:[],ratings:[],tags:[],sort:'added-desc'},
  watching:{q:'',cats:[],genres:[],decades:[],tags:[],sort:'added-desc'},
  planned: {q:'',cats:[],genres:[],decades:[],tags:[],sort:'added-desc'},
};
const CAT={movie:'Фільм',series:'Серіал',anime:'Аніме',cartoon:'Мульт',other:'Інше'};
const S_ALL=[['added-desc','Нові'],['added-asc','Старі'],['year-desc','Рік ↓'],['year-asc','Рік ↑'],['title-asc','А→Я'],['genre-asc','Жанр'],['imdb-rating-desc','IMDb ↓'],['imdb-rating-asc','IMDb ↑']];
const S_W  =[...S_ALL,['rating-desc','Оцінка ↓']];

function tList(t){return t==='watched'?watched:t==='watching'?watching:planned;}
function barId(t) {return{watched:'wBar',watching:'wnBar',planned:'plBar'}[t];}
function tagsId(t){return{watched:'wTags',watching:'wnTags',planned:'plTags'}[t];}
function panId(t) {return{watched:'wPanel',watching:'wnPanel',planned:'plPanel'}[t];}
function fN(t){const f=F[t];return f.cats.length+f.genres.length+f.decades.length+(f.ratings?.length||0)+(f.tags?.length||0);}

/* ── FILTER BAR ── */
function buildBar(t){
  const el=document.getElementById(barId(t));if(!el)return;
  const f=F[t],n=fN(t)-f.cats.length,opts=t==='watched'?S_W:S_ALL;
  const list=tList(t),counts={};list.forEach(i=>{const c=i.customCategory||i.type;if(c)counts[c]=(counts[c]||0)+1;});
  let cur=f.cats[0]||'';
  if(cur&&!counts[cur]){f.cats=[];cur='';} /* its last title left the list: don't leave an invisible filter on an empty-looking list */
  const cats=Object.keys(CAT).filter(c=>counts[c]);
  el.innerHTML=`
    ${cats.length>1?`<div class="cat-seg" role="group" aria-label="Категорія">
      <button class="cat-chip${cur?'':' on'}" data-act="setCat" data-args="${A(`${t}`,'')}">Усі<span class="num">${list.length}</span></button>
      ${cats.map(c=>`<button class="cat-chip${cur===c?' on':''}" data-act="setCat" data-args="${A(`${t}`,`${c}`)}">${catLabel(c)}<span class="num">${counts[c]}</span></button>`).join('')}</div>`:''}
    <div class="local-search-wrap"><span class="local-search-icon">${ic('search')}</span>
      <input class="local-search" type="text" placeholder="Пошук у списку…" aria-label="Пошук у списку" value="${esc(f.q||'')}" data-input="lsearch" data-args="${A(`${t}`,'$value')}">
    </div>
    <button id="fbtn-${t}" class="flt-pill${n?' has-n':''}" data-act="togglePan" data-args="${A(`${t}`)}">${ic('filter')}Жанр, роки, теги${n?` <span class="flt-n">${n}</span>`:''}</button>
    <select class="sort-sel" aria-label="Сортування" data-change="doSort" data-args="${A(`${t}`,'$value')}">
      ${opts.map(([v,l])=>`<option value="${v}"${f.sort===v?' selected':''}>${l}</option>`).join('')}
    </select>`;
}
function setCat(t,c){F[t].cats=c?[c]:[];buildBar(t);buildTags(t);rerender(t);}
let _lsT;
function lsearch(t,v){F[t].q=v.trim();clearTimeout(_lsT);_lsT=setTimeout(()=>rerender(t),150);}
function togglePan(t){
  const p=document.getElementById(panId(t)),b=document.getElementById(`fbtn-${t}`);
  if(!p)return;
  const open=p.style.display!=='none';
  if(open){p.style.display='none';b?.classList.remove('active');}
  else{buildPan(t);p.style.display='';b?.classList.add('active');}
}
function buildPan(t){
  const el=document.getElementById(panId(t));if(!el)return;
  const list=tList(t),f=F[t];
  const genres=[...new Set(list.flatMap(i=>(i.genre||'').split(',').map(g=>g.trim()).filter(Boolean)))].sort();
  const decades=[...new Set(list.map(i=>{const y=parseInt(i.year);return y?String(Math.floor(y/10)*10):null;}).filter(Boolean))].sort((a,b)=>b-a);
  const opts=t==='watched'?S_W:S_ALL;
  let h='';
  /* category (Тип) lives in the toolbar as chips now */
  if(genres.length)h+=`<div class="flt-row"><span class="flt-lbl">Жанр</span><div class="flt-chips">${genres.map(g=>`<button class="flt-chip${f.genres.includes(g)?' on':''}" data-act="chip" data-args="${A(`${t}`,'genres',`${uriSafe(g)}`)}">${esc(g)}</button>`).join('')}</div></div>`;
  if(decades.length>1)h+=`<div class="flt-row"><span class="flt-lbl">Десятиліття</span><div class="flt-chips">${decades.map(d=>`<button class="flt-chip${f.decades.includes(d)?' on':''}" data-act="chip" data-args="${A(`${t}`,'decades',`${d}`)}">${d}s</button>`).join('')}</div></div>`;
  if(t==='watched')h+=`<div class="flt-row"><span class="flt-lbl">Мін. оцінка</span><div class="flt-chips">${['6','7','8','9','10'].map(r=>`<button class="flt-chip${(f.ratings||[]).includes(r)?' on':''}" data-act="chip" data-args="${A(`${t}`,'ratings',`${r}`)}">${r==='10'?'★ 10':'★ '+r+'+'}</button>`).join('')}</div></div>`;
  const utags=[...new Set(list.flatMap(i=>i.tags||[]))].sort();
  if(utags.length)h+=`<div class="flt-row"><span class="flt-lbl">Теги</span><div class="flt-chips">${utags.map(t2=>{const t2e=uriSafe(t2);return `<span class="flt-chip-wrap"><button class="flt-chip flt-chip--t${(f.tags||[]).includes(t2)?' on':''}" data-act="chip" data-args="${A(`${t}`,'tags',`${t2e}`)}">${esc(t2)}</button><button class="flt-chip-del" data-act="delGlobalTag" data-args="${A(`${t2e}`)}" title="Видалити тег з усіх записів">×</button></span>`;}).join('')}</div></div>`;
  h+=`<div class="flt-panel-footer"><button class="flt-reset" data-act="clearF" data-args="${A(`${t}`)}">✕ Скинути всі фільтри</button></div>`;
  el.innerHTML=h;
}
function chip(t,dim,val){
  val=decodeURIComponent(val);
  const f=F[t];if(!f[dim])f[dim]=[];
  const i=f[dim].indexOf(val);
  if(i>=0)f[dim].splice(i,1);else{if(dim==='ratings')f[dim]=[];f[dim].push(val);}
  buildPan(t);buildTags(t);buildBar(t);rerender(t);
  document.getElementById(`fbtn-${t}`)?.classList.add('active');
}
function doSort(t,v){F[t].sort=v;buildBar(t);rerender(t);}
function clearF(t){const f=F[t];f.q='';f.cats=[];f.genres=[];f.decades=[];f.ratings=[];f.tags=[];buildPan(t);buildTags(t);buildBar(t);rerender(t);}
function removeChip(t,dim,val){val=decodeURIComponent(val);const f=F[t];if(f[dim])f[dim]=f[dim].filter(v=>v!==val);const p=document.getElementById(panId(t));if(p&&p.style.display!=='none')buildPan(t);buildTags(t);buildBar(t);rerender(t);}
function buildTags(t){
  const el=document.getElementById(tagsId(t));if(!el)return;
  const f=F[t];
  const all=[...f.genres.map(v=>({v,l:v,d:'genres'})),...f.decades.map(v=>({v,l:v+'s',d:'decades'})),...(f.ratings||[]).map(v=>({v,l:v==='10'?'★10':'★'+v+'+',d:'ratings'})),...(f.tags||[]).map(v=>({v,l:'#'+v,d:'tags',m:true}))];
  el.innerHTML=all.map(({v,l,d,m})=>`<span class="ftag${m?' ftag--m':''}">${esc(l)}<button class="ftag-x" data-act="removeChip" data-args="${A(`${t}`,`${d}`,`${uriSafe(v)}`)}" aria-label="Видалити фільтр">×</button></span>`).join('');
}
function applyF(list,t){
  const f=F[t];let r=[...list];
  if(f.q){const q=f.q.toLowerCase();r=r.filter(i=>(i.title||'').toLowerCase().includes(q));}
  if(f.cats?.length)    r=r.filter(i=>f.cats.includes(i.customCategory||i.type));
  if(f.genres?.length)  r=r.filter(i=>f.genres.some(g=>(i.genre||'').split(',').map(s=>s.trim()).includes(g)));
  if(f.decades?.length) r=r.filter(i=>{const y=parseInt(i.year);return y&&f.decades.includes(String(Math.floor(y/10)*10));});
  if(f.ratings?.length){const m=Math.max(...f.ratings.map(Number));r=r.filter(i=>(i.rating||0)>=m);}
  if(f.tags?.length)    r=r.filter(i=>f.tags.every(t=>(i.tags||[]).includes(t)));
  return sort(r,f.sort);
}
function sort(l,s){
  const a=[...l];
  switch(s){
    case 'added-asc':       return a.sort((x,y)=>(x.addedAt||0)-(y.addedAt||0));
    case 'year-desc':       return a.sort((x,y)=>parseInt(y.year||0)-parseInt(x.year||0));
    case 'year-asc':        return a.sort((x,y)=>parseInt(x.year||0)-parseInt(y.year||0));
    case 'title-asc':       return a.sort((x,y)=>(x.title||'').localeCompare(y.title||'','uk'));
    case 'genre-asc':       return a.sort((x,y)=>fg(x).localeCompare(fg(y),'uk'));
    case 'rating-desc':     return a.sort((x,y)=>(y.rating||0)-(x.rating||0));
    case 'imdb-rating-desc':return a.sort((x,y)=>parseFloat(y.imdbRating||0)-parseFloat(x.imdbRating||0));
    case 'imdb-rating-asc': return a.sort((x,y)=>parseFloat(x.imdbRating||0)-parseFloat(y.imdbRating||0));
    default:                return a.sort((x,y)=>(y.addedAt||0)-(x.addedAt||0));
  }
}
function fg(i){return(i.genre||'').split(',')[0].trim()||'Я';}
function rerender(t){if(t in _gridShown)_gridShown[t]=GRID_PAGE;if(t==='watched')rWatched();if(t==='watching')rWatching();if(t==='planned')rPlanned();}

/* ── SAVE ── */
function save(){
  if(typeof _tsRefreshActions==='function')setTimeout(_tsRefreshActions,0);
  /* a move between lists must never drop the item from both on disk: write the lists that grew
     (destinations) first, and if one fails keep the shrunken ones (sources) as they were */
  const L=[['ct_watched',watched],['ct_watching',watching],['ct_hidden',hidden],['ct_planned',planned]].map(([k,a])=>{const j=JSON.stringify(a);let p=0;try{p=(localStorage.getItem(k)||'').length;}catch(e){}return{k,j,d:j.length-p};}).sort((a,b)=>b.d-a.d);
  let failed=false;
  L.forEach(({k,j,d})=>{if(failed&&d<0)return;if(!_lsSet(k,j))failed=true;});
  updateStats();
  return !failed;
}
function saveAll(){save();['watched','watching','planned'].forEach(buildBar);}
function updateStats(){
  document.getElementById('nb-watched').textContent=watched.length;
  document.getElementById('nb-watching').textContent=watching.length;
  document.getElementById('nb-planned').textContent=planned.length;
  const tot=document.getElementById('totalCount');
  if(tot)tot.textContent=watched.length+watching.length+planned.length;
  const wh=document.getElementById('wHead'),wnH=document.getElementById('wnHead'),plH=document.getElementById('plHead');
  if(wh) wh.textContent='· '+watched.length;
  if(wnH)wnH.textContent='· '+watching.length;
  if(plH)plH.textContent='· '+planned.length;
}

/* ── STATS: one-time runtime backfill (old items never stored Runtime) ──
   Phase 1 is free: OMDb responses are already cached from when these items
   were added, so we just re-read Runtime out of that cache with zero new
   requests. Only titles with no cache at all trigger a (cheap, batched,
   one-time) network fetch. Once set, runtime is permanent — series aren't
   included since a single Runtime figure doesn't represent a whole show. */
async function ensureWatchedRuntimes(){
  /* undefined = never asked (or failed, retry); null = legacy failure marker, retried once; 0 = OMDb really has no runtime, final */
  const movies=watched.filter(i=>i.type==='movie'&&(i.runtime===undefined||i.runtime===null));
  if(!movies.length)return;
  let dirty=false;const stillUnknown=[];
  movies.forEach(i=>{
    const c1=_apiCache['i='+i.imdbID]?.d;
    const c2=_apiCache['i='+i.imdbID+'&plot=short']?.d;
    const rt=parseRuntime(c1?.Runtime)||parseRuntime(c2?.Runtime);
    if(rt){i.runtime=rt;dirty=true;}else stillUnknown.push(i);
  });
  if(dirty)save();
  if(stillUnknown.length&&API){
    const el=document.getElementById('statsContent');
    if(el)el.innerHTML=`<div class="spinner" id="statsRtProgress">Рахую тривалість переглянутого… 0/${stillUnknown.length}</div>`;
    let done=0,stop=false;
    for(let k=0;k<stillUnknown.length&&!stop;k+=5){
      const batch=stillUnknown.slice(k,k+5);
      await Promise.all(batch.map(async i=>{
        /* failures leave runtime as it was so the next stats visit retries; only a real answer is stored */
        try{
          const info=await aFetch('i='+i.imdbID);
          if(info?.Response==='False'&&/limit|key/i.test(info.Error||'')){stop=true;return;}
          if(info?.Response==='False'&&!/not found|incorrect/i.test(info.Error||''))return;
          const rt=parseRuntime(info?.Runtime);if(rt)i.runtime=rt;else if(info?.Response==='True'||info?.Response==='False')i.runtime=0;
        }catch(e){if(e.status===401||e.status===429)stop=true;}
      }));
      done+=batch.length;
      const p=document.getElementById('statsRtProgress');
      if(p)p.textContent=`Рахую тривалість переглянутого… ${Math.min(done,stillUnknown.length)}/${stillUnknown.length}`;
    }
    save();
  }
  /* no OMDb key: leave them undefined, nothing to store (they are retried once a key exists) */
}
async function loadStats(){
  const el=document.getElementById('statsContent');
  if(el&&!el.innerHTML)el.innerHTML=`<div class="spinner">Завантажую статистику…</div>`;
  await ensureWatchedRuntimes();
  renderStats();
}

