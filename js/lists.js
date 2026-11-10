/* ── TABS ── */
const TITLES={watched:'Переглянуте',watching:'Дивлюсь',planned:'Планую',stats:'Статистика',recs:'Рекомендації',collections:'Франшизи',people:'Актори й режисери',game:'Впізнай кадр'};
function goTab(id,btn){
  document.getElementById('gameModalBg')?.classList.add('hidden');
  const tabEl=document.getElementById('tab-'+id);
  const fresh=!!tabEl&&tabEl.classList.contains('hidden'); /* a new tab starts at its top, not at the old tab's scroll depth */
  document.querySelectorAll('[id^="tab-"]').forEach(t=>t.classList.add('hidden'));
  document.getElementById('tab-'+id).classList.remove('hidden');
  document.querySelectorAll('[data-tab]').forEach(b=>{const o=b.dataset.tab===id;b.classList.toggle('on',o);if(o)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  if(id==='stats')loadStats();
  if(id==='recs')openRecs();
  if(id==='watching')rWatching(); /* rWatching already starts the live fetches */
  if(id==='planned')rPlanned();
  if(id==='collections')loadCollections();
  if(id==='people')renderPeopleTab();
  if(id==='game')loadGameTab();
  const ds=document.getElementById('dashSection');if(ds)ds.hidden=id!=='watching'; /* air strip belongs to Дивлюсь */
  closeMenu();navClose();searchClose();
  if(fresh){window.scrollTo(0,0);requestAnimationFrame(()=>window.scrollTo(0,0));} /* after the menu closed: its history step must not bring the old position back */
}

/* ── SEARCH ── */
let _st2;
function handleSearch(){const q=document.getElementById('searchInput').value.trim();if(q.length<1){hideSug();document.querySelector('#srch .search-wrap')?.classList.remove('loading');return;}clearTimeout(_st2);document.querySelector('#srch .search-wrap').classList.add('loading');_st2=setTimeout(()=>doSearch(q),340);}
const _sCache={};
/* TMDB answers in Ukrainian and does not spend the 1000/day OMDb quota */
async function doSearch(q){
  if(TMDB_KEY&&!_tmdbBlocked){try{if(await _tmdbSearch(q))return;}catch(e){console.warn('TMDB search:',e);}}
  return _omdbSearch(q);
}
let _ownIdx=null;
/* "movie:603" -> imdbID, from the two TMDB id caches; rebuilt per search, both only grow */
function _tmdbOwnedId(mt,id){
  if(!_ownIdx){_ownIdx={};
    for(const [imdb,f] of Object.entries(_findCache)){if(f.m)_ownIdx['movie:'+f.m]=imdb;if(f.t)_ownIdx['tv:'+f.t]=imdb;}
    for(const [k,v] of Object.entries(_resolveCache))if(v?.imdbID)_ownIdx[k]=v.imdbID;}
  return _ownIdx[mt+':'+id]||'';
}
function _ownBadge(imdbID){
  if(!imdbID)return'';
  if(watching.find(x=>x.imdbID===imdbID))return `<span class="sug-badge wn">${ic('play')}Дивлюсь</span>`;
  if(watched.find(x=>x.imdbID===imdbID))return `<span class="sug-badge ok">${ic('check')}Переглянуто</span>`;
  if(planned.find(x=>x.imdbID===imdbID))return `<span class="sug-badge pl">${ic('bookmark')}Планую</span>`;
  return'';
}
async function _tmdbSearch(q){
  const url=p=>`/search/multi?query=${encodeURIComponent(q)}&language=uk-UA&include_adult=false&page=${p}`;
  const d=await tmdbFetch(url(1));
  if(document.getElementById('searchInput').value.trim()!==q)return true; /* typed on meanwhile */
  let all=d?.results||[];
  /* up to 20 titles: one TMDB page is 20 mixed hits (people, unposted), so a second page fills the rest */
  if((d?.total_pages||1)>1&&all.filter(r=>r.media_type==='movie'||r.media_type==='tv').length<20){
    try{const d2=await tmdbFetch(url(2));if(document.getElementById('searchInput').value.trim()!==q)return true;
      const seen=new Set(all.map(r=>r.media_type+r.id));all=all.concat((d2?.results||[]).filter(r=>!seen.has(r.media_type+r.id)));}catch(e){}
  }
  const res=all.filter(r=>r.media_type==='person'?r.profile_path&&r.popularity>1:(r.media_type==='movie'||r.media_type==='tv'));
  if(!res.length){document.getElementById('suggestions').innerHTML='';return false;}
  _ownIdx=null;
  /* TMDB's order puts «Золотая дюна» above «Дюна»: exact, then prefix matches first, then popularity */
  const ql=q.toLowerCase(),rank=r=>{const t=[r.title||r.name,r.original_title||r.original_name].map(x=>(x||'').toLowerCase());
    return t.includes(ql)?0:t.some(x=>x.startsWith(ql))?1:2;};
  const titles=res.filter(r=>r.media_type!=='person').sort((a,b)=>rank(a)-rank(b)||(b.popularity||0)-(a.popularity||0)).slice(0,20),people=res.filter(r=>r.media_type==='person').slice(0,4);
  const box=document.getElementById('suggestions');box.classList.remove('hidden');
  document.querySelector('#srch .search-wrap').classList.remove('loading');
  box.innerHTML=titles.map(r=>{
    const t=r.title||r.name||'',o=r.original_title||r.original_name||'',y=(r.release_date||r.first_air_date||'').slice(0,4);
    return `<div class="sug-item" data-act="_sugOpen" data-args="${A(r.media_type,r.id)}">
      <div class="sug-p"><img class="sug-img" src="${_tsImg(r.poster_path,'w185')||blank()}" alt="" loading="lazy" data-fb>${_ownBadge(_tmdbOwnedId(r.media_type,r.id))}</div>
      <div class="sug-title">${esc(t)}</div><div class="sug-meta">${y?`${esc(y)} · `:''}${(r.media_type==='tv'?CAT.series:CAT.movie).toLowerCase()}</div>${o&&o!==t?`<div class="sug-orig">${esc(o)}</div>`:''}</div>`;
  }).join('')+people.map(p=>`<div class="sug-item" data-act="_sugPerson" data-args="${A(p.id,p.name,p.profile_path||'')}">
      <div class="sug-p round"><img class="sug-img" src="${_tsImg(p.profile_path,'w185')}" alt="" loading="lazy" data-fb></div>
      <div class="sug-title">${esc(p.name)}</div><div class="sug-meta">${p.known_for_department==='Directing'?'режисер':'актор'} · фільмографія</div></div>`).join('');
  _sugSync('searchInput','suggestions');
  return true;
}
function _sugOpen(mt,id){searchSuspend();openTitleTmdb(mt,id);}
function _sugPerson(id,name,profile){searchClose();_tsPerson(id,name,profile);}
async function _omdbSearch(q){
  try{
    let r=_sCache[q];
    if(!r){
      r=await aFetch(`s=${encodeURIComponent(q)}`);
      /* If s= search returns no usable results (or all filtered out), try exact title match */
      const usable=r&&r.Search?r.Search.filter(m=>m.Type!=='episode'):[];
      if(!usable.length&&q.length>=2){
        const r2=await aFetch(`t=${encodeURIComponent(q)}`);
        if(r2&&r2.Response==='True')r={Search:[r2],Response:'True'};
      }
      if(r&&r.Search)_sCache[q]=r;
    }
    if(document.getElementById('searchInput').value.trim()!==q)return; /* typed on meanwhile (as in the TMDB path) */
    if(!r||!r.Search){hideSug();return;}
    const res=r.Search.filter(m=>m.Type!=='episode');if(!res.length){hideSug();return;}
    const box=document.getElementById('suggestions');box.classList.remove('hidden');
    document.querySelector('#srch .search-wrap').classList.remove('loading');
    box.innerHTML=res.slice(0,10).map(m=>{
      let b='';
      if(watched.find(x=>x.imdbID===m.imdbID))       b=`<span class="sug-badge ok">${ic('check')}Переглянуто</span>`;
      else if(watching.find(x=>x.imdbID===m.imdbID)) b=`<span class="sug-badge wn">${ic('play')}Дивлюсь</span>`;
      else if(planned.find(x=>x.imdbID===m.imdbID))  b=`<span class="sug-badge pl">${ic('bookmark')}Планую</span>`;
      return `<div class="sug-item" data-act="pickMovie" data-args="${A(`${m.imdbID}`)}">
        <div class="sug-p"><img class="sug-img" src="${imgSrc(m.Poster)}" alt="" loading="lazy" data-fb>${b}</div>
        <div class="sug-title">${esc(m.Title)}</div><div class="sug-meta">${esc(m.Year)} · ${String(tl(m.Type)).toLowerCase()}</div></div>`;
    }).join('');
    _sugSync('searchInput','suggestions');
  }catch(e){hideSug();console.warn('Search error:',e);}
}
function hideSug(){document.getElementById('suggestions').classList.add('hidden');document.querySelector('#srch .search-wrap').classList.remove('loading');_sugSync('searchInput','suggestions');}
/* ── SUGGESTIONS: ARIA + keyboard ──
   The box is a listbox, hits are options, the input is a combobox: ↑/↓ move through the hits (aria-activedescendant),
   Enter picks the active one, Esc closes. The mouse never takes focus from the input, so it no longer blurs
   (and hides the list) in the middle of a click. */
function _sugSync(inpId,boxId){
  const inp=document.getElementById(inpId),box=document.getElementById(boxId);if(!inp||!box)return;
  const items=[...box.querySelectorAll('.sug-item')];
  items.forEach((el,i)=>{el.setAttribute('role','option');el.id=`${boxId}-o${i}`;el.setAttribute('aria-selected','false');});
  inp.setAttribute('aria-expanded',String(items.length>0&&!box.classList.contains('hidden')));inp.removeAttribute('aria-activedescendant');
}
function _sugMove(inp,box,d){
  const items=[...box.querySelectorAll('.sug-item')];if(!items.length)return;
  let k=items.findIndex(x=>x.classList.contains('active'));
  k=k<0?(d>0?0:items.length-1):(k+d+items.length)%items.length;
  items.forEach((x,i)=>{x.classList.toggle('active',i===k);x.setAttribute('aria-selected',String(i===k));});
  inp.setAttribute('aria-activedescendant',items[k].id);items[k].scrollIntoView({block:'nearest'});
}
document.addEventListener('keydown',e=>{
  const boxId={searchInput:'suggestions'}[e.target?.id];if(!boxId)return;
  const box=document.getElementById(boxId);if(!box||box.classList.contains('hidden'))return;
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();_sugMove(e.target,box,e.key==='ArrowDown'?1:-1);}
  else if(e.key==='Enter'){const a=box.querySelector('.sug-item.active');if(a){e.preventDefault();a.click();}}
  else if(e.key==='Escape'){if(e.target.id==='searchInput')return;box.classList.add('hidden');_sugSync(e.target.id,boxId);}
});
document.addEventListener('mousedown',e=>{if(e.target.closest?.('.suggestions'))e.preventDefault();}); /* keep focus in the input */
/* focus leaving a field that has data-blur (+data-blur-box): run its function, unless focus went into its own list */
document.addEventListener('focusout',e=>{
  const el=e.target.closest?.('[data-blur]');if(!el)return;
  const box=document.getElementById(el.dataset.blurBox||'');if(box&&e.relatedTarget&&box.contains(e.relatedTarget))return;
  if(typeof window[el.dataset.blur]==='function')window[el.dataset.blur]();
});

/* ── PICK MOVIE ── */
async function pickMovie(imdbID){
  searchSuspend();
  let m=_pendingMap[imdbID];
  if(!m){
    try{
      m=await aFetch(`i=${imdbID}&plot=short`);
      if(!m||m.Response==='False')throw new Error(m?.Error||'немає даних');
      _pmSet(imdbID,m);
    }catch(e){toast(_omdbErr(e),'err',4200);searchResume();return;}
  }
  const inW=!!watched.find(x=>x.imdbID===imdbID),inWn=!!watching.find(x=>x.imdbID===imdbID),inPl=!!planned.find(x=>x.imdbID===imdbID);
  modal(`
    <img class="modal-poster" src="${imgSrc(m.Poster)}" data-fb="hide" alt="">
    <h2 class="modal-title">${esc(m.Title)}</h2>
    <div class="modal-sub">${esc(m.Year)} · ${tl(m.Type)} · ${m.imdbRating&&m.imdbRating!=='N/A'?'IMDb '+esc(m.imdbRating):'без рейтингу'} · ${esc((m.Genre||'').split(',')[0])}</div>
    ${m.Plot&&m.Plot!=='N/A'?`<div class="modal-plot">${esc(m.Plot)}</div>`:''}
    <div class="modal-btns">
      ${inW ?`<div class="modal-already ok">${ic('check')}Вже у переглянутому</div>`:`<button class="m-btn j" data-act="_pickDo" data-args="${A('w',imdbID)}">${ic('check')}Переглянуто</button>`}
      ${inWn?`<div class="modal-already go">${ic('play')}Вже дивлюсь</div>`:`<button class="m-btn s" data-act="_pickDo" data-args="${A('wn',imdbID)}">${ic('play')}Дивлюсь зараз</button>`}
      <button class="m-btn s" data-act="_pickDo" data-args="${A('info',imdbID)}">${ic('info')}Детальніше</button>
      ${inPl?`<div class="modal-already pl">${ic('bookmark')}Вже заплановано</div>`:`<button class="m-btn m" data-act="_pickDo" data-args="${A('pl',imdbID)}">${ic('bookmark')}Запланувати</button>`}
      <button class="m-btn can" data-act="closeModal">Закрити</button>
    </div>`);
}

/* ── ADD ── */
/* Parses OMDb's "142 min" into 142, or null if unknown ("N/A"/missing) */
function parseRuntime(r){const n=parseInt(String(r||'').replace(/[^0-9]/g,''));return n>0?n:null;}
/* User fields that must survive a list move/copy. Runtime: fresh value if OMDb has one, else the source's; unknown stays
   undefined (never null) so ensureWatchedRuntimes can still fill it. */
function _mvFields(id,m,lists){
  const s=lists.map(l=>l.find(x=>x.imdbID===id)).find(Boolean)||{},o={};
  if(s.tags?.length)o.tags=[...s.tags];
  if(s.streamUrl)o.streamUrl=s.streamUrl;
  const rt=parseRuntime(m.Runtime)||s.runtime;if(rt)o.runtime=rt;
  return o;
}

async function addW(id){
  if(watched.find(x=>x.imdbID===id)){toast('Вже є у переглянутих','err',2200);return false;}
  if(watching.find(x=>x.imdbID===id)||planned.find(x=>x.imdbID===id))
    toast('Переміщено з іншого списку','',2200);
  const m=_pendingMap[id]||await aFetch(`i=${id}`);
  if(!m||m.Response==='False'||!m.Title){toast(`OMDb: ${m?.Error||'немає даних'}`,'err',3600);return false;}
  /* Remove from other lists to avoid cross-list duplicates */
  const mv=_mvFields(id,m,[watching,planned]);
  watching=watching.filter(x=>x.imdbID!==id);
  planned =planned.filter(x=>x.imdbID!==id);
  watched.unshift({id:Date.now(),imdbID:id,title:m.Title,poster:ps(m.Poster),year:m.Year,type:m.Type,genre:m.Genre||'',country:m.Country||'',imdbUrl:`https://www.imdb.com/title/${id}/`,imdbRating:(m.imdbRating&&m.imdbRating!=='N/A')?m.imdbRating:null,...mv,customCategory:gc(m),rating:0,comment:'',addedAt:Date.now()});
  saveAll();rWatched();rWatching();rPlanned();rDash();toast(`«${m.Title}» додано до переглянутих`,'ok');
  return true;
}
/* Дивлюсь item that is a second viewing of something in Переглянуте: flagged by «Дивитись знову», or (older data)
   started after the title had been marked watched. Not a duplicate: the badge says «повторно», the data check leaves it. */
function _isRewatch(i){
  const w=i&&watched.find(x=>x.imdbID===i.imdbID);if(!w)return false;
  return !!i.rewatch||(w.addedAt||0)<=(i.addedAt||0);
}
async function addWn(id){
  if(watching.find(x=>x.imdbID===id)){toast('Вже є у списку "Дивлюсь"','err',2200);return false;}
  if(planned.find(x=>x.imdbID===id))
    toast('Переміщено з іншого списку','',2200);
  const m=_pendingMap[id]||await aFetch(`i=${id}`);
  if(!m||m.Response==='False'||!m.Title){toast(`OMDb: ${m?.Error||'немає даних'}`,'err',3600);return false;}
  /* watched stays: rewatch is supported (a title may sit in watched + watching); only planned is "consumed" */
  const mv=_mvFields(id,m,[planned,watched]);
  planned =planned.filter(x=>x.imdbID!==id);
  watching.unshift({id:Date.now(),imdbID:id,title:m.Title,poster:ps(m.Poster),year:m.Year,type:m.Type,genre:m.Genre||'',country:m.Country||'',imdbUrl:`https://www.imdb.com/title/${id}/`,imdbRating:(m.imdbRating&&m.imdbRating!=='N/A')?m.imdbRating:null,...mv,customCategory:gc(m),season:1,episode:1,totalSeasons:parseInt(m.totalSeasons)||1,addedAt:Date.now()});
  saveAll();rWatched();rWatching();rPlanned();rDash();toast(`«${m.Title}» додано до "Дивлюсь"`,'ok');
  return true;
}
async function addPl(id){
  if(planned.find(x=>x.imdbID===id)){toast('Вже є у запланованих','err',2200);return false;}
  if(watched.find(x=>x.imdbID===id)||watching.find(x=>x.imdbID===id))
    toast('Вже є в іншому списку','',2200);
  const m=_pendingMap[id]||await aFetch(`i=${id}`);
  if(!m||m.Response==='False'||!m.Title){toast(`OMDb: ${m?.Error||'немає даних'}`,'err',3600);return false;}
  planned.unshift({id:Date.now(),imdbID:id,title:m.Title,poster:ps(m.Poster),year:m.Year,type:m.Type,genre:m.Genre||'',country:m.Country||'',imdbUrl:`https://www.imdb.com/title/${id}/`,imdbRating:(m.imdbRating&&m.imdbRating!=='N/A')?m.imdbRating:null,..._mvFields(id,m,[watched,watching]),customCategory:gc(m),addedAt:Date.now()});
  saveAll();rPlanned();rDash();toast(`«${m.Title}» заплановано`,'ok');
  return true;
}

/* ── PROGRESSIVE GRID ──
   826 watched cards rendered at once meant ~17k DOM nodes on every re-render
   (each add/delete/tag). Render a page, append more as the sentinel nears the
   viewport. The shown count survives in-place re-renders so the scroll position
   holds; filter/sort/search changes (rerender) start from the first page. */
const GRID_PAGE=60;
const _gridShown={watched:GRID_PAGE,planned:GRID_PAGE};
const _gridState={};
let _gridObs=null;
function _gridRender(t,g,list,cardFn){
  let v=t in VIEW_LISTS?viewOf(t):'grid';
  if(v==='shelves'&&F[t].cats.length)v='grid'; /* one category chosen = one shelf: the grid shows it better */
  if(t in VIEW_LISTS)g.className=v==='grid'?'grid':`lv-${v}`;
  if(v==='shelves'){g.innerHTML=_shelvesHtml(t,list,cardFn);return;}
  if(v==='list')cardFn=i=>myRow(t,i);
  _gridState[t]={g,list,cardFn};
  const n=Math.min(_gridShown[t],list.length);
  g.innerHTML=(v==='list'?_rowHead(t):'')+list.slice(0,n).map(cardFn).join('');
  _gridSentinel(t,n);
}

/* ── VIEWS: grid / list / shelves for Переглянуте and Планую (remembered per list) ── */
const VIEW_LISTS={watched:1,planned:1};
const VIEWS=[['grid','Сітка'],['list','Список'],['shelves','Полиці']];
/* default view is chosen in Settings (ct_views_def); the switcher above a list only changes it for this visit */
let _viewDef=_lsJSON('ct_views_def',null);
if(!_viewDef){_viewDef=_lsJSON('ct_views',{});_lsSet('ct_views_def',JSON.stringify(_viewDef));try{localStorage.removeItem('ct_views');}catch(e){}}
const _views={};
const _okView=v=>VIEWS.some(([k])=>k===v);
function viewDefOf(t){return _okView(_viewDef[t])?_viewDef[t]:'grid';}
function viewOf(t){return _okView(_views[t])?_views[t]:viewDefOf(t);}
function setView(t,v){_views[t]=v;buildBar(t);rerender(t);}
function setViewDef(t,v){_viewDef[t]=v;_lsSet('ct_views_def',JSON.stringify(_viewDef));delete _views[t];buildBar(t);rerender(t);const el=document.getElementById('stView');if(el)el.outerHTML=_stViewHtml();} /* redraw only this block: reopening the whole settings modal made it flicker and jump */
function _stViewHtml(){
  const row=(t,n)=>`<div class="st-key-line"><span class="st-key-n">${n}</span><div class="seg" role="group" aria-label="${n}: вигляд за замовчуванням">${VIEWS.map(([k,l])=>`<button class="seg-b${viewDefOf(t)===k?' on':''}" aria-pressed="${viewDefOf(t)===k}" data-act="setViewDef" data-args="${A(`${t}`,`${k}`)}">${l}</button>`).join('')}</div></div>`;
  return `<div class="st-row" id="stView"><div class="st-row-head"><span class="st-lbl">Вигляд за замовчуванням</span></div>${row('watched','Переглянуте')}${row('planned','Планую')}<p class="st-hint">Перемикач над списком змінює вигляд лише до наступного відкриття сайту</p></div>`;
}
function viewSeg(t){
  if(!(t in VIEW_LISTS))return '';
  const cur=viewOf(t);
  return `<div class="seg view-seg" role="group" aria-label="Вигляд">${VIEWS.map(([k,l])=>`<button class="seg-b${cur===k?' on':''}" aria-pressed="${cur===k}" data-act="setView" data-args="${A(`${t}`,`${k}`)}">${l}</button>`).join('')}</div>`;
}
/* list: one compact row per title, every action of the card is still here (title opens the details, ⋯ the menu) */
function _rowHead(t){return `<div class="lrow lrow-h" aria-hidden="true"><span></span><span>Назва</span><span>Рік</span><span>Категорія</span><span>Жанр</span><span>IMDb</span><span>${t==='watched'?'Моя':''}</span><span></span></div>`;}
function myRow(list,i){
  const c=i.customCategory||i.type;
  return `<div class="lrow">
    <a class="lrow-art" href="${imdbHref(i)}" target="_blank" rel="noopener" tabindex="-1" data-act="_tsClick" data-args="${A('$ev',`${i.imdbID}`)}"><img src="${posterSrc(i.poster)}" data-pf="${esc(i.imdbID)}" alt="" loading="lazy"></a>
    <div class="lrow-t"><a href="${imdbHref(i)}" target="_blank" rel="noopener" data-act="_tsClick" data-args="${A('$ev',`${i.imdbID}`)}">${esc(tn(i))}</a>
      ${i.comment?`<div class="pc-note" title="${esc(i.comment)}">${esc(i.comment)}</div>`:''}${_tagsHtml(i)}</div>
    <span class="lrow-y num">${esc(i.year||'')}</span>
    <span class="lrow-c">${catLabel(c)}</span>
    <span class="lrow-g">${esc((i.genre||'').split(',').slice(0,2).map(s=>s.trim()).join(', '))}</span>
    <span class="lrow-i num">${i.imdbRating?esc(i.imdbRating):'—'}</span>
    <span class="lrow-my num">${i.rating?`${ic('star')}${esc(i.rating)}`:''}</span>
    <button class="lrow-more" data-act="cardMenu" data-args="${A('$ev',`${list}`,(i.id))}" aria-label="Дії: ${esc(tn(i))}">${ic('dots')}</button>
  </div>`;
}
/* shelves: one row of posters per category, newest first by the chosen sort; «Усі» opens the whole category */
const VSHELF_N=20;
const VSHELF_L={movie:'Фільми',series:'Серіали',anime:'Аніме',cartoon:'Мульти',other:'Інше'};
function _shelvesHtml(t,list,cardFn){
  const by={};list.forEach(i=>{const c=Object.hasOwn(VSHELF_L,i.customCategory||i.type)?(i.customCategory||i.type):'other';(by[c]??=[]).push(i);});
  return Object.keys(VSHELF_L).filter(c=>by[c]).map(c=>`<section class="shelf">
    <div class="shelf-h"><h2>${VSHELF_L[c]}</h2><span class="num">${by[c].length}</span>
      ${by[c].length>VSHELF_N?`<button class="shelf-all" data-act="setCat" data-args="${A(`${t}`,`${c}`)}">Усі ${by[c].length}</button>`:''}</div>
    <div class="shelf-row">${by[c].slice(0,VSHELF_N).map(cardFn).join('')}</div></section>`).join('');
}
function _gridSentinel(t,n){
  const st=_gridState[t];if(n>=st.list.length)return;
  if(!_gridObs)_gridObs=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){_gridObs.unobserve(e.target);const tt=e.target.dataset.t;e.target.remove();_gridMore(tt);}}),{rootMargin:'1200px 0px'});
  st.g.insertAdjacentHTML('beforeend',`<div class="grid-more" data-t="${t}" style="grid-column:1/-1;height:1px"></div>`);
  _gridObs.observe(st.g.lastElementChild);
}
function _gridMore(t){
  const st=_gridState[t],from=_gridShown[t];
  _gridShown[t]=Math.min(from+GRID_PAGE,st.list.length);
  st.g.insertAdjacentHTML('beforeend',st.list.slice(from,_gridShown[t]).map(st.cardFn).join(''));
  _gridSentinel(t,_gridShown[t]);
}
/* ── ICONS + "⋯" ACTION MENU ──
   One menu replaces the 4–5 coloured pill buttons each card used to carry. */
