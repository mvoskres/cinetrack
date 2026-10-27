/* ═══════════════════════════════════════════════════════════════
   RECOMMENDATIONS — shelves that each say why they are there.
   Was: one random grid of 18 (85 TMDB calls, 69 of them external_ids
   just to dedupe), re-rolled on every visit. Now:
   · candidates are filtered against your lists by known TMDB ids +
     title/year, so an IMDb id is only fetched when you add a title;
   · the result is kept for 24h (ct_recs) and only "Оновити" re-rolls it;
   · franchise and people shelves come from caches, zero requests. */
const RECS_TTL=24*60*60*1000;
const SHELF_N=6; /* cards shown per shelf before "Показати всі" */
let _recs=null;          /* {ts, seedRot, shelves:[{id,title,why,items:[...]}]} */
try{_recs=JSON.parse(localStorage.getItem('ct_recs')||'null');}catch(e){_recs=null;}
let _recView='picks', _recType='all', _recBusy=false, _recGenreState=null;
const _recOpen=new Set(); /* shelves expanded past SHELF_N */
function _recsSave(){if(_recs)_lsSet('ct_recs',JSON.stringify(_recs));}

/* What counts as "already yours": list items + hidden, by imdbID, by TMDB key, by title|year */
function _recKnown(){
  const imdb=new Set(),tmdb=new Set(),ty=new Set(),hiddenTitles=new Set();
  [...watched,...watching,...planned].forEach(i=>{
    imdb.add(i.imdbID);
    ty.add(_norm(i.title)+'|'+String(i.year||'').slice(0,4));
    const f=_findCache[i.imdbID];if(f){if(f.m)tmdb.add('movie:'+f.m);if(f.t)tmdb.add('tv:'+f.t);}
  });
  hidden.forEach(h=>{if(h.imdbID)imdb.add(h.imdbID);if(h.tmdb)tmdb.add(h.tmdb);hiddenTitles.add(_norm(h.title));
    const f=_findCache[h.imdbID];if(f){if(f.m)tmdb.add('movie:'+f.m);if(f.t)tmdb.add('tv:'+f.t);}});
  for(const k in _resolveCache)if(imdb.has(_resolveCache[k].imdbID))tmdb.add(k);
  return {imdb,tmdb,
    has(it){return tmdb.has(it.k)||(it.imdbID&&imdb.has(it.imdbID))||ty.has(_norm(it.title)+'|'+it.year)||hiddenTitles.has(_norm(it.title));}};
}

/* TMDB list result → compact rec item */
function _recItem(r,mt,note){
  const m=mt||(r.media_type==='tv'?'tv':'movie');
  const date=r.release_date||r.first_air_date||'';
  const k=`${m}:${r.id}`;
  return {k,id:r.id,mt:m,title:r.title||r.name||'',year:date.slice(0,4),date,poster:r.poster_path||null,
    rating:typeof r.vote_average==='number'?r.vote_average:0,votes:r.vote_count||0,
    anim:(r.genre_ids||[]).includes(16),lang:r.original_language||'',imdbID:_resolveCache[k]?.imdbID||'',note:note||''};
}
function _recTypeLabel(it){return it.anim?(it.lang==='ja'?'Аніме':'Мульт'):it.mt==='tv'?'Серіал':'Фільм';}
const _today=_todayISO;
/* quality gate: released, has a poster, enough votes to trust the score */
function _recOk(it,minVotes,minRating){return it.poster&&it.title&&it.date&&it.date<=_today()&&it.votes>=minVotes&&it.rating>=minRating;}

function _genreNameById(id){for(const n in TMDB_GENRES)if(TMDB_GENRES[n]===id)return n;return '';}
function _topGenreIds(n){
  const f={};watched.forEach(i=>(i.genre||'').split(',').map(s=>s.trim()).filter(Boolean).forEach(g=>{const id=TMDB_GENRES[g];if(id&&id!==16)f[id]=(f[id]||0)+1;}));
  return Object.entries(f).sort((a,b)=>b[1]-a[1]).slice(0,n).map(e=>+e[0]);
}
function _catShare(c){return watched.filter(i=>(i.customCategory||i.type)===c).length/Math.max(1,watched.length);}

