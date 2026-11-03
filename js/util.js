/* ── MODAL ── */
/* Esc closes; Tab stays inside the dialog */
const _FOCUSABLE='a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]';
function _modalKeys(e){
  if(e.key==='Escape'){closeModal();return;}
  if(e.key!=='Tab')return;
  const m=document.querySelector('#mbox .modal');if(!m)return;
  const f=[...m.querySelectorAll(_FOCUSABLE)].filter(x=>x.offsetParent!==null),a=document.activeElement;
  if(!f.length){e.preventDefault();m.focus();return;}
  if(e.shiftKey&&(a===f[0]||a===m)){e.preventDefault();f[f.length-1].focus();}
  else if(!e.shiftKey&&a===f[f.length-1]){e.preventDefault();f[0].focus();}
}
function _bgClose(ev,el,fn){if(ev.target===el&&typeof window[fn]==='function')window[fn]();}
document.addEventListener('keydown',e=>{
  if(e.key==='/'&&e.target.tagName!=='INPUT'&&e.target.tagName!=='TEXTAREA'&&e.target.tagName!=='SELECT'){
    e.preventDefault();
    const si=document.getElementById('searchInput');
    if(si){si.focus();si.select();}
  }
});
/* a dialog: role + label for screen readers, focus moves in and comes back to where it was on close */
let _modalPrev=null;
function modal(h){
  const box=document.getElementById('mbox');
  if(!box.innerHTML.trim())_modalPrev=document.activeElement; /* a modal replacing another keeps the first return point */
  box.innerHTML=`<div class="modal-bg" data-act="_bgClose" data-args="${A('$ev','$el','closeModal')}"><div class="modal" role="dialog" aria-modal="true" tabindex="-1">${h}</div></div>`;
  const m=box.querySelector('.modal'),t=m.querySelector('.modal-title');
  if(t){t.id='modalTitle';m.setAttribute('aria-labelledby','modalTitle');}else m.setAttribute('aria-label','Вікно');
  document.removeEventListener('keydown',_modalKeys);document.addEventListener('keydown',_modalKeys);
  (m.querySelector(_FOCUSABLE)||m).focus({preventScroll:true});
}
function closeModal(){
  document.getElementById('mbox').innerHTML='';document.removeEventListener('keydown',_modalKeys);
  const p=_modalPrev;_modalPrev=null;if(p&&p.isConnected&&typeof p.focus==='function')p.focus({preventScroll:true});
}

/* ── STARS ── */
/* a radio group: one tab stop (the chosen star, or the first), arrows change the grade, Home/Delete clear it */
function buildStars(cur){
  const sel=Math.max(0,Math.min(10,Math.round(+cur)||0));
  return Array.from({length:10},(_,i)=>`<span class="star${sel>i?' on':''}" role="radio" aria-checked="${sel===i+1}" aria-label="${i+1} з 10" tabindex="${(sel?sel===i+1:i===0)?0:-1}" data-act="pStar" data-args="${A((i+1))}" data-n="${i+1}">★</span>`).join('');
}
function pStar(n){
  document.getElementById('eR').value=n;
  document.querySelectorAll('#starsBox .star').forEach((s,i)=>{s.classList.toggle('on',i<n);s.setAttribute('aria-checked',String(i+1===n));s.tabIndex=(n?i+1===n:i===0)?0:-1;});
}
document.addEventListener('keydown',e=>{
  const s=e.target.closest?.('#starsBox .star');if(!s)return;
  const cur=parseInt(document.getElementById('eR')?.value)||0;let n=null;
  if(e.key==='ArrowRight'||e.key==='ArrowUp')n=Math.min(10,cur+1);
  else if(e.key==='ArrowLeft'||e.key==='ArrowDown')n=Math.max(1,cur-1);
  else if(e.key==='Home')n=1;else if(e.key==='End')n=10;
  else if(e.key==='Delete'||e.key==='Backspace')n=0;
  else if(e.key==='Enter'||e.key===' ')n=+s.dataset.n;
  if(n===null)return;
  e.preventDefault();pStar(n);oStar();
  (document.querySelector(`#starsBox .star[data-n="${n||1}"]`))?.focus();
});
/* hover preview without inline handlers */
document.addEventListener('mouseover',e=>{const s=e.target.closest?.('#starsBox .star');if(s)hStar(+s.dataset.n);});
document.addEventListener('mouseout',e=>{if(e.target.closest?.('#starsBox')&&!e.relatedTarget?.closest?.('#starsBox'))oStar();});
function hStar(n){document.querySelectorAll('#starsBox .star').forEach((s,i)=>s.style.color=i<n?'var(--gold)':'rgba(255,255,255,.08)');}
function oStar(){const c=parseInt(document.getElementById('eR')?.value)||0;document.querySelectorAll('#starsBox .star').forEach((s,i)=>s.style.color=i<c?'var(--gold)':'rgba(255,255,255,.08)');}

