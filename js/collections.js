/* ═══════════════════════════════════════════════════════════════
   COLLECTIONS (франшизи) — groups owned movies by TMDB collection,
   shows missing parts with quick-add. All lookups cached permanently
   in localStorage (collection membership & rosters barely change). */
let _collCache=_lsJSON('ct_collcache',{});       /* imdbID -> {collId,collName,collPoster} | {none:true} */
let _collDetails=_lsJSON('ct_colldetails',{});   /* collId -> {name,poster,parts:[...]} */
function _collCacheSave(){_lsSet('ct_collcache',JSON.stringify(_collCache));}
function _collDetailsSave(){_lsSet('ct_colldetails',JSON.stringify(_collDetails));}
/* Older versions cached network failures as 'not in a franchise' forever — drop those so they get re-checked */
{let n=0;for(const k in _collCache)if(_collCache[k]._err){delete _collCache[k];n++;}if(n)_collCacheSave();}

function _showCollLastRun(pending,total){
  const el=document.getElementById('collLastRun');
  if(!el)return;
  if(pending>0){el.textContent=`нових для аналізу: ${pending}/${total}`;return;}
  const last=localStorage.getItem('ct_coll_lastrun');
  if(!last){el.textContent='';return;}
  const mins=Math.round((Date.now()-Number(last))/60000);
  const when=mins<1?'щойно':mins<60?`${mins} хв тому`:mins<1440?`${Math.round(mins/60)} год тому`:`${Math.round(mins/1440)} дн тому`;
  el.textContent=`Оновлено ${when}`;
}
function _markCollRun(){_lsSet('ct_coll_lastrun',String(Date.now()));}

/* A part counts toward a franchise only once it is out. Unreleased/announced
   entries (Bond 26, Shrek 5 in 2027…) used to keep 44 finished franchises
   "incomplete" forever. */
/* local date (as rDash does): toISOString is UTC, so after midnight in Kyiv "today" was still yesterday */
/* _todayISO lives in core.js: recs.js needs it at load time */
function _partOut(p){return p.id===null||(!!p.date&&p.date<=_todayISO());}
/* Ratings come from the /collection response itself (TMDB score); the old
   per-part OMDb lookup cost 263 requests of the 1000/day quota on a full scan. */
