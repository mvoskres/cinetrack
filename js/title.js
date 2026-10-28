/* ═══════════════════════════════════════════════════════════════
   TITLE SHEET — everything we already fetch about a title, finally on
   screen: Ukrainian overview, cast, crew, seasons, trailer, where to
   watch in Ukraine, similar titles. One TMDB call (append_to_response),
   slimmed and kept for 14 days, last 80 titles only. */
const TS_TTL=14*864e5,TS_MAX=80;
/* airing shows change (next episode, status) far faster than films: 1 day, and stale once the cached next episode has aired */
function _tsFresh(c){
  if(!c||!c.ts)return false;
  const live=c.mt==='tv'&&!/^(Ended|Canceled)$/i.test(c.status||'');
  if(Date.now()-c.ts>=(live?864e5:TS_TTL))return false;
  return !(c.nextEp?.date&&c.nextEp.date<_todayISO());
}
let _tsCache={};try{_tsCache=JSON.parse(localStorage.getItem('ct_titlecache')||'{}');}catch(e){}
function _tsSave(){
  const ks=Object.keys(_tsCache);
  if(ks.length>TS_MAX)ks.sort((a,b)=>_tsCache[a].ts-_tsCache[b].ts).slice(0,ks.length-TS_MAX).forEach(k=>delete _tsCache[k]);
  _lsSet('ct_titlecache',JSON.stringify(_tsCache));
}
let _tsStack=[];   /* refs opened in this sheet, for "Назад" */
let _tsCur=null;   /* {ref, data} on screen */

/* ref: {imdbID} for your own titles, {mt,id} for TMDB ones (recs, people, franchises, similar) */
function openTitle(imdbID){_tsOpen({imdbID},true);}
function openTitleTmdb(mt,id){_tsOpen({mt:mt==='tv'?'tv':'movie',id:+id},true);}
function _tsOwned(imdbID){
  if(!imdbID)return null;
  for(const[l,arr]of[['watched',watched],['watching',watching],['planned',planned]]){const it=arr.find(x=>x.imdbID===imdbID);if(it)return{list:l,item:it};}
  return null;
}
async function _tsOpen(ref,push){
  const bg=document.getElementById('titleSheet');
  if(push){if(bg.classList.contains('hidden'))_tsStack=[];_tsStack.push(ref);}
  bg.classList.remove('hidden');document.body.style.overflow='hidden';
  const body=document.getElementById('tsBody');
  body.innerHTML=`${_tsTopBar()}<div class="spinner">Завантажую деталі…</div>`;
  body.parentElement.scrollTop=0;
  let data=null;
  try{data=await _tsLoad(ref);}catch(e){}
  if(_tsStack[_tsStack.length-1]!==ref)return; /* navigated away meanwhile */
  if(!data){body.innerHTML=`${_tsTopBar()}<div class="empty"><span class="empty-icon">${ic('alert')}</span><div class="empty-txt">Не вдалося завантажити деталі. Перевір з'єднання або ключі в Налаштуваннях</div></div>`;return;}
  _tsCur={ref,data};
  _tsRender();
  const w=data.mt==='tv'&&data.id&&_tsOwned(data.imdbID)?.list==='watching'?_tsOwned(data.imdbID).item:null;
  if(w&&data.seasons.some(s=>s.n===w.season))_tsSeason(w.season);
}
function closeTitle(){document.getElementById('titleSheet').classList.add('hidden');document.body.style.overflow='';_tsStack=[];_tsCur=null;_refreshVisibleTab();}
/* a status changed in the sheet must show on the tab underneath without leaving it */
function _refreshVisibleTab(){
  const vis=id=>!document.getElementById('tab-'+id)?.classList.contains('hidden');
  if(vis('watched'))rWatched();
  if(vis('watching'))rWatching(true);
  if(vis('planned'))rPlanned();
  if(vis('collections')&&_collGroupsCache){buildCollBar();renderCollections(true);}
  if(vis('people')){buildPersonBar();renderPersonList();}
  if(vis('recs'))renderRecs(); /* a title added from the sheet must leave the shelves */
}
function titleBack(){if(_tsStack.length>1){_tsStack.pop();_tsOpen(_tsStack[_tsStack.length-1],false);}else closeTitle();}

