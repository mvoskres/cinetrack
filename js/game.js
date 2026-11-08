/* ═══════════════════════════════════════════════════════════════
   GAME — "Впізнай кадр". Picks a random watched title, shows a
   text-free TMDB backdrop, offers 4 title choices. Runs until a
   wrong answer; best streak is saved permanently (and travels with
   backups, like everything else). Reuses tmdbFetch (already has its
   own cache/rate-limit handling) — no separate network layer needed. */
let _gameBackdropCache=_lsJSON('ct_gamebackdrops',{}); /* imdbID -> {backdrops:[paths],ts} | {none:true,ts} */
function _gameCacheSave(){_lsSet('ct_gamebackdrops',JSON.stringify(_gameBackdropCache));}
/* at most 12 frames per title: The Green Mile alone had 124 paths, ~1.1M chars across the whole list */
const GAME_FRAMES=12;
{let t=false;for(const k in _gameBackdropCache){const f=_gameBackdropCache[k].backdrops;if(f&&f.length>GAME_FRAMES){_gameBackdropCache[k].backdrops=f.slice(0,GAME_FRAMES);t=true;}}if(t)_gameCacheSave();}
/* records per game type: frame keeps its old keys, actor has its own */
const _GB_KEYS={frame:['ct_game_highscore','ct_game_roundbest'],actor:['ct_game_actor_hs','ct_game_actor_rb']};
const _gameBest={};for(const t in _GB_KEYS)_gameBest[t]={streak:parseInt(localStorage.getItem(_GB_KEYS[t][0])||'0'),round:parseInt(localStorage.getItem(_GB_KEYS[t][1])||'0')};
function _gb(){return _gameBest[_game.type]||_gameBest.frame;}
function _gameBestSave(t=_game.type){const b=_gameBest[t];_lsSet(_GB_KEYS[t][0],String(b.streak));_lsSet(_GB_KEYS[t][1],String(b.round));}
/* game types: «Кадр» guesses the title from a frame, «Актор» guesses where the shown actor played */
const GAME_TYPES={frame:{name:'Кадр',sub:'Кадр без тексту з того, що ти переглянув. Обери назву з чотирьох схожих варіантів',unit:'кадрів',load:'Завантажую кадр…'},
  actor:{name:'Актор',sub:'Фото актора з головних ролей у тому, що ти переглянув. Вгадай, де він грав',unit:'акторів',load:'Шукаю актора…'}};
const GAME_ROUND=10;
let _game={type:['frame','actor'].includes(localStorage.getItem('ct_game_type'))?localStorage.getItem('ct_game_type'):'frame',mode:'streak',filter:'all',pool:[],q:0,score:0,streak:0,recent:[],log:[],answered:true,current:null,next:null};

/* Ukrainian titles for the options: one TMDB /find call per title (it returns the localized title), kept for good.
   '' = TMDB has no title for it; the original title is used then */
let _gameUk=_lsJSON('ct_game_uk',{});
async function _gameUkName(item){
  if(!Object.hasOwn(_gameUk,item.imdbID)){
    try{
      const d=await tmdbFetch(`/find/${item.imdbID}?external_source=imdb_id&language=uk-UA`);
      if(!d)return item.title; /* network or key problem: ask again next time */
      const m=d.movie_results?.[0],t=d.tv_results?.[0];
      const r=item.type==='series'?(t||m):(m||t);
      _gameUk[item.imdbID]=((r&&(r.title||r.name))||'').trim();
      _lsSet('ct_game_uk',JSON.stringify(_gameUk));
    }catch(e){return item.title;}
  }
  return _gameUk[item.imdbID]||item.title;
}
function _gameEligible(){return watched.filter(i=>i.imdbID&&i.title&&(i.type==='movie'||i.type==='series')&&(_game.type!=='actor'||_gameKind(i)!=='anim'));} /* animation: voice actors only */
function _gameKind(i){const c=i.customCategory||i.type;return c==='anime'||c==='cartoon'?'anim':i.type==='series'?'series':'movie';}