/* ── TOAST ── */
let _tTimer;
/* Messages across the app were written with a leading emoji (⚠ ✓ ℹ 🔖…);
   the icon now comes from the toast type, so strip whatever leads the text. */
const _LEAD_GLYPH=/^(?:[\p{Extended_Pictographic}\u2713\u2717\u2726\u25B6]\uFE0F?\s*)+/u;
function toast(msg,type='',dur=3400){
  clearTimeout(_tTimer);document.querySelectorAll('.toast').forEach(t=>t.remove());
  const el=document.createElement('div');el.className=`toast${type?' '+type:''}`;
  const txt=document.createElement('span');txt.textContent=String(msg).replace(_LEAD_GLYPH,'');
  el.innerHTML=ic(type==='ok'?'check':type==='err'?'alert':'info');el.appendChild(txt);
  el.setAttribute('role','status');el.setAttribute('aria-live','polite');
  document.body.appendChild(el);_tTimer=setTimeout(()=>el.remove(),dur);
}

/* ── DELETE + UNDO ── */
let _undo=null;

/* Shared undo toast for move operations.
   actionLabel = what was done ("«Title» → Переглянуто")
   undoFn = function to call to reverse the move              */
function _mvUndo(item,fromList,fromIdx,undoFn,actionLabel){
  if(_undo){clearTimeout(_undo.timer);document.querySelectorAll('.toast').forEach(t=>t.remove());_undo=null;}
  document.querySelectorAll('.toast').forEach(t=>t.remove());
  const el=document.createElement('div');el.className='toast undo';
  el.setAttribute('role','status');el.setAttribute('aria-live','polite');
  const lbl=document.createElement('span');lbl.textContent=actionLabel;
  const btn=document.createElement('button');btn.className='t-undo';btn.innerHTML=ic('undo')+'Скасувати';
  btn.onclick=()=>{
    clearTimeout(_undo?.timer);_undo=null;
    undoFn();
    el.remove();
    toast(`«${item.title}» повернено до запланованого`,'ok',2400);
  };
  el.append(lbl,btn);document.body.appendChild(el);
  const timer=setTimeout(()=>{el.remove();_undo=null;},5000);
  _undo={timer};
}

function del(listName,id,renderFn){
  const map={watched,watching,planned};
  const list=map[listName];const idx=list.findIndex(i=>i.id===id);if(idx===-1)return;
  const item=list[idx];list.splice(idx,1);saveAll();renderFn();
  if(_undo){clearTimeout(_undo.timer);_undo=null;}
  document.querySelectorAll('.toast').forEach(t=>t.remove());
  const el=document.createElement('div');el.className='toast undo';
  const lbl=document.createElement('span');lbl.textContent=`«${item.title||'Запис'}» видалено`;
  const btn=document.createElement('button');btn.className='t-undo';btn.innerHTML=ic('undo')+'Відновити';
  btn.onclick=()=>{clearTimeout(_undo?.timer);_undo=null;const cur=tList(listName);cur.splice(Math.min(idx,cur.length),0,item);saveAll();renderFn();el.remove();toast(`«${item.title}» відновлено`,'ok',2400);};
  el.append(lbl,btn);document.body.appendChild(el);
  const timer=setTimeout(()=>{el.remove();_undo=null;},5000);_undo={timer};
}

