/* ═══════════════════════════════════════════════════════════════
   RECS VIEW (1.13): genres as picture tiles on top, shelves as horizontal strips,
   «+ Додати» and «✕» right on the poster. Only the look: what goes into the shelves
   is built in recs.js. Loaded after recs.js, so these definitions are the ones used. */

/* genre tiles: Ukrainian name → TMDB genre (the key is what recGenre() expects) */
const REC_GENRES=[['Action','Бойовик'],['Adventure','Пригоди'],['Comedy','Комедія'],['Drama','Драма'],['Sci-Fi','Фантастика'],['Fantasy','Фентезі'],
  ['Animation','Анімація'],['Thriller','Трилер'],['Crime','Кримінал'],['Horror','Жахи'],['Romance','Мелодрама'],['Family','Сімейне'],
  ['Mystery','Детектив'],['History','Історичне'],['War','Воєнне'],['Documentary','Документальне']];
/* util.js (TMDB_GENRES) loads after this file: filter when used, not at load time */
const _recGenresOk=()=>REC_GENRES.filter(([k])=>TMDB_GENRES[k]);
/* one backdrop per genre, fetched once and kept for a week */
let _recTiles=_lsJSON('ct_rec_gtiles',{});
let _recTilesBusy=false;
async function _recTilesFill(){
  if(_recTilesBusy||!TMDB_KEY||_tmdbBlocked)return;
  if(_recTiles.ts&&Date.now()-_recTiles.ts<7*864e5&&_recGenresOk().every(([k])=>_recTiles[k]!==undefined))return;
  _recTilesBusy=true;
  const todo=_recGenresOk().filter(([k])=>_recTiles[k]===undefined||!_recTiles.ts||Date.now()-_recTiles.ts>=7*864e5);
  for(let i=0;i<todo.length;i+=4){
    await Promise.all(todo.slice(i,i+4).map(async([k])=>{
      try{const d=await tmdbFetch(`/discover/movie?with_genres=${TMDB_GENRES[k]}&vote_count.gte=3000&sort_by=popularity.desc`);
        _recTiles[k]=(d?.results||[]).find(r=>r.backdrop_path)?.backdrop_path||'';}catch(e){}
    }));
  }
  _recTiles.ts=Date.now();_lsSet('ct_rec_gtiles',JSON.stringify(_recTiles));_recTilesBusy=false;
  _recTilesRender();
}
function _recTilesRender(){
  const el=document.getElementById('recsGenres');if(!el)return;
  const cur=_recView==='genre'?_recGenreState?.name:_recView==='picks'?'_me':'';
  const n=_recs?.shelves?.length||0;
  el.innerHTML=`<button class="rg-t rg-me${cur==='_me'?' on':''}" aria-pressed="${cur==='_me'}" data-act="recView" data-args="[&quot;picks&quot;]">
      <span class="rg-ic">${ic('spark')}</span><b>Для тебе</b><small>${n?`${n} ${n%10===1&&n%100!==11?'підбірка':n%10>=2&&n%10<=4&&(n%100<12||n%100>14)?'підбірки':'підбірок'}`:'підбірка'}</small></button>`+
    _recGenresOk().map(([k,ua])=>{const bd=_recTiles[k];return `<button class="rg-t${cur===k?' on':''}" aria-pressed="${cur===k}" data-act="recGenre" data-args="${A(k)}">
      ${bd?`<img src="${esc(_tsImg(bd,'w500'))}" alt="" loading="lazy">`:''}<b>${ua}</b></button>`;}).join('');
  if(!_recTilesBusy)_recTilesFill();
}
const _recGenreUa=k=>(REC_GENRES.find(([e])=>e===k)||[k,k])[1];

function _recCard(it){
  const href=esc(/^tt\d+$/.test(it.imdbID||'')?`https://www.imdb.com/title/${it.imdbID}/`:`https://www.themoviedb.org/${it.mt==='tv'?'tv':'movie'}/${+it.id||0}`);
  const poster=esc(String(it.poster||'').startsWith('http')?ps(it.poster)||BLANK:_tsImg(it.poster,'w342')||BLANK);
  const score=it.imdbRating?`IMDb ${esc(it.imdbRating)}`:it.rating?`TMDB ${it.rating.toFixed(1)}`:'';
  const meta=[it.year?esc(it.year):'',_recTypeLabel(it),score].filter(Boolean).join(' · ');
  const open=`href="${href}" target="_blank" rel="noopener" data-act="_tsClickT" data-args="${A('$ev',`${it.mt}`,(it.id))}"`;
  return `<article class="rv-c" id="rc-${esc(String(it.k).replace(':','-'))}">
    <div class="rv-art"><a ${open} tabindex="-1"><img src="${poster}" alt="" loading="lazy" data-fb></a>
      <button class="rv-x" data-act="recAct" data-args="${A(`${it.k}`,'hide')}" title="Не цікаво" aria-label="Не цікаво: ${esc(it.title)}">${ic('minus')}</button>
      <button class="fa-lbl miss rv-add" data-act="recMenu" data-args="${A('$ev',`${it.k}`)}" aria-label="Додати: ${esc(it.title)}">${ic('plus')}Додати</button></div>
    <div class="fa-cap"><a class="fa-t" ${open}>${esc(it.title)}</a><span>${meta}</span>${it.note?`<em title="${esc(it.note)}">${esc(it.note)}</em>`:''}</div>
  </article>`;
}