async function _fetchCollection(id){
  const [d,uk]=await Promise.all([tmdbFetch(`/collection/${id}`),tmdbFetch(`/collection/${id}?language=uk-UA`).catch(()=>null)]);
  const old={};(_collDetails[id]?.parts||[]).forEach(p=>{old[p.id]=p;});
  const ukp={};(uk?.parts||[]).forEach(p=>{ukp[p.id]=p;});
  _collDetails[id]={name:d.name,uname:uk?_ukTitle(uk.name,'',d.name):'',uk:uk?1:0,poster:d.poster_path,ts:Date.now(),
    parts:(d.parts||[]).filter(p=>p.title).map(p=>({id:p.id,title:p.title,ut:_ukTitle(ukp[p.id]?.title,p.original_title,p.title),year:(p.release_date||'').slice(0,4),date:p.release_date||'',
      poster:p.poster_path||null,vote:typeof p.vote_average==='number'&&p.vote_count>=20?Math.round(p.vote_average*10)/10:null,
      imdbID:old[p.id]?.imdbID,imdbRating:old[p.id]?.imdbRating}))};
}
/* refetch: announced parts every 14 days (dates move, sequels appear), the rest every 60; old caches had no part posters */
/* caches from before 1.14 have English titles only: one Ukrainian request per franchise, once, in the background */
let _collUkBusy=false;
async function _collUkFill(){
  if(_collUkBusy||!TMDB_KEY||_tmdbBlocked)return false;
  const ids=Object.keys(_collDetails).filter(id=>_collDetails[id]&&!_collDetails[id].uk);if(!ids.length)return false;
  _collUkBusy=true;let any=false,fails=0;
  for(let i=0;i<ids.length&&fails<5;i+=4){
    await Promise.all(ids.slice(i,i+4).map(async id=>{
      try{const uk=await tmdbFetch(`/collection/${id}?language=uk-UA`);const det=_collDetails[id];if(!uk||!det)return;
        const ukp={};(uk.parts||[]).forEach(p=>{ukp[p.id]=p;});
        det.uname=_ukTitle(uk.name,'',det.name);
        (det.parts||[]).forEach(p=>{const u=ukp[p.id];if(u)p.ut=_ukTitle(u.title,u.original_title,p.title);});
        det.uk=1;any=true;fails=0;}catch(e){fails++;}
    }));
  }
  if(any)_collDetailsSave();
  _collUkBusy=false;return any;
}
function _collStale(det){
  if(!det)return true;
  const parts=det.parts||[];
  if(parts.length&&parts.every(p=>!p.poster))return true;
  return Date.now()-(det.ts||0)>(parts.some(p=>!_partOut(p))?14:60)*864e5;
}
async function _enrichParts(ids){
  const ownedMap=_ownedMovieMap();let any=false;
  for(const id of ids){
    const todo=(_collDetails[id]?.parts||[]).filter(p=>p.imdbID===undefined);
    for(let i=0;i<todo.length;i+=6){
      await Promise.all(todo.slice(i,i+6).map(async p=>{
        let imdbID=_resolveCache[`movie:${p.id}`]?.imdbID;
        if(!imdbID){
          try{const d=await tmdbFetch(`/movie/${p.id}/external_ids`);imdbID=d?.imdb_id||'';
            if(imdbID)_resolveCache[`movie:${p.id}`]={imdbID,ended:true,ts:Date.now()};}
          catch(e){return;} /* stays undefined → retried next visit */
        }
        p.imdbID=imdbID||null;
        const own=imdbID&&ownedMap[imdbID];if(own&&own.item.imdbRating)p.imdbRating=own.item.imdbRating;
        any=true;
      }));
    }
  }
  return any;
}
let _collCtx=null,_collRefreshing=false;
async function _collBackgroundRefresh(force){
  if(_collRefreshing||!_collCtx)return;
  const {groups,collIds}=_collCtx;
  const stale=collIds.filter(id=>force||_collStale(_collDetails[id])).sort((a,b)=>(_collDetails[a]?.ts||0)-(_collDetails[b]?.ts||0)).slice(0,force?Infinity:60);
  if(!stale.length)return;
  _collRefreshing=true;document.getElementById('collRefresh')?.classList.add('busy');
  const el=document.getElementById('collLastRun');let done=0;
  for(let i=0;i<stale.length;i+=6){
    await Promise.all(stale.slice(i,i+6).map(id=>_fetchCollection(id).catch(()=>{})));
    done=Math.min(stale.length,i+6);
    if(el)el.textContent=`Оновлюю склад франшиз… ${done}/${stale.length}`;
  }
  await _enrichParts(stale);_collDetailsSave();_resolveCacheSave();
  _collGroupsCache=_buildCollGroups(groups,collIds);_markCollRun();
  _collRefreshing=false;document.getElementById('collRefresh')?.classList.remove('busy');
  _showCollLastRun(0,collIds.length);
  if(!document.getElementById('tab-collections')?.classList.contains('hidden')){buildCollBar();renderCollections(true);}
}
/* header button: re-read every franchise and re-check old "not in a franchise" answers; nothing is wiped */
async function refreshCollectionsData(){
  if(_collRefreshing)return;
  const old=Date.now()-180*864e5;
  for(const k in _collCache)if(_collCache[k].none&&(_collCache[k].ts||0)<old)delete _collCache[k];
  await loadCollections(true);
}

async function _movieImdbToCollection(imdbID){
  try{
    const f=await tmdbFindIds(imdbID);
    const m=f.m?{id:f.m}:null;
    if(!m){_collCache[imdbID]={none:true,ts:Date.now()};return;}
    /* piggy-back: cache this tmdb-id→imdb-id mapping permanently for reuse elsewhere */
    _resolveCache[`movie:${m.id}`]={imdbID,ended:true,ts:Date.now()};
    const det=await tmdbFetch(`/movie/${m.id}`);
    const bc=det?.belongs_to_collection;
    _collCache[imdbID]=bc?{collId:bc.id,collName:bc.name,collPoster:bc.poster_path,ts:Date.now()}:{none:true,ts:Date.now()};
  }catch(e){delete _collCache[imdbID];} /* transient failure: leave uncached so the next visit retries it */
}

function _ownedMovieMap(){
  const map={};
  watched.forEach(i=>{if(i.imdbID)map[i.imdbID]={status:'ok',item:i};});
  watching.forEach(i=>{if(i.imdbID&&!map[i.imdbID])map[i.imdbID]={status:'wn',item:i};});
  planned.forEach(i=>{if(i.imdbID&&!map[i.imdbID])map[i.imdbID]={status:'pl',item:i};});
  return map;
}