function ic(n){return `<svg class="i" aria-hidden="true"><use href="#i-${n}"/></svg>`;}
function openMenu(ev,items){
  ev.preventDefault();ev.stopPropagation();
  closeMenu();
  const btn=ev.currentTarget;
  const m=document.createElement('div');m.className='ct-menu';m.setAttribute('role','menu');
  /* item = {icon,label,fn,args} (fn is a global function name, args go through data-args) or {icon,label,href} */
  m.innerHTML=items.filter(Boolean).map(x=>x==='-'?'<hr>':x.href
    ?`<a role="menuitem" href="${esc(safeUrl(x.href)||'#')}" target="_blank" rel="noopener" data-act="closeMenu">${ic(x.icon)}${x.label}</a>`
    :`<button role="menuitem" class="${x.danger?'danger':''}" data-act="_menuRun" data-args="${A(x.fn,...(x.args||[]))}">${ic(x.icon)}${x.label}</button>`).join('');
  document.body.appendChild(m);
  const r=btn.getBoundingClientRect();
  const below=r.bottom+6+m.offsetHeight<=innerHeight-8;
  m.style.top=Math.max(8,below?r.bottom+6:r.top-m.offsetHeight-6)+'px';
  m.style.left=Math.max(8,Math.min(innerWidth-m.offsetWidth-8,r.right-m.offsetWidth))+'px';
  m.querySelector('button,a')?.focus({preventScroll:true});
}
function closeMenu(){document.querySelector('.ct-menu')?.remove();}
function _menuRun(fn,...args){closeMenu();if(typeof window[fn]==='function')window[fn](...args);}
function _menuDel(list,id){del(list,id,{watched:rWatched,watching:rWatching,planned:rPlanned}[list]);}
document.addEventListener('click',e=>{if(!e.target.closest('.ct-menu'))closeMenu();});
/* ── DELEGATED HANDLERS ──
   Markup carries data-act / data-input / data-change="fnName" and data-args (JSON from A()).
   '$ev' '$el' '$value' stand for the event, the element and its value. Ancestors with the
   same attribute run too, like inline handlers bubbling, until one stops propagation. */