function loadGameTab(){
  const el=document.getElementById('gameStart');if(!el)return;
  const all=_gameEligible(),cnt={all:all.length,movie:0,series:0,anim:0};all.forEach(i=>cnt[_gameKind(i)]++);
  if(_game.filter!=='all'&&cnt[_game.filter]<4)_game.filter='all';
  const n=cnt[_game.filter];
  const T=GAME_TYPES[_game.type];
  const h=document.querySelector('#tab-game .section-title'),sb=document.querySelector('#tab-game .recs-sub');
  if(h)h.textContent=`Впізнай ${_game.type==='actor'?'актора':'кадр'}`;if(sb)sb.textContent=T.sub;
  const blocked=!TMDB_KEY||_tmdbBlocked?'Потрібен TMDB API-ключ у налаштуваннях, щоб підтягувати кадри й фото.':n<4?`Для гри потрібно щонайменше 4 переглянуті тайтли, а тут ${n}.`:'';
  el.innerHTML=`
    <div class="seg game-type" role="group" aria-label="Гра">${Object.entries(GAME_TYPES).map(([k,v])=>`<button class="seg-b${_game.type===k?' on':''}" aria-pressed="${_game.type===k}" data-act="setGameType" data-args="${A(`${k}`)}">${v.name}</button>`).join('')}</div>
    <div class="cat-seg game-filter" role="group" aria-label="З чого брати кадри">${[['all','Усе'],['movie','Фільми'],['series','Серіали'],['anim','Анімація']].filter(([k])=>k==='all'||cnt[k]>=4)
      .map(([k,l])=>`<button class="cat-chip${_game.filter===k?' on':''}" data-act="setGameFilter" data-args="${A(`${k}`)}">${l}<span class="num">${cnt[k]}</span></button>`).join('')}</div>
    ${blocked?`<div class="recs-note">${ic('info')}<span>${blocked}</span></div>`:''}
    <div class="game-modes">
      <button class="game-mode" data-act="startGame" data-args="[&quot;streak&quot;]" ${blocked?'disabled':''}>
        <span class="game-mode-ic">${ic('spark')}</span>
        <span class="game-mode-name">Серія</span>
        <span class="game-mode-desc">${_game.type==='actor'?'Актори':'Кадри'} йдуть, доки не помилишся</span>
        <span class="game-mode-best">Рекорд: <b class="num">${_gb().streak}</b> поспіль</span>
      </button>
      <button class="game-mode" data-act="startGame" data-args="[&quot;round&quot;]" ${blocked?'disabled':''}>
        <span class="game-mode-ic">${ic('frame')}</span>
        <span class="game-mode-name">Раунд з ${GAME_ROUND} ${T.unit}</span>
        <span class="game-mode-desc">Помилки не зупиняють гру, рахунок у кінці</span>
        <span class="game-mode-best">Найкраще: <b class="num">${_gb().round}</b> з ${GAME_ROUND}</span>
      </button>
    </div>
    <p class="game-keys">Клавіші: <kbd>1</kbd>–<kbd>4</kbd> відповідь · <kbd>Enter</kbd> далі · <kbd>Esc</kbd> вийти</p>`;
}
function setGameFilter(k){_game.filter=k;loadGameTab();}
function setGameType(k){if(!GAME_TYPES[k])return;_game.type=k;_game.next=null;_lsSet('ct_game_type',k);loadGameTab();}

