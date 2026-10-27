/* ═══════════════════════════════════════════════════════════════
   GAME — "Впізнай кадр". Picks a random watched title, shows a
   text-free TMDB backdrop, offers 4 title choices. Runs until a
   wrong answer; best streak is saved permanently (and travels with
   backups, like everything else). Reuses tmdbFetch (already has its
   own cache/rate-limit handling) — no separate network layer needed. */
let _gameBackdropCache=JSON.parse(localStorage.getItem('ct_gamebackdrops')||'{}'); /* imdbID -> {backdrops:[paths],ts} | {none:true,ts} */
function _gameCacheSave(){_lsSet('ct_gamebackdrops',JSON.stringify(_gameBackdropCache));}
/* at most 12 frames per title: The Green Mile alone had 124 paths, ~1.1M chars across the whole list */
const GAME_FRAMES=12;
{let t=false;for(const k in _gameBackdropCache){const f=_gameBackdropCache[k].backdrops;if(f&&f.length>GAME_FRAMES){_gameBackdropCache[k].backdrops=f.slice(0,GAME_FRAMES);t=true;}}if(t)_gameCacheSave();}
let _gameBestScore=parseInt(localStorage.getItem('ct_game_highscore')||'0');   /* streak mode */
let _gameRoundBest=parseInt(localStorage.getItem('ct_game_roundbest')||'0');   /* best of 10 */
function _gameBestSave(){_lsSet('ct_game_highscore',String(_gameBestScore));_lsSet('ct_game_roundbest',String(_gameRoundBest));}
const GAME_ROUND=10;
let _game={mode:'streak',filter:'all',pool:[],q:0,score:0,streak:0,recent:[],log:[],answered:true,current:null,next:null};

function _gameEligible(){return watched.filter(i=>i.imdbID&&i.title&&(i.type==='movie'||i.type==='series'));}
function _gameKind(i){const c=i.customCategory||i.type;return c==='anime'||c==='cartoon'?'anim':i.type==='series'?'series':'movie';}

function loadGameTab(){
  const el=document.getElementById('gameStart');if(!el)return;
  const all=_gameEligible(),cnt={all:all.length,movie:0,series:0,anim:0};all.forEach(i=>cnt[_gameKind(i)]++);
  if(_game.filter!=='all'&&cnt[_game.filter]<4)_game.filter='all';
  const n=cnt[_game.filter];
  const blocked=!TMDB_KEY||_tmdbBlocked?'Потрібен TMDB API-ключ у налаштуваннях, щоб підтягувати кадри.':n<4?`Для гри потрібно щонайменше 4 переглянуті тайтли, а тут ${n}.`:'';
  el.innerHTML=`
    <div class="cat-seg game-filter" role="group" aria-label="З чого брати кадри">${[['all','Усе'],['movie','Фільми'],['series','Серіали'],['anim','Анімація']].filter(([k])=>k==='all'||cnt[k]>=4)
      .map(([k,l])=>`<button class="cat-chip${_game.filter===k?' on':''}" data-act="setGameFilter" data-args="${A(`${k}`)}">${l}<span class="num">${cnt[k]}</span></button>`).join('')}</div>
    ${blocked?`<div class="recs-note">${ic('info')}<span>${blocked}</span></div>`:''}
    <div class="game-modes">
      <button class="game-mode" onclick="startGame('streak')" ${blocked?'disabled':''}>
        <span class="game-mode-ic">${ic('spark')}</span>
        <span class="game-mode-name">Серія</span>
        <span class="game-mode-desc">Кадри йдуть, доки не помилишся</span>
        <span class="game-mode-best">Рекорд: <b class="num">${_gameBestScore}</b> поспіль</span>
      </button>
      <button class="game-mode" onclick="startGame('round')" ${blocked?'disabled':''}>
        <span class="game-mode-ic">${ic('frame')}</span>
        <span class="game-mode-name">Раунд з ${GAME_ROUND} кадрів</span>
        <span class="game-mode-desc">Помилки не зупиняють гру, рахунок у кінці</span>
        <span class="game-mode-best">Найкраще: <b class="num">${_gameRoundBest}</b> з ${GAME_ROUND}</span>
      </button>
    </div>
    <p class="game-keys">Клавіші: <kbd>1</kbd>–<kbd>4</kbd> відповідь · <kbd>Enter</kbd> далі · <kbd>Esc</kbd> вийти</p>`;
}
function setGameFilter(k){_game.filter=k;loadGameTab();}