/* ── COLLECTIONS: filter/sort/pagination state ── */
/* "Skipped" = titles the person deliberately decided not to watch (e.g. a
   franchise entry with a 2/10 rating). Counted as "done" for completion
   purposes, but never added to the watched list itself. */
let _skippedParts=_lsJSON('ct_skipped',{}); /* imdbID -> {ts} */
function _skippedSave(){_lsSet('ct_skipped',JSON.stringify(_skippedParts));}

let _collGroupsCache=null; /* precomputed list, built once by loadCollections(), reused by renderCollections() */
let _collFilter={q:'',status:'incomplete',sort:'missing-asc',types:[],genres:[]}; /* unfinished first: that's where the next film to watch is */
let _collShown=12; /* how many cards are currently visible — preserved across sort/filter changes so cards never "disappear" */
const COLL_PAGE_SIZE=12;

async function loadCollections(force){
  const g=document.getElementById('collGrid');
  if(!TMDB_KEY||_tmdbBlocked){
    g.innerHTML=`<div class="empty"><span class="empty-icon">${ic('stack')}</span><div class="empty-txt">Потрібен TMDB API-ключ у налаштуваннях, щоб визначати франшизи</div></div>`;
    document.getElementById('collBar').innerHTML='';
    return;
  }
  const items=[...watched,...watching,...planned].filter(i=>i.type==='movie'&&i.imdbID);
  const uniq=[];const seenU=new Set();
  items.forEach(i=>{if(!seenU.has(i.imdbID)){seenU.add(i.imdbID);uniq.push(i);}});
  const todo=uniq.filter(i=>!_collCache[i.imdbID]);
  _showCollLastRun(todo.length,uniq.length);
  if(todo.length){
    g.innerHTML=`<div class="spinner" role="status" id="collProgress">Шукаю франшизи серед нових фільмів… 0/${todo.length}</div>`;
    let done=0;
    for(let i=0;i<todo.length;i+=5){
      const batch=todo.slice(i,i+5);
      await Promise.all(batch.map(it=>_movieImdbToCollection(it.imdbID)));
      done+=batch.length;
      const p=document.getElementById('collProgress');
      if(p)p.textContent=`Шукаю франшизи серед нових фільмів… ${Math.min(done,todo.length)}/${todo.length}`;
    }
    _collCacheSave();_resolveCacheSave();
  }

  const groups={};
  uniq.forEach(it=>{
    const c=_collCache[it.imdbID];
    if(!c||c.none||!c.collId)return;
    (groups[c.collId]=groups[c.collId]||{collName:c.collName,collPoster:c.collPoster,owned:[]}).owned.push(it);
  });
  const collIds=Object.keys(groups);
  _collCtx={groups,collIds};
  if(!collIds.length){
    g.innerHTML=`<div class="empty"><span class="empty-icon">${ic('stack')}</span><div class="empty-txt">Серед твоїх фільмів поки немає франшиз із кількох частин</div></div>`;
    document.getElementById('collBar').innerHTML='';
    return;
  }

  /* only franchises never fetched block the first render; stale ones refresh afterwards */
  const need=collIds.filter(id=>!_collDetails[id]);
  if(need.length){
    for(let i=0;i<need.length;i+=6){
      await Promise.all(need.slice(i,i+6).map(id=>_fetchCollection(id).catch(()=>{})));
      const p=document.getElementById('collProgress');if(p)p.textContent=`Завантажую склад франшиз… ${Math.min(i+6,need.length)}/${need.length}`;
    }
    await _enrichParts(need);_collDetailsSave();_resolveCacheSave();
  }

  _collGroupsCache=_buildCollGroups(groups,collIds);
  _markCollRun();
  _showCollLastRun(0,collIds.length);
  buildCollBar();
  _collShown=COLL_PAGE_SIZE;
  _collOrderLocked=null;
  renderCollections();
  _collBackgroundRefresh(force);
  _collUkFill().then(any=>{if(any&&_collCtx){_collGroupsCache=_buildCollGroups(_collCtx.groups,_collCtx.collIds);renderCollections(true);}});
}
/* flat, render-ready list; filters/sorts/paging never touch the network */
function _buildCollGroups(groups,collIds){
  return collIds.map(id=>{
    const grp=groups[id],det=_collDetails[id];
    const parts=(det?.parts||[]).slice().sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999'));
    const list=parts.length?parts:grp.owned.map(o=>({title:o.title,year:String(o.year||'').slice(0,4),id:null,imdbID:o.imdbID,imdbRating:o.imdbRating,poster:null}));
    return{id,name:_collName(det,grp.collName),en:(det?.name||grp.collName||'').replace(/ Collection$/,''),poster:grp.collPoster||det?.poster||parts.find(p=>p.poster)?.poster,list, /* some collections have no poster of their own */
      types:[...new Set(grp.owned.map(o=>o.customCategory||o.type).filter(Boolean))],
      genres:[...new Set(grp.owned.flatMap(o=>(o.genre||'').split(',').map(s=>s.trim()).filter(Boolean)))]};
  });
}
/* watched (or deliberately skipped) out of released parts; announced ones counted apart */
function _collCounts(c,ownedMap){
  let owned=0,total=0,upcoming=0,next=null;
  c.list.forEach(p=>{
    if(!_partOut(p)){upcoming++;if(p.date&&(!next||p.date<next))next=p.date;return;}
    total++;if(p.imdbID&&(ownedMap[p.imdbID]?.status==='ok'||_skippedParts[p.imdbID]))owned++;
  });
  return{...c,owned,total,upcoming,next};
}

