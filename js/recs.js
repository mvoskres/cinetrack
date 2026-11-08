/* ═══════════════════════════════════════════════════════════════
   RECOMMENDATIONS — shelves that each say why they are there.
   · «Для тебе» comes first: TMDB recommendations for ten titles you watched, merged, so a title several
     of them point to ranks above one only one does; at most two per franchise; each card says what it is like;
   · seeds come from all of «Переглянуте», a share per category (addedAt is the import order, not a watch
     date, so nothing here claims to know what you watched recently);
   · "already yours" is matched by TMDB id: the ids of every list and hidden title are looked up once
     (ct_tmdbfind, permanent); title+year is only the fallback. An IMDb id is fetched only when you add a title;
   · titles come in Ukrainian (language=uk-UA), the original title is kept for the fallback match;
   · the result is kept for 24h (ct_recs), 30 min when a good part of it failed; "Оновити" brings new seeds
     and other pages of the broad shelves; a build in which TMDB failed entirely keeps the previous shelves;
   · franchise and people shelves come from caches, zero requests. */
const RECS_TTL=24*60*60*1000;
const RECS_RETRY=30*60*1000; /* a build with failed shelves is redone this soon */
const REC_V=2; /* bumped when the shelves change meaning: a build cached by an older version is redone at once */
const SHELF_N=6; /* cards shown per shelf before "Показати всі" */
let _recs=null;          /* {v, ts, seedRot, partial?, shelves:[{id,title,why,items:[...]}]} */
_recs=_lsJSON('ct_recs',null);
let _recView='picks', _recType='all', _recBusy=false, _recGenreState=null;
const _recOpen=new Set(); /* shelves expanded past SHELF_N */
function _recsSave(){if(_recs)_lsSet('ct_recs',JSON.stringify(_recs));}
/* TMDB recommendations per seed title, 7 days, compact (ct_recsrc: a cache, dropped first when storage is full);
   40 seeds = the last three builds, ~70K chars */
const RECSRC_TTL=7*864e5,RECSRC_MAX=40;
let _recSrc=_lsJSON('ct_recsrc',{}); /* 'movie:603' -> {ts, r:[packed items]} */
function _recSrcSave(){
  const ks=Object.keys(_recSrc);
  if(ks.length>RECSRC_MAX)ks.sort((a,b)=>(_recSrc[a].ts||0)-(_recSrc[b].ts||0)).slice(0,ks.length-RECSRC_MAX).forEach(k=>delete _recSrc[k]);
  _lsSet('ct_recsrc',JSON.stringify(_recSrc));
}

/* What counts as "already yours": list items + hidden, by imdbID, by TMDB key, by title|year */
function _recKnown(){
  const imdb=new Set(),tmdb=new Set(),ty=new Set(),hiddenTitles=new Set(); /* hiddenTitles: only legacy hides that have no year */
  [...watched,...watching,...planned].forEach(i=>{
    imdb.add(i.imdbID);
    ty.add(_norm(i.title)+'|'+String(i.year||'').slice(0,4));
    const f=_findCache[i.imdbID];if(f){if(f.m)tmdb.add('movie:'+f.m);if(f.t)tmdb.add('tv:'+f.t);}
  });
  /* a hide matches by id, or by title+year: a remake with the same name but another year is a different title */
  hidden.forEach(h=>{if(h.imdbID)imdb.add(h.imdbID);if(h.tmdb)tmdb.add(h.tmdb);
    if(h.year)ty.add(_norm(h.title)+'|'+String(h.year).slice(0,4));else if(!h.imdbID&&!h.tmdb)hiddenTitles.add(_norm(h.title));
    const f=_findCache[h.imdbID];if(f){if(f.m)tmdb.add('movie:'+f.m);if(f.t)tmdb.add('tv:'+f.t);}});
  for(const k in _resolveCache)if(imdb.has(_resolveCache[k].imdbID))tmdb.add(k);
  return {imdb,tmdb,
    has(it){return tmdb.has(it.k)||(it.imdbID&&imdb.has(it.imdbID))||ty.has(_norm(it.title)+'|'+it.year)||hiddenTitles.has(_norm(it.title))
      /* titles now come in Ukrainian; the lists hold English/original ones */
      ||(!!it.ot&&(ty.has(_norm(it.ot)+'|'+it.year)||hiddenTitles.has(_norm(it.ot))));}};
}