/* ── API ── */
const _omdbInflight={};
function aFetch(p,retries=2){
  /* Check persistent cache first */
  const cp=_apiCache[p];
  if(cp&&Date.now()-cp.ts<_apiTTL)return Promise.resolve(cp.d);
  if(_omdbInflight[p])return _omdbInflight[p]; /* same lookup already on the wire (e.g. one title in two lists) */
  return _omdbInflight[p]=(async()=>{
    for(let i=0;i<=retries;i++){
      try{
        const ctrl=new AbortController();
        const tid=setTimeout(()=>ctrl.abort(),OMDB_TIMEOUT);
        const r=await fetch(`https://www.omdbapi.com/?apikey=${API}&${p}`,{signal:ctrl.signal});
        clearTimeout(tid);
        if(!r.ok){const er=new Error(`HTTP ${r.status}`);er.status=r.status;throw er;}
        const d=await r.json();
        /* Never cache transient refusals (daily limit, bad key) — they'd stick for 24h */
        if(!(d&&d.Response==='False'&&/limit|key/i.test(d.Error||''))){_apiCache[p]={d,ts:Date.now()};_cacheSave();}
        return d;
      }catch(e){
        /* 4xx (bad key, quota) won't change on retry — retrying just burns requests */
        if(i===retries||(e.status>=400&&e.status<500))throw e;
        await new Promise(r=>setTimeout(r,RETRY_DELAY*(i+1)));
      }
    }
  })().finally(()=>{delete _omdbInflight[p];});
}

/* ── HELPERS ── */
/* poster URL from OMDb/TMDB/a file: http(s) or nothing ('N/A' and javascript: both end up as '') */
function ps(p){return safeUrl(p);}
/* A card poster that 404s (OMDb's Amazon links rot) or was never stored ('data:,' fails on purpose):
   TMDB /find first — the title sheet already shows TMDB posters — then OMDb; the found URL is saved on
   the item so it is fixed once. Queued 3 at a time: a grid can hold dozens of broken posters */