function A(...a){return esc(JSON.stringify(a));}
/* Enter in a field marked data-enter="fnName" (+ data-args) */
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.closest?.('[data-enter]'))_dispatch(e,'data-enter');});
function _dispatch(ev,attr){
  let el=ev.target.closest?.('['+attr+']');
  while(el){
    const fn=window[el.getAttribute(attr)];
    if(typeof fn==='function'){
      let args=[];try{args=JSON.parse(el.getAttribute('data-args')||'[]');}catch(e){}
      const cur=el,evp=new Proxy(ev,{get:(t,k)=>k==='currentTarget'?cur:typeof t[k]==='function'?t[k].bind(t):t[k]});
      fn.apply(el,args.map(a=>a==='$ev'?evp:a==='$el'?el:a==='$value'?el.value:a));
      if(ev.cancelBubble){ev.stopImmediatePropagation();return;}
    }
    el=el.parentElement?.closest('['+attr+']');
  }
}
document.addEventListener('click',e=>_dispatch(e,'data-act'));
document.addEventListener('input',e=>_dispatch(e,'data-input'));
document.addEventListener('change',e=>_dispatch(e,'data-change'));
function _pickDo(kind,imdbID){
  if(kind==='info'){closeModal();openTitle(imdbID);return;}
  ({w:addW,wn:addWn,pl:addPl})[kind](imdbID).then(closeModal).catch(e=>toast(_omdbErr(e),'err',4200)); /* the modal stays open: the title can be tried again */
}
/* one wording for an OMDb call that threw or answered with an error */
function _omdbErr(e){
  const s=e&&e.status;
  if(s===401||s===403)return 'OMDb не відповів: ключ не діє або вичерпано денний ліміт запитів';
  if(s===429)return 'OMDb: забагато запитів, спробуй за хвилину';
  if(e&&e.name==='AbortError')return 'OMDb не відповів вчасно, спробуй ще раз';
  if(e&&/^HTTP|Failed to fetch|NetworkError/i.test(e.message||''))return 'Немає зв\'язку з OMDb';
  return 'OMDb: '+((e&&e.message)||'помилка');
}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu();});
window.addEventListener('scroll',e=>{if(!e.target.closest?.('.ct-menu'))closeMenu();},{passive:true,capture:true});
/* title sheet: the sticky top bar stays see-through over the hero and gets a solid background once content scrolls under it */
window.addEventListener('scroll',e=>{const t=e.target;if(t.classList?.contains('ts'))t.classList.toggle('scrolled',t.scrollTop>8);},{passive:true,capture:true});
function cardMenu(ev,list,id){
  const it=findItem(id);if(!it)return;
  const ser=it.type==='series';
  const common=[it.streamUrl&&safeUrl(it.streamUrl)&&{icon:'play',label:'Дивитись',href:it.streamUrl},
    {icon:'link',label:it.streamUrl?'Змінити посилання':'Додати посилання',fn:'editUrl',args:[id]},
    {icon:'tag',label:'Додати тег',fn:'addTag',args:[id]},'-'];
  const items={
    watched:[{icon:'star',label:'Оцінка і коментар',fn:'editW',args:[id]},!watching.some(x=>x.imdbID===it.imdbID)&&{icon:'play',label:'Дивитись знову',fn:'wToWn',args:[id]},...common,{icon:'trash',label:'Видалити',fn:'_menuDel',args:['watched',id],danger:1}],
    planned:[{icon:'check',label:'Переглянуто',fn:'plToW',args:[id]},{icon:'play',label:'Почати дивитись',fn:'plToWn',args:[id]},...common,{icon:'trash',label:'Видалити',fn:'_menuDel',args:['planned',id],danger:1}],
    watching:[ser&&{icon:'refresh',label:'Оновити дані ефіру',fn:'relive',args:[it.imdbID]},ser&&it.season<(it.totalSeasons||1)&&{icon:'plus',label:'Наступний сезон',fn:'adj',args:[id,'s',1]},ser&&it.season>1&&{icon:'minus',label:'Попередній сезон',fn:'adj',args:[id,'s',-1]},
      {icon:'check',label:'Переглянуто повністю',fn:'mvToW',args:[id]},...common,{icon:'trash',label:'Видалити',fn:'_menuDel',args:['watching',id],danger:1}],
  }[list];
  openMenu(ev,items);
}

