/* ── NAV DOCK + SEARCH LAYER ──
   One «dock» (index.html header.dock): on a computer it is the top bar; ≤1100px the five pages fold into «Ще»
   (a drop-down, .dk-drop); on a phone (≤700px) it is a floating dock at the bottom that grows into the full
   menu. navOpen/navClose toggle body.nav-on for both. The search is a full-screen layer (#srch, body.srch-on).
   Both push one history entry, so the phone's Back button closes them instead of leaving the site. */
try{history.scrollRestoration='manual';}catch(e){} /* closing the menu/search goes «back»; the browser must not restore an old scroll then */
let _ovPushed=false;
function _ovPush(){if(!_ovPushed){try{history.pushState({ctOv:1},'');_ovPushed=true;}catch(e){}}}
function _ovPop(){if(_ovPushed&&!document.body.classList.contains('nav-on')&&!document.body.classList.contains('srch-on')&&!document.body.classList.contains('fs-on')){_ovPushed=false;history.back();}}
window.addEventListener('popstate',()=>{if(history.state?.ctOv)return; /* landed on our own entry (a late «back» of a closed sheet): the menu/search stays */
  _ovPushed=false;navClose(true);searchClose(true);if(typeof fsClose==='function')fsClose(true);});

function navOpen(){_dockWall();if(typeof fsClose==='function')fsClose(true);document.body.classList.add('nav-on');document.querySelector('.dk-mb')?.setAttribute('aria-expanded','true');_ovPush();}
function navClose(fromHistory){
  if(!document.body.classList.contains('nav-on'))return;
  document.body.classList.remove('nav-on');document.querySelector('.dk-mb')?.setAttribute('aria-expanded','false');
  if(!fromHistory)_ovPop();
}
/* on a phone the ☰ doubles as ✕ for the search layer as well */
function navToggle(){
  if(document.body.classList.contains('srch-on')){searchClose();return;}
  document.body.classList.contains('nav-on')?navClose():navOpen();
}
function searchOpen(){
  _dockWall();
  const L=document.getElementById('srch');if(!L)return;
  navClose(true);if(typeof fsClose==='function')fsClose(true);
  if(!document.body.classList.contains('srch-on')){L.hidden=false;document.body.classList.add('srch-on');_ovPush();}
  _srchFit();
  const si=document.getElementById('searchInput');if(si){si.focus({preventScroll:true});si.select();}
  _seRender();_seShow();
}
/* phone keyboard: the browser pans the visible area under the keyboard and a plain fixed layer slides off the top.
   The layer follows window.visualViewport instead, so its search line stays on screen while typing. */
function _srchFit(){
  const L=document.getElementById('srch'),v=window.visualViewport;if(!L||!v)return;
  if(!document.body.classList.contains('srch-on')){L.style.top=L.style.height='';return;}
  L.style.top=Math.max(0,v.offsetTop)+'px';L.style.height=v.height+'px';
}
if(window.visualViewport){visualViewport.addEventListener('resize',_srchFit);visualViewport.addEventListener('scroll',_srchFit);}
/* a hit opened a title card / dialog: the search stays where it is, under the card (z 800) or dialog (z 1000),
   with its query, results and scroll position; closing the card simply shows it again */