/* bumped on every start and close: an answer that arrives for an older game must not paint over the current one */
let _gameRun=0;
function startGame(mode){
  _gameRun++;
  mode=mode||_game.mode;
  const pool=_gameEligible().filter(i=>_game.filter==='all'||_gameKind(i)===_game.filter);
  if(pool.length<4)return;
  _game={..._game,mode,pool,q:0,score:0,streak:0,recent:[],log:[],answered:true,current:null,next:null};
  document.getElementById('gameTitle').textContent=(mode==='round'?`Раунд з ${GAME_ROUND} ${GAME_TYPES[_game.type].unit}`:'Серія')+(_game.type==='actor'&&mode!=='round'?' · Актор':'');
  document.getElementById('gameModalBg').classList.remove('hidden');
  document.getElementById('gameOver').classList.add('hidden');
  document.getElementById('gamePlay').classList.remove('hidden');
  gameNextQuestion();
}
function closeGameModal(){_gameRun++;document.getElementById('gameModalBg').classList.add('hidden');_game.answered=true;loadGameTab();}

function _gameHud(){
  const h=document.getElementById('gameHud');if(!h)return;
  if(_game.mode==='round'){
    const dots=Array.from({length:GAME_ROUND},(_,k)=>{const l=_game.log[k];return `<i class="${l?(l.ok?'ok':'bad'):k===_game.q-1?'cur':''}"></i>`;}).join('');
    h.innerHTML=`<span class="game-dots" aria-label="Кадр ${_game.q} з ${GAME_ROUND}, правильно ${_game.score}">${dots}</span><span class="num">${_game.score}/${GAME_ROUND}</span>`;
  }else h.innerHTML=`<span>Серія <b class="num">${_game.streak}</b></span><span class="game-hud-dim">рекорд <span class="num">${_gb().streak}</span></span>`;
}

async function _gameGetBackdrop(item){
  const cached=_gameBackdropCache[item.imdbID];
  if(cached){
    if(cached.none)return null;
    if(cached.backdrops?.length)return`https://image.tmdb.org/t/p/w780${cached.backdrops[Math.floor(Math.random()*cached.backdrops.length)]}`;
  }
  try{
    const f=await tmdbFindIds(item.imdbID);
    const isSeries=item.type==='series';
    const kind=isSeries?(f.t?'tv':f.m?'movie':null):(f.m?'movie':f.t?'tv':null);
    if(!kind){_gameBackdropCache[item.imdbID]={none:true,ts:Date.now()};_gameCacheSave();return null;}
    const imgData=await tmdbFetch(`/${kind}/${kind==='tv'?f.t:f.m}/images`);
    const all=imgData?.backdrops||[];
    /* text-free frames first (no language = no title lettering), best rated first */
    const clean=all.filter(b=>!b.iso_639_1),use=(clean.length?clean:all).slice().sort((a,b)=>(b.vote_average||0)-(a.vote_average||0)).map(b=>b.file_path).slice(0,GAME_FRAMES);
    if(!use.length){_gameBackdropCache[item.imdbID]={none:true,ts:Date.now()};_gameCacheSave();return null;}
    _gameBackdropCache[item.imdbID]={backdrops:use,ts:Date.now()};_gameCacheSave();
    return`https://image.tmdb.org/t/p/w780${use[Math.floor(Math.random()*use.length)]}`;
  }catch(e){return null;}
}
/* next title with a usable frame, avoiding the last ten shown; the image is fetched into the cache */
async function _gamePick(){
  const fresh=_game.pool.filter(p=>!_game.recent.includes(p.imdbID)&&p.imdbID!==_game.current?.item.imdbID);
  const src=fresh.length?fresh:_game.pool;
  const tried=new Set();
  for(let i=0;i<10&&tried.size<src.length;i++){
    const cand=src[Math.floor(Math.random()*src.length)];
    if(tried.has(cand.imdbID))continue;tried.add(cand.imdbID);
    const url=await _gameGetBackdrop(cand);
    if(url){
      const items=[cand,..._gameDistractors(cand)];
      const [,names]=await Promise.all([new Promise(r=>{const im=new Image();im.onload=im.onerror=r;im.src=url;}),Promise.all(items.map(_gameUkName))]);
      const opts=items.map((it,k)=>({id:it.imdbID,name:names[k]}));
      /* two options that read the same in Ukrainian would be unanswerable: fall back to the originals for those */
      opts.forEach((o,k)=>{if(opts.some((p,j)=>j!==k&&p.name===o.name))o.name=items[k].title;});
      return{item:cand,url,name:opts[0].name,opts};
    }
  }
  return null;
}
/* wrong options look like the right one: same kind, nearby years, a shared genre —
   but never another part of the same franchise (near-identical frames) */
