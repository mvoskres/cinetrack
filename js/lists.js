/* ── TABS ── */
const TITLES={watched:'Переглянуте',watching:'Дивлюсь',planned:'Планую',stats:'Статистика',recs:'Рекомендації',collections:'Франшизи',people:'Актори й режисери',game:'Впізнай кадр'};
function goTab(id,btn){
  document.getElementById('gameModalBg')?.classList.add('hidden');
  document.querySelectorAll('[id^="tab-"]').forEach(t=>t.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
  document.getElementById('tab-'+id).classList.remove('hidden');
  btn.classList.add('active');
  document.getElementById('topbarTitle').textContent=TITLES[id]||id;
  if(id==='stats')loadStats();
  if(id==='recs')openRecs();
  if(id==='watching')rWatching(); /* rWatching already starts the live fetches */
  if(id==='planned')rPlanned();
  if(id==='collections')loadCollections();
  if(id==='people')renderPeopleTab();
  if(id==='game')loadGameTab();
  document.querySelectorAll('.tabbar button[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===id));
  const ds=document.getElementById('dashSection');if(ds)ds.hidden=id!=='watching'; /* air strip belongs to Дивлюсь */
  closeMenu();
}

/* ── SEARCH ── */
let _st2;
function handleSearch(){const q=document.getElementById('searchInput').value.trim();if(q.length<1){hideSug();document.querySelector('.search-wrap')?.classList.remove('loading');return;}clearTimeout(_st2);document.querySelector('.search-wrap').classList.add('loading');_st2=setTimeout(()=>doSearch(q),340);}
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
  if(watched.find(x=>x.imdbID===imdbID))return `<span class="sug-badge ok">${ic('check')}Переглянуто</span>`;
  if(watching.find(x=>x.imdbID===imdbID))return `<span class="sug-badge wn">${ic('play')}Дивлюсь</span>`;
  if(planned.find(x=>x.imdbID===imdbID))return `<span class="sug-badge pl">${ic('bookmark')}Планую</span>`;
  return'';
}
async function _tmdbSearch(q){
  const d=await tmdbFetch(`/search/multi?query=${encodeURIComponent(q)}&language=uk-UA&include_adult=false`);
  if(document.getElementById('searchInput').value.trim()!==q)return true; /* typed on meanwhile */
  const res=(d?.results||[]).filter(r=>r.media_type==='person'?r.profile_path&&r.popularity>1:(r.media_type==='movie'||r.media_type==='tv'));
  if(!res.length){document.getElementById('suggestions').innerHTML='';return false;}
  _ownIdx=null;
  /* TMDB's order puts «Золотая дюна» above «Дюна»: exact, then prefix matches first, then popularity */
  const ql=q.toLowerCase(),rank=r=>{const t=[r.title||r.name,r.original_title||r.original_name].map(x=>(x||'').toLowerCase());
    return t.includes(ql)?0:t.some(x=>x.startsWith(ql))?1:2;};
  const titles=res.filter(r=>r.media_type!=='person').sort((a,b)=>rank(a)-rank(b)||(b.popularity||0)-(a.popularity||0)).slice(0,7),people=res.filter(r=>r.media_type==='person').slice(0,2);
  const box=document.getElementById('suggestions');box.classList.remove('hidden');
  document.querySelector('.search-wrap').classList.remove('loading');
  box.innerHTML=titles.map(r=>{
    const t=r.title||r.name||'',o=r.original_title||r.original_name||'',y=(r.release_date||r.first_air_date||'').slice(0,4);
    return `<div class="sug-item" data-act="_sugOpen" data-args="${A(r.media_type,r.id)}">
      <img class="sug-img" src="${_tsImg(r.poster_path,'w92')||blank()}" loading="lazy" onerror="this.src=BLANK">
      <div class="sug-info"><div class="sug-title">${esc(t)}</div><div class="sug-meta">${y?`<span class="sug-year">${y}</span> · `:''}${r.media_type==='tv'?'Серіал':'Фільм'}${o&&o!==t?` · ${esc(o)}`:''}</div></div>
      ${_ownBadge(_tmdbOwnedId(r.media_type,r.id))}</div>`;
  }).join('')+people.map(p=>`<div class="sug-item" data-act="_sugPerson" data-args="${A(p.id,p.name,p.profile_path||'')}">
      <img class="sug-img round" src="${_tsImg(p.profile_path,'w92')}" loading="lazy" onerror="this.src=BLANK">
      <div class="sug-info"><div class="sug-title">${esc(p.name)}</div><div class="sug-meta">${p.known_for_department==='Directing'?'Режисер':'Актор'} · фільмографія</div></div></div>`).join('');
  return true;
}
function _sugOpen(mt,id){hideSug();document.getElementById('searchInput').value='';openTitleTmdb(mt,id);}
function _sugPerson(id,name,profile){hideSug();document.getElementById('searchInput').value='';_tsPerson(id,name,profile);}
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
    document.querySelector('.search-wrap').classList.remove('loading');
    box.innerHTML=res.slice(0,7).map(m=>{
      let b='';
      if(watched.find(x=>x.imdbID===m.imdbID))       b=`<span class="sug-badge ok">${ic('check')}Переглянуто</span>`;
      else if(watching.find(x=>x.imdbID===m.imdbID)) b=`<span class="sug-badge wn">${ic('play')}Дивлюсь</span>`;
      else if(planned.find(x=>x.imdbID===m.imdbID))  b=`<span class="sug-badge pl">${ic('bookmark')}Планую</span>`;
      return `<div class="sug-item" data-act="pickMovie" data-args="${A(`${m.imdbID}`)}">
        <img class="sug-img" src="${ps(m.Poster)||blank()}" loading="lazy" onerror="this.src=BLANK">
        <div class="sug-info"><div class="sug-title">${esc(m.Title)}</div><div class="sug-meta"><span class="sug-year">${m.Year}</span> · ${tl(m.Type)}</div></div>
        ${b}</div>`;
    }).join('');
  }catch(e){hideSug();console.warn('Search error:',e);}
}
function hideSug(){document.getElementById('suggestions').classList.add('hidden');document.querySelector('.search-wrap').classList.remove('loading');}