function startGame(mode){
  mode=mode||_game.mode;
  const pool=_gameEligible().filter(i=>_game.filter==='all'||_gameKind(i)===_game.filter);
  if(pool.length<4)return;
  _game={..._game,mode,pool,q:0,score:0,streak:0,recent:[],log:[],answered:true,current:null,next:null};
  document.getElementById('gameTitle').textContent=mode==='round'?`Раунд з ${GAME_ROUND} кадрів`:'Серія';
  document.getElementById('gameModalBg').classList.remove('hidden');
  document.getElementById('gameOver').classList.add('hidden');
  document.getElementById('gamePlay').classList.remove('hidden');
  gameNextQuestion();
}
function closeGameModal(){document.getElementById('gameModalBg').classList.add('hidden');_game.answered=true;loadGameTab();}

function _gameHud(){
  const h=document.getElementById('gameHud');if(!h)return;
  if(_game.mode==='round'){
    const dots=Array.from({length:GAME_ROUND},(_,k)=>{const l=_game.log[k];return `<i class="${l?(l.ok?'ok':'bad'):k===_game.q-1?'cur':''}"></i>`;}).join('');
    h.innerHTML=`<span class="game-dots" aria-label="Кадр ${_game.q} з ${GAME_ROUND}, правильно ${_game.score}">${dots}</span><span class="num">${_game.score}/${GAME_ROUND}</span>`;
  }else h.innerHTML=`<span>Серія <b class="num">${_game.streak}</b></span><span class="game-hud-dim">рекорд <span class="num">${_gameBestScore}</span></span>`;
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
    if(url){await new Promise(r=>{const im=new Image();im.onload=im.onerror=r;im.src=url;});return{item:cand,url};}
  }
  return null;
}
/* wrong options look like the right one: same kind, nearby years, a shared genre —
   but never another part of the same franchise (near-identical frames) */
function _gameDistractors(item){
  const kind=_gameKind(item),y=parseInt(item.year)||0,g=new Set((item.genre||'').split(',').map(x=>x.trim()).filter(Boolean));
  const coll=_collCache[item.imdbID]?.collId;
  const ranked=_gameEligible().filter(p=>p.title!==item.title&&p.imdbID!==item.imdbID&&!(coll&&_collCache[p.imdbID]?.collId===coll))
    .map(p=>({p,s:(_gameKind(p)===kind?4:0)+(Math.abs((parseInt(p.year)||0)-y)<=8?2:0)+((p.genre||'').split(',').some(x=>g.has(x.trim()))?1:0)+Math.random()*1.5}))
    .sort((a,b)=>b.s-a.s).slice(0,14);
  return [...new Set(_gameShuffle(ranked).map(r=>r.p.title))].slice(0,3);
}
function _gameShuffle(arr){const a=arr.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}

async function gameNextQuestion(){
  if(_game.mode==='round'&&_game.q>=GAME_ROUND){gameEnd();return;}
  _game.q++;_game.answered=true;
  document.getElementById('gameReveal').innerHTML='';
  document.getElementById('gameOpts').innerHTML='';
  document.getElementById('gameShotWrap').innerHTML='<div class="spinner">Завантажую кадр…</div>';
  _gameHud();
  const pick=await(_game.next||_gamePick());_game.next=null;
  if(document.getElementById('gameModalBg').classList.contains('hidden'))return; /* closed while loading */
  if(!pick){gameEnd(true);return;}
  _game.current=pick;
  _game.recent.push(pick.item.imdbID);if(_game.recent.length>Math.min(10,_game.pool.length-1))_game.recent.shift();
  document.getElementById('gameShotWrap').innerHTML=`<img src="${pick.url}" alt="Кадр, який треба впізнати">`;
  const opts=_gameShuffle([pick.item.title,..._gameDistractors(pick.item)]);
  const box=document.getElementById('gameOpts');box.innerHTML='';
  opts.forEach((t,k)=>{const b=document.createElement('button');b.className='game-opt';b.dataset.title=t;
    b.innerHTML=`<kbd>${k+1}</kbd><span></span>`;b.querySelector('span').textContent=t;b.onclick=()=>_gameAnswer(b);box.appendChild(b);});
  _game.answered=false;
  _game.next=_gamePick(); /* the next frame loads while you think */
}