function _gameDistractors(item,n=3){
  const kind=_gameKind(item),y=parseInt(item.year)||0,g=new Set((item.genre||'').split(',').map(x=>x.trim()).filter(Boolean));
  const coll=_collCache[item.imdbID]?.collId;
  const ranked=_gameEligible().filter(p=>p.title!==item.title&&p.imdbID!==item.imdbID&&!(coll&&_collCache[p.imdbID]?.collId===coll))
    .map(p=>({p,s:(_gameKind(p)===kind?4:0)+(Math.abs((parseInt(p.year)||0)-y)<=8?2:0)+((p.genre||'').split(',').some(x=>g.has(x.trim()))?1:0)+Math.random()*1.5}))
    .sort((a,b)=>b.s-a.s).slice(0,14);
  const seen=new Set(),out=[];
  for(const r of _gameShuffle(ranked)){if(seen.has(r.p.title))continue;seen.add(r.p.title);out.push(r.p);if(out.length===n)break;}
  return out;
}
function _gameShuffle(arr){const a=arr.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}

async function gameNextQuestion(){
  if(_game.mode==='round'&&_game.q>=GAME_ROUND){gameEnd();return;}
  const run=_gameRun;
  _game.q++;_game.answered=true;
  document.getElementById('gameReveal').innerHTML='';
  document.getElementById('gameOpts').innerHTML='';
  const sw=document.getElementById('gameShotWrap');sw.classList.toggle('portrait',_game.type==='actor');sw.innerHTML=`<div class="spinner">${GAME_TYPES[_game.type].load}</div>`;
  _gameHud();
  const pick=await(_game.next||_gamePickAny());
  if(run!==_gameRun)return; /* closed or restarted while loading */
  _game.next=null;
  if(document.getElementById('gameModalBg').classList.contains('hidden'))return;
  if(!pick){gameEnd(true);return;}
  _game.current=pick;
  _game.recent.push(pick.item.imdbID);if(_game.recent.length>Math.min(10,_game.pool.length-1))_game.recent.shift();
  document.getElementById('gameShotWrap').innerHTML=`<img src="${esc(pick.url)}" alt="${pick.actor?'Актор, якого треба впізнати':'Кадр, який треба впізнати'}">`;
  const opts=_gameShuffle(pick.opts);
  const box=document.getElementById('gameOpts');box.innerHTML='';
  opts.forEach((o,k)=>{const b=document.createElement('button');b.className='game-opt';b.dataset.id=o.id;
    b.innerHTML=`<kbd>${k+1}</kbd><span></span>`;b.querySelector('span').textContent=o.name;b.onclick=()=>_gameAnswer(b);box.appendChild(b);});
  _game.answered=false;
  _game.next=_gamePickAny(); /* the next one loads while you think */
}