let _srchSusp=false;
function searchSuspend(){
  if(!document.body.classList.contains('srch-on'))return;
  _srchSusp=true;document.getElementById('searchInput')?.blur();
}
function _srchCovered(){return !document.getElementById('titleSheet')?.classList.contains('hidden')||!!document.getElementById('mbox')?.innerHTML.trim();}
function searchResume(){
  if(!_srchSusp||_srchCovered())return;
  _srchSusp=false;
  const q=document.getElementById('searchInput')?.value.trim();if(q)doSearch(q); /* a status changed in the card shows on its poster (TMDB answers come from the cache) */
}
function searchClose(fromHistory){
  _srchSusp=false;
  if(!document.body.classList.contains('srch-on'))return;
  document.body.classList.remove('srch-on');document.getElementById('srch').hidden=true;
  clearTimeout(_st2);hideSug();const si=document.getElementById('searchInput');if(si){si.value='';si.blur();}
  if(!fromHistory)_ovPop();
}
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape')return;
  if(_srchCovered())return; /* a card or dialog on top handles its own Esc */
  if(document.body.classList.contains('srch-on')){e.preventDefault();searchClose();}
  else if(document.body.classList.contains('nav-on'))navClose();
},true); /* capture: decided before the card's own Esc closes it, so one Esc closes only the card */
/* a click outside the drop-down (computer/tablet) closes it */
document.addEventListener('click',e=>{
  if(!document.body.classList.contains('nav-on')||window.innerWidth<=700)return;
  if(!e.target.closest('.dk-drop,.dk-more'))navClose();
});
/* a click on the empty part of the search layer closes it */
document.getElementById('srch')?.addEventListener('click',e=>{if(e.target.id==='srch'||e.target.classList.contains('srch-in'))searchClose();});
/* wide enough for the full bar: an open «Ще» has nothing left to show */
let _navRz;
window.addEventListener('resize',()=>{clearTimeout(_navRz);_navRz=setTimeout(()=>{if(window.innerWidth>1100)navClose();},120);});