/* ── COLLECTIONS: toolbar + filter panel ── */
function _collFN(){const f=_collFilter;return f.types.length+f.genres.length;}
function buildCollBar(){
  const el=document.getElementById('collBar');if(!el)return;
  const f=_collFilter,n=_collFN();
  const om=_ownedMovieMap(),all=(_collGroupsCache||[]).map(c=>_collCounts(c,om));
  const cnt={incomplete:all.filter(c=>c.total>0&&c.owned<c.total).length,complete:all.filter(c=>c.total>0&&c.owned>=c.total).length,
    upcoming:all.filter(c=>c.upcoming).length,all:all.length};
  const sub=document.getElementById('collSub');if(sub)sub.textContent='';
  el.innerHTML=`
    <div class="fa-tabs" role="group" aria-label="Статус">${[['incomplete','незавершені'],['complete','повні'],['upcoming','чекають<em> продовження</em>'],['all','усі']]
      .map(([k,l])=>`<button class="fa-tab${f.status===k?' on':''}" aria-pressed="${f.status===k}" data-act="collSetStatus" data-args="${A(`${k}`)}"><b class="num">${cnt[k]}</b><span>${l}</span></button>`).join('')}</div>
    <div class="fa-tools">
      <div class="local-search-wrap"><span class="local-search-icon">${ic('search')}</span>
        <input class="local-search" type="text" placeholder="Пошук франшизи…" aria-label="Пошук франшизи" value="${esc(f.q)}" data-input="collSearch" data-args="[&quot;$value&quot;]"><button type="button" class="ls-x" data-act="lsClear" data-args="[&quot;$el&quot;]" aria-label="Очистити пошук" title="Очистити">${ic('x')}</button>
      </div>
      <button id="collFbtn" class="flt-pill${n?' has-n':''}" data-act="toggleCollPan">${ic('filter')}Тип, жанр${n?` <span class="flt-n">${n}</span>`:''}</button>
      <select class="sort-sel" aria-label="Сортування" data-change="collSetSort" data-args="[&quot;$value&quot;]">
        ${[['missing-asc','Найближчі до завершення'],['owned-desc','Найбільше переглянуто'],['next-asc','Найближча прем\'єра'],['name-asc','А→Я']]
          .map(([v,l])=>`<option value="${v}"${f.sort===v?' selected':''}>${l}</option>`).join('')}
      </select>
    </div>`;
}
function toggleCollPan(){
  const p=document.getElementById('collPanel'),b=document.getElementById('collFbtn');
  if(!p)return;
  const open=p.style.display!=='none';
  if(open){p.style.display='none';b?.classList.remove('active');}
  else{buildCollPan();p.style.display='';b?.classList.add('active');}
}
function buildCollPan(){
  const el=document.getElementById('collPanel');if(!el||!_collGroupsCache)return;
  const f=_collFilter;
  const types=[...new Set(_collGroupsCache.flatMap(c=>c.types))];
  const genres=[...new Set(_collGroupsCache.flatMap(c=>c.genres))].sort();
  let h='';
  if(types.length>1)h+=`<div class="flt-row"><span class="flt-lbl">Тип</span><div class="flt-chips">${types.map(t=>`<button class="flt-chip${f.types.includes(t)?' on':''}" data-act="collChip" data-args="${A('types',`${t}`)}">${CAT[t]||t}</button>`).join('')}</div></div>`;
  if(genres.length)h+=`<div class="flt-row"><span class="flt-lbl">Жанр</span><div class="flt-chips">${genres.map(g=>`<button class="flt-chip${f.genres.includes(g)?' on':''}" data-act="collChip" data-args="${A('genres',`${uriSafe(g)}`)}">${esc(g)}</button>`).join('')}</div></div>`;
  h+=`<div class="flt-panel-footer"><button class="flt-reset" data-act="collClearPan">✕ Скинути тип/жанр</button></div>`;
  el.innerHTML=h;
}
function collChip(dim,val){
  val=decodeURIComponent(val);
  const f=_collFilter,arr=f[dim];
  const i=arr.indexOf(val);
  if(i>=0)arr.splice(i,1);else arr.push(val);
  buildCollBar();buildCollPan();
  document.getElementById('collFbtn')?.classList.add('active');
  renderCollections();
}
function collClearPan(){_collFilter.types=[];_collFilter.genres=[];buildCollBar();buildCollPan();renderCollections();}

