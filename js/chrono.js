/* ── ХРОНОЛОГІЯ (1.36) ──
   N posters from «Переглянуте»; put them in release order, oldest first, then «Перевірити». A streak of correct rounds;
   the first wrong order ends it. Count 4/5/7 and difficulty (how close the years are) are chosen on the start screen.
   Plays in the game window (#gameModalBg) in its own body #chWrap. Order: drag a poster (pointer events, both mouse and
   touch), or tap one and then another to swap them; keyboard: Enter/Space picks, arrows move the picked one. */
const CH_COUNTS=[4,5,7];
const CH_LEVELS=[['easy','Легко','різні десятиліття',8],['mid','Середньо','кілька років між ними',3],['hard','Складно','роки поруч',1]];
let _ch={n:CH_COUNTS.includes(+localStorage.getItem('ct_ch_n'))?+localStorage.getItem('ct_ch_n'):5,
  d:CH_LEVELS.some(l=>l[0]===localStorage.getItem('ct_ch_d'))?localStorage.getItem('ct_ch_d'):'mid',
  filter:'all',cards:[],order:[],checked:false,streak:0,recent:[],sel:null};
let _chBest=_lsJSON('ct_ch_best',{}); /* `${n}-${d}` -> best streak */

function _chYear(i){const y=parseInt(i.year);return y>1880&&y<2100?y:0;}
function _chPool(){return watched.filter(i=>/^https:\/\//.test(i.poster||'')&&_chYear(i)&&(_ch.filter==='all'||_gameKind(i)===_ch.filter));}
function chCount(n){if(!CH_COUNTS.includes(+n))return;_ch.n=+n;_lsSet('ct_ch_n',String(n));loadGameTab();}
function chLevel(d){if(!CH_LEVELS.some(l=>l[0]===d))return;_ch.d=d;_lsSet('ct_ch_d',d);loadGameTab();}
function chFilter(f){_ch.filter=f;loadGameTab();}
const _chKey=()=>`${_ch.n}-${_ch.d}`;

function chScreen(){
  const pool=watched.filter(i=>/^https:\/\//.test(i.poster||'')&&_chYear(i)),cnt={all:pool.length,movie:0,series:0,anim:0};pool.forEach(i=>cnt[_gameKind(i)]++);
  if(_ch.filter!=='all'&&cnt[_ch.filter]<12)_ch.filter='all';
  const best=_chBest[_chKey()]||0,few=cnt[_ch.filter]<12;
  const peek=pool.slice().sort((a,b)=>_chYear(a)-_chYear(b));
  const strip=peek.length>=4?[0,.33,.66,1].map(f=>peek[Math.round(f*(peek.length-1))]):[];
  return `<section class="gx-screen gx-chrono">
    ${strip.length?`<div class="ch-peek" aria-hidden="true">${strip.map(i=>`<span><img src="${posterSrc(i.poster)}" alt=""><b>${_chYear(i)}</b></span>`).join('')}</div>`:''}
    <div class="gx-in">
      <div class="gx-k">Розстав по роках</div>
      <h2 class="gx-q">Хронологія</h2>
      <p class="gx-d">Постери з того, що ти переглянув. Розстав їх від найстарішого до найновішого: перетягни або торкнись двох, щоб поміняти місцями.</p>
      <p class="pz-lbl">Скільки постерів</p>
      <div class="ch-row" role="group" aria-label="Скільки постерів">${CH_COUNTS.map(k=>`<button class="pz-sz${_ch.n===k?' on':''}" aria-pressed="${_ch.n===k}" data-act="chCount" data-args="${A(k)}"><b>${k}</b><span>постерів</span></button>`).join('')}</div>
      <p class="pz-lbl">Складність</p>
      <div class="ch-row" role="group" aria-label="Складність">${CH_LEVELS.map(([k,l,s])=>`<button class="pz-sz${_ch.d===k?' on':''}" aria-pressed="${_ch.d===k}" data-act="chLevel" data-args="${A(k)}"><b>${l}</b><span>${s}</span></button>`).join('')}</div>
      ${few?`<div class="recs-note">${ic('info')}<span>Для гри потрібно щонайменше 12 переглянутих тайтлів із роком і постером.</span></div>`:''}
      <div class="gx-modes"><button class="gx-mode p" data-act="chStart" ${few?'disabled':''}><b>Почати</b><span>серія до першої помилки · рекорд <span class="num">${best}</span></span></button></div>
    </div></section>
    <div class="cat-seg game-filter" role="group" aria-label="З чого брати">${[['all','Усе'],['movie','Фільми'],['series','Серіали'],['anim','Анімація']].filter(([k])=>k==='all'||cnt[k]>=12)
      .map(([k,l])=>`<button class="cat-chip${_ch.filter===k?' on':''}" data-act="chFilter" data-args="${A(`${k}`)}">${l}<span class="num">${cnt[k]}</span></button>`).join('')}</div>
    <p class="game-keys">Перетягни постер або торкнись двох, щоб поміняти · клавіші: <kbd>Enter</kbd> взяти, стрілки посунути · <kbd>Esc</kbd> вийти</p>`;
}

/* N titles with different years, the minimal gap set by the level; «hard» takes them from a narrow window of years */
function _chDeal(){
  const n=_ch.n,lvl=CH_LEVELS.find(l=>l[0]===_ch.d),pool=_chPool(),recent=new Set(_ch.recent);
  for(let gap=lvl[3];gap>=1;gap--){
    for(let t=0;t<40;t++){
      let cand=_gameShuffle(pool.filter(i=>!recent.has(i.imdbID)));
      if(_ch.d==='hard'&&cand.length){const a=_chYear(cand[0]);const w=cand.filter(i=>Math.abs(_chYear(i)-a)<=n*2);if(w.length>=n)cand=w;}
      const pick=[];
      for(const i of cand){const y=_chYear(i);if(pick.every(p=>Math.abs(_chYear(p)-y)>=gap)){pick.push(i);if(pick.length===n)return pick;}}
    }
    if(recent.size){recent.clear();gap++;}
  }
  return null;
}
function chStart(){
  _gameRun++;
  Object.assign(_ch,{streak:0,recent:[]});
  const bg=document.getElementById('gameModalBg'),m=bg.querySelector('.game-modal');
  let w=document.getElementById('chWrap');
  if(!w){w=document.createElement('div');w.id='chWrap';w.className='game-modal-body ch-wrap';m.appendChild(w);}
  if(typeof _pzStop==='function')_pzStop();
  document.getElementById('gamePlay').classList.add('hidden');document.getElementById('gameOver').classList.add('hidden');w.classList.remove('hidden');
  m.classList.add('ch-on');
  document.getElementById('gameTitle').textContent=`Хронологія · ${_ch.n} постерів`;
  if(bg.classList.contains('hidden')){_gameFocus.el=null;bg.classList.remove('hidden');_lyOpen('game',()=>closeGameModal());_inertSync();_focusIn(m,_gameFocus);}
  chNext();
}
function chNext(){
  const cards=_chDeal();
  if(!cards){toast('Замало тайтлів із різними роками','err',2400);closeGameModal();return;}
  _ch.cards=cards;_ch.recent=[..._ch.recent,...cards.map(i=>i.imdbID)].slice(-_ch.n*6);
  /* dealt in a random order that is never already right */
  let o;do{o=_gameShuffle(cards.map((_,k)=>k));}while(o.every((k,x)=>x===0||_chYear(cards[o[x-1]])<_chYear(cards[k])));
  _ch.order=o;_ch.checked=false;_ch.sel=null;
  _chDraw();
}
function _chHud(){const h=document.getElementById('gameHud');if(h)h.innerHTML=`<span class="pz-hud">серія <b class="num">${_ch.streak}</b> · рекорд <b class="num">${_chBest[_chKey()]||0}</b></span>`;}
function _chCard(k){
  const i=_ch.cards[k];
  return `<div class="ch-card" role="listitem" tabindex="0" data-k="${k}" aria-label="${esc(tn(i))}"><img src="${posterSrc(i.poster)}" alt="" draggable="false" data-fb>
    <span class="ch-tx"><b>${esc(tn(i))}</b><small>${catLabel(i.customCategory||i.type)}</small></span><span class="ch-y" aria-hidden="true"></span></div>`;
}
function _chDraw(){
  const w=document.getElementById('chWrap');if(!w)return;
  w.innerHTML=`<p class="ch-hint"><span>старіше</span><i></i><span>новіше</span></p>
    <div class="ch-list" id="chList" role="list" aria-label="Постери: від найстарішого до найновішого">${_ch.order.map(_chCard).join('')}</div>
    <div class="ch-foot" id="chFoot" aria-live="polite"><button class="btn primary" id="gameNextBtn" data-act="chCheck">${ic('check')}Перевірити <kbd>Enter</kbd></button></div>`;
  _chHud();_chDragInit(document.getElementById('chList'));
}
function _chSync(){_ch.order=[...document.querySelectorAll('#chList .ch-card')].map(c=>+c.dataset.k);}
function _chSelect(card){
  if(_ch.checked)return;
  const list=document.getElementById('chList');
  if(!_ch.sel){_ch.sel=card;card.classList.add('sel');return;}
  const a=_ch.sel;_ch.sel=null;a.classList.remove('sel');
  if(a===card)return;
  const ph=document.createElement('i');list.insertBefore(ph,a);list.insertBefore(a,card);list.insertBefore(card,ph);ph.remove();
  _chSync();a.focus();
}
function _chDragInit(list){
  if(!list)return;
  list.addEventListener('pointerdown',e=>{
    const card=e.target.closest('.ch-card');if(!card||_ch.checked||e.button>0)return;
    const s={x:e.clientX,y:e.clientY};let drag=false;
    const vertical=()=>getComputedStyle(list).flexDirection==='column';
    const move=ev=>{
      if(!drag){if(Math.hypot(ev.clientX-s.x,ev.clientY-s.y)<8)return;drag=true;card.classList.add('drag');if(_ch.sel){_ch.sel.classList.remove('sel');_ch.sel=null;}}
      ev.preventDefault();
      const v=vertical(),pos=v?ev.clientY:ev.clientX,others=[...list.children].filter(c=>c!==card);
      let idx=others.findIndex(c=>{const r=c.getBoundingClientRect();return pos<(v?r.top+r.height/2:r.left+r.width/2);});
      const ref=idx<0?null:others[idx];
      if(card.nextElementSibling!==ref){const b=card.getBoundingClientRect();list.insertBefore(card,ref);const a=card.getBoundingClientRect();s.x+=a.left-b.left;s.y+=a.top-b.top;}
      card.style.transform=`translate(${ev.clientX-s.x}px,${ev.clientY-s.y}px)`;
    };
    const end=()=>{
      window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',end);window.removeEventListener('pointercancel',end);
      if(drag){card.classList.remove('drag');card.style.transform='';_chSync();}else _chSelect(card);
    };
    window.addEventListener('pointermove',move,{passive:false});window.addEventListener('pointerup',end);window.addEventListener('pointercancel',end);
  });
  list.addEventListener('keydown',e=>{
    const card=e.target.closest('.ch-card');if(!card||_ch.checked)return;
    if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();_chSelect(card);return;}
    const d={ArrowLeft:-1,ArrowUp:-1,ArrowRight:1,ArrowDown:1}[e.key];if(!d)return;
    e.preventDefault();
    if(_ch.sel===card){const sib=d<0?card.previousElementSibling:card.nextElementSibling;if(sib){list.insertBefore(card,d<0?sib:sib.nextElementSibling);_chSync();card.focus();}}
    else (d<0?card.previousElementSibling:card.nextElementSibling)?.focus();
  });
}
function chCheck(){
  if(_ch.checked)return;_chSync();_ch.checked=true;
  if(_ch.sel){_ch.sel.classList.remove('sel');_ch.sel=null;}
  const right=_ch.order.slice().sort((a,b)=>_chYear(_ch.cards[a])-_chYear(_ch.cards[b]));
  const ok=_ch.order.every((k,x)=>k===right[x]);
  const list=document.getElementById('chList');
  _ch.order.forEach((k,x)=>{const c=list.querySelector(`.ch-card[data-k="${k}"]`);c.classList.add(k===right[x]?'ok':'bad');c.querySelector('.ch-y').textContent=_chYear(_ch.cards[k]);c.tabIndex=-1;});
  /* then slide into the right order, keeping the marks of where each one was put */
  setTimeout(()=>{right.forEach(k=>list.appendChild(list.querySelector(`.ch-card[data-k="${k}"]`)));list.classList.add('done');},ok?0:650);
  const f=document.getElementById('chFoot');
  if(ok){
    _ch.streak++;
    const key=_chKey(),rec=_ch.streak>(_chBest[key]||0);if(rec){_chBest[key]=_ch.streak;_lsSet('ct_ch_best',JSON.stringify(_chBest));}
    f.innerHTML=`<p class="pz-res"><b>Так!</b> серія ${_ch.streak}${rec?' · <em>новий рекорд</em>':''}</p><button class="btn primary" id="gameNextBtn" data-act="chNext">Далі <kbd>Enter</kbd></button>`;
  }else{
    const best=_chBest[_chKey()]||0;
    f.innerHTML=`<p class="pz-res"><b>Не той порядок.</b> Серія: ${_ch.streak}${best?` · рекорд ${best}`:''}</p>
      <div class="pz-acts"><button class="btn primary" id="gameAgainBtn" data-act="chStart">${ic('refresh')}Ще раз <kbd>Enter</kbd></button><button class="btn" data-act="closeGameModal">Закрити</button></div>`;
  }
  _chHud();
  (document.getElementById('gameNextBtn')||document.getElementById('gameAgainBtn'))?.focus();
}
function _chStop(){const w=document.getElementById('chWrap');if(w){w.classList.add('hidden');w.innerHTML='';}document.querySelector('#gameModalBg .game-modal')?.classList.remove('ch-on');_ch.sel=null;}