function _gameAnswer(btn){
  if(_game.answered)return;_game.answered=true;
  const item=_game.current.item,ok=btn.dataset.title===item.title;
  document.querySelectorAll('#gameOpts .game-opt').forEach(b=>{b.disabled=true;if(b.dataset.title===item.title)b.classList.add('right');});
  if(!ok)btn.classList.add('wrong');
  _game.log.push({item,ok});
  if(ok){_game.score++;_game.streak++;}
  if(_game.mode==='streak'&&_game.streak>_gameBestScore){_gameBestScore=_game.streak;_gameBestSave();}
  _gameHud();
  const last=_game.mode==='round'?_game.q>=GAME_ROUND:!ok;
  document.getElementById('gameReveal').innerHTML=`
    <img src="${item.poster||BLANK}" alt="" onerror="this.src=BLANK">
    <div class="game-reveal-txt"><div><b>${ok?'Так!':'Ні.'}</b> Це <a href="${item.imdbUrl}" target="_blank" rel="noopener">${esc(item.title)}</a></div>
      <span>${esc(item.year||'')} · ${catLabel(item.customCategory||item.type)}${item.imdbRating?` · IMDb ${esc(item.imdbRating)}`:''}</span></div>
    <button class="btn primary" id="gameNextBtn" onclick="${last?'gameEnd()':'gameNextQuestion()'}">${last?'Підсумок':'Далі'} <kbd>Enter</kbd></button>`;
  document.getElementById('gameNextBtn').focus({preventScroll:true});
}

function gameEnd(noMoreImages){
  _game.answered=true;
  if(_game.mode==='round'&&_game.score>_gameRoundBest&&_game.q>=GAME_ROUND){_gameRoundBest=_game.score;_gameBestSave();}
  document.getElementById('gamePlay').classList.add('hidden');
  const over=document.getElementById('gameOver');over.classList.remove('hidden');
  const round=_game.mode==='round';
  const record=round?_game.score>=_gameRoundBest&&_game.score>0&&_game.q>=GAME_ROUND:_game.streak>0&&_game.streak>=_gameBestScore;
  const head=noMoreImages?'Кадри закінчились':round?`${_game.score} з ${GAME_ROUND}`:`Серія: ${_game.streak}`;
  const sub=noMoreImages?'Не вдалося знайти кадри для решти тайтлів у цьому наборі.':record?'Новий рекорд!':round?`Найкраще: ${_gameRoundBest} з ${GAME_ROUND}`:`Рекорд лишається ${_gameBestScore}`;
  const log=_game.log.slice(-GAME_ROUND);
  over.innerHTML=`
    <div class="game-over-ic">${ic(noMoreImages?'frame':record?'trophy':_game.score?'check':'film')}</div>
    <div class="game-over-title">${head}</div>
    <div class="game-over-sub">${sub}</div>
    ${log.length?`<ol class="game-log">${log.map(l=>`<li class="${l.ok?'ok':'bad'}">${ic(l.ok?'check':'minus')}<a href="${l.item.imdbUrl}" target="_blank" rel="noopener">${esc(l.item.title)}</a><span class="num">${esc(l.item.year||'')}</span></li>`).join('')}</ol>`:''}
    <div class="game-over-btns">
      <button class="btn primary" id="gameAgainBtn" onclick="startGame()">${ic('refresh')}Ще раз <kbd>Enter</kbd></button>
      <button class="btn" onclick="closeGameModal()">Закрити</button>
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