let _collSearchT;
function collSearch(v){clearTimeout(_collSearchT);_collSearchT=setTimeout(()=>{_collFilter.q=v.trim();renderCollections();},220);}
function collSetStatus(s){
  _collFilter.status=s;
  if(s==='upcoming')_collFilter.sort='next-asc';else if(_collFilter.sort==='next-asc')_collFilter.sort='missing-asc';
  buildCollBar();renderCollections();
}
function collSetSort(v){_collFilter.sort=v;renderCollections();}

/* ── COLLECTIONS: fast client-side render (no network) ── */
let _collOrderLocked=null; /* array of collection ids in the currently displayed order — frozen
  across in-place refreshes (e.g. right after marking something watched) so a card's changed
  progress/count never makes it jump to a new position mid-interaction. Only recomputed when
  the person actually changes sort/filter/search, or the tab is (re)loaded. */

function renderCollections(preserveOrder){
  const g=document.getElementById('collGrid');
  if(!_collGroupsCache)return;
  const ownedMap=_ownedMovieMap();
  /* owned/total are computed live every render (not stored), so counts
     and progress bars always reflect the current state — e.g. right
     after adding something via the status picker — with no reload. */
  const withCounts=c=>_collCounts(c,ownedMap);

  let list;
  if(preserveOrder&&_collOrderLocked){
    list=_collOrderLocked.map(id=>_collGroupsCache.find(c=>c.id===id)).filter(Boolean).map(withCounts);
  }else{
    list=_collGroupsCache.map(withCounts);
    const f=_collFilter;
    if(f.q){const q=f.q.toLowerCase();list=list.filter(c=>c.name.toLowerCase().includes(q)||(c.en||'').toLowerCase().includes(q));}
    if(f.status==='incomplete')list=list.filter(c=>c.total>0&&c.owned<c.total);
    if(f.status==='complete')list=list.filter(c=>c.total>0&&c.owned>=c.total);
    if(f.status==='upcoming')list=list.filter(c=>c.upcoming>0);
    if(f.types.length)list=list.filter(c=>c.types.some(t=>f.types.includes(t)));
    if(f.genres.length)list=list.filter(c=>c.genres.some(gg=>f.genres.includes(gg)));
    const sorters={
      'missing-asc':(a,b)=>(a.total-a.owned)-(b.total-b.owned)||b.owned-a.owned,
      'owned-desc':(a,b)=>b.owned-a.owned,
      'next-asc':(a,b)=>(a.next||'9999').localeCompare(b.next||'9999'),
      'name-asc':(a,b)=>a.name.localeCompare(b.name,'uk'),
    };
    list.sort(sorters[f.sort]||sorters['missing-asc']);
    _collOrderLocked=list.map(c=>c.id);
  }

  if(!list.length){
    g.innerHTML=`<div class="empty"><span class="empty-icon">${ic('search')}</span><div class="empty-txt">Нічого не знайдено за цим фільтром</div></div>`;
    return;
  }

  const shown=list.slice(0,_collShown);
  const f=_collFilter,plain=f.status==='incomplete'&&!f.q&&!f.types.length&&!f.genres.length;
  g.innerHTML=`${plain?_collOneLeftHtml(list,ownedMap):''}<div class="fa-album">${shown.map(c=>_collCardHtml(c,ownedMap)).join('')}</div>
    ${shown.length<list.length?`<div style="text-align:center;margin-top:1.25rem">
      <button class="rec-btn m" data-act="collMore">Показати ще (${list.length-shown.length})</button>
    </div>`:''}`;
}