const _pfDone=new Set(),_pfQ=[];let _pfRun=0,_pfSaveT=null;
/* a title for which neither TMDB nor OMDb had a poster is not searched again for a week (ct_nopic, a cache key) */
const NOPIC_TTL=7*864e5;let _noPic=_lsJSON('ct_nopic',{}),_noPicT=null;
{const now=Date.now();let d=false;for(const k in _noPic)if(!(now-_noPic[k]<NOPIC_TTL)){delete _noPic[k];d=true;}if(d)_lsSet('ct_nopic',JSON.stringify(_noPic));}
function _noPicMark(id){_noPic[id]=Date.now();clearTimeout(_noPicT);_noPicT=setTimeout(()=>_lsSet('ct_nopic',JSON.stringify(_noPic)),1500);}
/* src="…" value for a stored poster: http(s) only and escaped; anything else fails on purpose, so fixBrokenPoster looks for a real one */
function posterSrc(p){return esc(ps(p)||'data:,');}
/* same, with the blank placeholder instead of the failing 'data:,' (modals, search hits) */
function imgSrc(p){return esc(ps(p)||blank());}
/* the IMDb page is always derived from the id, never taken from a stored (importable) URL */
function imdbHref(i){return /^tt\d+$/.test(i?.imdbID||'')?`https://www.imdb.com/title/${i.imdbID}/`:'#';}
function fixBrokenPoster(img,imdbID){
  const bad=img.getAttribute('src');
  img.src=BLANK;
  if(!/^tt\d+$/.test(imdbID||'')||_pfDone.has(imdbID)||Date.now()-(_noPic[imdbID]||0)<NOPIC_TTL)return;
  _pfDone.add(imdbID);_pfQ.push({img,imdbID,bad});_pfNext();
}
function _pfNext(){
  while(_pfRun<3&&_pfQ.length){
    const j=_pfQ.shift();_pfRun++;
    _pfFind(j.imdbID,j.bad).then(u=>{
      if(u===''){_noPicMark(j.imdbID);return;} /* asked, and nobody has one */
      if(!u)return;
      [watched,watching,planned].forEach(l=>l.forEach(it=>{if(it.imdbID===j.imdbID)it.poster=u;}));
      document.querySelectorAll(`img[data-pf="${j.imdbID}"]`).forEach(im=>{im.onerror=null;im.src=u;}); /* the same title on other cards */
      clearTimeout(_pfSaveT);_pfSaveT=setTimeout(save,1500);
    }).catch(()=>{}).finally(()=>{_pfRun--;_pfNext();});
  }
}
/* a failed <img data-pf="imdbID">: no inline onerror (and so no data inside JS), one capture-phase listener for all of them */
document.addEventListener('error',e=>{const im=e.target;if(im&&im.tagName==='IMG'&&im.dataset.pf&&im.getAttribute('src')!==BLANK)fixBrokenPoster(im,im.dataset.pf);},true);
/* a URL when found, '' when the sources answered and have none (remembered), null when a source failed or none could be asked (retried later) */
async function _pfFind(imdbID,bad){
  let asked=0,failed=false;
  if(TMDB_KEY&&!_tmdbBlocked){
    try{const d=await tmdbFetch(`/find/${imdbID}?external_source=imdb_id`);asked++;
      const p=_tsImg((d?.movie_results?.[0]||d?.tv_results?.[0])?.poster_path,'w342');if(p)return p;}catch(e){failed=true;}
  }
  if(API){try{const m=await aFetch('i='+imdbID);asked++;if(m&&m.Response==='False'&&/limit|key/i.test(m.Error||''))failed=true;const u=ps(m?.Poster);if(u&&u!==bad)return u;}catch(e){failed=true;}}
  return asked&&!failed?'':null;
}
/* labels are HTML-safe: the fallback is the raw (possibly imported) value */
function tl(t){return esc({movie:CAT.movie,series:CAT.series,episode:'Серія',game:'Гра'}[t]||t||'');}
/* Anime = Japan is credited AND an East Asian country leads the list. «United States, Japan»
   is how OMDb credits most Pixar/Disney films, and those are cartoons. */
function isAnimeCountry(country){const c=(country||'').toLowerCase().split(',').map(x=>x.trim());return c.includes('japan')&&['japan','south korea','china','taiwan'].includes(c[0]);}
function gc(m){const g=(m.Genre||'').toLowerCase();if(g.includes('animation'))return isAnimeCountry(m.Country)?'anime':'cartoon';if(m.Type==='series')return'series';return'movie';}
/* Quotes are %27-encoded: this URI is interpolated into onerror="this.src='…'",
   where a bare ' ended the string early and every poster fallback threw. */
const BLANK=blank();
function blank(){return"data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 155 232%27%3E%3Crect fill=%27%230e1218%27 width=%27155%27 height=%27232%27/%3E%3Ctext x=%2777%27 y=%27125%27 text-anchor=%27middle%27 fill=%27%234a5260%27 font-size=%2742%27%3E✦%3C/text%3E%3C/svg%3E";}