/* Seeds: titles you rated 8+ first, then highly rated among the last 120 you watched.
   Three per refresh, rotating, so "Оновити" brings different shelves. */
function _recSeeds(rot){
  const rated=watched.filter(i=>i.rating>=8).sort((a,b)=>b.rating-a.rating||(b.addedAt||0)-(a.addedAt||0));
  const recent=watched.slice().sort((a,b)=>(b.addedAt||0)-(a.addedAt||0)).slice(0,120)
    .filter(i=>!i.rating&&parseFloat(i.imdbRating)>=7.6).sort((a,b)=>parseFloat(b.imdbRating)-parseFloat(a.imdbRating));
  const pool=[...rated,...recent].slice(0,24);
  if(!pool.length)return [];
  const out=[];for(let k=0;k<Math.min(3,pool.length);k++)out.push(pool[(rot*3+k)%pool.length]);
  return [...new Set(out)];
}

/* ── shelves that need no network ── */
function _shelfFranchises(known){
  const own=_ownedMovieMap(),today=_today(),groups={};
  for(const imdb in own){const c=_collCache[imdb];if(c&&c.collId&&own[imdb].status==='ok')(groups[c.collId]=groups[c.collId]||0),groups[c.collId]++;}
  const items=[];
  Object.entries(groups).sort((a,b)=>b[1]-a[1]).forEach(([cid,seen])=>{
    const det=_collDetails[cid];if(!det)return;
    const parts=(det.parts||[]).slice().sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999'));
    /* skip weak entries (Home Alone 4 is 2.6): offer the next missing part worth watching */
    const idx=parts.findIndex(p=>p.imdbID&&!own[p.imdbID]&&!_skippedParts[p.imdbID]&&p.date&&p.date<=today&&!(parseFloat(p.imdbRating||p.vote)<6));
    if(idx<0)return;
    const p=parts[idx];
    const it={k:'movie:'+p.id,id:p.id,mt:'movie',title:p.title,year:p.year,date:p.date,poster:p.poster||det.poster||null,
      rating:p.vote||0,imdbRating:p.imdbRating||'',votes:0,anim:false,lang:'',imdbID:p.imdbID,
      note:`${(det.name||'').replace(/ Collection$/,'')} · частина ${idx+1} з ${parts.length}`};
    if(!known.has(it))items.push(it);
  });
  return {id:'franchise',title:'Наступне у твоїх франшизах',why:'Перша непереглянута частина франшиз, які ти вже почав',items:items.slice(0,18)};
}
function _shelfPeople(known){
  const items=[],today=_today();
  _trackedPeople.forEach(p=>{
    const c=_personCache[p.id];if(!c)return;
    [...(c.cast||[]).map(x=>({...x,_r:'acting'})),...(c.crew||[]).filter(x=>x.job==='Director').map(x=>({...x,_r:'directing'}))].forEach(x=>{
      if((x.genre_ids||[]).some(g=>g===99||g===10767||g===10763||g===10764))return; /* docs, talk shows */
      const it=_recItem(x,x.media_type==='tv'?'tv':'movie',`${p.name} · ${x._r==='acting'?'грає':'режисер'}`);
      if(_recOk(it,150,6.3)&&!known.has(it))items.push(it);
    });
  });
  const seen=new Set();
  return {id:'people',title:'З фільмографій людей, за якими стежиш',why:'Те, чого ще немає у твоїх списках',
    items:items.filter(i=>seen.has(i.k)?false:(seen.add(i.k),true)).sort((a,b)=>b.votes-a.votes).slice(0,18)};
}