/* ✕ in a list search (Переглянуте/Дивлюсь/Планую, Франшизи, фільмографія); Esc in the field does the same */
function lsClear(btn){
  const inp=btn?.closest('.local-search-wrap')?.querySelector('.local-search');if(!inp)return;
  inp.value='';inp.dispatchEvent(new Event('input',{bubbles:true}));inp.focus();
}
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&e.target.classList?.contains('local-search')&&e.target.value){e.preventDefault();e.stopPropagation();lsClear(e.target);}
});
/* the dock's texture: the user's own best-rated posters, smaller copies where the host allows */
let _dockWallDone=false;
function _dockWall(){
  if(_dockWallDone)return;_dockWallDone=true;
  const ps=watched.filter(i=>/^https:\/\//.test(i.poster||'')).sort((a,b)=>(parseFloat(b.imdbRating)||0)-(parseFloat(a.imdbRating)||0)).slice(0,36)
    .map(i=>i.poster.replace(/\._V1_[^/]*\.jpg$/,'._V1_SX160.jpg'));
  if(!ps.length)return;
  const html=[...ps,...ps].slice(0,60).map(u=>`<i><img src="${esc(u)}" alt="" loading="lazy" decoding="async" data-fb></i>`).join('');
  ['dkWall','srchWall'].forEach(id=>{const el=document.getElementById(id);if(el)el.innerHTML=html;});
}
(function(){const go=()=>('requestIdleCallback' in window?requestIdleCallback(_dockWall,{timeout:2500}):setTimeout(_dockWall,500));
  if(document.readyState==='complete')go();else addEventListener('load',go,{once:true});})();

/* ── SEARCH: empty state (1.30) ──
   With nothing typed the search layer shows recent queries (remembered when a result is opened or added),
   recently added titles and the people you follow. Every result not in the lists has «+ Додати» under it. */
const _SE_KEY='ct_srch_recent';
const _seRecent=()=>_lsJSON(_SE_KEY,[]);
function _seRemember(){
  const q=document.getElementById('searchInput')?.value.trim();if(!q)return;
  const r=[q,..._seRecent().filter(x=>x.toLowerCase()!==q.toLowerCase())].slice(0,8);
  _lsSet(_SE_KEY,JSON.stringify(r));
}
function _seRender(){
  let el=document.getElementById('srchEmpty');
  if(!el){el=document.createElement('div');el.id='srchEmpty';el.className='se';document.getElementById('suggestions')?.after(el);}
  const rec=_seRecent();
  const ts=x=>typeof x.addedAt==='number'?x.addedAt:Date.parse(x.addedAt)||0;
  const added=[...watching,...watched,...planned].filter(x=>x.addedAt&&x.poster&&x.poster!=='N/A').sort((a,b)=>ts(b)-ts(a)).slice(0,6);
  const ppl=(typeof _trackedPeople!=='undefined'?_trackedPeople:[]).filter(p=>p.profile).slice(0,10);
  el.innerHTML=(rec.length?`<section class="se-s"><div class="se-h"><h3>Ти шукав</h3><button class="rd-lnk" data-act="seClear">Очистити</button></div>
      <div class="se-q">${rec.map(q=>`<button class="se-c" data-act="seRun" data-args="${A(q)}">${ic('search')}<span>${esc(q)}</span></button>`).join('')}</div></section>`:'')
    +(added.length?`<section class="se-s"><div class="se-h"><h3>Нещодавно додане</h3></div><div class="suggestions se-g">${added.map(i=>`<div class="sug-item" data-act="seOpen" data-args="${A(i.imdbID)}">
      <div class="sug-p"><img class="sug-img" src="${posterSrc(i.poster)}" alt="" loading="lazy" data-fb>${_ownBadge(i.imdbID)}</div>
      <div class="sug-title">${esc(tn(i))}</div><div class="sug-meta">${[_wbYear(i),catLabel(i.customCategory||i.type).toLowerCase()].filter(Boolean).join(' · ')}</div></div>`).join('')}</div></section>`:'')
    +(ppl.length?`<section class="se-s"><div class="se-h"><h3>Люди, за якими стежиш</h3></div><div class="se-p">${ppl.map(p=>`<button class="se-f" data-act="seFace" data-args="${A(p.id,p.name,p.profile)}"><img src="${_tsImg(p.profile,'w185')}" alt="" loading="lazy"><span>${esc(p.name)}</span></button>`).join('')}</div></section>`:'');
}
function _seShow(){const q=document.getElementById('searchInput')?.value.trim();const el=document.getElementById('srchEmpty');if(el)el.hidden=!!q;
  document.getElementById('srchHint')?.toggleAttribute('hidden',!q&&!!el?.innerHTML.trim());}
function seRun(q){const i=document.getElementById('searchInput');if(!i)return;i.value=q;handleSearch();i.focus({preventScroll:true});}
function seClear(){_lsSet(_SE_KEY,'[]');_seRender();_seShow();}
function seOpen(imdb){searchSuspend();openTitle(imdb);}
function seFace(id,name,profile){searchClose();_tsPerson(id,name,profile);}
function sugAdd(ev,mt,id){
  ev.stopPropagation();
  openMenu(ev,[{icon:'check',label:'Переглянуто',fn:'sugAddAs',args:[mt,id,'watched']},{icon:'play',label:'Дивлюсь',fn:'sugAddAs',args:[mt,id,'watching']},
    {icon:'bookmark',label:'Запланувати',fn:'sugAddAs',args:[mt,id,'planned']}]);
}
async function sugAddAs(mt,id,list){
  _seRemember();
  let imdb='';
  try{const d=await tmdbFetch(`/${mt}/${id}/external_ids`);imdb=d?.imdb_id||'';
    if(imdb){_resolveCache[mt+':'+id]={imdbID:imdb,ended:mt==='movie',ts:Date.now()};_resolveCacheSave();}}
  catch(e){toast('Не вдалося зв\'язатися з TMDB, спробуй ще раз','err');return;}
  if(!imdb){toast('Цього тайтлу немає на IMDb, тож додати його не вийде','err',3600);return;}
  const fn={watched:addW,watching:addWn,planned:addPl}[list];
  try{await fn(imdb);}catch(e){toast('Не вдалося додати: немає зв\'язку з OMDb','err');return;}
  _ownIdx=null;const q=document.getElementById('searchInput')?.value.trim();if(q)doSearch(q);
}

/* ── PHONE SCROLL LOCK ──
   While a sheet, the menu, the search or a title card is open, the page under it must not scroll. overflow:hidden on
   the body does that, but on Android Chrome it also brings the address bar back: the bottom dock jumps up and its taps
   keep landing in the old place. So on a phone the body keeps scrolling and a drag that would move the page is
   cancelled here; a drag inside something that can still scroll that way (the sheet, the card, chip rows) goes through. */
const _LOCKS=['nav-on','wb-on','fs-on','tg-on','srch-on','ts-on'];
let _lkX=0,_lkY=0;
document.addEventListener('touchstart',e=>{const t=e.touches[0];if(t){_lkX=t.clientX;_lkY=t.clientY;}},{passive:true,capture:true});
document.addEventListener('touchmove',e=>{
  if(!e.cancelable||e.defaultPrevented||e.touches.length!==1)return;
  const cl=document.body.classList;if(!_LOCKS.some(c=>cl.contains(c))||!matchMedia('(max-width:700px)').matches)return;
  const t=e.touches[0],dx=t.clientX-_lkX,dy=t.clientY-_lkY,hor=Math.abs(dx)>Math.abs(dy);
  for(let el=e.target;el&&el!==document.body&&el!==document.documentElement;el=el.parentElement){
    const cs=getComputedStyle(el);
    if(hor){
      if(el.scrollWidth>el.clientWidth+1&&/auto|scroll/.test(cs.overflowX)&&((dx<0&&el.scrollLeft+el.clientWidth<el.scrollWidth-1)||(dx>0&&el.scrollLeft>0)))return;
    }else if(el.scrollHeight>el.clientHeight+1&&/auto|scroll/.test(cs.overflowY)&&((dy<0&&el.scrollTop+el.clientHeight<el.scrollHeight-1)||(dy>0&&el.scrollTop>0)))return;
  }
  e.preventDefault();
},{passive:false});

/* ── SHEET SWIPE (phone): pull a bottom sheet down to close it; from the grab bar / header, a swipe up runs `up` ──
   The sheet follows the finger; a short or slow pull springs back. Content that is scrolled keeps scrolling. */
function sheetSwipe(pan,{close,up,handle,scroller}){
  if(!pan||pan._sw)return;pan._sw=1;
  let y0=0,t0=0,dy=0,mode=null,fromHandle=false;
  const phone=()=>matchMedia('(max-width:700px)').matches;
  pan.addEventListener('touchstart',e=>{
    if(!phone()||e.touches.length!==1)return;
    y0=e.touches[0].clientY;t0=Date.now();dy=0;mode=null;
    fromHandle=!!(handle&&e.target.closest(handle));
  },{passive:true});
  pan.addEventListener('touchmove',e=>{
    if(!phone()||!t0)return;
    dy=e.touches[0].clientY-y0;
    if(!mode){
      if(Math.abs(dy)<8)return;
      const sc=scroller?pan.querySelector(scroller):pan;
      if(dy>0&&((sc?sc.scrollTop:0)<=0||fromHandle))mode='down';
      else if(dy<0&&fromHandle&&up)mode='up';
      else{t0=0;return;}
      pan.style.transition='none';
    }
    e.preventDefault();
    pan.style.transform=mode==='down'?`translateY(${Math.max(0,dy)}px)`:`translateY(${Math.max(-60,dy*.35)}px)`;
  },{passive:false});
  const end=()=>{
    if(!mode){t0=0;return;}
    const v=Math.abs(dy)/Math.max(1,Date.now()-t0),m=mode;mode=null;t0=0;
    pan.style.transition='transform .22s cubic-bezier(.3,.7,.2,1)';
    if(m==='down'&&(dy>110||(dy>40&&v>.6))){
      /* the sheet still slides away for 0.2 s: taps already go through it (a quick tap on the dock used to land on the dimmer) */
      const root=pan.parentElement;if(root)root.style.pointerEvents='none';
      pan.style.transform='translateY(100%)';setTimeout(()=>{pan.style.transform='';pan.style.transition='';if(root)root.style.pointerEvents='';close();},200);return;}
    pan.style.transform='';setTimeout(()=>{pan.style.transition='';},230);
    if(m==='up'&&(dy<-50||(dy<-25&&v>.5)))up();
  };
  pan.addEventListener('touchend',end);pan.addEventListener('touchcancel',end);
}