/* ── POSTER CARD — the one card for watched, planned, recs, people ── */
function _myMeta(i){const c=i.customCategory||i.type;return `<div class="pc-m">${i.year?`<span class="num">${esc(i.year)}</span>`:''}<span>${catLabel(c)}</span>${i.imdbRating?`<span class="imdb">IMDb <span class="num">${esc(i.imdbRating)}</span></span>`:''}</div>`;}
function _tagsHtml(i){return (i.tags||[]).length?`<div class="card-utags">${i.tags.map(t=>`<span class="utag">${esc(t)}<button class="utag-x" data-act="rmTag" data-args="${A((i.id),`${uriSafe(t)}`)}" aria-label="Видалити тег ${esc(t)}">✕</button></span>`).join('')}</div>`:'';}
function myCard(list,i){
  return `<article class="pc">
    <div class="pc-art"><a href="${imdbHref(i)}" target="_blank" rel="noopener" tabindex="-1" data-act="_tsClick" data-args="${A('$ev',`${i.imdbID}`)}"><img src="${posterSrc(i.poster)}" data-pf="${esc(i.imdbID)}" alt="" loading="lazy"></a>
      ${i.rating?`<span class="pc-my">${ic('star')}${esc(i.rating)}</span>`:''}
      ${i.streamUrl&&safeUrl(i.streamUrl)?`<a class="pc-fab play" href="${esc(safeUrl(i.streamUrl))}" target="_blank" rel="noopener" aria-label="Дивитись ${esc(tn(i))}">${ic('play')}</a>`:''}
      <button class="pc-fab more" data-act="cardMenu" data-args="${A('$ev',`${list}`,(i.id))}" aria-label="Дії: ${esc(tn(i))}">${ic('dots')}</button></div>
    <div class="pc-t"><a href="${imdbHref(i)}" target="_blank" rel="noopener" data-act="_tsClick" data-args="${A('$ev',`${i.imdbID}`)}">${esc(tn(i))}</a></div>
    ${_myMeta(i)}
    ${i.comment?`<div class="pc-note" title="${esc(i.comment)}">${esc(i.comment)}</div>`:''}
    ${_tagsHtml(i)}
  </article>`;
}