/* ── network shelves (TMDB) ── */
async function _shelfSeed(seed,known){
  const f=await tmdbFindIds(seed.imdbID);
  const mt=seed.type==='series'?(f.t?'tv':f.m?'movie':null):(f.m?'movie':f.t?'tv':null);
  if(!mt)return null;
  const d=await tmdbFetch(`/${mt}/${mt==='tv'?f.t:f.m}/recommendations`);
  const items=(d?.results||[]).map(r=>_recItem(r,r.media_type==='tv'?'tv':r.media_type==='movie'?'movie':mt))
    .filter(it=>_recOk(it,it.mt==='tv'?40:120,6.4)&&!known.has(it));
  return {id:'seed-'+seed.imdbID,title:`Схоже на «${seed.title}»`,
    why:seed.rating?`Бо ти оцінив його на ${seed.rating}/10`:`Бо ти нещодавно його переглянув (IMDb ${seed.imdbRating})`,items:items.slice(0,18)};
}
async function _shelfDiscover(id,title,why,queries,known,minVotes,minRating,sortBy){
  const pages=await Promise.all(queries.map(([mt,q])=>tmdbFetch(`/discover/${mt}?${q}`).then(d=>(d?.results||[]).map(r=>_recItem(r,mt))).catch(()=>[])));
  let items=pages.flat().filter(it=>_recOk(it,minVotes,minRating)&&!known.has(it));
  if(sortBy)items.sort(sortBy);
  return {id,title,why,items:items.slice(0,18)};
}

async function buildRecs(){
  if(_recBusy)return;_recBusy=true;
  const g=document.getElementById('recsGrid');
  if(!_recs)g.innerHTML='<div class="spinner">Підбираю рекомендації…</div>';
  document.getElementById('recsRefresh')?.classList.add('busy');
  const known=_recKnown(),rot=((_recs?.seedRot)??-1)+1;
  const shelves=[_shelfFranchises(known)];
  if(TMDB_KEY&&!_tmdbBlocked){
    const since=new Date(Date.now()-548*864e5).toISOString().slice(0,10); /* ~18 months */
    const top=_topGenreIds(3),gq=top.join('|');
    const seeds=_recSeeds(rot);
    const jobs=[
      ...seeds.map(s=>_shelfSeed(s,known).catch(()=>null)),
      top.length?_shelfDiscover('fresh','Свіжі релізи у твоїх жанрах',`За останні півтора року · ${top.map(_genreNameById).join(', ')}`,
        [['movie',`with_genres=${gq}&primary_release_date.gte=${since}&vote_count.gte=150&sort_by=popularity.desc`],
         ['tv',`with_genres=${gq}&first_air_date.gte=${since}&vote_count.gte=60&sort_by=popularity.desc`]],known,60,6.5,(a,b)=>b.votes-a.votes).catch(()=>null):null,
      (_catShare('cartoon')+_catShare('anime')>=0.15)?_shelfDiscover('anim','Визнана анімація, яку ти ще не бачив','Найвище оцінені анімаційні фільми на TMDB (від 7.2, щонайменше 300 голосів)',
        /* sorted by score, not popularity: the 60 most-voted ones are all in your lists already */
        [1,2,3].map(p=>['movie',`with_genres=16&vote_average.gte=7.2&vote_count.gte=300&sort_by=vote_average.desc&page=${p}`]),known,300,7.2,(a,b)=>b.rating-a.rating).catch(()=>null):null,
      _catShare('anime')>=0.05?_shelfDiscover('anime','Аніме-серіали з високими оцінками','Японська анімація з оцінкою від 7.8 на TMDB',
        [1,2].map(p=>['tv',`with_genres=16&with_original_language=ja&vote_average.gte=7.8&vote_count.gte=300&sort_by=vote_count.desc&page=${p}`]),known,300,7.8,(a,b)=>b.rating-a.rating).catch(()=>null):null,
      tmdbFetch('/trending/all/week').then(d=>({id:'trend',title:'Популярне цього тижня',why:'Тренди TMDB без того, що вже є у твоїх списках',
        items:(d?.results||[]).filter(r=>r.media_type==='movie'||r.media_type==='tv').map(r=>_recItem(r)).filter(it=>it.poster&&it.votes>=50&&!known.has(it)).slice(0,18)})).catch(()=>null),
    ];
    const res=await Promise.all(jobs);
    const [s1,s2,s3]=res.slice(0,seeds.length);const rest=res.slice(seeds.length);
    /* interleave so the page alternates "because of X" with broader shelves */
    shelves.push(s1,rest[0],s2,rest[1],s3,_shelfPeople(known),rest[2],rest[3]);
  }else shelves.push(_shelfPeople(known));
  /* a title shows up only in the first shelf that has it */
  const seen=new Set();
  const clean=shelves.filter(Boolean).map(s=>({...s,items:s.items.filter(i=>seen.has(i.k)?false:(seen.add(i.k),true))})).filter(s=>s.items.length);
  _recs={ts:Date.now(),seedRot:rot,shelves:clean};_recsSave();
  recsFetched=Date.now();_recBusy=false;
  document.getElementById('recsRefresh')?.classList.remove('busy');
  renderRecs();
}

