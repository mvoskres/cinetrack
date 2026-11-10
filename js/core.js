/* Pause the animated aurora background while the tab is hidden — no visible cost, saves GPU work */
document.addEventListener('visibilitychange',()=>{document.querySelector('.bg-fx')?.classList.toggle('paused',document.hidden);});

/* ── ESCAPING + SAFE VALUES ──
   Everything that came from a file, an API or the user's own text goes through esc() before it
   lands in innerHTML, and URLs through safeUrl() before they land in href/src. */
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
/* encodeURIComponent leaves ' alone; kept for args that travel inside data-args as encoded strings */
function uriSafe(s){return encodeURIComponent(s).replace(/'/g,'%27');}
/* http(s) only (https only when asked); anything else, javascript: included, becomes '' */
function safeUrl(u,httpsOnly){
  if(typeof u!=='string')return '';
  u=u.trim();
  if(!u||u.length>2000||/[\s"<>`\\]/.test(u))return '';
  try{const p=new URL(u).protocol;return p==='https:'||(!httpsOnly&&p==='http:')?u:'';}catch(e){return '';}
}
/* local date, as the franchises tab needs it (toISOString is UTC: after midnight in Kyiv "today" was yesterday) */
function _todayISO(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}

/* ── SAFE STORAGE ──
   localStorage holds ~5M chars per origin, and every file:// page shares that
   one origin. A full store makes setItem throw, which used to abort whatever
   was saving (inside aFetch that even failed adding a movie). Now a failed
   write first frees space by dropping regenerable caches, then retries; the
   user's own lists are never pruned. */
let _quotaWarned=false;
const _LIST_KEYS=['ct_watched','ct_watching','ct_hidden','ct_planned'];
/* what the user typed in or decided, as opposed to caches that are refetched on demand */
const _USER_KEYS=[..._LIST_KEYS,'ct_trackedpeople','ct_skipped'];
const _lsBad=new Set(); /* user keys that failed to parse: left untouched on disk, never overwritten by a save */
/* JSON from localStorage that can't take the app down. Broken cache -> the key is dropped (it refills itself);
   broken user data -> left exactly as it is, reported by init.js, and not written over until a restore replaces it */
function _lsJSON(k,def){
  let raw=null;
  try{raw=localStorage.getItem(k);}catch(e){return def;}
  if(raw===null||raw==='')return def;
  try{
    const v=JSON.parse(raw);
    if(Array.isArray(def)?!Array.isArray(v):(def&&typeof def==='object')?(!v||typeof v!=='object'||Array.isArray(v)):false)throw new Error('wrong shape');
    return v;
  }catch(e){
    console.warn('[CineTrack] '+k+' is damaged:',e.message);
    if(_USER_KEYS.includes(k))_lsBad.add(k);
    else try{localStorage.removeItem(k);}catch(_){}
    return def;
  }
}
/* a restore is about to replace a damaged user key: keep the damaged text under another name first */
function _lsBadRelease(){
  _lsBad.forEach(k=>{try{localStorage.setItem('ct_damaged_'+k,localStorage.getItem(k)||'');}catch(e){}});
  _lsBad.clear();
}
function _lsSet(k,v){
  if(_lsBad.has(k)){try{toast('Збережене в браузері «'+k+'» пошкоджено, тому зміни не записуються, щоб не затерти його. Відновіть дані з бекапу: Налаштування','err',9000);}catch(_){}return false;}
  try{localStorage.setItem(k,v);return true;}catch(e){}
  _freeCacheSpace();
  if(k==='ct_apicache')return true; /* _freeCacheSpace just wrote the pruned cache */
  try{localStorage.setItem(k,v);return true;}catch(e){
    /* a failed list write = data not on disk: tell the user every time, not once per session */
    const isList=_LIST_KEYS.includes(k);
    if(isList||!_quotaWarned){_quotaWarned=true;try{toast(isList?'Не вдалося зберегти списки: сховище браузера переповнене. Зроби бекап і очисти кеші: Налаштування':'Сховище браузера переповнене. Зроби бекап і очисти кеші: Налаштування','err',9000);}catch(_){}}
    return false;
  }
}
function _freeCacheSpace(){
  _pruneApiCache(200);
  try{localStorage.setItem('ct_apicache',JSON.stringify(_apiCache));}catch(e){localStorage.removeItem('ct_apicache');}
  /* pure caches only (all refetched on demand); lists, tracked people, collections, game progress stay */
  ['ct_gamebackdrops','ct_titlecache','ct_recs','ct_recsrc','ct_nopic'].forEach(k=>localStorage.removeItem(k));
  /* people: drop everyone except the followed ones (their filmographies are what the People page, stats and recs read) */
  try{const keep={};(typeof _trackedPeople!=='undefined'?_trackedPeople:[]).forEach(p=>{const c=_personCache?.[p.id];if(c)keep[p.id]=c;});
    for(const k in _personCache)if(!(k in keep))delete _personCache[k];localStorage.setItem('ct_personcache',JSON.stringify(keep));}catch(e){localStorage.removeItem('ct_personcache');}
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
/* ── ACCENT colour: one choice drives every --gold* token (kept per device, ct_accent) ── */
const ACCENTS=[['#e3a54a','Бурштин'],['#e8735a','Корал'],['#e0607e','Малина'],['#b07ce8','Бузок'],['#5b9cf0','Небо'],['#3fbfa8','Бірюза'],['#8cc152','Лайм'],['#d9d9d9','Срібло']];
function _hexRgb(h){const m=/^#([0-9a-f]{6})$/i.exec(h||'');if(!m)return null;const n=parseInt(m[1],16);return[n>>16&255,n>>8&255,n&255];}
function applyAccent(h){
  const c=_hexRgb(h)||_hexRgb(ACCENTS[0][0]),[r,g,b]=c,st=document.documentElement.style;
  const mix=(t,k)=>Math.round(t+(255-t)*k),lum=(.2126*r+.7152*g+.0722*b)/255;
  st.setProperty('--gold',`rgb(${r},${g},${b})`);
  st.setProperty('--gold-2',`rgb(${mix(r,.25)},${mix(g,.25)},${mix(b,.25)})`);
  st.setProperty('--gold-ink',lum>.5?'#15120c':'#ffffff'); /* text on the accent stays readable */
  st.setProperty('--gold-d',`rgba(${r},${g},${b},.13)`);
  st.setProperty('--gold-b',`rgba(${r},${g},${b},.32)`);
  st.setProperty('--gold-glow',`rgba(${r},${g},${b},.07)`);
}
function accentNow(){const v=localStorage.getItem('ct_accent');return _hexRgb(v)?v.toLowerCase():ACCENTS[0][0];}
function setAccent(h){if(!_hexRgb(h))return;_lsSet('ct_accent',h.toLowerCase());applyAccent(h);if(document.getElementById('stAccent'))document.getElementById('stAccent').outerHTML=_stAccentHtml();}
function _stAccentHtml(){
  const cur=accentNow(),custom=!ACCENTS.some(([h])=>h===cur);
  return `<div class="st-row" id="stAccent"><div class="st-row-head"><span class="st-lbl">Акцентний колір</span></div>
    <div class="acc-sw" role="group" aria-label="Акцентний колір">${ACCENTS.map(([h,n])=>`<button class="acc-b${h===cur?' on':''}" style="--c:${h}" data-act="setAccent" data-args="${A(h)}" title="${n}" aria-label="${n}" aria-pressed="${h===cur}"></button>`).join('')}
      <label class="acc-b acc-own${custom?' on':''}" style="--c:${cur}" title="Свій колір"><input type="color" value="${cur}" data-change="setAccent" data-args="[&quot;$value&quot;]" aria-label="Свій колір"><span>${ic('plus')}</span></label></div></div>`;
}
applyAccent(accentNow());

/* Ukrainian titles for list items (imdbID -> title, '' = TMDB has no translation); the list item keeps its own
   (English) title for matching, search finds both */
let _ukList=_lsJSON('ct_uk_titles',{});
function tn(i){return (i&&_ukList[i.imdbID])||i?.title||'';}
let watched =_lsJSON('ct_watched',[]);
let watching=_lsJSON('ct_watching',[]);
let hidden  =_lsJSON('ct_hidden',[]);
let planned =_lsJSON('ct_planned',[]);
const _pendingMap={};
function _pmSet(k,v){const ks=Object.keys(_pendingMap);if(ks.length>=100)delete _pendingMap[ks[0]];_pendingMap[k]=v;}
let TMDB_KEY=localStorage.getItem('ct_tmdbkey')||'';
const GDRIVE_CLIENT_ID='736522220888-jt1nuelrnm81684kgs0krup3sv6p4d2d.apps.googleusercontent.com'; /* OAuth Client ID (Web application); ct_gclientid in localStorage overrides it (no field in the UI) */
let _tmdbBlocked=false;

/* ── PERSISTENT API CACHE (24h TTL) ── */
const _apiCache=_lsJSON('ct_apicache',{});
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
let _resolveCache=_lsJSON('ct_resolvecache',{});
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
/* the one map of category labels; the other tabs derive theirs from it (library CAT_L, people CREDIT_TYPE_LABEL, tl) */
const CAT={movie:'Фільм',series:'Серіал',anime:'Аніме',cartoon:'Мульт',other:'Інше'};
function catLabel(c){return esc(Object.hasOwn(CAT,c)?CAT[c]:c||'');}
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
    ${viewSeg(t)}
    ${cats.length>1?`<div class="cat-seg" role="group" aria-label="Категорія">
      <button class="cat-chip${cur?'':' on'}" data-act="setCat" data-args="${A(`${t}`,'')}">Усі<span class="num">${list.length}</span></button>
      ${cats.map(c=>`<button class="cat-chip${cur===c?' on':''}" data-act="setCat" data-args="${A(`${t}`,`${c}`)}">${catLabel(c)}<span class="num">${counts[c]}</span></button>`).join('')}</div>`:''}
    <div class="local-search-wrap"><span class="local-search-icon">${ic('search')}</span>
      <input class="local-search" type="text" placeholder="Пошук у списку…" aria-label="Пошук у списку" value="${esc(f.q||'')}" data-input="lsearch" data-args="${A(`${t}`,'$value')}"><button type="button" class="ls-x" data-act="lsClear" data-args="[&quot;$el&quot;]" aria-label="Очистити пошук" title="Очистити">${ic('x')}</button>
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
  if(f.q){const q=f.q.toLowerCase();r=r.filter(i=>(i.title||'').toLowerCase().includes(q)||tn(i).toLowerCase().includes(q));}
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
    case 'title-asc':       return a.sort((x,y)=>tn(x).localeCompare(tn(y),'uk'));
    case 'genre-asc':       return a.sort((x,y)=>fg(x).localeCompare(fg(y),'uk'));
    case 'rating-desc':     return a.sort((x,y)=>(y.rating||0)-(x.rating||0));
    case 'imdb-rating-desc':return a.sort((x,y)=>parseFloat(y.imdbRating||0)-parseFloat(x.imdbRating||0));
    case 'imdb-rating-asc': return a.sort((x,y)=>parseFloat(x.imdbRating||0)-parseFloat(y.imdbRating||0));
    default:                return a.sort((x,y)=>(y.addedAt||0)-(x.addedAt||0));
  }
}
function fg(i){return(i.genre||'').split(',')[0].trim()||'Я';}
function rerender(t){if(t in _gridShown)_gridShown[t]=GRID_PAGE;if(t==='watched')rWatched();if(t==='watching')rWatching();if(t==='planned')rPlanned();}

/* ── TWO TABS, ONE STORE ──
   save() writes whole lists, so a tab that had been open for a while used to overwrite what another tab
   saved since. Now each tab remembers the text it last read or wrote per list (_base) and a version counter
   ct_ver. Before a write, if storage no longer matches _base (or ct_ver moved), the lists are merged
   three-way, base / ours / theirs, per record: what the other tab added or changed stays, what this tab
   added, removed or changed on top of that is applied, and only then is anything written. A `storage`
   event does the same merge at once, so the other tab's change also shows up without a reload. */
const _SYNC_KEYS=_LIST_KEYS; /* same four keys */
const _base={};
let _myVer=0;
function _ver(){try{return +localStorage.getItem('ct_ver')||0;}catch(e){return 0;}}
function _syncBase(){
  _SYNC_KEYS.forEach(k=>{try{_base[k]=localStorage.getItem(k)||'[]';}catch(e){_base[k]='[]';}});
  _myVer=_ver();
}
_syncBase();
function _keyOf(k){return k==='ct_hidden'?(x=>(x.imdbID||'')+'|'+(x.tmdb||'')):(x=>x.id!==undefined?x.id:'i:'+x.imdbID);}
function _merge3(base,ours,theirs,keyOf){
  const B=new Map(base.map(x=>[keyOf(x),JSON.stringify(x)])),O=new Map(ours.map(x=>[keyOf(x),x]));
  const edited=k=>O.has(k)&&B.has(k)&&JSON.stringify(O.get(k))!==B.get(k);
  const res=[],seen=new Set();
  theirs.forEach(t=>{const k=keyOf(t);seen.add(k);
    if(B.has(k)&&!O.has(k))return;           /* this tab deleted it */
    res.push(edited(k)?O.get(k):t);});       /* this tab edited it, else the other tab's version */
  ours.forEach((o,i)=>{const k=keyOf(o);
    if(seen.has(k))return;
    if(!B.has(k)||edited(k))res.splice(Math.min(i,res.length),0,o);}); /* added here, or edited here and deleted there: keep */
  return res;
}
/* has another tab (or an older copy of the app) written since this tab last read or wrote? */
function _foreignWrite(){
  if(_ver()!==_myVer)return true;
  try{return _SYNC_KEYS.some(k=>!_lsBad.has(k)&&(localStorage.getItem(k)||'[]')!==_base[k]);}catch(e){return false;}
}
/* merge storage into memory (in place: other code holds these arrays); true if memory differs from storage afterwards,
   i.e. this tab still has changes of its own to write */
function _reconcile(){
  let ownDiff=false;
  [['ct_watched',watched],['ct_watching',watching],['ct_hidden',hidden],['ct_planned',planned]].forEach(([k,mem])=>{
    if(_lsBad.has(k))return;
    let theirs,base;
    try{theirs=_lsJSON(k,[]);base=JSON.parse(_base[k]);}catch(e){return;}
    if(!Array.isArray(base))base=[];
    const merged=_merge3(base,mem,theirs,_keyOf(k));
    if(JSON.stringify(merged)!==JSON.stringify(mem))mem.splice(0,mem.length,...merged);
    if(JSON.stringify(merged)!==JSON.stringify(theirs))ownDiff=true;
    try{_base[k]=localStorage.getItem(k)||'[]';}catch(e){}
  });
  _myVer=_ver();
  return ownDiff;
}
let _foreignT=null;
function _onStorage(e){
  if(e.storageArea&&e.storageArea!==localStorage)return;
  if(e.key!==null&&e.key!=='ct_ver'&&!_SYNC_KEYS.includes(e.key))return;
  clearTimeout(_foreignT);_foreignT=setTimeout(_foreignSync,80); /* the writer sets four lists and ct_ver in a row: wait for the burst */
}
function _foreignSync(){
  if(!_foreignWrite())return;
  const ownDiff=_reconcile();
  if(ownDiff)save(); /* this tab had unsaved changes of its own (a debounced write): put the merged result on disk */
  /* redraw from the merged lists; the filter bars are left alone while one of their inputs has focus */
  if(!document.activeElement?.closest?.('.filter-row'))['watched','watching','planned'].forEach(buildBar);
  updateStats();rDash();
  if(typeof _refreshVisibleTab==='function')_refreshVisibleTab();
  if(typeof _tsRefreshActions==='function')_tsRefreshActions();
  const modalOpen=!!document.getElementById('mbox')?.innerHTML.trim();
  toast(modalOpen?'Дані змінено в іншій вкладці, списки оновлено. Закрий вікно й перевір свою правку':'Дані змінено в іншій вкладці, оновлено','',modalOpen?6000:3200);
}
window.addEventListener('storage',_onStorage);

/* ── SAVE ── */
function save(){
  if(typeof _tsRefreshActions==='function')setTimeout(_tsRefreshActions,0);
  /* another tab wrote since we last looked: merge first, never write our whole lists over theirs */
  if(_foreignWrite()){_reconcile();setTimeout(()=>{['watched','watching','planned'].forEach(buildBar);updateStats();rDash();if(typeof _refreshVisibleTab==='function')_refreshVisibleTab();toast('Дані змінено в іншій вкладці: твою правку злито з ними','',3600);},0);}
  /* a move between lists must never drop the item from both on disk: write the lists that grew
     (destinations) first, and if one fails keep the shrunken ones (sources) as they were */
  const L=[['ct_watched',watched],['ct_watching',watching],['ct_hidden',hidden],['ct_planned',planned]].map(([k,a])=>{const j=JSON.stringify(a);let p=0;try{p=(localStorage.getItem(k)||'').length;}catch(e){}return{k,j,d:j.length-p};}).sort((a,b)=>b.d-a.d);
  let failed=false;
  L.forEach(({k,j,d})=>{if(failed&&d<0)return;if(!_lsSet(k,j))failed=true;else _base[k]=j;});
  if(!failed){try{_myVer=Math.max(_ver(),_myVer)+1;localStorage.setItem('ct_ver',String(_myVer));}catch(e){}}
  updateStats();
  return !failed;
}
function saveAll(){const ok=save();['watched','watching','planned'].forEach(buildBar);return ok;}
function updateStats(){
  const nf=n=>n.toLocaleString('uk-UA'),cn={watched:watched.length,watching:watching.length,planned:planned.length};
  document.querySelectorAll('[data-nb]').forEach(el=>{el.textContent=nf(cn[el.dataset.nb]??0);});
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