function renderRecs(){
  const g=document.getElementById('recsGrid');if(!g)return;
  document.getElementById('rv-hidden')?.classList.toggle('on',_recView==='hidden');
  const hn=document.getElementById('rvHiddenN');if(hn)hn.textContent=hidden.length||'';
  const sub=document.getElementById('recsSub'),bar=document.getElementById('recsBar');
  _recTilesRender();
  if(_recView==='hidden'){if(sub)sub.textContent='Тайтли, які ти сховав. Вони не з\'являтимуться в підбірках';if(bar)bar.innerHTML='';showHidden();return;}
  /* shelves are cached for 24h: whatever was added/hidden since must not show up again */
  const known=_recKnown(),fresh=it=>!known.has(it);
  const pool=(_recView==='genre'?(_recGenreState?.items||[]):(_recs?.shelves||[]).flatMap(s=>s.items)).filter(fresh);
  const cnt={all:pool.length,movie:0,tv:0,anim:0};pool.forEach(i=>{cnt[i.anim?'anim':i.mt]++;});
  const chips=pool.length?`<div class="cat-seg" role="group" aria-label="Тип">${[['all','Усе'],['movie','Фільми'],['tv','Серіали'],['anim','Анімація']].filter(([k])=>k==='all'||cnt[k]).map(([k,l])=>`<button class="cat-chip${_recType===k?' on':''}" data-act="recType" data-args="${A(`${k}`)}">${l}<span class="num">${cnt[k]}</span></button>`).join('')}</div>`:'';
  if(_recView==='genre'){
    const st=_recGenreState;
    if(sub)sub.textContent='';
    if(bar)bar.innerHTML=`<div class="rg-head"><h2>${esc(_recGenreUa(st?.name||''))}</h2><span>популярне, чого немає у твоїх списках</span></div>${chips}`;
    if(!st?.loaded){g.innerHTML='<div class="spinner" role="status">Шукаю популярне в жанрі…</div>';return;}
    const items=st.items.filter(fresh).filter(_recTypeOk);
    g.innerHTML=items.length?`<div class="rv-grid">${items.map(_recCard).join('')}</div>`:`<div class="empty"><span class="empty-icon">${ic('search')}</span><div class="empty-txt">Усе популярне в цьому жанрі вже є у твоїх списках</div></div>`;
    return;
  }
  if(bar)bar.innerHTML=chips;
  if(sub){
    if(_recs){const h=Math.round((Date.now()-_recs.ts)/36e5);sub.textContent=`оновлено ${h<1?'щойно':h<24?h+' год тому':Math.round(h/24)+' дн тому'}`;}
    else sub.textContent='';
  }
  if(!_recs){if(!_recBusy)g.innerHTML='';return;}
  const shelves=_recs.shelves.map(s=>({...s,items:s.items.filter(fresh).filter(_recTypeOk)})).filter(s=>s.items.length);
  const noKey=!TMDB_KEY?`<div class="recs-note">${ic('info')}<span>Більшість підбірок будує TMDB. Додай безкоштовний ключ у Налаштуваннях, щоб їх побачити.</span></div>`:'';
  if(!shelves.length){g.innerHTML=noKey+`<div class="empty"><span class="empty-icon">${ic('spark')}</span><div class="empty-txt">Поки нічого не підібралось. Спробуй «Оновити» або інший тип</div></div>`;return;}
  /* each shelf is a horizontal strip; «Усі N» unfolds it into a grid */
  g.innerHTML=noKey+shelves.map(s=>{
    const open=_recOpen.has(s.id);
    return `<section class="rv-shelf" aria-labelledby="sh-${s.id}">
      <div class="rv-head"><div><h2 id="sh-${s.id}">${esc(s.title)}</h2><p>${esc(s.why||'')}</p></div>
        ${s.items.length>5?`<button class="link-btn" data-act="recShelfMore" data-args="${A(`${s.id}`)}">${open?'Згорнути':`Усі ${s.items.length} →`}</button>`:''}</div>
      <div class="${open?'rv-grid':'rv-strip'}">${s.items.map(_recCard).join('')}</div>
    </section>`;}).join('');
}
