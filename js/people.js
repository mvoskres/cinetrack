/* ═══════════════════════════════════════════════════════════════
   PEOPLE (актори/режисери) — track a person, see their filmography
   cross-referenced against your lists via title+year matching (no
   extra API calls needed for matching itself). */
let _trackedPeople=JSON.parse(localStorage.getItem('ct_trackedpeople')||'[]');
let _personCache=JSON.parse(localStorage.getItem('ct_personcache')||'{}');
const PERSON_TTL=7*24*60*60*1000; /* 7 days — filmographies change rarely */
function _peopleSave(){_lsSet('ct_trackedpeople',JSON.stringify(_trackedPeople));}
function _personCacheSave(){_lsSet('ct_personcache',JSON.stringify(_personCache));}
/* TMDB credits carry overview, backdrop, popularity… none of which is shown —
   one tracked person was ~300K chars. Keep only the fields actually read. */
const _CREDIT_FIELDS=['id','title','name','release_date','first_air_date','media_type','character','job','order','episode_count','poster_path','vote_average','vote_count','genre_ids','original_language'];
function _slimCredits(arr){return(arr||[]).map(c=>{const o={};_CREDIT_FIELDS.forEach(f=>{if(c[f]!==undefined)o[f]=c[f];});return o;});}
{let slimmed=false;for(const id in _personCache){const c=_personCache[id];if([...(c.cast||[]),...(c.crew||[])].some(x=>'overview' in x)){c.cast=_slimCredits(c.cast);c.crew=_slimCredits(c.crew);slimmed=true;}}if(slimmed)_personCacheSave();}
function _norm(s){return String(s||'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();}

function _ownedByTitleYear(){
  const map={};
  const add=(i,status)=>{const key=_norm(i.title)+'|'+(i.year||'').slice(0,4);if(!map[key])map[key]={status,item:i};};
  watched.forEach(i=>add(i,'ok'));
  watching.forEach(i=>add(i,'wn'));
  planned.forEach(i=>add(i,'pl'));
  return map;
}

let _pst;
function handlePersonSearch(){
  const q=document.getElementById('personSearchInput').value.trim();
  if(q.length<2){hidePersonSug();return;}
  clearTimeout(_pst);_pst=setTimeout(()=>doPersonSearch(q),340);
}
async function doPersonSearch(q){
  if(!TMDB_KEY||_tmdbBlocked)return;
  try{
    const r=await tmdbFetch(`/search/person?query=${encodeURIComponent(q)}`);
    const res=(r?.results||[]).slice(0,7);
    const box=document.getElementById('personSuggestions');
    if(!res.length){box.classList.add('hidden');return;}
    box.classList.remove('hidden');
    box.innerHTML=res.map(p=>{
      const already=_trackedPeople.find(t=>t.id===p.id);
      return `<div class="sug-item" data-act="addTrackedPerson" data-args="${A(p.id,p.name,p.profile_path||'',p.known_for_department||'')}">
        <img class="sug-img" style="border-radius:50%;object-fit:cover" src="${p.profile_path?`https://image.tmdb.org/t/p/w92${p.profile_path}`:blank()}" onerror="this.src=BLANK">
        <div class="sug-info"><div class="sug-title">${esc(p.name)}</div><div class="sug-meta">${esc(p.known_for_department||'')}</div></div>
        ${already?`<span class="sug-badge ok">${ic('check')}Стежу</span>`:''}
      </div>`;
    }).join('');
  }catch(e){}
}
function hidePersonSug(){document.getElementById('personSuggestions')?.classList.add('hidden');}

function addTrackedPerson(id,name,profile,dept){
  hidePersonSug();document.getElementById('personSearchInput').value='';
  if(!_trackedPeople.find(t=>t.id===id)){_trackedPeople.unshift({id,name,profile,dept});_peopleSave();}
  renderPeopleTab();openPerson(id);
}
function removeTrackedPerson(id){
  _trackedPeople=_trackedPeople.filter(t=>t.id!==id);_peopleSave();
  const detail=document.getElementById('personDetail');
  if(detail&&detail.dataset.pid==String(id))detail.innerHTML='';
  renderPeopleTab();
}

let _personLast=null; /* reopen the person you looked at last */
let _personPreview=null; /* {id,name,profile} opened from a title, not followed */
function followPerson(id){
  const p=_personPreview;
  if(p&&p.id===id&&!_trackedPeople.find(t=>t.id===id)){_trackedPeople.unshift(p);_peopleSave();toast(`Стежиш за фільмографією: ${p.name}`,'ok',2600);}
  _personPreview=null;
  renderPeopleTab();openPerson(id);
}
function renderPeopleTab(){
  const box=document.getElementById('peopleTracked');
  if(!_trackedPeople.length&&!_personPreview){
    box.innerHTML=`<div class="empty"><span class="empty-icon">${ic('person')}</span><div class="empty-txt">Знайди актора чи режисера в пошуку вище, щоб стежити за фільмографією</div></div>`;
    const detail=document.getElementById('personDetail');if(detail)detail.innerHTML='';
    return;
  }
  box.innerHTML=!_trackedPeople.length?'':`<div class="people-chips">${_trackedPeople.map(p=>`
    <button class="person-chip" data-pid="${p.id}" data-act="openPerson" data-args="${A((p.id))}">
      <img src="${p.profile?`https://image.tmdb.org/t/p/w92${p.profile}`:BLANK}" alt="" onerror="this.src=BLANK">${esc(p.name)}
    </button>`).join('')}</div>`;
  const detail=document.getElementById('personDetail');
  const cur=+detail?.dataset.pid;
  const known=id=>_trackedPeople.some(t=>t.id===id)||_personPreview?.id===id;
  if(!detail?.innerHTML.trim()||!known(cur)){
    const id=known(_personLast)?_personLast:(_trackedPeople[0]?.id??_personPreview.id);
    openPerson(id);
  }else document.querySelectorAll('.person-chip').forEach(b=>b.classList.toggle('active',b.dataset.pid==String(cur)));
}

/* ── PEOPLE: filter/sort/pagination state ── */
let _personGroupsCache=null; /* {personId, all:[...normalized credits]} */
const PERSON_FILTER_DEFAULT={q:'',ownership:'missing',type:'all',role:'all',showMinor:false,sort:'popular'};
let _personFilter={...PERSON_FILTER_DEFAULT};
let _personShown=24;
const PERSON_PAGE_SIZE=24;

/* Classifies a credit from the genre ids already in combined_credits (no extra calls).
   Talk/news/reality/docs are award-show cameos and interviews, not titles to collect. */
function _creditType(genreIds,mediaType,lang){
  const g=genreIds||[];
  if(g.includes(10767)||g.includes(10763)||g.includes(10764))return 'talk';
  if(g.includes(99))return 'doc';
  if(g.includes(16))return lang==='ja'?'anime':'cartoon';
  return mediaType==='tv'?'tv':'movie';
}
const CREDIT_TYPE_LABEL={movie:'Фільм',tv:'Серіал',anime:'Аніме',cartoon:'Мультфільм',doc:'Документальний',talk:'Шоу'};

/* Remembers credits where TMDB has no IMDb id at all, so "Додати" isn't offered again */
let _unresolvable=JSON.parse(localStorage.getItem('ct_unresolvable')||'{}'); /* 'mediaType:tmdbId' -> true */
function _unresolvableSave(){_lsSet('ct_unresolvable',JSON.stringify(_unresolvable));}

/* noise = shows/docs, or no poster / almost no votes: hidden unless asked for */
const _SELF=/^(self|himself|herself|themselves)\b/i; /* award shows, interviews: "The Oscars · Self" */
const _creditMinor=c=>c.type==='talk'||c.type==='doc'||!c.poster||c.voteCount<10||c.selfOnly;

/* one card per title: acting and directing the same film used to show twice.
   Shared by the person tab and the stats, so "помітних" counts agree */
function _personAllCredits(credits){
  const byKey=new Map();
  const add=(c,role)=>{
    if(!(c.title||c.name))return;
    const mt=c.media_type==='tv'?'tv':'movie',k=mt+':'+c.id;
    let it=byKey.get(k);
    if(!it){
      const date=c.release_date||c.first_air_date||'';
      it={id:c.id,mediaType:mt,title:c.title||c.name||'',year:date.slice(0,4),date,characters:[],roles:new Set(),lead:false,
        poster:c.poster_path||null,rating:typeof c.vote_average==='number'?c.vote_average:0,voteCount:c.vote_count||0,
        type:_creditType(c.genre_ids||[],c.media_type,c.original_language)};
      byKey.set(k,it);
    }
    it.roles.add(role);
    if(role==='acting'){
      if(c.character&&!it.characters.includes(c.character))it.characters.push(c.character);
      /* billing order 0-3 on a film, or most of a show's episodes, = a main role */
      if((mt==='movie'&&typeof c.order==='number'&&c.order<=3)||(mt==='tv'&&c.episode_count>=6))it.lead=true;
    }
  };
  (credits.cast||[]).forEach(c=>add(c,'acting'));
  (credits.crew||[]).filter(c=>c.job==='Director').forEach(c=>add(c,'directing'));
  const all=[...byKey.values()];
  all.forEach(c=>{c.selfOnly=!c.roles.has('directing')&&c.characters.length>0&&c.characters.every(ch=>_SELF.test(ch));});
  return all;
}
async function openPerson(id){
  const detail=document.getElementById('personDetail');
  const tracked=_trackedPeople.find(t=>t.id===id),person=tracked||(_personPreview?.id===id?_personPreview:null);
  if(_personGroupsCache?.personId!==id){_personFilter={...PERSON_FILTER_DEFAULT};_personShown=PERSON_PAGE_SIZE;}
  _personLast=id;
  detail.dataset.pid=id;
  detail.innerHTML=`<div class="spinner">Завантажую фільмографію…</div>`;
  document.querySelectorAll('.person-chip').forEach(b=>b.classList.toggle('active',b.dataset.pid==String(id)));

  let credits=_personCache[id];
  /* older caches were slimmed without billing order: refetch once */
  const stale=!credits||Date.now()-credits.ts>PERSON_TTL||(credits.cast||[]).length&&!(credits.cast||[]).some(c=>'order' in c||'episode_count' in c);
  if(stale){
    try{
      const r=await tmdbFetch(`/person/${id}/combined_credits`,8000,true);
      credits={cast:_slimCredits(r.cast),crew:_slimCredits(r.crew),ts:Date.now()};
      _personCache[id]=credits;_personCacheSave();
    }catch(e){
      if(detail.dataset.pid!==String(id))return; /* another person was opened meanwhile */
      if(!credits){detail.innerHTML=`<div class="empty"><span class="empty-icon">${ic('alert')}</span><div class="empty-txt">Не вдалося завантажити фільмографію</div></div>`;return;}
    }
    if(detail.dataset.pid!==String(id))return; /* a slow answer must not paint over the person now on screen (the cache is already filled) */
  }

  const all=_personAllCredits(credits);
  _personGroupsCache={personId:id,all};
  const prof=person?.profile?`https://image.tmdb.org/t/p/w185${person.profile}`:BLANK;
  detail.innerHTML=`<div class="person-head">
      <img class="person-photo" src="${prof}" alt="" onerror="this.src=BLANK">
      <div class="person-info">
        <h2 class="person-name">${esc(person?.name||'')}</h2>
        <div class="person-stats" id="personStats"></div>
        <div class="tr-bar"><i id="personBarFill" style="width:0"></i></div>
      </div>
      ${tracked?`<button class="flt-pill person-remove" data-act="removeTrackedPerson" data-args="${A((id))}">${ic('trash')}Не стежити</button>`
        :`<button class="flt-pill" data-act="followPerson" data-args="${A((id))}">${ic('plus')}Стежити</button>`}
    </div>
    <div class="filter-row" id="personBar"></div>
    <div id="personList"></div>`;
  buildPersonBar();
  renderPersonList();
}

/* ── PEOPLE: toolbar (everything on show, no hidden panel) ── */
function _personPool(){
  const all=_personGroupsCache?.all||[];
  return _personFilter.showMinor?all:all.filter(c=>!_creditMinor(c));
}
function buildPersonBar(){
  const el=document.getElementById('personBar');if(!el||!_personGroupsCache)return;
  const f=_personFilter,own=_personOwnedFns(),pool=_personPool();
  const withOwned=pool.map(c=>({...c,owned:own(c)}));
  const cntO={missing:withOwned.filter(c=>!c.owned).length,owned:withOwned.filter(c=>c.owned).length,all:withOwned.length};
  const tCnt={};pool.forEach(c=>{const t=c.type==='anime'||c.type==='cartoon'?'anim':c.type;tCnt[t]=(tCnt[t]||0)+1;});
  const leads=pool.filter(c=>c.lead).length,dirs=pool.filter(c=>c.roles.has('directing')).length;
  const minor=(_personGroupsCache.all.length-_personGroupsCache.all.filter(c=>!_creditMinor(c)).length);
  const chips=(arr,cur,fn)=>arr.map(([k,l,n])=>`<button class="cat-chip${cur===k?' on':''}" data-act="${fn}" data-args="${A(k)}">${l}${n!=null?`<span class="num">${n}</span>`:''}</button>`).join('');
  el.innerHTML=`
    <div class="cat-seg" role="group" aria-label="Наявність">${chips([['missing','Чого бракує',cntO.missing],['owned','Є в списках',cntO.owned],['all','Усе',cntO.all]],f.ownership,'personSetOwnership')}</div>
    <div class="local-search-wrap"><span class="local-search-icon">${ic('search')}</span>
      <input class="local-search" type="text" placeholder="Пошук у фільмографії…" aria-label="Пошук у фільмографії" value="${esc(f.q)}" oninput="personListSearch(this.value)">
    </div>
    <select class="sort-sel" aria-label="Сортування" onchange="personSetSort(this.value)">
      ${[['popular','Найвідоміші'],['year-desc','Спочатку нові'],['year-asc','Спочатку старі'],['rating-desc','За рейтингом'],['name-asc','А→Я']].map(([v,l])=>`<option value="${v}"${f.sort===v?' selected':''}>${l}</option>`).join('')}
    </select>
    <div class="person-sub">
      <div class="cat-seg" role="group" aria-label="Тип">${chips([['all','Усі типи',null],...[['movie','Фільми'],['tv','Серіали'],['anim','Анімація'],['doc','Документальні'],['talk','Шоу']].filter(([k])=>tCnt[k]).map(([k,l])=>[k,l,tCnt[k]])],f.type,'personSetType')}</div>
      <div class="cat-seg" role="group" aria-label="Роль">${chips([['all','Усі ролі',null],...(leads?[['lead','Головні ролі',leads]]:[]),...(dirs?[['directing','Режисура',dirs]]:[])],f.role,'personSetRole')}</div>
      ${minor?`<button class="link-btn" onclick="personToggleMinor()">${f.showMinor?'Сховати шоу й дрібні появи':`Показати шоу й дрібні появи (${minor})`}</button>`:''}
    </div>`;
}
function personSetType(v){_personFilter.type=v;_personShown=PERSON_PAGE_SIZE;buildPersonBar();renderPersonList();}
function personSetRole(v){_personFilter.role=v;_personShown=PERSON_PAGE_SIZE;buildPersonBar();renderPersonList();}
function personToggleMinor(){_personFilter.showMinor=!_personFilter.showMinor;if(!_personFilter.showMinor&&(_personFilter.type==='doc'||_personFilter.type==='talk'))_personFilter.type='all';buildPersonBar();renderPersonList();}
let _personSearchT;
function personListSearch(v){clearTimeout(_personSearchT);_personSearchT=setTimeout(()=>{_personFilter.q=v.trim();renderPersonList();},220);}
function personSetOwnership(v){_personFilter.ownership=v;_personShown=PERSON_PAGE_SIZE;buildPersonBar();renderPersonList();}
function personSetSort(v){_personFilter.sort=v;renderPersonList();}

/* ── PEOPLE: ownership — by TMDB id first (exact), title+year as a fallback ── */
function _personOwnedFns(){
  const st={};
  [['ok',watched],['wn',watching],['pl',planned]].forEach(([s,l])=>l.forEach(i=>{if(i.imdbID&&!st[i.imdbID])st[i.imdbID]={status:s,item:i};}));
  const byKey={};
  for(const imdb in st){const f=_findCache[imdb];if(f){if(f.m)byKey['movie:'+f.m]=st[imdb];if(f.t)byKey['tv:'+f.t]=st[imdb];}}
  for(const k in _resolveCache){const o=st[_resolveCache[k].imdbID];if(o)byKey[k]=o;}
  const byTitle=_ownedByTitleYear();
  return c=>byKey[`${c.mediaType}:${c.id}`]||byTitle[_norm(c.title)+'|'+c.year]||null;
}
function renderPersonList(){
  const listEl=document.getElementById('personList');
  if(!_personGroupsCache||!listEl)return;
  const own=_personOwnedFns(),f=_personFilter;
  /* header progress: watched out of the notable, released filmography */
  const notable=_personGroupsCache.all.filter(c=>!_creditMinor(c)&&c.date&&c.date<=_todayISO()).map(c=>({...c,owned:own(c)}));
  const seen=notable.filter(c=>c.owned?.status==='ok').length,listed=notable.filter(c=>c.owned&&c.owned.status!=='ok').length;
  const stats=document.getElementById('personStats');
  if(stats)stats.innerHTML=`Переглянуто <b class="num">${seen}</b> з <span class="num">${notable.length}</span> помітних${listed?` · ще <span class="num">${listed}</span> у твоїх списках`:''}`;
  const bar=document.getElementById('personBarFill');if(bar)bar.style.width=(notable.length?Math.round(seen/notable.length*100):0)+'%';

  let items=_personPool().map(c=>({...c,owned:own(c)}));
  if(f.q){const q=f.q.toLowerCase();items=items.filter(c=>c.title.toLowerCase().includes(q));}
  if(f.type!=='all')items=items.filter(c=>f.type==='anim'?(c.type==='anime'||c.type==='cartoon'):c.type===f.type);
  if(f.role==='lead')items=items.filter(c=>c.lead);
  if(f.role==='directing')items=items.filter(c=>c.roles.has('directing'));
  if(f.ownership==='owned')items=items.filter(c=>!!c.owned);
  if(f.ownership==='missing')items=items.filter(c=>!c.owned);

  const sorters={
    'popular':(a,b)=>b.voteCount-a.voteCount,
    'year-desc':(a,b)=>(b.date||'9999').localeCompare(a.date||'9999'),
    'year-asc':(a,b)=>(a.date||'9999').localeCompare(b.date||'9999'),
    'rating-desc':(a,b)=>(b.voteCount>=50)-(a.voteCount>=50)||b.rating-a.rating, /* a 9.4 from 6 votes shouldn't lead */
    'name-asc':(a,b)=>a.title.localeCompare(b.title,'uk'),
  };
  items.sort(sorters[f.sort]||sorters.popular);

  if(!items.length){
    listEl.innerHTML=`<div class="empty"><span class="empty-icon">${ic(f.ownership==='missing'?'check':'search')}</span><div class="empty-txt">${f.ownership==='missing'&&!f.q?'Усе помітне з цієї фільмографії вже є у твоїх списках':'Нічого не знайдено за цим фільтром'}</div></div>`;
    return;
  }
  const shown=items.slice(0,_personShown);
  listEl.innerHTML=`<div class="person-grid">${shown.map(c=>_personCardHtml(c)).join('')}</div>
    ${shown.length<items.length?`<div style="text-align:center;margin-top:1.1rem">
      <button class="rec-btn m" onclick="_personShown+=PERSON_PAGE_SIZE;renderPersonList()">Показати ще (${items.length-shown.length})</button>
    </div>`:''}`;
}

function _personCardHtml(c){
  let status='';
  const ck=`${c.mediaType}:${c.id}`;
  const out=c.date&&c.date<=_todayISO();
  if(c.owned){
    const m={ok:['ok','check','Переглянуто'],wn:['wn','play','Дивлюсь'],pl:['pl','bookmark','Заплановано']}[c.owned.status];
    status=`<span class="chip-s ${m[0]}">${ic(m[1])}${m[2]}</span>`;
  }else if(c.type==='talk'){
    status=`<span class="chip-s mute">Не відстежується</span>`;
  }else if(_unresolvable[ck]){
    status=`<span class="chip-s mute">Немає на IMDb</span>`;
  }else{
    const meta=uriSafe(JSON.stringify({title:c.title,year:c.year,poster:c.poster?`https://image.tmdb.org/t/p/w342${c.poster}`:'',rating:c.rating?c.rating.toFixed(1):''}));
    const knownImdb=_resolveCache[ck]?.imdbID;
    status=knownImdb&&_skippedParts[knownImdb]
      ?`<button class="pc-act muted" data-act="personAddMissing" data-args="${A((c.id),`${c.mediaType}`,`${meta}`,'$el')}">Пропущено</button>`
      :`<button class="pc-act" data-act="personAddMissing" data-args="${A((c.id),`${c.mediaType}`,`${meta}`,'$el')}">${out?'Додати':'Запланувати'}</button>`;
  }
  const knownImdbForLink=c.owned?c.owned.item.imdbID:_resolveCache[ck]?.imdbID;
  const link=knownImdbForLink?`https://www.imdb.com/title/${knownImdbForLink}/`:`https://www.themoviedb.org/${c.mediaType==='tv'?'tv':'movie'}/${c.id}`;
  const posterUrl=c.poster?`https://image.tmdb.org/t/p/w342${c.poster}`:BLANK;
  const roleLbl=c.roles.has('directing')&&c.roles.has('acting')?'Режисер і актор':c.roles.has('directing')?'Режисер':c.lead?'Головна роль':'Роль';
  const role=roleLbl+(c.characters.length?' · '+c.characters.join(', '):'');
  const score=!out?`<span class="fc-up">${c.date?'вийде '+new Date(c.date+'T00:00:00').toLocaleDateString('uk-UA',{day:'numeric',month:'short',year:'numeric'}):'анонс'}</span>`
    :c.rating&&c.voteCount>=10?`<span class="imdb">TMDB <span class="num">${c.rating.toFixed(1)}</span></span>`:'';
  return `<article class="pc">
    <div class="pc-art"><a href="${link}" target="_blank" rel="noopener" tabindex="-1" data-act="_tsClickT" data-args="${A('$ev',`${c.mediaType}`,(c.id))}"><img src="${posterUrl}" onerror="this.src=BLANK" loading="lazy" alt=""></a></div>
    <div class="pc-t" title="${esc(c.title)}"><a href="${link}" target="_blank" rel="noopener" data-act="_tsClickT" data-args="${A('$ev',`${c.mediaType}`,(c.id))}">${esc(c.title)}</a></div>
    <div class="pc-m">${c.year?`<span class="num">${c.year}</span>`:''}<span>${CREDIT_TYPE_LABEL[c.type]||''}</span>${score}</div>
    <div class="pc-note" title="${esc(role)}">${esc(role)}</div>
    <div class="pc-status">${status}</div>
  </article>`;
}

async function personAddMissing(tmdbId,mediaType,metaEnc,btn){
  let meta={};try{meta=JSON.parse(decodeURIComponent(metaEnc));}catch(e){}
  const orig=btn.textContent;
  btn.disabled=true;btn.textContent='…';
  const mt=mediaType==='tv'?'tv':'movie';
  const ck=`${mt}:${tmdbId}`;
  try{
    let imdbID=_resolveCache[ck]?.imdbID;
    if(!imdbID){
      const ep=mt==='tv'?`/tv/${tmdbId}/external_ids`:`/movie/${tmdbId}/external_ids`;
      const d=await tmdbFetch(ep);
      imdbID=d?.imdb_id||'';
      if(imdbID){_resolveCache[ck]={imdbID,ended:mt!=='tv',ts:Date.now()};_resolveCacheSave();}
    }
    if(!imdbID){
      _unresolvable[ck]=true;_unresolvableSave();
      renderPersonList();
      return;
    }
    btn.disabled=false;btn.textContent=orig;
    openStatusPicker(imdbID,meta,()=>{buildPersonBar();renderPersonList();});
  }catch(e){
    btn.disabled=false;
    if(e&&e.message==='TMDB_BLOCKED'){
      btn.textContent='TMDB недоступний';
      toast('TMDB недоступний цього сеансу — оновіть сторінку, щоб спробувати ще раз','err',3600);
    }else{
      btn.textContent='Помилка';
      toast('Не вдалося додати — спробуйте ще раз','err',2800);
    }
    setTimeout(()=>{if(btn.isConnected)btn.textContent=orig;},2600);
  }
}