/* ── RENDER WATCHED ── */
function rWatched(){
  const g=document.getElementById('wGrid');
  const list=applyF(watched,'watched');
  const cnt=document.getElementById('wCount');
  if(cnt)cnt.textContent=list.length!==watched.length?`${list.length} з ${watched.length} записів`:'';
  if(!list.length){g.className='grid';g.innerHTML=watched.length?`<div class="empty"><span class="empty-icon">${ic('search')}</span><div class="empty-txt">Нічого не знайдено за фільтром</div></div>`:`<div class="empty"><span class="empty-icon">${ic('film')}</span><div class="empty-txt">Тут з'являтимуться переглянуті фільми та серіали</div><button class="w-btn gold empty-act" data-act="openIO" data-args="[&quot;stCsv&quot;]">${ic('upload')}Імпортувати з IMDb / Letterboxd</button></div>`;return;}
  _gridRender('watched',g,list,i=>myCard('watched',i));
}

/* ── RENDER PLANNED ── */
function rPlanned(){
  const g=document.getElementById('plGrid');
  const list=applyF(planned,'planned');
  if(!list.length){g.className='grid';g.innerHTML=planned.length?`<div class="empty"><span class="empty-icon">${ic('search')}</span><div class="empty-txt">Нічого не знайдено</div></div>`:`<div class="empty"><span class="empty-icon">${ic('bookmark')}</span><div class="empty-txt">Черга для перегляду порожня</div></div>`;return;}
  _gridRender('planned',g,list,i=>myCard('planned',i));
}