/* entry point from the tab */
function openRecs(){
  _recView=_recView==='genre'?'picks':_recView;
  if(!_recs||Date.now()-_recs.ts>RECS_TTL)buildRecs();
  renderRecs();
}
async function refreshRecs(){_recOpen.clear();_recView='picks';const gp=document.getElementById('genrePick');if(gp)gp.value='';await buildRecs();}
const loadRecs=openRecs; /* older callers */

function _recFind(k){
  for(const s of _recs?.shelves||[]){const it=s.items.find(i=>i.k===k);if(it)return it;}
  return _recGenreState?.items.find(i=>i.k===k)||null;
}
function _recDrop(k){
  (_recs?.shelves||[]).forEach(s=>{s.items=s.items.filter(i=>i.k!==k);});
  if(_recs)_recs.shelves=_recs.shelves.filter(s=>s.items.length);
  if(_recGenreState)_recGenreState.items=_recGenreState.items.filter(i=>i.k!==k);
  _recsSave();renderRecs();
}
function recMenu(ev,k){
  openMenu(ev,[{icon:'check',label:'Переглянуто',run:`recAct('${k}','watched')`},{icon:'play',label:'Дивлюсь',run:`recAct('${k}','watching')`},
    {icon:'bookmark',label:'Запланувати',run:`recAct('${k}','planned')`},'-',{icon:'eye-off',label:'Не цікаво, сховати',run:`recAct('${k}','hide')`}]);
}
/* IMDb id is resolved only here, when a title is actually added */
async function recAct(k,action){
  const it=_recFind(k);if(!it)return;
  if(action==='hide'){
    hidden.push({imdbID:it.imdbID||'',tmdb:k,title:it.title,year:it.year,poster:it.poster?`https://image.tmdb.org/t/p/w342${it.poster}`:''});
    save();_recDrop(k);toast(`«${it.title}» більше не пропонуватиметься`,'',2600);return;
  }
  let imdb=it.imdbID||_resolveCache[k]?.imdbID;
  if(!imdb){
    try{const d=await tmdbFetch(`/${it.mt}/${it.id}/external_ids`);imdb=d?.imdb_id||'';
      if(imdb){_resolveCache[k]={imdbID:imdb,ended:it.mt==='movie',ts:Date.now()};_resolveCacheSave();}}
    catch(e){toast('Не вдалося зв\'язатися з TMDB, спробуй ще раз','err');return;}
  }
  if(!imdb){toast('Цього тайтлу немає на IMDb, тож додати його не вийде','err',3600);return;}
  it.imdbID=imdb;
  const fn={watched:addW,watching:addWn,planned:addPl}[action];
  let ok=false;try{ok=await fn(imdb);}catch(e){toast('Не вдалося додати: немає зв\'язку з OMDb','err');}
  if(ok)_recDrop(k);
}

/* ── genre browse: one grid, popular titles of a genre you haven't seen ── */
async function recGenre(name){
  if(!name){_recView='picks';renderRecs();return;}
  const gid=TMDB_GENRES[name];if(!gid||!TMDB_KEY||_tmdbBlocked)return;
  _recView='genre';_recGenreState={name,items:[]};renderRecs();
  const known=_recKnown();
  const s=await _shelfDiscover('genre','','',[1,2].flatMap(p=>[['movie',`with_genres=${gid}&vote_count.gte=500&sort_by=popularity.desc&page=${p}`],['tv',`with_genres=${gid}&vote_count.gte=200&sort_by=popularity.desc&page=${p}`]]),known,200,6.5).catch(()=>({items:[]}));
  if(_recGenreState?.name!==name)return; /* switched again meanwhile */
  _recGenreState.items=s.items.concat([]).slice(0,48);_recGenreState.loaded=true;renderRecs();
}
function recView(v){_recView=v;if(v!=='genre'){const gp=document.getElementById('genrePick');if(gp)gp.value='';}renderRecs();}
function recType(t){_recType=t;renderRecs();}
function recShelfMore(id){_recOpen.has(id)?_recOpen.delete(id):_recOpen.add(id);renderRecs();}