/* ── PICK MOVIE ── */
async function pickMovie(imdbID){
  hideSug();document.getElementById('searchInput').value='';
  let m=_pendingMap[imdbID];if(!m){m=await aFetch(`i=${imdbID}&plot=short`);_pmSet(imdbID,m);}
  const inW=!!watched.find(x=>x.imdbID===imdbID),inWn=!!watching.find(x=>x.imdbID===imdbID),inPl=!!planned.find(x=>x.imdbID===imdbID);
  modal(`
    <img class="modal-poster" src="${ps(m.Poster)||blank()}" onerror="this.style.display='none'" alt="">
    <h2 class="modal-title">${esc(m.Title)}</h2>
    <div class="modal-sub">${m.Year} · ${tl(m.Type)} · ${m.imdbRating&&m.imdbRating!=='N/A'?'IMDb '+m.imdbRating:'без рейтингу'} · ${(m.Genre||'').split(',')[0]}</div>
    ${m.Plot&&m.Plot!=='N/A'?`<div class="modal-plot">${esc(m.Plot)}</div>`:''}
    <div class="modal-btns">
      ${inW ?`<div class="modal-already ok">${ic('check')}Вже у переглянутому</div>`:`<button class="m-btn j" data-act="_pickDo" data-args="${A('w',imdbID)}">${ic('check')}Переглянуто</button>`}
      ${inWn?`<div class="modal-already go">${ic('play')}Вже дивлюсь</div>`:`<button class="m-btn s" data-act="_pickDo" data-args="${A('wn',imdbID)}">${ic('play')}Дивлюсь зараз</button>`}
      <button class="m-btn s" data-act="_pickDo" data-args="${A('info',imdbID)}">${ic('info')}Детальніше</button>
      ${inPl?`<div class="modal-already pl">${ic('bookmark')}Вже заплановано</div>`:`<button class="m-btn m" data-act="_pickDo" data-args="${A('pl',imdbID)}">${ic('bookmark')}Запланувати</button>`}
      <button class="m-btn can" onclick="closeModal()">Закрити</button>
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

/* ── RIBBON ── */
function ribbon(cat){const map={series:'series',anime:'anime',cartoon:'cartoon',other:'other'};const cls=map[cat]||'';return `<div class="card-ribbon${cls?' '+cls:''}">${{movie:'Фільм',series:'Серіал',anime:'Аніме',cartoon:'Мульт',other:'Інше'}[cat]||cat}</div>`;}

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
  _gridState[t]={g,list,cardFn};
  const n=Math.min(_gridShown[t],list.length);
  g.innerHTML=list.slice(0,n).map(cardFn).join('');
  _gridSentinel(t,n);
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
  m.innerHTML=items.filter(Boolean).map(x=>x==='-'?'<hr>':x.href
    ?`<a role="menuitem" href="${esc(x.href)}" target="_blank" rel="noopener" onclick="closeMenu()">${ic(x.icon)}${x.label}</a>`
    :`<button role="menuitem" class="${x.danger?'danger':''}" onclick="closeMenu();${x.run}">${ic(x.icon)}${x.label}</button>`).join('');
  document.body.appendChild(m);
  const r=btn.getBoundingClientRect();
  const below=r.bottom+6+m.offsetHeight<=innerHeight-8;
  m.style.top=Math.max(8,below?r.bottom+6:r.top-m.offsetHeight-6)+'px';
  m.style.left=Math.max(8,Math.min(innerWidth-m.offsetWidth-8,r.right-m.offsetWidth))+'px';
  m.querySelector('button,a')?.focus({preventScroll:true});
}
function closeMenu(){document.querySelector('.ct-menu')?.remove();}
document.addEventListener('click',e=>{if(!e.target.closest('.ct-menu'))closeMenu();});
/* ── DELEGATED HANDLERS ──
   Markup carries data-act / data-input / data-change="fnName" and data-args (JSON from A()).
   '$ev' '$el' '$value' stand for the event, the element and its value. Ancestors with the
   same attribute run too, like inline handlers bubbling, until one stops propagation. */
function A(...a){return esc(JSON.stringify(a));}
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
  ({w:addW,wn:addWn,pl:addPl})[kind](imdbID).then(closeModal);
}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu();});
window.addEventListener('scroll',e=>{if(!e.target.closest?.('.ct-menu'))closeMenu();},{passive:true,capture:true});
/* title sheet: the sticky top bar stays see-through over the hero and gets a solid background once content scrolls under it */
window.addEventListener('scroll',e=>{const t=e.target;if(t.classList?.contains('ts'))t.classList.toggle('scrolled',t.scrollTop>8);},{passive:true,capture:true});
function cardMenu(ev,list,id){
  const it=findItem(id);if(!it)return;
  const ser=it.type==='series';
  const common=[it.streamUrl&&{icon:'play',label:'Дивитись',href:it.streamUrl},
    {icon:'link',label:it.streamUrl?'Змінити посилання':'Додати посилання',run:`editUrl(${id})`},
    {icon:'tag',label:'Додати тег',run:`addTag(${id})`},'-'];
  const items={
    watched:[{icon:'star',label:'Оцінка і коментар',run:`editW(${id})`},...common,{icon:'trash',label:'Видалити',run:`del('watched',${id},rWatched)`,danger:1}],
    planned:[{icon:'check',label:'Переглянуто',run:`plToW(${id})`},{icon:'play',label:'Почати дивитись',run:`plToWn(${id})`},...common,{icon:'trash',label:'Видалити',run:`del('planned',${id},rPlanned)`,danger:1}],
    watching:[ser&&{icon:'refresh',label:'Оновити дані ефіру',run:`relive('${it.imdbID}')`},ser&&{icon:'plus',label:'Наступний сезон',run:`adj(${id},'s',1)`},ser&&it.season>1&&{icon:'minus',label:'Попередній сезон',run:`adj(${id},'s',-1)`},
      {icon:'check',label:'Переглянуто повністю',run:`mvToW(${id})`},...common,{icon:'trash',label:'Видалити',run:`del('watching',${id},rWatching)`,danger:1}],
  }[list];
  openMenu(ev,items);
}

/* ── POSTER CARD — the one card for watched, planned, recs, people ── */
function _myMeta(i){const c=i.customCategory||i.type;return `<div class="pc-m">${i.year?`<span class="num">${esc(i.year)}</span>`:''}<span>${catLabel(c)}</span>${i.imdbRating?`<span class="imdb">IMDb <span class="num">${esc(i.imdbRating)}</span></span>`:''}</div>`;}
function _tagsHtml(i){return (i.tags||[]).length?`<div class="card-utags">${i.tags.map(t=>`<span class="utag">${esc(t)}<button class="utag-x" data-act="rmTag" data-args="${A((i.id),`${uriSafe(t)}`)}" aria-label="Видалити тег ${esc(t)}">✕</button></span>`).join('')}</div>`:'';}
function myCard(list,i){
  return `<article class="pc">
    <div class="pc-art"><a href="${i.imdbUrl}" target="_blank" rel="noopener" tabindex="-1" data-act="_tsClick" data-args="${A('$ev',`${i.imdbID}`)}"><img src="${i.poster||BLANK}" alt="" loading="lazy" onerror="this.src=BLANK"></a>
      ${i.rating?`<span class="pc-my">${ic('star')}${i.rating}</span>`:''}
      ${i.streamUrl?`<a class="pc-fab play" href="${esc(i.streamUrl)}" target="_blank" rel="noopener" aria-label="Дивитись ${esc(i.title)}">${ic('play')}</a>`:''}
      <button class="pc-fab more" data-act="cardMenu" data-args="${A('$ev',`${list}`,(i.id))}" aria-label="Дії: ${esc(i.title)}">${ic('dots')}</button></div>
    <div class="pc-t"><a href="${i.imdbUrl}" target="_blank" rel="noopener" data-act="_tsClick" data-args="${A('$ev',`${i.imdbID}`)}">${esc(i.title)}</a></div>
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
  if(!list.length){g.innerHTML=watched.length?`<div class="empty"><span class="empty-icon">${ic('search')}</span><div class="empty-txt">Нічого не знайдено за фільтром</div></div>`:`<div class="empty"><span class="empty-icon">${ic('film')}</span><div class="empty-txt">Тут з'являтимуться переглянуті фільми та серіали</div></div>`;return;}
  _gridRender('watched',g,list,i=>myCard('watched',i));
}

/* ── RENDER PLANNED ── */
function rPlanned(){
  const g=document.getElementById('plGrid');
  const list=applyF(planned,'planned');
  if(!list.length){g.innerHTML=planned.length?`<div class="empty"><span class="empty-icon">${ic('search')}</span><div class="empty-txt">Нічого не знайдено</div></div>`:`<div class="empty"><span class="empty-icon">${ic('bookmark')}</span><div class="empty-txt">Черга для перегляду порожня</div></div>`;return;}
  _gridRender('planned',g,list,i=>myCard('planned',i));
}

/* ── EDIT WATCHED ── */
function editW(id){
  const it=watched.find(i=>i.id===id);if(!it)return;
  modal(`
    <img class="modal-poster" src="${it.poster||blank()}" loading="lazy" onerror="this.src=BLANK" alt="">
    <h2 class="modal-title">${esc(it.title)}</h2>
    <div class="modal-sub" style="margin-bottom:1.1rem">${it.year||''} · ${tl(it.type)}</div>
    <div class="form-g"><label class="form-lbl">Категорія</label>
      <select class="form-sel" id="eC">
        <option value="movie"   ${(it.customCategory||it.type)==='movie'   ?'selected':''}>Фільм</option>
        <option value="series"  ${(it.customCategory||it.type)==='series'  ?'selected':''}>Серіал</option>
        <option value="anime"   ${(it.customCategory||it.type)==='anime'   ?'selected':''}>Аніме</option>
        <option value="cartoon" ${(it.customCategory||it.type)==='cartoon' ?'selected':''}>Мульт</option>
        <option value="other"   ${(it.customCategory||it.type)==='other'   ?'selected':''}>Інше</option>
      </select></div>
    <div class="form-g"><label class="form-lbl">Моя оцінка</label>
      <div class="stars" id="starsBox">${buildStars(it.rating||0)}</div>
      <input type="hidden" id="eR" value="${it.rating||0}"></div>
    <div class="form-g"><label class="form-lbl">Коментар</label>
      <textarea class="form-ta" id="eCm" rows="3" placeholder="Враження…">${esc(it.comment||'')}</textarea></div>
    <div class="modal-btns">
      <button class="m-btn g" data-act="saveEditW" data-args="${A((id))}">Зберегти</button>
      <button class="m-btn can" onclick="closeModal()">Скасувати</button>
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
    const play=i.streamUrl?`<a class="btn sq" href="${esc(i.streamUrl)}" target="_blank" rel="noopener" aria-label="Дивитись" title="Дивитись">${ic('play')}</a>`:'';
    return `<article class="tr" id="wc-${i.id}">
      <img class="tr-art" src="${i.poster||BLANK}" alt="" loading="lazy" onerror="fixBrokenPoster(this,'${i.imdbID}')" data-act="openTitle" data-args="${A(`${i.imdbID}`)}" style="cursor:pointer">
      <div class="tr-body">
        <div class="tr-top"><div class="tr-head">
          <h3 class="tr-t"><a href="${i.imdbUrl}" target="_blank" rel="noopener" data-act="_tsClick" data-args="${A('$ev',`${i.imdbID}`)}">${esc(i.title)}</a>${_dupSet.has(i.imdbID)?'<span class="dup-badge" title="Цей тайтл є ще в іншому списку">дубль</span>':''}</h3>
          <div class="tr-meta">${catLabel(i.customCategory||i.type)}${i.year?` · <span class="num">${esc(i.year)}</span>`:''}${i.imdbRating?` · IMDb <span class="num">${esc(i.imdbRating)}</span>`:''}</div></div>
          <button class="icon-btn" data-act="cardMenu" data-args="${A('$ev','watching',(i.id))}" aria-label="Ще дії: ${esc(i.title)}">${ic('dots')}</button></div>
        ${isSeries?`<div id="lv-${i.imdbID}">${lh}</div>
          <div class="tr-bar" title="Сезон ${i.season} з ${i.totalSeasons||1}"><i style="width:${_seasonPct(i)}%"></i></div>
          <div class="counter">
            <div class="ep"><span class="ep-v">${_epLabel(i)}</span><small class="ep-of">сезон ${i.season} з ${i.totalSeasons||1}</small></div>
            <div class="step">${play}
              <button class="btn sq" data-act="adj" data-args="${A((i.id),'e',-1)}" aria-label="Мінус серія">${ic('minus')}</button>
              <button class="btn primary" data-act="adj" data-args="${A((i.id),'e',1)}">${ic('plus')}Серія</button>
              <button class="btn sq" data-act="mvToW" data-args="${A((i.id))}" aria-label="Переглянуто повністю" title="Переглянуто повністю">${ic('check')}</button>
            </div></div>`
        :`<div class="tr-meta">Повнометражний${i.runtime?` · <span class="num">${i.runtime}</span> хв`:''}</div>
          <div class="counter"><div class="step">${play}<button class="btn primary" data-act="mvToW" data-args="${A((i.id))}">${ic('check')}Переглянуто</button></div></div>`}
        ${_tagsHtml(i)}
      </div></article>`;
  }).join('');
  if(!skipLive&&!document.getElementById('tab-watching')?.classList.contains('hidden'))_startLive(list);
  rDash(); /* Refresh dashboard whenever watching list renders — liveStatus is on items */
}