/* ── EDIT WATCHED ── */
function editW(id){
  const it=watched.find(i=>i.id===id);if(!it)return;
  modal(`
    <img class="modal-poster" src="${imgSrc(it.poster)}" loading="lazy" data-fb alt="">
    <h2 class="modal-title">${esc(tn(it))}</h2>
    <div class="modal-sub" style="margin-bottom:1.1rem">${esc(it.year||'')} · ${tl(it.type)}</div>
    <div class="form-g"><label class="form-lbl" for="eC">Категорія</label>
      <select class="form-sel" id="eC">
        <option value="movie"   ${(it.customCategory||it.type)==='movie'   ?'selected':''}>Фільм</option>
        <option value="series"  ${(it.customCategory||it.type)==='series'  ?'selected':''}>Серіал</option>
        <option value="anime"   ${(it.customCategory||it.type)==='anime'   ?'selected':''}>Аніме</option>
        <option value="cartoon" ${(it.customCategory||it.type)==='cartoon' ?'selected':''}>Мульт</option>
        <option value="other"   ${(it.customCategory||it.type)==='other'   ?'selected':''}>Інше</option>
      </select></div>
    <div class="form-g"><label class="form-lbl" id="starsLbl">Моя оцінка</label>
      <div class="stars" id="starsBox" role="radiogroup" aria-labelledby="starsLbl">${buildStars(it.rating||0)}</div>
      <input type="hidden" id="eR" value="${+it.rating||0}"></div>
    <div class="form-g"><label class="form-lbl" for="eCm">Коментар</label>
      <textarea class="form-ta" id="eCm" rows="3" placeholder="Враження…">${esc(it.comment||'')}</textarea></div>
    <div class="modal-btns">
      <button class="m-btn g" data-act="saveEditW" data-args="${A((id))}">Зберегти</button>
      <button class="m-btn can" data-act="closeModal">Скасувати</button>
    </div>`);
}
function saveEditW(id){
  const it=watched.find(i=>i.id===id);if(!it)return;
  it.customCategory=document.getElementById('eC').value;
  it.rating=parseInt(document.getElementById('eR').value)||0;
  it.comment=document.getElementById('eCm').value.trim();
  saveAll();rWatched();closeModal();
}