function _recCard(it){
  const href=it.imdbID?`https://www.imdb.com/title/${it.imdbID}/`:`https://www.themoviedb.org/${it.mt}/${it.id}`;
  const poster=it.poster?(it.poster.startsWith('http')?it.poster:`https://image.tmdb.org/t/p/w342${it.poster}`):BLANK;
  const score=it.imdbRating?`<span class="imdb">IMDb <span class="num">${esc(it.imdbRating)}</span></span>`:it.rating?`<span class="imdb">TMDB <span class="num">${it.rating.toFixed(1)}</span></span>`:'';
  return `<article class="pc" id="rc-${it.k.replace(':','-')}">
    <div class="pc-art"><a href="${href}" target="_blank" rel="noopener" tabindex="-1" data-act="_tsClickT" data-args="${A('$ev',`${it.mt}`,(it.id))}"><img src="${poster}" alt="" loading="lazy" onerror="this.src=BLANK"></a>
      <button class="pc-fab more always" data-act="recMenu" data-args="${A('$ev',`${it.k}`)}" aria-label="Додати або сховати: ${esc(it.title)}">${ic('plus')}</button></div>
    <div class="pc-t"><a href="${href}" target="_blank" rel="noopener" data-act="_tsClickT" data-args="${A('$ev',`${it.mt}`,(it.id))}">${esc(it.title)}</a></div>
    <div class="pc-m">${it.year?`<span class="num">${esc(it.year)}</span>`:''}<span>${_recTypeLabel(it)}</span>${score}</div>
    ${it.note?`<div class="pc-note" title="${esc(it.note)}">${esc(it.note)}</div>`:''}
  </article>`;
}
const _recTypeOk=it=>_recType==='all'||(_recType==='anim'?it.anim:(!it.anim&&it.mt===_recType));