const COLL_ROWS=12; /* parts shown before «Усі частини» */
const _COLL_ST={ok:'Переглянуто',wn:'Дивлюсь',pl:'Заплановано'};
/* the title opens the in-app sheet; ctrl/middle click keeps the IMDb/TMDB link */
function _collLink(p,inner,cls=''){
  const link=p.imdbID?`https://www.imdb.com/title/${p.imdbID}/`:(p.id?`https://www.themoviedb.org/movie/${p.id}`:null);
  if(!link)return `<span class="${cls}">${inner}</span>`;
  return `<a class="${cls}" href="${esc(link)}" target="_blank" rel="noopener" ${p.id?`data-act="_tsClickT" data-args="${A('$ev','movie',p.id)}"`:`data-act="_tsClick" data-args="${A('$ev',p.imdbID)}"`}>${inner}</a>`;
}
/* every part is a poster; its state is a label on it (no more empty numbered slots) */
const _COLL_LBL={wn:'Дивлюсь',pl:'Заплановано',skip:'Пропущено',miss:'Не переглянуто'};
function _collCell(p,k,ownedMap,extra){
  const owned=p.imdbID?ownedMap[p.imdbID]:null,out=_partOut(p);
  /* «не буду дивитись» wins over «Планую»: it is counted as collected, so it must look collected too */
  const skipped=out&&p.imdbID&&owned?.status!=='ok'&&owned?.status!=='wn'&&_skippedParts[p.imdbID];
  const st=!out?'up':skipped?'skip':owned?owned.status:'miss';
  const img=_tsImg(p.poster,'w185')||(owned?ps(owned.item.poster):'');
  const tt=p.ut||p.title;
  const art=img?`<img src="${esc(img)}" alt="" loading="lazy" data-fb>`:`<span class="fa-noimg">${esc(tt)}</span>`;
  const lbl=st==='up'?`Вийде ${p.date?new Date(p.date+'T00:00:00').toLocaleDateString('uk-UA',{day:'numeric',month:'short',year:'numeric'}):'згодом'}`:_COLL_LBL[st]||'';
  /* missing and skipped parts: the label is the button that opens the status picker */
  const act=st!=='ok'&&st!=='up'&&p.imdbID; /* every label but «вийде» opens the status picker */
  const tag=lbl?(act?`<button class="fa-lbl ${st}" data-act="collAddMissing" data-args="${A(`${p.imdbID}`,`${_collMetaEnc(p)}`)}" aria-label="${lbl}: ${esc(tt)}. Змінити">${lbl}</button>`
    :`<span class="fa-lbl ${st}">${lbl}</span>`):'';
  const ir=owned?.item.imdbRating||p.imdbRating;
  const meta=[p.year?esc(p.year):'',ir?`IMDb ${esc(ir)}`:p.vote?`TMDB ${esc(p.vote)}`:''].filter(Boolean).join(' · ');
  return `<div class="fa-cell ${st}${extra?' extra':''}"><div class="fa-art">${_collLink(p,art,`fa-pc ${st}`)}${st==='ok'?`<i class="fa-ok" title="Переглянуто">${ic('check')}</i>`:''}${tag}</div>
    <div class="fa-cap">${_collLink(p,esc(tt),'fa-t')}<span>${meta}</span></div></div>`;
}
function _collCardHtml(c,ownedMap){
  const complete=c.total>0&&c.owned>=c.total;
  const isOpen=_collExpanded.has(String(c.id));
  const cells=c.list.map((p,k)=>_collCell(p,k,ownedMap,k>=COLL_ROWS)).join('');
  const foot=complete?'Зібрано повністю':`Бракує ${c.total-c.owned}`;
  const more=c.list.length>COLL_ROWS?`<button class="fc-more" data-cid="${esc(c.id)}" data-count="${c.list.length}" data-act="toggleCollParts" data-args="[&quot;$el&quot;]">${isOpen?'Згорнути':`Усі частини (${c.list.length})`}</button>`:'';
  return `<article class="fa-pg${complete?' full':''}${isOpen?' expanded':''}">
    <div class="fa-pg-h"><h3 class="fa-pg-n">${esc(c.name)}</h3><div class="fa-pg-c num"><b>${c.owned}</b>/${c.total}</div></div>
    <div class="fa-slots">${cells}</div>
    <div class="fa-pg-f"><span>${foot}${c.upcoming?` · ще ${c.upcoming} ${c.upcoming===1?'вийде':'вийдуть'}`:''}</span>${more}</div>
  </article>`;
}
/* franchises one part away from complete: that part, big */
function _collOneLeftHtml(list,ownedMap){
  const one=list.filter(c=>c.total>1&&c.total-c.owned===1).map(c=>{
    const k=c.list.findIndex(p=>_partOut(p)&&!(p.imdbID&&(ownedMap[p.imdbID]?.status==='ok'||_skippedParts[p.imdbID])));
    return k<0?null:{c,p:c.list[k],k};
  }).filter(Boolean);
  if(!one.length)return '';
  return `<section class="fa-one"><h2 class="fa-h">Лишилась одна частина</h2><p class="fa-s">${one.length} ${one.length%10===1&&one.length%100!==11?'франшиза':one.length%10>=2&&one.length%10<=4&&(one.length%100<12||one.length%100>14)?'франшизи':'франшиз'} за крок до повної</p>
    <div class="fa-one-strip">${one.slice(0,24).map(o=>`<div class="fa-one-i"><small>${esc(o.c.name)}</small>${_collCell(o.p,o.k,ownedMap,false)}</div>`).join('')}</div></section>`;
}
let _collExpanded=new Set(); /* which franchise cards show all parts — survives re-renders so
  adding a movie mid-list doesn't collapse the card you're working in */