/* ── RENDER WATCHING ── */
function rWatching(skipLive){
  const c=document.getElementById('wnList');
  const list=applyF(watching,'watching');
  if(!list.length){c.innerHTML=watching.length?`<div class="empty"><span class="empty-icon">${ic('search')}</span><div class="empty-txt">Нічого не знайдено</div></div>`:`<div class="empty"><span class="empty-icon">${ic('play')}</span><div class="empty-txt">Починай щось дивитись!</div></div>`;return;}
  /* Detect cross-list duplicates for badge display */
  const _dupSet=new Set();
  {const _all=[...watched,...watching,...planned];const _cnt={};_all.forEach(x=>{if(x.imdbID)_cnt[x.imdbID]=(_cnt[x.imdbID]||0)+1;});Object.keys(_cnt).forEach(k=>{if(_cnt[k]>1)_dupSet.add(k);});}
  c.innerHTML=list.map(i=>{
    const isSeries=i.type==='series';
    const lh=i.liveStatus?buildLiveHTML(i.liveStatus):'<div class="live-loading">Завантажую дані ефіру…</div>';
    const play=i.streamUrl&&safeUrl(i.streamUrl)?`<a class="btn sq" href="${esc(safeUrl(i.streamUrl))}" target="_blank" rel="noopener" aria-label="Дивитись" title="Дивитись">${ic('play')}</a>`:'';
    return `<article class="tr" id="wc-${esc(i.id)}">
      <img class="tr-art" src="${posterSrc(i.poster)}" data-pf="${esc(i.imdbID)}" alt="" loading="lazy" data-act="openTitle" data-args="${A(`${i.imdbID}`)}" style="cursor:pointer">
      <div class="tr-body">
        <div class="tr-top"><div class="tr-head">
          <h3 class="tr-t"><a href="${imdbHref(i)}" target="_blank" rel="noopener" data-act="_tsClick" data-args="${A('$ev',`${i.imdbID}`)}">${esc(tn(i))}</a>${_isRewatch(i)?'<span class="dup-badge rw" title="Повторний перегляд: у Переглянутому лишається твоя оцінка">повторно</span>':_dupSet.has(i.imdbID)?'<span class="dup-badge" title="Цей тайтл є ще в іншому списку">дубль</span>':''}</h3>
          <div class="tr-meta">${catLabel(i.customCategory||i.type)}${i.year?` · <span class="num">${esc(i.year)}</span>`:''}${i.imdbRating?` · IMDb <span class="num">${esc(i.imdbRating)}</span>`:''}</div></div>
          <button class="icon-btn" data-act="cardMenu" data-args="${A('$ev','watching',(i.id))}" aria-label="Ще дії: ${esc(tn(i))}">${ic('dots')}</button></div>
        ${isSeries?`<div id="lv-${esc(i.imdbID)}">${lh}</div>
          <div class="tr-bar" title="Сезон ${esc(i.season)} з ${esc(i.totalSeasons||1)}"><i style="width:${+_seasonPct(i)||0}%"></i></div>
          <div class="counter">
            <div class="ep"><span class="ep-v">${_epLabel(i)}</span><small class="ep-of">сезон ${esc(i.season)} з ${esc(i.totalSeasons||1)}</small></div>
            <div class="step">${play}
              <button class="btn sq" data-act="adj" data-args="${A((i.id),'e',-1)}" aria-label="Мінус серія">${ic('minus')}</button>
              <button class="btn primary" data-act="adj" data-args="${A((i.id),'e',1)}">${ic('plus')}Серія</button>
              <button class="btn sq" data-act="mvToW" data-args="${A((i.id))}" aria-label="Переглянуто повністю" title="Переглянуто повністю">${ic('check')}</button>
            </div></div>`
        :`<div class="tr-meta">Повнометражний${i.runtime?` · <span class="num">${esc(i.runtime)}</span> хв`:''}</div>
          <div class="counter"><div class="step">${play}<button class="btn primary" data-act="mvToW" data-args="${A((i.id))}">${ic('check')}Переглянуто</button></div></div>`}
        ${_tagsHtml(i)}
      </div></article>`;
  }).join('');
  if(!skipLive&&!document.getElementById('tab-watching')?.classList.contains('hidden'))_startLive(list);
  rDash(); /* Refresh dashboard whenever watching list renders — liveStatus is on items */
}

