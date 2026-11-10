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

/* ── FILTER BAR ──
   One row: list search + «Фільтри» (count badge) [+ sort and view on a computer]. Under it the applied filters as chips.
   «Фільтри» opens a sheet (bottom sheet on a phone, drop-down on a computer) where the choices are STAGED:
   they reach F[t] only on «Показати N»; closing the sheet any other way drops them. */
function buildBar(t){
  const el=document.getElementById(barId(t));if(!el)return;
  const f=F[t],n=fN(t),opts=t==='watched'?S_W:S_ALL;
  const list=tList(t),counts={};list.forEach(i=>{const c=i.customCategory||i.type;if(c)counts[c]=(counts[c]||0)+1;});
  if(f.cats[0]&&!counts[f.cats[0]])f.cats=[]; /* its last title left the list: don't leave an invisible filter on an empty-looking list */
  const open=document.body.classList.contains('fs-on')&&_fs&&_fs.t===t;
  el.className='filter-row fbar';
  el.innerHTML=`
    ${viewSeg(t)}
    <div class="local-search-wrap"><span class="local-search-icon">${ic('search')}</span>
      <input class="local-search" type="text" placeholder="Пошук" aria-label="Пошук у списку" value="${esc(f.q||'')}" data-input="lsearch" data-args="${A(`${t}`,'$value')}"><button type="button" class="ls-x" data-act="lsClear" data-args="[&quot;$el&quot;]" aria-label="Очистити пошук" title="Очистити">${ic('x')}</button>
    </div>
    <button id="fbtn-${t}" class="flt-pill fbtn${n?' has-n':''}${open?' active':''}" aria-haspopup="dialog" aria-expanded="${open}" data-act="togglePan" data-args="${A(`${t}`)}">${ic('filter')}Фільтри${n?` <span class="flt-n">${n}</span>`:''}</button>
    <select class="sort-sel fbar-sort" aria-label="Сортування" data-change="doSort" data-args="${A(`${t}`,'$value')}">
      ${opts.map(([v,l])=>`<option value="${v}"${f.sort===v?' selected':''}>${l}</option>`).join('')}
    </select>`;
}
function setCat(t,c){F[t].cats=c?[c]:[];buildBar(t);buildTags(t);rerender(t);}
let _lsT;
function lsearch(t,v){F[t].q=v.trim();clearTimeout(_lsT);_lsT=setTimeout(()=>rerender(t),150);}
const _dName=d=>d+'-ті';
const _gName=g=>typeof sxGenre==='function'?sxGenre(g):g; /* Ukrainian genre names live in stats.js, loaded later */
const _rName=r=>r==='10'?'★ 10':'★ '+r+'+';
const _catName=c=>Object.hasOwn(CAT,c)?CAT[c]:c;