function _gameAnswer(btn){
  if(_game.answered)return;_game.answered=true;
  const item=_game.current.item,act=_game.current.actor,name=_game.current.name||item.title,ok=btn.dataset.id===item.imdbID;
  document.querySelectorAll('#gameOpts .game-opt').forEach(b=>{b.disabled=true;if(b.dataset.id===item.imdbID)b.classList.add('right');});
  if(!ok)btn.classList.add('wrong');
  _game.log.push({item,ok,name,actor:act?.name,actorId:act?.id});
  const orig=name!==item.title?` <small class="game-orig">(${esc(item.title)})</small>`:'';
  if(ok){_game.score++;_game.streak++;}
  if(_game.mode==='streak'&&_game.streak>_gb().streak){_gb().streak=_game.streak;_gameBestSave();}
  _gameHud();
  const last=_game.mode==='round'?_game.q>=GAME_ROUND:!ok;
  document.getElementById('gameReveal').innerHTML=`
    <img src="${esc(ps(item.poster)||BLANK)}" alt="" data-fb>
    <div class="game-reveal-txt"><div><b>${ok?'Так!':'Ні.'}</b> ${act?`<a href="https://www.themoviedb.org/person/${encodeURIComponent(act.id)}" target="_blank" rel="noopener">${esc(act.name)}</a>${act.character?` (${esc(act.character)})`:''} у `:'Це '}<a href="${imdbHref(item)}" target="_blank" rel="noopener">${esc(name)}</a>${orig}</div>
      <span>${esc(item.year||'')} · ${catLabel(item.customCategory||item.type)}${item.imdbRating?` · IMDb ${esc(item.imdbRating)}`:''}</span></div>
    <button class="btn primary" id="gameNextBtn" data-act="${last?'gameEnd':'gameNextQuestion'}">${last?'Підсумок':'Далі'} <kbd>Enter</kbd></button>`;
  document.getElementById('gameNextBtn').focus({preventScroll:true});
}

function gameEnd(noMoreImages){
  _game.answered=true;
  if(_game.mode==='round'&&_game.score>_gb().round&&_game.q>=GAME_ROUND){_gb().round=_game.score;_gameBestSave();}
  document.getElementById('gamePlay').classList.add('hidden');
  const over=document.getElementById('gameOver');over.classList.remove('hidden');
  const round=_game.mode==='round';
  const record=round?_game.score>=_gb().round&&_game.score>0&&_game.q>=GAME_ROUND:_game.streak>0&&_game.streak>=_gb().streak;
  const head=noMoreImages?(_game.type==='actor'?'Актори закінчились':'Кадри закінчились'):round?`${_game.score} з ${GAME_ROUND}`:`Серія: ${_game.streak}`;
  const sub=noMoreImages?(_game.type==='actor'?'Не вдалося знайти фото акторів':'Не вдалося знайти кадри')+' для решти тайтлів у цьому наборі.':record?'Новий рекорд!':round?`Найкраще: ${_gb().round} з ${GAME_ROUND}`:`Рекорд лишається ${_gb().streak}`;
  const log=_game.log.slice(-GAME_ROUND);
  over.innerHTML=`
    <div class="game-over-ic">${ic(noMoreImages?'frame':record?'trophy':_game.score?'check':'film')}</div>
    <div class="game-over-title">${head}</div>
    <div class="game-over-sub">${sub}</div>
    ${log.length?`<ol class="game-log">${log.map(l=>`<li class="${l.ok?'ok':'bad'}">${ic(l.ok?'check':'minus')}<a href="${imdbHref(l.item)}" target="_blank" rel="noopener">${l.actor?`${esc(l.actor)} · `:''}${esc(l.name||l.item.title)}</a><span class="num">${esc(l.item.year||'')}</span></li>`).join('')}</ol>`:''}
    <div class="game-over-btns">
      <button class="btn primary" id="gameAgainBtn" data-act="startGame">${ic('refresh')}Ще раз <kbd>Enter</kbd></button>
      <button class="btn" data-act="closeGameModal">Закрити</button>
    </div>`;
  _gameHud();
  document.getElementById('gameAgainBtn').focus({preventScroll:true});
}

/* keyboard: 1–4 answer, Enter next / again, Esc close */
document.addEventListener('keydown',e=>{
  if(document.getElementById('gameModalBg')?.classList.contains('hidden'))return;
  if(e.key==='Escape'){closeGameModal();return;}
  if(/^[1-4]$/.test(e.key)&&!_game.answered){const b=document.querySelectorAll('#gameOpts .game-opt')[+e.key-1];if(b){e.preventDefault();_gameAnswer(b);}return;}
  if(e.key==='Enter'&&document.activeElement?.tagName!=='BUTTON'){const n=document.getElementById('gameNextBtn')||document.getElementById('gameAgainBtn');if(n&&n.offsetParent){e.preventDefault();n.click();}}
});