/* ── TMDB API ── */
/* Map OMDb genre names to TMDB genre IDs for discover endpoint */
const TMDB_GENRES={
  Action:28,Adventure:12,Animation:16,Comedy:35,Crime:80,
  Documentary:99,Drama:18,Family:10751,Fantasy:14,History:36,
  Horror:27,Music:10402,Musical:10402,Mystery:9648,Romance:10749,
  'Science Fiction':878,'Sci-Fi':878,'TV Movie':10770,Thriller:53,
  War:10752,Western:37,'Film-Noir':9648,'Reality-TV':10764,
  'Talk-Show':10767,'Game-Show':10764,Sport:10770,Biography:36
};
/* In-memory TMDB cache with 24h TTL */
const _tmdbCache={};
const TMDB_TTL=24*60*60*1000;
/**
 * Fetch from TMDB API v3 using the stored API key.
 * Results cached in-memory for 24 hours. Use force=true to bypass cache.
 * @param {string} endpoint - e.g. "/discover/movie?with_genres=28&with_runtime.gte=60"
 * @param {number} timeout - ms before abort (default 6000)
 * @param {boolean} force - bypass cache
 */
const _tmdbInflight={};
let _tmdbNetFails=0; /* consecutive network-level failures; one blip no longer disables TMDB for the session */
function tmdbFetch(endpoint,timeout=6000,force){
  if(_tmdbBlocked)return Promise.reject(new Error('TMDB_BLOCKED'));
  const cached=_tmdbCache[endpoint];
  if(!force&&cached&&Date.now()-cached.ts<TMDB_TTL)return Promise.resolve(cached.d);
  if(_tmdbInflight[endpoint])return _tmdbInflight[endpoint]; /* same request already on the wire */
  const sep=endpoint.includes('?')?'&':'?';
  const ctrl=new AbortController();const id=setTimeout(()=>ctrl.abort(),timeout);
  const pr=fetch(`https://api.themoviedb.org/3${endpoint}${sep}api_key=${TMDB_KEY}`,{
    signal:ctrl.signal,headers:{Accept:'application/json'}
  }).then(r=>{clearTimeout(id);if(!r.ok){const er=new Error(`TMDB HTTP ${r.status}`);er.status=r.status;throw er;}return r.json();})
  .then(d=>{_tmdbNetFails=0;_tmdbCache[endpoint]={d,ts:Date.now()};return d;})
  .catch(e=>{
    clearTimeout(id);
    if(e&&(e.name==='TypeError'||e.message==='Failed to fetch'||e.message==='NetworkError when attempting to fetch resource.')){
      if(++_tmdbNetFails>=3&&!_tmdbBlocked){_tmdbBlocked=true;console.warn('[CineTrack] TMDB unreachable — disabling TMDB calls for this session.');}
    }
    throw e;
  }).finally(()=>{delete _tmdbInflight[endpoint];});
  return _tmdbInflight[endpoint]=pr;
}

/* IMDb id → TMDB ids, kept permanently: the mapping never changes, and /find
   was being repeated by recommendations (8 per load), collections and the game. */
let _findCache=_lsJSON('ct_tmdbfind',{}); /* imdbID -> {m:movieId|0,t:tvId|0} */
let _findSaveT=null;
function _findSave(){clearTimeout(_findSaveT);_findSaveT=setTimeout(()=>_lsSet('ct_tmdbfind',JSON.stringify(_findCache)),1500);}
async function tmdbFindIds(imdbID){
  /* a hit is permanent; an empty {m:0,t:0} may just be TMDB not knowing the title yet, so it is re-asked after 7 days
     (old empty entries have no ts: stale at once) */
  const c=_findCache[imdbID];if(c&&(c.m||c.t||(c.ts&&Date.now()-c.ts<7*864e5)))return c;
  const d=await tmdbFetch(`/find/${imdbID}?external_source=imdb_id`);
  const r={m:d?.movie_results?.[0]?.id||0,t:d?.tv_results?.[0]?.id||0};
  if(!r.m&&!r.t)r.ts=Date.now();
  _findCache[imdbID]=r;_findSave();
  return r;
}