async function _tsLoad(ref){
  let mt=ref.mt,id=ref.id,imdbID=ref.imdbID;
  if(!id&&imdbID&&TMDB_KEY&&!_tmdbBlocked){
    const own=_tsOwned(imdbID);
    const f=await tmdbFindIds(imdbID).catch(()=>({m:0,t:0}));
    const series=own?.item.type==='series';
    mt=series?(f.t?'tv':f.m?'movie':null):(f.m?'movie':f.t?'tv':null);
    id=mt==='tv'?f.t:f.m;
  }
  if(!id)return imdbID?_tsFromOmdb(imdbID):null;   /* not on TMDB (or no key): OMDb has the basics */
  const k=`${mt}:${id}`;
  const c=_tsCache[k];
  if(_tsFresh(c))return c;
  /* shows: aggregate_credits = the cast of every season (plain credits only lists the latest one) */
  const d=await tmdbFetch(`/${mt}/${id}?language=uk-UA&append_to_response=${mt==='tv'?'aggregate_credits':'credits'},videos,watch/providers,recommendations,external_ids&include_video_language=uk,en`,9000);
  if(d.aggregate_credits)d.credits={cast:(d.aggregate_credits.cast||[]).map(c=>({id:c.id,name:c.name,profile_path:c.profile_path,character:c.roles?.[0]?.character||''})),crew:(d.aggregate_credits.crew||[]).map(c=>({...c,job:c.jobs?.[0]?.job||''}))};
  let overview=d.overview,tagline=d.tagline;
  if(!overview){try{const en=await tmdbFetch(`/${mt}/${id}?language=en-US`);overview=en.overview;tagline=tagline||en.tagline;}catch(e){}}
  const crew=d.credits?.crew||[];
  const names=jobs=>[...new Set(crew.filter(c=>jobs.includes(c.job)).map(c=>c.name))];
  const vids=(d.videos?.results||[]).filter(v=>v.site==='YouTube');
  const tr=vids.find(v=>v.type==='Trailer'&&v.iso_639_1==='uk')||vids.find(v=>v.type==='Trailer')||vids.find(v=>v.type==='Teaser');
  const ua=d['watch/providers']?.results?.UA;
  const pv=a=>(a||[]).map(p=>({name:p.provider_name,logo:p.logo_path}));
  const imdb=d.external_ids?.imdb_id||d.imdb_id||imdbID||'';
  if(imdb&&!_resolveCache[k]){_resolveCache[k]={imdbID:imdb,ended:mt==='movie'||d.status==='Ended',ts:Date.now()};_resolveCacheSave();}
  const date=d.release_date||d.first_air_date||'';
  const data={k,mt,id,imdbID:imdb,ts:Date.now(),
    title:d.title||d.name||'',original:d.original_title||d.original_name||'',year:date.slice(0,4),date,
    runtime:d.runtime||(d.episode_run_time||[])[0]||0,genres:(d.genres||[]).map(g=>g.name),gid:(d.genres||[]).map(g=>g.id),
    iso:[...new Set([...(d.origin_country||[]),...(d.production_countries||[]).map(c=>c.iso_3166_1)])],lastYear:(d.last_air_date||'').slice(0,4),
    countries:(d.production_countries||[]).map(c=>_tsCountry(c)).slice(0,3),status:d.status||'',
    overview:overview||'',tagline:tagline||'',vote:d.vote_average||0,votes:d.vote_count||0,
    poster:d.poster_path||null,backdrop:d.backdrop_path||null,
    cast:(d.credits?.cast||[]).slice(0,14).map(c=>({id:c.id,name:c.name,character:c.character||'',profile:c.profile_path||null})),
    directors:[...new Map(crew.filter(c=>c.job==='Director').map(c=>[c.id,{id:c.id,name:c.name,profile:c.profile_path||null}])).values()].slice(0,3),
    creators:(d.created_by||[]).map(c=>c.name),writers:names(['Screenplay','Writer','Story','Novel']).slice(0,4),music:names(['Original Music Composer','Music']).slice(0,2),
    trailer:tr?{key:tr.key,lang:tr.iso_639_1}:null,
    providers:ua?{link:ua.link,flat:pv(ua.flatrate),rent:pv(ua.rent),buy:pv(ua.buy)}:null,
    seasons:(d.seasons||[]).filter(s=>s.season_number>0).map(s=>({n:s.season_number,eps:s.episode_count,air:(s.air_date||'').slice(0,4)})),
    nextEp:d.next_episode_to_air?{s:d.next_episode_to_air.season_number,e:d.next_episode_to_air.episode_number,date:d.next_episode_to_air.air_date}:null,
    networks:(d.networks||[]).map(n=>n.name).slice(0,3),
    collection:d.belongs_to_collection?{id:d.belongs_to_collection.id,name:d.belongs_to_collection.name}:null,
    recs:(d.recommendations?.results||[]).filter(r=>r.poster_path).slice(0,12).map(r=>({id:r.id,mt:r.media_type==='tv'?'tv':'movie',title:r.title||r.name,year:(r.release_date||r.first_air_date||'').slice(0,4),poster:r.poster_path,vote:r.vote_average||0}))};
  _tsCache[k]=data;_tsSave();
  return data;
}
/* TMDB country names are English ("United States of America"); the ISO code gives a Ukrainian one */
let _tsRegionNames=null;
function _tsCountry(c){try{_tsRegionNames=_tsRegionNames||new Intl.DisplayNames(['uk'],{type:'region'});return _tsRegionNames.of(c.iso_3166_1)||c.name;}catch(e){return c.name;}}
async function _tsFromOmdb(imdbID){
  const m=await aFetch(`i=${imdbID}&plot=full`);
  if(!m||m.Response==='False')return null;
  const list=s=>(s&&s!=='N/A'?s.split(',').map(x=>x.trim()):[]);
  return{k:'imdb:'+imdbID,mt:m.Type==='series'?'tv':'movie',id:0,imdbID,ts:Date.now(),title:m.Title,original:'',year:(m.Year||'').slice(0,4),date:'',
    runtime:parseRuntime(m.Runtime)||0,genres:list(m.Genre),countries:list(m.Country).slice(0,3),status:'',overview:m.Plot&&m.Plot!=='N/A'?m.Plot:'',tagline:'',
    vote:0,votes:0,poster:null,posterUrl:ps(m.Poster),backdrop:null,cast:list(m.Actors).map(n=>({id:0,name:n,character:'',profile:null})),
    directors:list(m.Director).map(n=>({id:0,name:n})),creators:[],writers:list(m.Writer).slice(0,4),music:[],trailer:null,providers:null,
    seasons:[],nextEp:null,networks:[],collection:null,recs:[],omdbOnly:true};
}