/* ── ACTOR game: a lead actor's photo from a watched title; the options are titles, and none of the wrong ones
   has that actor in its cast (checked against each title's cast, cached like the frames) ── */
let _gameCast=_lsJSON('ct_game_cast',{}); /* imdbID -> {ids:[up to 30 person ids], top:[[id,name,character,profile]] up to 6} | {none:true,ts} */
async function _gameGetCast(item){
  const c=_gameCast[item.imdbID];
  if(c&&(c.top||(c.ts&&Date.now()-c.ts<7*864e5)))return c.top?c:null;
  try{
    const f=await tmdbFindIds(item.imdbID);
    const kind=item.type==='series'?(f.t?'tv':f.m?'movie':null):(f.m?'movie':f.t?'tv':null);
    if(!kind){_gameCast[item.imdbID]={none:true,ts:Date.now()};_lsSet('ct_game_cast',JSON.stringify(_gameCast));return null;}
    const d=await tmdbFetch(`/${kind}/${kind==='tv'?f.t:f.m}/${kind==='tv'?'aggregate_credits':'credits'}`);
    if(!d)return null; /* network or key problem: ask again next time */
    const cast=(d.cast||[]).slice().sort((a,b)=>(a.order??99)-(b.order??99));
    const top=cast.filter(p=>p.profile_path).slice(0,6).map(p=>[p.id,p.name,(p.character||p.roles?.[0]?.character||'').split('/')[0].trim(),p.profile_path]);
    const r=top.length?{ids:cast.slice(0,30).map(p=>p.id),top}:{none:true,ts:Date.now()};
    _gameCast[item.imdbID]=r;_lsSet('ct_game_cast',JSON.stringify(_gameCast));
    return r.top?r:null;
  }catch(e){return null;}
}
async function _gamePickActor(){
  const fresh=_game.pool.filter(p=>!_game.recent.includes(p.imdbID)&&p.imdbID!==_game.current?.item.imdbID);
  const src=fresh.length?fresh:_game.pool;
  const tried=new Set(),shown=new Set(_game.log.map(l=>l.actorId).concat(_game.current?.actor?.id||[]));
  for(let i=0;i<10&&tried.size<src.length;i++){
    const cand=src[Math.floor(Math.random()*src.length)];
    if(tried.has(cand.imdbID))continue;tried.add(cand.imdbID);
    const cast=await _gameGetCast(cand);if(!cast)continue;
    const lead=cast.top.slice(0,4).filter(a=>!shown.has(a[0]));if(!lead.length)continue;
    const [id,aname,character,profile]=lead[Math.floor(Math.random()*lead.length)];
    /* wrong options: similar titles whose cast does not have this actor */
    const cands=_gameDistractors(cand,7),casts=await Promise.all(cands.map(_gameGetCast));
    const wrong=cands.filter((p,k)=>casts[k]&&!casts[k].ids.includes(id)).slice(0,3);
    if(wrong.length<3)continue;
    const url=`https://image.tmdb.org/t/p/h632${profile}`;
    const items=[cand,...wrong];
    const [,names]=await Promise.all([new Promise(r=>{const im=new Image();im.onload=im.onerror=r;im.src=url;}),Promise.all(items.map(_gameUkName))]);
    const opts=items.map((it,k)=>({id:it.imdbID,name:names[k]}));
    opts.forEach((o,k)=>{if(opts.some((p,j)=>j!==k&&p.name===o.name))o.name=items[k].title;});
    return{item:cand,url,name:opts[0].name,opts,actor:{id,name:aname,character}};
  }
  return null;
}
function _gamePickAny(){return _game.type==='actor'?_gamePickActor():_gamePick();}
