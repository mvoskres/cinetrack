/* ── П'ЯТНАШКИ (1.35) ──
   A poster cut into N×N tiles, the last cell empty; tiles slide back into place. The 4th game type on the «Гра» tab:
   the start screen (size + poster: random or by name from your lists, franchises or TMDB) is drawn by pzScreen() from
   loadGameTab; the board plays in the same game window (#gameModalBg) in its own body #pzWrap.
   Every start shuffles at random; an unsolvable order is fixed by one swap (parity), an already solved one is reshuffled. */
const PZ_SIZES=[[3,'Легко'],[4,'Класика'],[5,'Складно'],[6,'Дуже складно']];
let _pz={n:[3,4,5,6].includes(+localStorage.getItem('ct_pz_n'))?+localStorage.getItem('ct_pz_n'):4,pick:null,q:'',sug:[],
  board:[],moves:0,t0:0,timer:0,won:false,nums:localStorage.getItem('ct_pz_nums')==='1'};
let _pzBest=_lsJSON('ct_pz_best',{}); /* n -> {m:moves,t:seconds} (fewest moves) */

/* the biggest sensible copy of a poster: IMDb (Amazon) URLs take a width suffix, TMDB paths a size */
function _pzBig(p){
  if(!p)return '';
  if(p[0]==='/')return _tsImg(p,'w780');
  return ps(p).replace(/\._V1_[^/]*\.jpg$/,'._V1_SX720.jpg');
}
function _pzMine(){const seen=new Set();return [...watched,...watching,...planned].filter(i=>/^https:\/\//.test(i.poster||'')&&!seen.has(i.imdbID)&&seen.add(i.imdbID));}
function _pzItem(i){return {title:tn(i),sub:[i.year,catLabel(i.customCategory||i.type)].filter(Boolean).join(' · '),img:_pzBig(i.poster),thumb:ps(i.poster)};}
function _pzFr(){return Object.values(typeof _collDetails==='object'?_collDetails:{}).filter(d=>d&&d.name&&d.poster);}

/* 1.43: nothing in the lists yet — a random popular film from TMDB */
let _pzPop=null;
async function _pzPopPick(){
  if(!TMDB_KEY||_tmdbBlocked)return null;
  if(!_pzPop){try{const d=await tmdbFetch('/trending/movie/week?language=uk-UA');_pzPop=(d?.results||[]).filter(r=>r.poster_path);}catch(e){_pzPop=null;}}
  if(!_pzPop?.length){_pzPop=null;return null;}
  const r=_pzPop[Math.floor(Math.random()*_pzPop.length)];
  return {title:r.title||r.name||'',sub:[(r.release_date||'').slice(0,4),'фільм'].filter(Boolean).join(' · '),img:_pzBig(r.poster_path),thumb:_tsImg(r.poster_path,'w92')};
}
const _pzNoPoster=()=>toast(TMDB_KEY?'Не вдалося взяти постер: перевір з’єднання':'Додай ключ TMDB у Налаштуваннях — тоді постери братимуться з популярного','err',3200);
async function pzRandom(){
  const all=_pzMine();
  if(!all.length){const p=await _pzPopPick();if(!p){_pzNoPoster();return;}_pz.pick=p;_pz.q='';_pz.sug=[];loadGameTab();return;}
  let i;for(let k=0;k<5;k++){i=all[Math.floor(Math.random()*all.length)];if(_pzItem(i).title!==_pz.pick?.title)break;}
  _pz.pick=_pzItem(i);_pz.q='';_pz.sug=[];loadGameTab();
}
function pzSize(n){if(![3,4,5,6].includes(+n))return;_pz.n=+n;_lsSet('ct_pz_n',String(n));loadGameTab();}
function pzClear(){_pz.pick=null;loadGameTab();setTimeout(()=>document.getElementById('pzQ')?.focus(),0);}

/* name search: your lists and franchises first, then TMDB (films, series, collections) */
let _pzQT=0,_pzQN=0;
function pzQuery(v){
  _pz.q=v;clearTimeout(_pzQT);
  const q=v.trim().toLowerCase();
  if(q.length<2){_pz.sug=[];_pzSugDraw();return;}
  const mine=_pzMine().filter(i=>tn(i).toLowerCase().includes(q)||(i.title||'').toLowerCase().includes(q)).slice(0,5).map(_pzItem);
  const fr=_pzFr().filter(d=>d.name.toLowerCase().includes(q)).slice(0,3).map(d=>({title:d.name,sub:'франшиза',img:_pzBig(d.poster),thumb:_tsImg(d.poster,'w92')}));
  _pz.sug=[...mine,...fr];_pzSugDraw();
  if(!TMDB_KEY||_tmdbBlocked)return;
  const run=++_pzQN;
  _pzQT=setTimeout(async()=>{
    try{
      const enc=encodeURIComponent(v.trim());
      const [m,c]=await Promise.all([tmdbFetch(`/search/multi?query=${enc}&language=uk-UA`),tmdbFetch(`/search/collection?query=${enc}&language=uk-UA`)]);
      if(run!==_pzQN)return;
      const have=new Set(_pz.sug.map(s=>s.title.toLowerCase()));
      const add=[...(c?.results||[]).filter(r=>r.poster_path).slice(0,2).map(r=>({title:r.name,sub:'франшиза',img:_pzBig(r.poster_path),thumb:_tsImg(r.poster_path,'w92')})),
        ...(m?.results||[]).filter(r=>(r.media_type==='movie'||r.media_type==='tv')&&r.poster_path).slice(0,6).map(r=>({title:r.title||r.name,
          sub:[(r.release_date||r.first_air_date||'').slice(0,4),r.media_type==='tv'?'серіал':'фільм'].filter(Boolean).join(' · '),img:_pzBig(r.poster_path),thumb:_tsImg(r.poster_path,'w92')}))]
        .filter(s=>!have.has(s.title.toLowerCase())&&have.add(s.title.toLowerCase()));
      _pz.sug=[..._pz.sug,...add].slice(0,9);_pzSugDraw();
    }catch(e){}
  },320);
}
function _pzSugDraw(){
  const el=document.getElementById('pzSug');if(!el)return;
  el.innerHTML=_pz.sug.map((s,k)=>`<button class="pz-sg" data-act="pzPickSug" data-args="${A(k)}"><img src="${esc(s.thumb||s.img)}" alt="" loading="lazy" data-fb><span><b>${esc(s.title)}</b><small>${esc(s.sub||'')}</small></span></button>`).join('')
    ||(_pz.q.trim().length>=2?'<p class="pz-none">Шукаю…</p>':'');
}
function pzPickSug(k){const s=_pz.sug[+k];if(!s)return;_pz.pick=s;_pz.q='';_pz.sug=[];loadGameTab();}

/* the start screen inside «Гра» */
function pzScreen(){
  const n=_pz.n,b=_pzBest[n],p=_pz.pick;
  const sizes=PZ_SIZES.map(([k,l])=>`<button class="pz-sz${n===k?' on':''}" aria-pressed="${n===k}" data-act="pzSize" data-args="${A(k)}"><b>${k}×${k}</b><span>${l} · ${k*k-1}</span></button>`).join('');
  const chosen=p?`<div class="pz-pick"><img src="${esc(p.thumb||p.img)}" alt="" data-fb><span><b>${esc(p.title)}</b><small>${esc(p.sub||'')}</small></span>
      <button class="pz-chg" data-act="pzRandom" aria-label="Інший випадковий">${ic('refresh')}</button><button class="pz-chg" data-act="pzClear" aria-label="Обрати за назвою">${ic('search')}</button></div>`
    :`<div class="pz-src"><button class="pz-rnd" data-act="pzRandom">${ic('refresh')}Випадковий</button>
      <div class="local-search-wrap pz-q"><span class="local-search-icon">${ic('search')}</span><input class="local-search" id="pzQ" type="text" placeholder="Фільм, серіал, франшиза" aria-label="Назва фільму, серіалу чи франшизи" autocomplete="off" value="${esc(_pz.q)}" data-input="pzQuery" data-args="[&quot;$value&quot;]"></div></div>
      <div class="pz-sug" id="pzSug"></div>`;
  return `<section class="gx-screen gx-puzzle">${p?`<img class="gx-bg" src="${esc(p.img)}" alt="">`:''}
    <div class="gx-in">
      <div class="gx-k">Склади постер</div>
      <h2 class="gx-q">П'ятнашки</h2>
      <p class="gx-d">Постер розрізано на клітинки, одна порожня. Торкнись або проведи клітинку в порожнє місце, поки картинка не складеться.</p>
      <p class="pz-lbl">Складність</p><div class="pz-sizes" role="group" aria-label="Складність">${sizes}</div>
      <p class="pz-lbl">Постер</p>${chosen}
      <div class="gx-modes"><button class="gx-mode p" data-act="pzStart"><b>Почати</b><span>${b?`рекорд ${n}×${n}: <span class="num">${b.m}</span> ${_pzPl(b.m)} · ${_pzTime(b.t)}`:p?'перемішаю клітинки навмання':'без вибору — випадковий постер'}</span></button></div>
    </div></section>
    <p class="game-keys">Клавіші: стрілки рухають клітинку в порожнє місце · <kbd>Esc</kbd> вийти</p>`;
}
const _pzPl=m=>m%10===1&&m%100!==11?'хід':m%10>=2&&m%10<=4&&(m%100<12||m%100>14)?'ходи':'ходів';
const _pzTime=s=>`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;

/* ── the board ── */
function _pzShuffle(n){
  const N=n*n,blank=N-1;let a;
  do{
    a=_gameShuffle([...Array(N).keys()]);
    const t=a.filter(x=>x!==blank);let inv=0;
    for(let i=0;i<t.length;i++)for(let j=i+1;j<t.length;j++)if(t[i]>t[j])inv++;
    const rowFromBottom=n-Math.floor(a.indexOf(blank)/n);
    const ok=n%2?inv%2===0:(rowFromBottom%2===0)===(inv%2===1);
    if(!ok){const [i,j]=a.map((x,k)=>x===blank?-1:k).filter(k=>k>=0);[a[i],a[j]]=[a[j],a[i]];}
  }while(a.every((x,k)=>x===k));
  return a;
}
async function pzStart(again){
  if(!_pz.pick||again==='new'){const all=_pzMine();
    if(all.length)_pz.pick=_pzItem(all[Math.floor(Math.random()*all.length)]);
    else{const p=await _pzPopPick();if(!p){_pzNoPoster();return;}_pz.pick=p;}}
  _gameRun++;clearInterval(_pz.timer);if(typeof _chStop==='function')_chStop();
  Object.assign(_pz,{board:_pzShuffle(_pz.n),moves:0,t0:0,won:false});
  const bg=document.getElementById('gameModalBg'),m=bg.querySelector('.game-modal');
  let w=document.getElementById('pzWrap');
  if(!w){w=document.createElement('div');w.id='pzWrap';w.className='game-modal-body pz-wrap';m.appendChild(w);}
  document.getElementById('gamePlay').classList.add('hidden');document.getElementById('gameOver').classList.add('hidden');w.classList.remove('hidden');
  m.classList.add('pz-on');
  document.getElementById('gameTitle').textContent=`П'ятнашки ${_pz.n}×${_pz.n}`;
  if(bg.classList.contains('hidden')){
    _gameFocus.el=null;bg.classList.remove('hidden');_lyOpen('game',()=>closeGameModal());_inertSync();_focusIn(m,_gameFocus);
  }
  _pzDraw();
}
function _pzHud(){
  const h=document.getElementById('gameHud');if(!h)return;
  const s=_pz.t0?Math.round((Date.now()-_pz.t0)/1000):0;
  h.innerHTML=`<span class="pz-hud"><b class="num">${_pz.moves}</b> ${_pzPl(_pz.moves)} · <b class="num">${_pzTime(s)}</b></span>`;
}
function _pzDraw(){
  const w=document.getElementById('pzWrap');if(!w)return;
  const n=_pz.n,N=n*n,img=esc(String(_pz.pick.img||'').replace(/['()\\]/g,c=>'%'+c.charCodeAt(0).toString(16))); /* 1.49.2: it sits inside url('…') */
  w.innerHTML=`<div class="pz-board${_pz.nums?' nums':''}" id="pzBoard" style="--n:${n};--img:url('${img}')" role="grid" aria-label="Поле п'ятнашок ${n} на ${n}">
      ${Array.from({length:N-1},(_,id)=>`<button class="pz-tile" data-id="${id}" data-act="pzTap" data-args="${A(id)}" style="--x:${id%n};--y:${Math.floor(id/n)}" aria-label="Клітинка ${id+1}"><i>${id+1}</i></button>`).join('')}
      <div class="pz-full" aria-hidden="true"></div>
    </div>
    <div class="pz-bar"><span class="pz-ttl">${esc(_pz.pick.title)}</span>
      <button class="btn sq${_pz.nums?' on':''}" data-act="pzNums" aria-pressed="${_pz.nums}" title="Номери на клітинках">#</button>
      <button class="btn" data-act="pzPeek" aria-pressed="false">${ic('eye')}Підглянути</button>
      <button class="btn" data-act="pzStart">${ic('refresh')}Перемішати</button></div>
    <div class="pz-win" id="pzWin" aria-live="polite"></div>`;
  _pzPlace();_pzHud();
}
function _pzPlace(){
  const n=_pz.n;
  _pz.board.forEach((id,pos)=>{if(id===n*n-1)return;const t=document.querySelector(`#pzBoard .pz-tile[data-id="${id}"]`);if(t){t.style.setProperty('--c',pos%n);t.style.setProperty('--r',Math.floor(pos/n));t.classList.toggle('ok',pos===id);}});
}
/* a tap on a tile in the blank's row or column slides the whole line toward the gap (each tile moved = one move) */
function pzTap(id){
  if(_pz.won)return;
  const n=_pz.n,b=_pz.board,blank=n*n-1,p=b.indexOf(+id),e=b.indexOf(blank);
  const pr=Math.floor(p/n),pc=p%n,er=Math.floor(e/n),ec=e%n;
  if(pr!==er&&pc!==ec)return;
  const step=pr===er?(pc<ec?-1:1):(pr<er?-n:n);
  let cur=e;
  while(cur!==p){const nx=cur+step;b[cur]=b[nx];b[nx]=blank;cur=nx;_pz.moves++;}
  if(!_pz.t0){_pz.t0=Date.now();_pz.timer=setInterval(_pzHud,1000);}
  _pzPlace();_pzHud();
  if(b.every((x,k)=>x===k))_pzWin();
}
function _pzWin(){
  _pz.won=true;clearInterval(_pz.timer);
  const n=_pz.n,t=Math.round((Date.now()-_pz.t0)/1000),old=_pzBest[n],rec=!old||_pz.moves<old.m||(_pz.moves===old.m&&t<old.t);
  if(rec){_pzBest[n]={m:_pz.moves,t};_lsSet('ct_pz_best',JSON.stringify(_pzBest));}
  document.getElementById('pzBoard')?.classList.add('won');_pzHud();
  const w=document.getElementById('pzWin');
  if(w)w.innerHTML=`<p class="pz-res"><b>Зібрано!</b> ${_pz.moves} ${_pzPl(_pz.moves)} · ${_pzTime(t)}${rec?' · <em>новий рекорд</em>':old?` · рекорд ${old.m} ${_pzPl(old.m)}`:''}</p>
    <div class="pz-acts"><button class="btn primary" id="gameAgainBtn" data-act="pzStart">${ic('refresh')}Ще раз</button><button class="btn" data-act="pzStart" data-args="[&quot;new&quot;]">Інший постер</button></div>`;
  document.getElementById('gameAgainBtn')?.focus();
}
function pzNums(){_pz.nums=!_pz.nums;_lsSet('ct_pz_nums',_pz.nums?'1':'0');document.getElementById('pzBoard')?.classList.toggle('nums',_pz.nums);
  const b=document.querySelector('[data-act="pzNums"]');if(b){b.classList.toggle('on',_pz.nums);b.setAttribute('aria-pressed',_pz.nums);}}
function pzPeek(){const bd=document.getElementById('pzBoard'),on=!bd?.classList.contains('peek');bd?.classList.toggle('peek',on);
  const b=document.querySelector('[data-act="pzPeek"]');if(b){b.setAttribute('aria-pressed',on);b.classList.toggle('on',on);}}
function _pzStop(){clearInterval(_pz.timer);const w=document.getElementById('pzWrap');if(w){w.classList.add('hidden');w.innerHTML='';}document.querySelector('#gameModalBg .game-modal')?.classList.remove('pz-on');}
/* swipe (1.40): a tile swiped toward the gap slides (with its line, as a tap); a swipe that starts elsewhere moves the tile
   next to the gap in the swipe direction, like the arrows. The tap that follows a swipe is swallowed. */
let _pzSw=null,_pzSwAt=0;
document.addEventListener('pointerdown',e=>{
  const bd=e.target.closest?.('#pzBoard');if(!bd||_pz.won||!e.isPrimary)return;
  _pzSw={x:e.clientX,y:e.clientY,id:e.target.closest('.pz-tile')?.dataset.id,w:bd.getBoundingClientRect().width/_pz.n};
});
document.addEventListener('pointerup',e=>{
  const s=_pzSw;_pzSw=null;if(!s||_pz.won||!document.getElementById('pzBoard'))return;
  const dx=e.clientX-s.x,dy=e.clientY-s.y,ax=Math.abs(dx),ay=Math.abs(dy);
  if(Math.max(ax,ay)<Math.max(18,s.w*.22))return; /* a tap: the click handler does it */
  _pzSwAt=Date.now();
  const d=ax>ay?[0,dx>0?1:-1]:[dy>0?1:-1,0]; /* [row, col] of the movement */
  const n=_pz.n,b=_pz.board,e0=b.indexOf(n*n-1),er=Math.floor(e0/n),ec=e0%n;
  if(s.id!=null){
    const p=b.indexOf(+s.id),pr=Math.floor(p/n),pc=p%n;
    if((d[0]&&pc===ec&&Math.sign(er-pr)===d[0])||(d[1]&&pr===er&&Math.sign(ec-pc)===d[1])){pzTap(+s.id);return;}
  }
  const r=er-d[0],c=ec-d[1];
  if(r>=0&&c>=0&&r<n&&c<n)pzTap(b[r*n+c]);
});
document.addEventListener('pointercancel',()=>{_pzSw=null;});
document.addEventListener('click',e=>{if(Date.now()-_pzSwAt<400&&e.target.closest?.('#pzBoard')){e.stopPropagation();e.preventDefault();}},true);
/* arrows: the tile next to the gap moves into it (← takes the one on the gap's right, etc.) */
document.addEventListener('keydown',e=>{
  if(!document.getElementById('pzBoard')||document.getElementById('gameModalBg')?.classList.contains('hidden')||_pz.won)return;
  const d={ArrowLeft:[0,1],ArrowRight:[0,-1],ArrowUp:[1,0],ArrowDown:[-1,0]}[e.key];if(!d)return;
  const n=_pz.n,e0=_pz.board.indexOf(n*n-1),r=Math.floor(e0/n)+d[0],c=e0%n+d[1];
  if(r<0||c<0||r>=n||c>=n)return;
  e.preventDefault();pzTap(_pz.board[r*n+c]);
});