function _tsTopBar(){
  return `<div class="ts-top">
    ${_tsStack.length>1?`<button class="flt-pill" onclick="titleBack()">‹ Назад</button>`:'<span></span>'}
    <button class="game-modal-close" onclick="closeTitle()" aria-label="Закрити">✕</button></div>`;
}
const _tsImg=(p,w)=>p?`https://image.tmdb.org/t/p/${w}${p}`:'';
const _tsFd=d=>d?new Date(d+'T00:00:00').toLocaleDateString('uk-UA',{day:'numeric',month:'long',year:'numeric'}):'';

function _tsActions(d){
  const own=_tsOwned(d.imdbID);
  if(own){
    const it=own.item,lbl={watched:['ok','check','Переглянуто'],watching:['wn','play','Дивлюсь'],planned:['pl','bookmark','Заплановано']}[own.list];
    const extra=own.list==='watching'&&it.type==='series'?` · ${_epLabel(it)}`:own.list==='watched'&&it.rating?` · твоя оцінка ${it.rating}/10`:'';
    const main=own.list==='watched'?`<button class="btn" data-act="editW" data-args="${A((it.id))}">${ic('star')}Оцінка і коментар</button>`
      :own.list==='planned'?`<button class="btn primary" data-act="plToW" data-args="${A((it.id))}">${ic('check')}Переглянуто</button><button class="btn" data-act="plToWn" data-args="${A((it.id))}">${ic('play')}Почати дивитись</button>`
      :`<button class="btn primary" data-act="mvToW" data-args="${A((it.id))}">${ic('check')}Переглянуто повністю</button>`;
    return `<span class="chip-s ${lbl[0]}">${ic(lbl[1])}${lbl[2]}${extra}</span>${main}
      <button class="icon-btn" data-act="cardMenu" data-args="${A('$ev',`${own.list}`,(it.id))}" aria-label="Ще дії">${ic('dots')}</button>`;
  }
  if(!d.imdbID)return `<span class="chip-s mute">Немає на IMDb, тож додати не вийде</span>`;
  return ['watched','watching','planned'].map((l,k)=>`<button class="btn${k===0?' primary':''}" data-act="_tsAdd" data-args="${A(`${l}`)}">${ic(['check','play','bookmark'][k])}${['Переглянуто','Дивлюсь','Запланувати'][k]}</button>`).join('');
}
async function _tsAdd(list){
  const d=_tsCur?.data;if(!d?.imdbID)return;
  const fn={watched:addW,watching:addWn,planned:addPl}[list];
  if(!_pendingMap[d.imdbID]&&d.id&&d.gid){try{_pmSet(d.imdbID,await _omdbShape(d));}catch(e){}}
  let ok=false;
  try{ok=await fn(d.imdbID);}catch(e){toast('Не вдалося додати: немає зв\'язку з OMDb','err');}
  if(ok&&_pendingMap[d.imdbID]?._fromTmdb)_topUpImdbRating(d.imdbID);
  _tsRefreshActions();
}
/* TMDB genre ids -> the English names OMDb uses, so stats, filters and gc() see one vocabulary */
const TMDB_GENRE_OMDB={28:'Action',12:'Adventure',16:'Animation',35:'Comedy',80:'Crime',99:'Documentary',18:'Drama',10751:'Family',
  14:'Fantasy',36:'History',27:'Horror',10402:'Music',9648:'Mystery',10749:'Romance',878:'Sci-Fi',53:'Thriller',10752:'War',37:'Western',
  10759:'Action, Adventure',10762:'Family',10763:'News',10764:'Reality-TV',10765:'Sci-Fi, Fantasy',10767:'Talk-Show',10768:'War'};