function renderRecs(){
  const g=document.getElementById('recsGrid');if(!g)return;
  ['picks','hidden'].forEach(v=>document.getElementById('rv-'+v)?.classList.toggle('on',_recView===v));
  const hn=document.getElementById('rvHiddenN');if(hn)hn.textContent=hidden.length;
  const sub=document.getElementById('recsSub');
  const bar=document.getElementById('recsBar');
  if(_recView==='hidden'){if(sub)sub.textContent='Тайтли, які ти сховав. Вони не з\'являтимуться в підбірках';if(bar)bar.innerHTML='';showHidden();return;}
  /* shelves are cached for 24h: whatever was added/hidden since must not show up again */
  const known=_recKnown(),fresh=it=>!known.has(it);
  /* type chips: counts over what is currently on screen */
  const pool=(_recView==='genre'?(_recGenreState?.items||[]):(_recs?.shelves||[]).flatMap(s=>s.items)).filter(fresh);
  const cnt={all:pool.length,movie:0,tv:0,anim:0};pool.forEach(i=>{cnt[i.anim?'anim':i.mt]++;});
  if(bar)bar.innerHTML=pool.length?`<div class="cat-seg" role="group" aria-label="Тип">${[['all','Усе'],['movie','Фільми'],['tv','Серіали'],['anim','Анімація']].filter(([k])=>k==='all'||cnt[k]).map(([k,l])=>`<button class="cat-chip${_recType===k?' on':''}" data-act="recType" data-args="${A(`${k}`)}">${l}<span class="num">${cnt[k]}</span></button>`).join('')}</div>`:'';
  if(_recView==='genre'){
    const st=_recGenreState;
    if(sub)sub.innerHTML=`Популярне в жанрі ${esc(st?.name||'')} · <button class="link-btn" onclick="recView('picks')">до підбірки</button>`;
    if(!st?.loaded){g.innerHTML='<div class="spinner">Шукаю популярне в жанрі…</div>';return;}
    const items=st.items.filter(fresh).filter(_recTypeOk);
    g.innerHTML=items.length?`<div class="grid">${items.map(_recCard).join('')}</div>`:`<div class="empty"><span class="empty-icon">${ic('search')}</span><div class="empty-txt">Усе популярне в цьому жанрі вже є у твоїх списках</div></div>`;
    return;
  }
  if(sub){
    if(_recs){const h=Math.round((Date.now()-_recs.ts)/36e5);sub.textContent=`${_recs.shelves.length} підбірок · оновлено ${h<1?'щойно':h<24?h+' год тому':Math.round(h/24)+' дн тому'}`;}
    else sub.textContent='';
  }
  if(!_recs){if(!_recBusy)g.innerHTML='';return;}
  const shelves=_recs.shelves.map(s=>({...s,items:s.items.filter(fresh).filter(_recTypeOk)})).filter(s=>s.items.length);
  const noKey=!TMDB_KEY?`<div class="recs-note">${ic('info')}<span>Більшість підбірок будує TMDB. Додай безкоштовний ключ у Налаштуваннях, щоб їх побачити.</span></div>`:'';
  if(!shelves.length){g.innerHTML=noKey+`<div class="empty"><span class="empty-icon">${ic('spark')}</span><div class="empty-txt">Поки нічого не підібралось. Спробуй «Оновити» або інший тип</div></div>`;return;}
  g.innerHTML=noKey+shelves.map(s=>{
    const open=_recOpen.has(s.id),shown=open?s.items:s.items.slice(0,SHELF_N);
    return `<section class="rec-shelf" aria-labelledby="sh-${s.id}">
      <div class="rec-shelf-head"><div><h2 id="sh-${s.id}">${esc(s.title)}</h2><div class="rec-why">${esc(s.why)}</div></div>
        ${s.items.length>SHELF_N?`<button class="link-btn" data-act="recShelfMore" data-args="${A(`${s.id}`)}">${open?'Згорнути':`Усі ${s.items.length}`}</button>`:''}</div>
      <div class="grid">${shown.map(_recCard).join('')}</div>
    </section>`;}).join('');
}

/* ── hidden titles ── */
function showHidden(){
  const g=document.getElementById('recsGrid');
  if(!hidden.length){g.innerHTML=`<div class="empty"><span class="empty-icon">${ic('eye-off')}</span><div class="empty-txt">Нічого не приховано</div></div>`;return;}
  const _hl=id=>{for(const l of[watched,watching,planned]){const f=l.find(i=>i.imdbID===id);if(f)return f;}return null;};
  const list=hidden.map((h,idx)=>({h,idx})).reverse(); /* newest first */
  g.innerHTML='<div class="grid" id="hiddenGrid"></div>';
  _gridShown.hidden=_gridShown.hidden||GRID_PAGE;
  _gridRender('hidden',document.getElementById('hiddenGrid'),list,({h,idx})=>{
    const found=h.imdbID?_hl(h.imdbID):null;
    const poster=found?.poster||h.poster||'';
    const href=h.imdbID?`https://www.imdb.com/title/${h.imdbID}/`:h.tmdb?`https://www.themoviedb.org/${h.tmdb.replace(':','/')}`:'#';
    const year=found?.year||h.year||'';
    return `<article class="pc"><div class="pc-art"><a href="${href}" target="_blank" rel="noopener" tabindex="-1"><img src="${ps(poster)||BLANK}" alt="" loading="lazy" onerror="this.src=BLANK"></a></div>
      <div class="pc-t"><a href="${href}" target="_blank" rel="noopener">${esc(h.title)}</a></div>
      <div class="pc-m">${year?`<span class="num">${esc(year)}</span>`:''}${found?`<span>${tl(found.type)}</span>`:''}</div>
      <div class="pc-status"><button class="pc-act" data-act="unhide" data-args="${A((idx))}">${ic('eye')}Повернути</button></div></article>`;
  });
}
function unhide(idx){hidden.splice(idx,1);save();renderRecs();}