function collMore(){_collShown+=COLL_PAGE_SIZE;renderCollections(true);}
function toggleCollParts(btn){
  const card=btn.closest('.fa-pg'),open=card.classList.toggle('expanded'),cid=btn.dataset.cid;
  if(open)_collExpanded.add(cid);else _collExpanded.delete(cid);
  btn.textContent=open?'Згорнути':`Усі частини (${btn.dataset.count})`;
}

function _collMetaEnc(p){
  /* encodeURIComponent does NOT escape apostrophes — a title like "Harry
     Potter and the Philosopher's Stone" would otherwise break out of the
     single-quoted onclick attribute and silently kill the handler. */
  return uriSafe(JSON.stringify({title:p.title,year:p.year,poster:p.poster?`https://image.tmdb.org/t/p/w342${p.poster}`:'',rating:p.imdbRating||''}));
}

function collAddMissing(imdbID,metaEnc){
  let meta={};try{meta=JSON.parse(decodeURIComponent(metaEnc));}catch(e){}
  openStatusPicker(imdbID,meta,()=>{buildCollBar();renderCollections(true);}); /* bar counts/chips depend on what is owned */
}

/* ═══════════════════════════════════════════════════════════════
   STATUS PICKER — centered modal (same visual language as the
   search "add movie" modal) offering all three statuses, so picking
   "already watched" doesn't force a detour through "planned" first.
   Adding is reversible for 5 seconds via an undo toast. */