let _enRegion=null;
function _enCountry(iso){try{_enRegion=_enRegion||new Intl.DisplayNames(['en'],{type:'region'});return _enRegion.of(iso);}catch(e){return iso;}}
/* An OMDb-shaped record built from TMDB: the item keeps the English title like every
   other entry; one en-US call (usually cached by the title sheet already) */
async function _omdbShape(d){
  return _shapeFromTmdb(d.mt,await tmdbFetch(`/${d.mt}/${d.id}?language=en-US`));
}
function _shapeFromTmdb(mt,en){
  const series=mt==='tv',date=en.release_date||en.first_air_date||'',y=date.slice(0,4);
  const genre=[...new Set((en.genres||[]).flatMap(g=>(TMDB_GENRE_OMDB[g.id]||'').split(', ')).filter(Boolean))].join(', ');
  const iso=[...new Set([...(en.origin_country||[]),...(en.production_countries||[]).map(c=>c.iso_3166_1)])];
  const rt=en.runtime||(en.episode_run_time||[])[0]||0;
  return{_fromTmdb:true,Response:'True',Title:en.title||en.name||'',
    Year:series?`${y}–${en.status==='Ended'||en.status==='Canceled'?(en.last_air_date||'').slice(0,4):''}`:y,Type:series?'series':'movie',
    Genre:genre,Country:iso.map(_enCountry).join(', '),Poster:_tsImg(en.poster_path,'w342'),
    Runtime:rt?`${rt} min`:'N/A',imdbRating:'N/A',totalSeasons:String(en.number_of_seasons||1)};
}
/* One OMDb call after the add, for the IMDb rating only; a spent quota just leaves it empty */
async function _topUpImdbRating(imdbID){
  try{const m=await aFetch(`i=${imdbID}`);const r=m?.imdbRating&&m.imdbRating!=='N/A'?m.imdbRating:null;if(!r)return;
    [watched,watching,planned].forEach(l=>l.filter(i=>i.imdbID===imdbID&&!i.imdbRating).forEach(i=>{i.imdbRating=r;}));
    save();rWatched();rWatching();rPlanned();}catch(e){}
}
function _tsRefreshActions(){
  if(!_tsCur||document.getElementById('titleSheet')?.classList.contains('hidden'))return;
  const el=document.getElementById('tsActions');if(el)el.innerHTML=_tsActions(_tsCur.data);
  const sn=document.getElementById('tsSeasons');if(sn)sn.innerHTML=_tsSeasonChips(_tsCur.data);
  if(_tsCur.season)_tsEpsRender();
  const n=document.getElementById('tsMine');if(n)n.innerHTML=_tsMine(_tsCur.data);
}
function _tsMine(d){
  const it=_tsOwned(d.imdbID)?.item;if(!it)return '';
  const bits=[];
  if(it.rating)bits.push(`<div><span class="ts-k">Твоя оцінка</span><span class="ts-stars" aria-label="${it.rating} з 10">${'★'.repeat(it.rating)}<i>${'★'.repeat(10-it.rating)}</i></span></div>`);
  if(it.comment)bits.push(`<div><span class="ts-k">Коментар</span><p>${esc(it.comment)}</p></div>`);
  if((it.tags||[]).length)bits.push(`<div><span class="ts-k">Теги</span>${_tagsHtml(it)}</div>`);
  if(it.streamUrl)bits.push(`<div><span class="ts-k">Посилання</span><a href="${esc(it.streamUrl)}" target="_blank" rel="noopener">${esc(it.streamUrl.replace(/^https?:\/\//,'').slice(0,60))}</a></div>`);
  return bits.length?`<section class="ts-sec"><h3>Твої нотатки</h3><div class="ts-mine">${bits.join('')}</div></section>`:'';
}
/* a click on a person only shows the filmography; following is the "Стежити" button there */
function _tsPerson(id,name,profile){
  _personPreview=_trackedPeople.find(t=>t.id===id)?null:{id,name,profile,dept:''};
  _personLast=id;
  const detail=document.getElementById('personDetail');if(detail)detail.innerHTML=''; /* renderPeopleTab opens _personLast */
  closeTitle();goTab('people',document.getElementById('ni-people'));
}