/* TMDB list result → compact rec item */
function _recItem(r,mt,note){
  const m=mt||(r.media_type==='tv'?'tv':'movie');
  const date=r.release_date||r.first_air_date||'';
  const k=`${m}:${r.id}`,title=r.title||r.name||'',ot=r.original_title||r.original_name||'';
  return {k,id:r.id,mt:m,title,ot:ot&&ot!==title?ot:'',year:date.slice(0,4),date,poster:r.poster_path||null,
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
function _recCat(i){const c=i.customCategory||i.type;return c==='cartoon'||c==='anime'||c==='series'?c:'movie';}
/* a count, not a share: 46 anime among 1000 titles is 4.6 %, and still plenty to recommend from */
function _catCount(c){return watched.filter(i=>(i.customCategory||i.type)===c).length;}
/* Series have their own TMDB genre ids: Action/Adventure, Sci-Fi/Fantasy and War/Politics are merged there,
   and Thriller, Horror, Romance, History, Music don't exist (/discover/tv with them returns nothing) */
const _TV_GENRE={28:10759,12:10759,878:10765,14:10765,10752:10768,16:16,35:35,80:80,99:99,18:18,10751:10751,9648:9648,37:37};
function _tvGenres(ids){return [...new Set(ids.map(id=>_TV_GENRE[id]).filter(Boolean))];}

/* Franchise keys of a title: its TMDB collection when known; otherwise, per name, the first word when it is
   5+ letters («Digimon Frontier»/«Digimon Tamers»), else the name up to a colon or dash */
let _recCollIdx=null; /* TMDB movie id -> collection id, from the Franchises cache; reset per build */
function _recCollOf(movieId){
  if(!_recCollIdx){_recCollIdx={};for(const cid in _collDetails)(_collDetails[cid]?.parts||[]).forEach(p=>{if(p.id)_recCollIdx[p.id]=cid;});}
  return _recCollIdx[movieId]||'';
}
function _recFamKeys(names,collId){
  if(collId)return ['c'+collId];
  return [...new Set(names.filter(Boolean).map(t=>{const w=_norm(t).split(' ')[0]||'';return w.length>=5?'w'+w:'t'+_norm(String(t).split(/[:\-–(]/)[0]);}))];
}

/* Seeds: titles of «Переглянуте» you rated 8+ (they go first) or left unrated with IMDb 7.5+. addedAt is the
   import order, not a watch date, so it plays no part. Each category gets seeds by its share of what you
   watch, any category with 5+ such titles at least one; two seeds never share a franchise. Within a category
   the order is fixed (rating, then a hash of the id), and rot walks it, so each build brings the next seeds.
   The result alternates categories, starting from a different one each build. */
function _recSeedsPick(rot,n){
  const by={},cnt={};
  watched.forEach(i=>{
    const c=_recCat(i);cnt[c]=(cnt[c]||0)+1;
    if(!/^tt\d+$/.test(i.imdbID||''))return;
    const r=+i.rating||0;
    if(r>=8||(!r&&parseFloat(i.imdbRating)>=7.5))(by[c]=by[c]||[]).push(i);
  });
  const cats=Object.keys(by).sort((a,b)=>cnt[b]-cnt[a]);
  if(!cats.length)return [];
  const h=s=>{let x=2166136261;for(let k=0;k<s.length;k++)x=Math.imul(x^s.charCodeAt(k),16777619);return x>>>0;};
  cats.forEach(c=>by[c].sort((a,b)=>(+b.rating||0)-(+a.rating||0)||h(a.imdbID)-h(b.imdbID)));
  /* quotas: one for every category that has enough, the rest by share (largest remainder) */
  const q={};let left=n;
  cats.forEach(c=>{q[c]=0;if(left>0&&by[c].length>=5){q[c]=1;left--;}});
  const tot=cats.reduce((s,c)=>s+cnt[c],0)||1,want=cats.map(c=>({c,x:cnt[c]/tot*left}));
  want.forEach(w=>{q[w.c]+=Math.floor(w.x);});
  let rest=n-cats.reduce((s,c)=>s+q[c],0);
  want.slice().sort((a,b)=>(b.x%1)-(a.x%1)).forEach(w=>{if(rest>0){q[w.c]++;rest--;}});
  const used=new Set(),picked={};
  cats.forEach(c=>{
    const L=by[c],out=picked[c]=[],need=Math.min(q[c],L.length),start=(rot*Math.max(1,q[c]))%L.length;
    for(let k=0;k<L.length&&out.length<need;k++){
      const i=L[(start+k)%L.length],keys=_recFamKeys([i.title],_collCache[i.imdbID]?.collId);
      if(keys.some(x=>used.has(x)))continue;
      keys.forEach(x=>used.add(x));out.push(i);
    }
  });
  const order=cats.filter(c=>picked[c].length),r0=order.length?rot%order.length:0,ord=[...order.slice(r0),...order.slice(0,r0)];
  const out=[];
  for(let k=0;out.length<n;k++){let any=false;ord.forEach(c=>{const i=picked[c][k];if(i&&out.length<n){out.push(i);any=true;}});if(!any)break;}
  return out;
}
function _seedWhy(s){return s.rating>=8?`Бо ти оцінив його на ${s.rating}/10`:`Бо він є в твоєму «Переглянутому» (IMDb ${s.imdbRating})`;}

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
/* TMDB ids of every list and hidden title, looked up once (ct_tmdbfind is permanent): matching by id is what
   keeps watched and hidden titles off the shelves, title+year is only the fallback. The first run asks about
   the ~800 hidden titles older versions kept with an IMDb id only; later runs only about new titles.
   4 at a time; stops after 5 failures in a row (bad key, offline). Resolves to how many were looked up. */
let _recIdsP=null;
function _recFillIds(){
  if(_recIdsP)return _recIdsP;
  if(!TMDB_KEY||_tmdbBlocked)return Promise.resolve(0);
  const todo=[...new Set([...watched,...watching,...planned,...hidden].map(i=>i.imdbID).filter(id=>/^tt\d+$/.test(id||'')&&!_findCache[id]))];
  if(!todo.length)return Promise.resolve(0);
  return _recIdsP=(async()=>{
    let k=0,n=0,bad=0;
    const worker=async()=>{while(k<todo.length&&bad<5&&!_tmdbBlocked){const id=todo[k++];try{await tmdbFindIds(id);n++;bad=0;}catch(e){bad++;}}};
    try{await Promise.all(Array.from({length:4},worker));}finally{_recIdsP=null;}
    return n;
  })();
}

/* per-seed TMDB recommendations, packed for ct_recsrc: [id, tv?1:0, title, original, date, poster, score, votes, anim?1:0, lang] */
const _recPack=it=>[it.id,it.mt==='tv'?1:0,it.title,it.ot||'',it.date,it.poster||'',Math.round(it.rating*10)/10,it.votes,it.anim?1:0,it.lang||''];
function _recUnpack(a){
  const id=+a[0]||0,mt=a[1]?'tv':'movie',k=`${mt}:${id}`,date=String(a[4]||'');
  return {k,id,mt,title:String(a[2]||''),ot:String(a[3]||''),year:date.slice(0,4),date,poster:a[5]?String(a[5]):null,
    rating:+a[6]||0,votes:+a[7]||0,anim:!!a[8],lang:String(a[9]||''),imdbID:_resolveCache[k]?.imdbID||'',note:''};
}
/* {seed, items} with the quality gate applied but not the "already yours" filter (that one changes daily) */
async function _seedRecs(seed){
  const f=await tmdbFindIds(seed.imdbID);
  const mt=seed.type==='series'?(f.t?'tv':f.m?'movie':null):(f.m?'movie':f.t?'tv':null);
  if(!mt)return null;
  const id=mt==='tv'?f.t:f.m,key=`${mt}:${id}`,c=_recSrc[key];
  if(c&&Date.now()-(c.ts||0)<RECSRC_TTL&&Array.isArray(c.r))return {seed,items:c.r.filter(Array.isArray).map(_recUnpack).filter(it=>it.id)};
  const d=await tmdbFetch(`/${mt}/${id}/recommendations?language=uk-UA`);
  const items=(d?.results||[]).map(r=>_recItem(r,r.media_type==='tv'?'tv':r.media_type==='movie'?'movie':mt)).filter(it=>_recOk(it,it.mt==='tv'?40:120,6.4));
  _recSrc[key]={ts:Date.now(),r:items.map(_recPack)};
  return {seed,items};
}
function _shelfSeed(r,known){
  return {id:'seed-'+r.seed.imdbID,title:`Схоже на «${r.seed.title}»`,why:_seedWhy(r.seed),items:r.items.filter(it=>!known.has(it)).slice(0,18)};
}
function _recLike(names){
  const q=t=>`«${t}»`;
  return 'схоже на '+(names.length===1?q(names[0]):names.length===2?`${q(names[0])} і ${q(names[1])}`:`${q(names[0])}, ${q(names[1])} і ще ${names.length-2}`);
}
/* «Для тебе»: every seed's list merged. A title scores by its place in each list that has it (1 for the top,
   less further down), so one that several seeds point to rises; the TMDB score only breaks near-ties.
   At most two per franchise, so one series of sequels can't fill the shelf. */
function _shelfForYou(res,known){
  const agg=new Map();
  res.forEach(({seed,items})=>items.forEach((it,pos)=>{
    if(known.has(it))return;
    let a=agg.get(it.k);if(!a)agg.set(it.k,a={it,s:0,from:[]});
    if(a.from.includes(seed.title))return;
    a.s+=1-pos/25;a.from.push(seed.title);
  }));
  const sc=a=>a.s+(a.it.rating-7)*.1,fam={},items=[];
  [...agg.values()].sort((x,y)=>sc(y)-sc(x)).forEach(a=>{
    if(items.length>=24)return;
    const keys=_recFamKeys([a.it.ot,a.it.title],a.it.mt==='movie'?_recCollOf(a.it.id):'');
    if(keys.some(k=>(fam[k]||0)>=2))return;
    keys.forEach(k=>{fam[k]=(fam[k]||0)+1;});
    items.push({...a.it,note:_recLike(a.from)});
  });
  return {id:'foryou',title:'Для тебе',why:`Те, що TMDB радить після ${res.length} тайтлів з твого «Переглянутого»: вище те, на що вказують кілька`,items};
}
/* a shelf from /discover pages; throws when every page failed, so that counts as a failure, not as an empty shelf */
async function _shelfDiscover(id,title,why,queries,known,minVotes,minRating,sortBy,keep){
  let bad=0;
  const pages=await Promise.all(queries.map(([mt,q])=>tmdbFetch(`/discover/${mt}?${q}&language=uk-UA`).then(d=>(d?.results||[]).map(r=>_recItem(r,mt))).catch(()=>{bad++;return [];})));
  if(queries.length&&bad===queries.length)throw new Error('TMDB discover failed');
  const s=new Set(); /* one title on two pages: popularity shifts between the requests */
  let items=pages.flat().filter(it=>_recOk(it,minVotes,minRating)&&(!keep||keep(it))&&!known.has(it)&&(s.has(it.k)?false:(s.add(it.k),true)));
  if(sortBy)items.sort(sortBy);
  return {id,title,why,items:items.slice(0,18)};
}

/* manual: started by "Оновити" (failures are then reported with a toast) */
async function buildRecs(manual){
  if(_recBusy)return;_recBusy=true;
  const g=document.getElementById('recsGrid');
  if(!_recs&&g)g.innerHTML='<div class="spinner">Підбираю рекомендації…</div>';
  document.getElementById('recsRefresh')?.classList.add('busy');
  try{
    let net=!!TMDB_KEY&&!_tmdbBlocked;
    if(net){
      /* the build waits for the id lookup up to 15 s; the rest finishes in the background and the shelves are re-filtered */
      const fill=_recFillIds();
      await Promise.race([fill,new Promise(ok=>setTimeout(ok,15000))]);
      fill.then(n=>{if(n)renderRecs();});
      net=!_tmdbBlocked;
    }
    _recCollIdx=null;
    const known=_recKnown(),rot=((_recs?.seedRot)??-1)+1;
    const franchise=_shelfFranchises(known);
    let ordered,jobs=0,fails=0;
    if(net){
      const soft=p=>{jobs++;return p.catch(()=>{fails++;return null;});};
      const since=new Date(Date.now()-548*864e5).toISOString().slice(0,10); /* ~18 months */
      const top=_topGenreIds(3),tvTop=_tvGenres(top),seeds=_recSeedsPick(rot,13);
      /* rot turns the pages of the broad shelves too, so "Оновити" changes them, not only the seed shelves */
      const fp=1+rot%3,ap=1+(rot*2)%10,sp=1+(rot*2)%6;
      const [sr,fresh,anim,anime,animTv,trend]=await Promise.all([
        Promise.all(seeds.map(s=>soft(_seedRecs(s)))),
        top.length?soft(_shelfDiscover('fresh','Свіжі релізи у твоїх жанрах',`За останні півтора року · ${top.map(_genreNameById).join(', ')}`,
          [['movie',`with_genres=${top.join('|')}&primary_release_date.gte=${since}&vote_count.gte=150&sort_by=popularity.desc&page=${fp}`],
           ...(tvTop.length?[['tv',`with_genres=${tvTop.join('|')}&first_air_date.gte=${since}&vote_count.gte=60&sort_by=popularity.desc&page=${fp}`]]:[])],
          known,60,6.5,(a,b)=>b.votes-a.votes)):null,
        /* sorted by score, not popularity: the most-voted ones are all in your lists already */
        _catCount('cartoon')+_catCount('anime')>=30?soft(_shelfDiscover('anim','Визнана анімація, яку ти ще не бачив','Найвище оцінені анімаційні фільми на TMDB (від 7.2, щонайменше 300 голосів)',
          [ap,ap+1].map(p=>['movie',`with_genres=16&vote_average.gte=7.2&vote_count.gte=300&sort_by=vote_average.desc&page=${p}`]),known,300,7.2,(a,b)=>b.rating-a.rating)):null,
        _catCount('anime')>=20?soft(_shelfDiscover('anime','Аніме-серіали з високими оцінками','Японська анімація з оцінкою від 7.8 на TMDB',
          [sp,sp+1].map(p=>['tv',`with_genres=16&with_original_language=ja&vote_average.gte=7.8&vote_count.gte=300&sort_by=vote_count.desc&page=${p}`]),known,300,7.8,(a,b)=>b.rating-a.rating)):null,
        /* western and other non-Japanese animated series: TMDB can't exclude a language, so it is filtered here */
        _catCount('cartoon')>=30?soft(_shelfDiscover('animtv','Анімаційні серіали з високими оцінками','Не аніме: анімаційні серіали з оцінкою від 7.5 на TMDB',
          [sp,sp+1,sp+2].map(p=>['tv',`with_genres=16&vote_average.gte=7.5&vote_count.gte=150&sort_by=vote_count.desc&page=${p}`]),known,150,7.5,(a,b)=>b.rating-a.rating,it=>it.lang!=='ja')):null,
        soft(tmdbFetch('/trending/all/week?language=uk-UA').then(d=>({id:'trend',title:'Популярне цього тижня',why:'Тренди TMDB без того, що вже є у твоїх списках',
          items:(d?.results||[]).filter(r=>r.media_type==='movie'||r.media_type==='tv').map(r=>_recItem(r)).filter(it=>it.poster&&it.votes>=50&&!known.has(it)).slice(0,18)}))),
      ]);
      _recSrcSave();
      /* the first three seeds that brought something get a shelf each; the others are merged into «Для тебе» */
      const ok=sr.filter(r=>r&&r.items.length),mine=ok.slice(0,3).map(r=>_shelfSeed(r,known));
      /* interleave so the page alternates "because of X" with broader shelves */
      ordered=[ok.length>=5?_shelfForYou(ok.slice(3),known):null,franchise,mine[0],fresh,mine[1],anim,mine[2],_shelfPeople(known),anime,animTv,trend];
    }else ordered=[franchise,_shelfPeople(known)];
    /* a title shows up only in the first shelf that has it */
    const seen=new Set();
    const clean=ordered.filter(Boolean).map(s=>({...s,items:s.items.filter(i=>seen.has(i.k)?false:(seen.add(i.k),true))})).filter(s=>s.items.length);
    /* with a key, but TMDB unreachable or every request failed: keep the previous shelves rather than 24 h of the two offline ones */
    const dead=!!TMDB_KEY&&(!net||(jobs>0&&fails>=jobs));
    if(dead&&_recs?.shelves?.length){if(manual)toast('TMDB зараз не відповідає, тож лишаю попередню підбірку. Спробуй трохи згодом','err',4200);}
    else{
      _recs={v:REC_V,ts:Date.now(),seedRot:rot,shelves:clean};
      if(dead||(fails&&fails*4>=jobs))_recs.partial=true; /* a quarter or more failed: redone in 30 min, not 24 h */
      _recsSave();
      if(dead&&manual)toast('TMDB зараз не відповідає: показую лише франшизи й людей','err',4200);
    }
  }catch(e){console.warn('[CineTrack] recommendations:',e);if(manual)toast('Не вдалося зібрати підбірку, спробуй ще раз','err');}
  finally{
    _recBusy=false;
    document.getElementById('recsRefresh')?.classList.remove('busy');
    renderRecs();
  }
}

/* entry point from the tab */
function openRecs(){
  _recView=_recView==='genre'?'picks':_recView;
  if(!_recs||_recs.v!==REC_V||Date.now()-(_recs.ts||0)>(_recs.partial?RECS_RETRY:RECS_TTL))buildRecs();
  else _recFillIds().then(n=>{if(n)renderRecs();}); /* titles added elsewhere since: their ids, then re-filter */
  renderRecs();
}
async function refreshRecs(){
  _recOpen.clear();_recView='picks';const gp=document.getElementById('genrePick');if(gp)gp.value='';
  /* "Оновити" means try TMDB again: three network blips used to switch it off until the page was reloaded */
  if(TMDB_KEY&&_tmdbBlocked){_tmdbBlocked=false;_tmdbNetFails=0;}
  await buildRecs(true);
}

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
  openMenu(ev,[{icon:'check',label:'Переглянуто',fn:'recAct',args:[k,'watched']},{icon:'play',label:'Дивлюсь',fn:'recAct',args:[k,'watching']},
    {icon:'bookmark',label:'Запланувати',fn:'recAct',args:[k,'planned']},'-',{icon:'eye-off',label:'Не цікаво, сховати',fn:'recAct',args:[k,'hide']}]);
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
  const tv=_TV_GENRE[gid]; /* no series genre for Thriller, Horror, Romance…: films only */
  const s=await _shelfDiscover('genre','','',[1,2].flatMap(p=>[['movie',`with_genres=${gid}&vote_count.gte=500&sort_by=popularity.desc&page=${p}`],...(tv?[['tv',`with_genres=${tv}&vote_count.gte=200&sort_by=popularity.desc&page=${p}`]]:[])]),known,200,6.5).catch(()=>({items:[]}));
  if(_recGenreState?.name!==name)return; /* switched again meanwhile */
  _recGenreState.items=s.items.concat([]).slice(0,48);_recGenreState.loaded=true;renderRecs();
}
function recView(v){_recView=v;if(v!=='genre'){const gp=document.getElementById('genrePick');if(gp)gp.value='';}renderRecs();}
function recType(t){_recType=t;renderRecs();}
function recShelfMore(id){_recOpen.has(id)?_recOpen.delete(id):_recOpen.add(id);renderRecs();}

/* _recCard and renderRecs live in recs-view.js (the look); this file builds what goes in */
const _recTypeOk=it=>_recType==='all'||(_recType==='anim'?it.anim:(!it.anim&&it.mt===_recType));

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
    const href=esc(/^tt\d+$/.test(h.imdbID||'')?`https://www.imdb.com/title/${h.imdbID}/`:/^(movie|tv):\d+$/.test(h.tmdb||'')?`https://www.themoviedb.org/${h.tmdb.replace(':','/')}`:'#');
    const year=found?.year||h.year||'';
    return `<article class="pc"><div class="pc-art"><a href="${href}" target="_blank" rel="noopener" tabindex="-1"><img src="${esc(ps(poster)||BLANK)}" alt="" loading="lazy" data-fb></a></div>
      <div class="pc-t"><a href="${href}" target="_blank" rel="noopener">${esc(h.title)}</a></div>
      <div class="pc-m">${year?`<span class="num">${esc(year)}</span>`:''}${found?`<span>${tl(found.type)}</span>`:''}</div>
      <div class="pc-status"><button class="pc-act" data-act="unhide" data-args="${A((idx))}">${ic('eye')}Повернути</button></div></article>`;
  });
}
function unhide(idx){hidden.splice(idx,1);save();renderRecs();}