function openStatusPicker(imdbID,meta,onDone){
  meta=meta||{};
  const already={
    watched:!!watched.find(x=>x.imdbID===imdbID),
    watching:!!watching.find(x=>x.imdbID===imdbID),
    planned:!!planned.find(x=>x.imdbID===imdbID)
  };
  const skipped=!!_skippedParts[imdbID];
  const sub=[meta.year,meta.rating?`★ ${meta.rating}`:null].filter(Boolean).join(' · ');
  _collPickerOnDone=onDone;
  modal(`
    <img class="modal-poster" src="${imgSrc(meta.poster)}" data-fb="hide" alt="">
    <h2 class="modal-title">${esc(meta.title||'')}</h2>
    ${sub?`<div class="modal-sub">${esc(sub)}</div>`:''}
    <div class="modal-btns">
      ${already.watched ?`<div class="modal-already ok">${ic('check')}Вже у переглянутому</div>`:`<button class="m-btn j" data-act="_pickStatus" data-args="${A(`${imdbID}`,'watched')}">${ic('check')}Переглянуто</button>`}
      ${already.watching?`<div class="modal-already go">${ic('play')}Вже дивлюсь</div>`:`<button class="m-btn s" data-act="_pickStatus" data-args="${A(`${imdbID}`,'watching')}">${ic('play')}Дивлюсь зараз</button>`}
      ${already.planned ?`<div class="modal-already pl">${ic('bookmark')}Вже заплановано</div>`:`<button class="m-btn m" data-act="_pickStatus" data-args="${A(`${imdbID}`,'planned')}">${ic('bookmark')}Запланувати</button>`}
      ${skipped
        ?`<div class="modal-already skip">${ic('ban')}Позначено «не буду дивитись»</div><button class="m-btn can" data-act="_unskipPart" data-args="${A(`${imdbID}`)}">${ic('undo')}Скасувати позначку</button>`
        :`<button class="m-btn skip" data-act="_skipPart" data-args="${A(`${imdbID}`)}">${ic('ban')}Не буду дивитись</button>`}
      <button class="m-btn can" data-act="closeModal">Закрити</button>
    </div>`);
}
let _collPickerOnDone=null;
async function _pickStatus(imdbID,status){
  closeModal();
  const fn={watched:addW,watching:addWn,planned:addPl}[status];
  /* addW/addWn move the title out of the other lists — remember where it was
     so undo can put it back instead of losing it */
  const before={};
  ['watched','watching','planned'].forEach(ln=>{const arr=tList(ln);const i=arr.findIndex(x=>x.imdbID===imdbID);if(i>=0)before[ln]={idx:i,item:arr[i]};});
  let ok=false;
  try{ok=await fn(imdbID);}catch(e){toast('Не вдалося додати: немає зв\'язку з OMDb','err');}
  if(ok){
    if(_skippedParts[imdbID]){delete _skippedParts[imdbID];_skippedSave();}
    _showAddUndo(imdbID,status,before);
  }
  if(_collPickerOnDone)_collPickerOnDone();
}
function _skipPart(imdbID){
  closeModal();
  _skippedParts[imdbID]={ts:Date.now()};
  _skippedSave();
  _showSkipUndo(imdbID,true);
  if(_collPickerOnDone)_collPickerOnDone();
}
function _unskipPart(imdbID){
  closeModal();
  delete _skippedParts[imdbID];
  _skippedSave();
  _showSkipUndo(imdbID,false);
  if(_collPickerOnDone)_collPickerOnDone();
}
function _showSkipUndo(imdbID,wasSkipped){
  clearTimeout(_tTimer);
  document.querySelectorAll('.toast').forEach(t=>t.remove());
  const el=document.createElement('div');el.className='toast undo';el.dataset.addUndo='1';
  const lblEl=document.createElement('span');lblEl.textContent=wasSkipped?'Позначено «не буду дивитись»':'Позначку знято';
  const btn=document.createElement('button');btn.className='t-undo';btn.innerHTML=ic('undo')+'Скасувати';
  btn.onclick=()=>{
    clearTimeout(timer);
    if(wasSkipped){delete _skippedParts[imdbID];}else{_skippedParts[imdbID]={ts:Date.now()};}
    _skippedSave();
    el.remove();
    if(_collPickerOnDone)_collPickerOnDone();
  };
  el.append(lblEl,btn);_toastMount(el);
  const timer=_toastTimer(el,5000,()=>el.remove());
}
function _showAddUndo(imdbID,status,before={}){
  const lbl={watched:'Переглянуто',watching:'Дивлюсь',planned:'Заплановано'}[status];
  clearTimeout(_tTimer);
  document.querySelectorAll('.toast').forEach(t=>t.remove());
  const el=document.createElement('div');el.className='toast undo';el.dataset.addUndo='1';
  const lblEl=document.createElement('span');lblEl.textContent=`Додано: ${lbl}`;
  const btn=document.createElement('button');btn.className='t-undo';btn.innerHTML=ic('undo')+'Скасувати';
  btn.onclick=()=>{
    clearTimeout(timer);
    const arr=tList(status); /* read at click time: the lists get reassigned by filter() */
    const idx=arr.findIndex(x=>x.imdbID===imdbID);
    if(idx>=0)arr.splice(idx,1);
    for(const ln in before){
      if(ln===status)continue;
      const cur=tList(ln);
      if(!cur.find(x=>x.imdbID===imdbID))cur.splice(Math.min(before[ln].idx,cur.length),0,before[ln].item);
    }
    save();rWatched();rWatching();rPlanned();rDash();updateStats();
    el.remove();
    if(_collPickerOnDone)_collPickerOnDone();
  };
  el.append(lblEl,btn);_toastMount(el);
  const timer=_toastTimer(el,5000,()=>el.remove());
}