function _tsRender(){
  const d=_tsCur.data,own=_tsOwned(d.imdbID)?.item;
  const body=document.getElementById('tsBody');
  const omdb=d.imdbID?_apiCache['i='+d.imdbID]?.d||_apiCache['i='+d.imdbID+'&plot=short']?.d:null;
  const rt=omdb?.Ratings?.find(r=>r.Source==='Rotten Tomatoes')?.Value,mc=omdb?.Ratings?.find(r=>r.Source==='Metacritic')?.Value;
  const imdbR=own?.imdbRating||(omdb?.imdbRating&&omdb.imdbRating!=='N/A'?omdb.imdbRating:'');
  const listTitle=own?.title||d.title;
  const alt=[d.title!==listTitle?d.title:'',d.original&&d.original!==listTitle&&d.original!==d.title?d.original:''].filter(Boolean).join(' · ');
  const meta=[d.year,d.runtime?`${d.runtime} хв${d.mt==='tv'?' серія':''}`:'',d.genres.slice(0,3).join(', '),d.countries.join(', ')].filter(Boolean).join(' · ');
  const scores=[imdbR&&`<span class="ts-score"><b>IMDb</b> ${esc(imdbR)}</span>`,d.vote&&d.votes>=20&&`<span class="ts-score"><b>TMDB</b> ${d.vote.toFixed(1)} <small>${nf2(d.votes)}</small></span>`,
    rt&&`<span class="ts-score"><b>Rotten Tomatoes</b> ${esc(rt)}</span>`,mc&&`<span class="ts-score"><b>Metacritic</b> ${esc(mc)}</span>`].filter(Boolean).join('');
  const poster=d.posterUrl||_tsImg(d.poster,'w342')||own?.poster||BLANK;
  const links=[d.trailer&&`<a class="btn" href="https://www.youtube.com/watch?v=${d.trailer.key}" target="_blank" rel="noopener">${ic('play')}Трейлер${d.trailer.lang==='uk'?' українською':''}</a>`,
    d.imdbID&&`<a class="btn" href="https://www.imdb.com/title/${d.imdbID}/" target="_blank" rel="noopener">IMDb</a>`,
    d.id&&`<a class="btn" href="https://www.themoviedb.org/${d.mt}/${d.id}" target="_blank" rel="noopener">TMDB</a>`].filter(Boolean).join('');
  const crewRows=[d.directors.length&&['Режисер',d.directors.map(p=>p.id?`<button class="link-btn" data-act="_tsPerson" data-args="${A(p.id,p.name,p.profile||'')}">${esc(p.name)}</button>`:esc(p.name)).join(', ')],
    d.creators.length&&['Автори серіалу',esc(d.creators.join(', '))],d.writers.length&&['Сценарій',esc(d.writers.join(', '))],d.music.length&&['Музика',esc(d.music.join(', '))],
    d.networks.length&&['Канал',esc(d.networks.join(', '))]].filter(Boolean);
  const prov=d.providers&&(d.providers.flat.length||d.providers.rent.length||d.providers.buy.length)?`<section class="ts-sec"><h3>Де дивитись в Україні</h3>
    ${[['flat','Підписка'],['rent','Оренда'],['buy','Купівля']].filter(([k])=>d.providers[k].length).map(([k,l])=>`<div class="ts-prov"><span class="ts-k">${l}</span>${d.providers[k].map(p=>`<span class="ts-prov-i">${p.logo?`<img src="${_tsImg(p.logo,'w45')}" alt="">`:''}${esc(p.name)}</span>`).join('')}</div>`).join('')}
    <p class="ts-note">Дані JustWatch через TMDB${d.providers.link?` · <a href="${d.providers.link}" target="_blank" rel="noopener">усі варіанти</a>`:''}</p></section>`:'';
  const seasons=d.seasons.length?`<section class="ts-sec"><h3>Сезони <small>${d.status==='Ended'?'серіал завершено':d.status==='Returning Series'?'серіал триває':''}</small></h3>
    <div class="ts-seasons" id="tsSeasons">${_tsSeasonChips(d)}</div>
    ${d.nextEp?`<p class="ts-note">Наступна серія S${d.nextEp.s}E${d.nextEp.e}: ${_tsFd(d.nextEp.date)}</p>`:''}
    <div id="tsEps"></div></section>`:'';
  body.innerHTML=`${_tsTopBar()}
    <header class="ts-hero"${d.backdrop?` style="--bd:url('${_tsImg(d.backdrop,'w1280')}')"`:''}>
      <img class="ts-poster" src="${poster}" alt="" onerror="this.src=BLANK">
      <div class="ts-head">
        <h2 class="ts-title">${esc(listTitle)}</h2>
        ${alt?`<div class="ts-alt">${esc(alt)}</div>`:''}
        <div class="ts-meta">${esc(meta)}</div>
        ${scores?`<div class="ts-scores">${scores}</div>`:''}
      </div>
    </header>
    <div class="ts-actions" id="tsActions">${_tsActions(d)}</div>
    <div class="ts-content">
      ${d.tagline?`<p class="ts-tagline">${esc(d.tagline)}</p>`:''}
      ${d.overview?`<p class="ts-overview">${esc(d.overview)}</p>`:'<p class="ts-note">Опису поки немає</p>'}
      ${links?`<div class="ts-links">${links}</div>`:''}
      <div id="tsMine">${_tsMine(d)}</div>
      ${prov}${seasons}
      ${d.cast.length?`<section class="ts-sec"><h3>Актори</h3><div class="ts-cast">${d.cast.map(c=>`
        <button class="ts-person"${c.id?` data-act="_tsPerson" data-args="${A(c.id,c.name,c.profile||'')}" title="Фільмографія"`:' disabled'}>
          <img src="${c.profile?_tsImg(c.profile,'w185'):BLANK}" alt="" loading="lazy" onerror="this.src=BLANK">
          <b>${esc(c.name)}</b><span>${esc(c.character)}</span></button>`).join('')}</div></section>`:''}
      ${crewRows.length?`<section class="ts-sec"><dl class="ts-crew">${crewRows.map(([k,v])=>`<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl></section>`:''}
      ${_tsColl(d)}
      ${_tsRecs(d)}
      ${d.omdbOnly?`<p class="ts-note">Показано дані OMDb: на TMDB цього тайтлу немає або не задано ключ TMDB</p>`:''}
    </div>`;
}
/* ── EPISODES ──
   Season chips open that season's episodes (TMDB, uk-UA, kept for the session).
   For a show in Дивлюсь a click on an episode puts the progress there. */
const _tsSeasonCache={};
function _tsWatching(){const o=_tsCur&&_tsOwned(_tsCur.data.imdbID);return o?.list==='watching'?o.item:null;}
function _tsSeasonChips(d){
  const w=_tsOwned(d.imdbID),it=w?.item,open=_tsCur?.data===d?_tsCur.season:0;
  return d.seasons.map(s=>{
    const st=w?.list==='watched'||w?.list==='watching'&&s.n<it.season?' done':w?.list==='watching'&&s.n===it.season?' cur':'';
    return `<button class="ts-sn${st}${open===s.n?' open':''}" data-act="_tsSeason" data-args="${A(s.n)}" aria-expanded="${open===s.n}"><b>S${s.n}</b> ${s.eps} сер.${s.air?` · ${s.air}`:''}</button>`;
  }).join('');
}
async function _tsSeason(n){
  const d=_tsCur?.data;if(!d?.id)return;
  if(_tsCur.season===n){_tsCur.season=0;_tsRefreshActions();document.getElementById('tsEps').innerHTML='';return;}
  _tsCur.season=n;_tsRefreshActions();
  const box=document.getElementById('tsEps'),k=`${d.id}:${n}`;
  if(!_tsSeasonCache[k]){
    box.innerHTML='<div class="spinner">Завантажую серії…</div>';
    try{const r=await tmdbFetch(`/tv/${d.id}/season/${n}?language=uk-UA`);
      _tsSeasonCache[k]=(r.episodes||[]).map(e=>({e:e.episode_number,name:e.name||'',date:e.air_date||'',rt:e.runtime||0,vote:e.vote_count>=5?e.vote_average:0,ov:e.overview||''}));
    }catch(err){if(_tsCur?.season===n)box.innerHTML='<p class="ts-note">Не вдалося завантажити серії</p>';return;}
  }
  if(_tsCur?.data===d&&_tsCur.season===n)_tsEpsRender();
}
function _tsEpsRender(){
  const d=_tsCur.data,n=_tsCur.season,eps=_tsSeasonCache[`${d.id}:${n}`],box=document.getElementById('tsEps');if(!eps||!box)return;
  const w=_tsWatching(),own=_tsOwned(d.imdbID),today=_todayISO();
  box.innerHTML=`${w?'<p class="ts-note">Натисни на серію, на якій ти зараз</p>':own?'':'<p class="ts-note">Додай серіал у «Дивлюсь», щоб відмічати серії</p>'}
    <ol class="ts-eps">${eps.map(ep=>{
      const st=own?.list==='watched'||w&&(n<w.season||n===w.season&&ep.e<w.episode)?'done':w&&n===w.season&&ep.e===w.episode?'cur':'';
      const soon=ep.date&&ep.date>today;
      return `<li><button class="ts-ep ${st}${soon?' soon':''}"${w&&!soon?` data-act="_tsSetEp" data-args="${A(n,ep.e)}"`:' disabled'}${ep.ov?` title="${esc(ep.ov.slice(0,300))}"`:''}>
        <span class="ts-ep-n">${String(ep.e).padStart(2,'0')}</span>
        <span class="ts-ep-t"><b>${esc(ep.name)}</b><small>${[soon?'вийде '+_tsFd(ep.date):_tsFd(ep.date),ep.rt?ep.rt+' хв':'',ep.vote?'★ '+ep.vote.toFixed(1):''].filter(Boolean).join(' · ')}</small></span>
        ${st==='done'?ic('check'):st==='cur'?'<span class="ts-ep-here">ти тут</span>':''}</button></li>`;}).join('')}</ol>`;
}
function _tsSetEp(sn,ep){
  const it=_tsWatching();if(!it)return;
  it.season=sn;it.episode=ep;
  if(_tsCur.data.seasons.length>(it.totalSeasons||1))it.totalSeasons=_tsCur.data.seasons.length;
  save();
  const c=document.getElementById(`wc-${it.id}`);
  if(c){c.querySelector('.ep-v').textContent=_epLabel(it);c.querySelector('.ep-of').textContent=`сезон ${it.season} з ${it.totalSeasons||1}`;
    const bar=c.querySelector('.tr-bar i');if(bar)bar.style.width=_seasonPct(it)+'%';}
  _tsRefreshActions();
  toast(`Прогрес: ${_epLabel(it)}`,'ok',1800);
}
/* ── SIMILAR ── each with its list status. The TMDB ids of your titles are known only for those
   already looked up somewhere, so the rest are filled in once per session and the row redrawn */
function _tsRecs(d){
  if(!d.recs.length)return '';
  _fillOwnedTmdb().then(ch=>{const el=document.getElementById('tsRecs');if(ch&&el&&_tsCur?.data===d)el.outerHTML=_tsRecsHtml(d);});
  return _tsRecsHtml(d);
}
function _tsRecsHtml(d){
  _ownIdx=null;
  const own=_ownedMovieMap(),ST={ok:'переглянуто',wn:'дивлюсь',pl:'заплановано'}; /* same wording as the franchise row */
  return `<section class="ts-sec" id="tsRecs"><h3>Схожі</h3><div class="ts-recs">${d.recs.map(r=>{const st=own[_tmdbOwnedId(r.mt,r.id)]?.status;
      const info=[r.year,st?ST[st]:r.vote?`TMDB ${r.vote.toFixed(1)}`:''].filter(Boolean).join(' · ');return `
        <button class="ts-rec${st?' '+st:''}" data-act="_tsOpen" data-args="${A({mt:r.mt,id:r.id},true)}"><img src="${_tsImg(r.poster,'w185')}" alt="" loading="lazy" onerror="this.src=BLANK"><b>${esc(r.title)}</b><span>${esc(info)}</span></button>`;}).join('')}</div></section>`;
}
let _ownFillP=null;
function _fillOwnedTmdb(){
  if(_ownFillP)return _ownFillP;
  const todo=[...new Set([...watched,...watching,...planned].map(i=>i.imdbID).filter(id=>id&&!_findCache[id]))];
  if(!todo.length||!TMDB_KEY)return _ownFillP=Promise.resolve(false);
  return _ownFillP=(async()=>{
    let k=0;const worker=async()=>{while(k<todo.length){const id=todo[k++];try{await tmdbFindIds(id);}catch(e){}}};
    await Promise.all(Array.from({length:6},worker));
    _ownFillP=null; /* titles added later get looked up on the next opening */
    return true;
  })();
}
/* ── FRANCHISE ROW ── every part of the movie's TMDB collection, above "Схожі";
   uses the Franchises tab cache, fetches the collection once when it isn't there */
const _tsCollBusy={};
function _tsColl(d){
  const c=d.collection;if(!c)return '';
  const det=_collDetails[c.id];
  if(!det||_collStale(det)){
    _tsCollLoad(d);
    if(!det)return `<section class="ts-sec" id="tsColl"><h3>Франшиза</h3><div class="spinner">Завантажую франшизу…</div></section>`;
  }
  return _tsCollHtml(d,det);
}
async function _tsCollLoad(d){
  const id=d.collection.id;if(_tsCollBusy[id])return;
  _tsCollBusy[id]=1;
  try{await _fetchCollection(id);_collDetailsSave();}catch(e){}
  delete _tsCollBusy[id];
  const el=document.getElementById('tsColl');
  if(el&&_tsCur?.data===d)el.outerHTML=_tsCollHtml(d,_collDetails[id]);
}
function _tsCollHtml(d,det){
  const parts=(det?.parts||[]).slice().sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999'));
  if(parts.length<2)return '';
  const name=(det.name||d.collection.name||'').replace(/ Collection$/,'');
  const own=_ownedMovieMap(),ST={ok:'переглянуто',wn:'дивлюсь',pl:'заплановано'};
  const mine=Object.values(_collCache).some(x=>x.collId===d.collection.id); /* the Franchises tab lists it */
  const n=parts.length,a=n%10,b=n%100,films=a===1&&b!==11?'фільм':a>=2&&a<=4&&(b<12||b>14)?'фільми':'фільмів';
  return `<section class="ts-sec" id="tsColl"><h3>Франшиза <small>${esc(name)} · ${n} ${films}</small></h3>
    <div class="ts-recs">${parts.map(p=>{
      const cur=p.id===d.id,st=own[p.imdbID||_resolveCache[`movie:${p.id}`]?.imdbID]?.status;
      const info=[_partOut(p)?p.year:p.year?`вийде ${p.year}`:'анонс',cur?'цей фільм':ST[st]].filter(Boolean).join(' · ');
      return `<button class="ts-rec${cur?' cur':st?' '+st:''}"${cur?' disabled':` data-act="_tsOpen" data-args="${A({mt:'movie',id:p.id},true)}"`}><img src="${p.poster?_tsImg(p.poster,'w185'):BLANK}" alt="" loading="lazy" onerror="this.src=BLANK"><b>${esc(p.title)}</b><span>${esc(info)}</span></button>`;}).join('')}</div>
    ${mine?`<button class="link-btn" data-act="_tsGoColl" data-args="${A(name)}">${ic('stack')} Відкрити у франшизах</button>`:''}</section>`;
}
function _tsGoColl(name){closeTitle();_collFilter.q=name;_collFilter.status='all';goTab('collections',document.getElementById('ni-collections'));}
const nf2=n=>n>=1000?(n/1000).toFixed(n>=10000?0:1).replace('.',',')+' тис.':String(n);
/* keep the sheet in step with list changes made from it (or from the modals over it) */
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape'||document.getElementById('titleSheet')?.classList.contains('hidden'))return;
  if(document.getElementById('mbox')?.innerHTML.trim()||document.querySelector('.ct-menu'))return; /* a modal/menu on top closes first */
  closeTitle();
});

function _tsClick(ev,imdbID){if(ev.ctrlKey||ev.metaKey||ev.shiftKey||ev.button===1)return true;ev.preventDefault();openTitle(imdbID);return false;}
function _tsClickT(ev,mt,id){if(ev.ctrlKey||ev.metaKey||ev.shiftKey||ev.button===1)return true;ev.preventDefault();openTitleTmdb(mt,id);return false;}