/* ── FILTER SHEET ── */
let _fs=null; /* {t, st:{staged copy of F[t]}, more:bool} while the sheet is open */
function togglePan(t){document.body.classList.contains('fs-on')&&_fs?.t===t?fsClose():fsOpen(t);}
function fsOpen(t){
  if(document.body.classList.contains('fs-on'))fsClose(true);
  if(typeof searchClose==='function'&&document.body.classList.contains('srch-on'))searchClose(true);
  if(typeof navClose==='function')navClose(true);
  const f=F[t];
  _fs={t,more:false,st:{cats:[...f.cats],genres:[...f.genres],decades:[...f.decades],ratings:[...(f.ratings||[])],tags:[...(f.tags||[])],sort:f.sort}};
  let root=document.getElementById('fsh');
  if(!root){root=document.createElement('div');root.id='fsh';root.className='fsh';document.body.appendChild(root);}
  root.hidden=false;
  document.body.classList.add('fs-on');
  fsRender();fsPlace();
  const b=document.getElementById(`fbtn-${t}`);b?.setAttribute('aria-expanded','true');b?.classList.add('active');
  if(typeof _ovPush==='function')_ovPush();
  root.querySelector('.fsh-card')?.focus({preventScroll:true});
}
function fsClose(fromHistory){
  if(!document.body.classList.contains('fs-on'))return;
  const t=_fs&&_fs.t;
  document.body.classList.remove('fs-on');
  const root=document.getElementById('fsh');if(root){root.hidden=true;root.innerHTML='';}
  _fs=null;
  if(t){const b=document.getElementById(`fbtn-${t}`);b?.setAttribute('aria-expanded','false');b?.classList.remove('active');}
  if(fromHistory!==true&&typeof _ovPop==='function')_ovPop();
}
/* a computer: the card hangs under the button; a phone: CSS pins it to the bottom */
function fsPlace(){
  const root=document.getElementById('fsh'),card=root?.querySelector('.fsh-card'),b=_fs&&document.getElementById(`fbtn-${_fs.t}`);
  if(!card)return;
  if(window.innerWidth<=700||!b){card.style.top=card.style.left=card.style.width=card.style.maxHeight='';return;}
  const r=b.getBoundingClientRect(),w=Math.min(440,window.innerWidth-24);
  card.style.width=w+'px';
  card.style.left=Math.max(12,Math.min(r.right-w,window.innerWidth-w-12))+'px';
  card.style.top=(r.bottom+8)+'px';
  card.style.maxHeight=Math.max(240,Math.min(window.innerHeight*.7,window.innerHeight-r.bottom-20))+'px';
}
window.addEventListener('resize',()=>{if(_fs)fsPlace();});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&document.body.classList.contains('fs-on')){e.preventDefault();e.stopPropagation();fsClose();}
},true);
/* live number of results for the staged choice: applyF on a temporary state */
function _fsCount(){
  const {t,st}=_fs,orig=F[t];let n=0;
  F[t]={...orig,cats:st.cats,genres:st.genres,decades:st.decades,tags:st.tags,sort:st.sort};
  if(t==='watched')F[t].ratings=st.ratings;
  try{n=applyF(tList(t),t).length;}finally{F[t]=orig;}
  return n;
}
function fsRender(){
  const root=document.getElementById('fsh');if(!root||!_fs)return;
  const {t,st}=_fs,list=tList(t);
  /* focus and scroll survive the redraw */
  const old=root.querySelector('.fsh-body'),sc=old?old.scrollTop:0,fk=document.activeElement?.getAttribute?.('data-k');
  const cnt=arr=>{const m={};arr.forEach(k=>{if(k!=null&&k!=='')m[k]=(m[k]||0)+1;});return m;};
  const cats=cnt(list.map(i=>i.customCategory||i.type));
  const gc={};list.forEach(i=>new Set((i.genre||'').split(',').map(g=>g.trim()).filter(Boolean)).forEach(g=>{gc[g]=(gc[g]||0)+1;}));
  const dc=cnt(list.map(i=>{const y=parseInt(i.year);return y?String(Math.floor(y/10)*10):null;}));
  const tc={};list.forEach(i=>new Set(i.tags||[]).forEach(x=>{tc[x]=(tc[x]||0)+1;}));
  st.tags=st.tags.filter(x=>tc[x]);
  const ch=(dim,val,label,n,extra='')=>{const on=st[dim].includes(val);return `<button type="button" class="fsh-chip${on?' on':''}${extra}" aria-pressed="${on}" data-k="${dim}:${esc(val)}" data-act="fsTog" data-args="${A(`${dim}`,`${uriSafe(val)}`)}">${esc(label)}${n!=null?`<span class="num">${n}</span>`:''}</button>`;};
  const grp=(title,body)=>`<section class="fsh-grp"><h3 class="fsh-lbl">${title}</h3><div class="fsh-chips">${body}</div></section>`;
  let h='';
  const _fsPhone=matchMedia('(max-width:700px)').matches; /* view and sort sit in the toolbar on a computer, sort also on a phone */
  if(t in VIEW_LISTS&&_fsPhone){const cur=viewOf(t);h+=grp('Вигляд',VIEWS.map(([k,l])=>`<button type="button" class="fsh-chip${cur===k?' on':''}" aria-pressed="${cur===k}" data-k="view:${k}" data-act="fsView" data-args="${A(`${k}`)}">${l}</button>`).join(''));}
  const opts=t==='watched'?S_W:S_ALL;
  /* Сортування: the select in the toolbar (phone and computer) */
  const ck=Object.keys(CAT).filter(c=>cats[c]);
  if(ck.length>1)h+=grp('Тип',ck.map(c=>ch('cats',c,CAT[c],cats[c])).join(''));
  const gk=Object.keys(gc).sort((a,b)=>gc[b]-gc[a]||_gName(a).localeCompare(_gName(b),'uk'));
  if(gk.length){
    const vis=_fs.more?gk:[...gk.slice(0,12),...gk.slice(12).filter(g=>st.genres.includes(g))],hid=gk.length-vis.length;
    h+=grp('Жанр',vis.map(g=>ch('genres',g,_gName(g),gc[g])).join('')+(hid?`<button type="button" class="fsh-chip fsh-more" data-k="more" data-act="fsMore">Ще ${hid}</button>`:''));
  }
  const dk=Object.keys(dc).sort((a,b)=>b-a);
  if(dk.length>1)h+=grp('Десятиліття',dk.map(d=>ch('decades',d,_dName(d),dc[d])).join(''));
  if(t==='watched')h+=grp('Моя оцінка',['6','7','8','9','10'].map(r=>ch('ratings',r,_rName(r),null)).join(''));
  const tk=Object.keys(tc).sort((a,b)=>a.localeCompare(b,'uk'));
  if(tk.length)h+=grp('Теги',tk.map(x=>`<span class="fsh-tagw">${ch('tags',x,'#'+x,tc[x],' fsh-chip--t')}<button type="button" class="fsh-tagx" data-act="delGlobalTag" data-args="${A(`${uriSafe(x)}`)}" aria-label="Видалити тег «${esc(x)}» з усіх записів" title="Видалити тег з усіх записів">×</button></span>`).join(''));
  const n=_fsCount();
  const card0=root.querySelector('.fsh-card');
  if(card0){ /* already open: swap the groups and the count only, so the sheet does not slide in again */
    card0.querySelector('.fsh-body').innerHTML=h;card0.querySelector('.fsh-go').textContent=`Показати ${n}`;
    const nb0=card0.querySelector('.fsh-body');if(nb0)nb0.scrollTop=sc;
    if(fk)[...root.querySelectorAll('[data-k]')].find(b=>b.getAttribute('data-k')===fk)?.focus({preventScroll:true});
    fsPlace();return;
  }
  root.innerHTML=`<div class="fsh-bd" data-act="fsClose"></div>
    <div class="fsh-card" role="dialog" aria-modal="true" aria-label="Фільтри" tabindex="-1">
      <div class="fsh-grab" aria-hidden="true"></div>
      <div class="fsh-hd"><h2 class="fsh-t">Фільтри</h2><button type="button" class="fsh-lnk" data-act="fsResetAll">Скинути все</button><button type="button" class="fsh-x" data-act="fsClose" aria-label="Закрити">${ic('x')}</button></div>
      <div class="fsh-body">${h}</div>
      <div class="fsh-ft"><button type="button" class="fsh-reset" data-act="fsReset">Скинути</button><button type="button" class="fsh-go" data-act="fsApply">Показати ${n}</button></div>
    </div>`;
  const nb=root.querySelector('.fsh-body');if(nb)nb.scrollTop=sc;
  if(fk)[...root.querySelectorAll('[data-k]')].find(b=>b.getAttribute('data-k')===fk)?.focus({preventScroll:true});
  fsPlace();
}
function fsTog(dim,val){
  if(!_fs)return;val=decodeURIComponent(val);
  const a=_fs.st[dim],i=a.indexOf(val);
  if(i>=0)a.splice(i,1);else{if(dim==='ratings'||dim==='cats')a.length=0;a.push(val);}
  fsRender();
}
function fsSort(v){if(!_fs)return;_fs.st.sort=v;fsRender();}
function fsMore(){if(!_fs)return;_fs.more=true;fsRender();}
function fsView(v){if(!_fs)return;setView(_fs.t,v);fsRender();} /* the view is not a filter: it applies at once */
function fsReset(){if(!_fs)return;const s=_fs.st;s.cats=[];s.genres=[];s.decades=[];s.ratings=[];s.tags=[];fsRender();}
function fsResetAll(){if(!_fs)return;_fs.st.sort='added-desc';fsReset();}
function fsApply(){
  if(!_fs)return;
  const {t,st}=_fs,f=F[t];
  f.cats=st.cats;f.genres=st.genres;f.decades=st.decades;f.tags=st.tags;f.sort=st.sort;
  if(t==='watched')f.ratings=st.ratings;
  fsClose();buildBar(t);buildTags(t);rerender(t);
}
/* kept for callers elsewhere (library.js after a tag is deleted): redraw an open sheet */
function buildPan(t){if(_fs&&(!t||_fs.t===t))fsRender();}
/* a chip straight onto the list (shelves «Усі N» and the like), no staging */
function chip(t,dim,val){
  val=decodeURIComponent(val);
  const f=F[t];if(!f[dim])f[dim]=[];
  const i=f[dim].indexOf(val);
  if(i>=0)f[dim].splice(i,1);else{if(dim==='ratings'||dim==='cats')f[dim]=[];f[dim].push(val);}
  buildBar(t);buildTags(t);rerender(t);
}
function doSort(t,v){F[t].sort=v;buildBar(t);rerender(t);}
function clearF(t){F[t].q='';clearChips(t);}
function clearChips(t){const f=F[t];f.cats=[];f.genres=[];f.decades=[];f.ratings=[];f.tags=[];buildBar(t);buildTags(t);rerender(t);}
function removeChip(t,dim,val){val=decodeURIComponent(val);const f=F[t];if(f[dim])f[dim]=f[dim].filter(v=>v!==val);buildTags(t);buildBar(t);rerender(t);}
/* applied filters as gold chips under the toolbar */
function buildTags(t){
  const el=document.getElementById(tagsId(t));if(!el)return;
  const f=F[t];
  const all=[...f.cats.map(v=>({v,l:_catName(v),d:'cats'})),...f.genres.map(v=>({v,l:_gName(v),d:'genres'})),...f.decades.map(v=>({v,l:_dName(v),d:'decades'})),...(f.ratings||[]).map(v=>({v,l:_rName(v),d:'ratings'})),...(f.tags||[]).map(v=>({v,l:'#'+v,d:'tags',m:true}))];
  el.innerHTML=all.length?all.map(({v,l,d,m})=>`<span class="ftag${m?' ftag--m':''}">${esc(l)}<button class="ftag-x" data-act="removeChip" data-args="${A(`${t}`,`${d}`,`${uriSafe(v)}`)}" aria-label="Прибрати фільтр ${esc(l)}">${ic('x')}</button></span>`).join('')+`<button class="ftag ftag-reset" data-act="clearChips" data-args="${A(`${t}`)}">Скинути</button>`:'';
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

