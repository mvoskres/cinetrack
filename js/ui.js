/* ── NAV DOCK + SEARCH LAYER ──
   One «dock» (index.html header.dock): on a computer it is the top bar; ≤1100px the five pages fold into «Ще»
   (a drop-down, .dk-drop); on a phone (≤700px) it is a floating dock at the bottom that grows into the full
   menu. navOpen/navClose toggle body.nav-on for both. The search is a full-screen layer (#srch, body.srch-on).
   The phone's Back button closes them instead of leaving the site (BACK below). */
try{history.scrollRestoration='manual';}catch(e){}
try{const h=history.state;if(h&&(h.ctLy||h.ctOv||h.wbSheet||h.tgSheet||h.ctExit))history.replaceState(null,'');}catch(e){} /* a reload on one of our overlay entries (or the 1.32 exit sentinel): it is a plain page now */ /* closing the menu/search goes «back»; the browser must not restore an old scroll then */

/* ── BACK on Android: CloseWatcher (1.32.1) ──
   Chrome on Android animates every step back through history — a screenshot of the previous entry slides in, even for our own
   pushState entries — so closing a card with Back looked like the page reloading. In Chrome on Android (the system Back is known
   to reach CloseWatcher there) overlays add NO history entries: they are listed in _cwL (in the order they opened) and ONE
   CloseWatcher is armed while anything is listed. Back fires it → only the top overlay closes → a new watcher is armed for the rest.
   Always one watcher, never one per overlay: watchers made without a tap in between are grouped by the browser and a single
   Back closes the whole group (HTML «close watcher manager»); a lone watcher re-made after each Back is always its own group.
   Everywhere else (a computer — its Back button / mouse back button must keep closing overlays —, iOS Safari, other Android
   browsers, where Back may not reach a watcher) the history entries below are used. A new overlay, both ways: _lyOpen('key',
   closeFn) when it opens, _lyDone('key') at the end of its close function (plus _OVL for inert); Back calls closeFn.
   Esc keeps its own handlers in both ways. */
const _ua=navigator.userAgentData;
const _cwMode='CloseWatcher' in window&&!!_ua&&_ua.platform==='Android'&&(_ua.brands||[]).some(b=>b.brand==='Google Chrome');
const _cwL=[];let _cwW=null;
function _cwAdd(key,close){if(!_cwL.some(l=>l.key===key))_cwL.push({key,close});_exitCancel();_cwSync();}
function _cwDel(key){const k=_cwL.findIndex(l=>l.key===key);if(k>=0)_cwL.splice(k,1);_cwSync();}
function _cwSync(){ /* a watcher exists exactly while something is open, or the exit guard is armed */
  const need=_cwL.length>0||(_exitOn&&!_exitWin);
  if(need&&!_cwW){try{const w=new CloseWatcher();w.onclose=()=>{if(_cwW===w)_cwBack();};_cwW=w;}catch(e){}}
  else if(!need&&_cwW){const w=_cwW;_cwW=null;try{w.destroy();}catch(e){}}
}
function _cwBack(){
  _cwW=null; /* the browser has already destroyed it */
  if(document.querySelector('.ct-menu'))closeMenu(true); /* a ⋯ menu on top closes first, as with Esc */
  else{const top=_cwL.pop();if(top){try{top.close();}catch(e){}_inertSync();}else _exitHit();}
  _cwSync();
}
if(_cwMode)window.addEventListener('keydown',e=>{if(e.key==='Escape'&&_cwW)e.preventDefault();},true); /* window capture: before every other handler. Esc is handled by them (they know what is on top); the cancelled keydown keeps it from also reaching the watcher and closing a second layer */
/* ── DOUBLE BACK TO EXIT (installed app, Chrome on an Android touch screen) ──
   With nothing open the same watcher is the guard: the first Back shows a hint and leaves the guard off for 2 s, so a second
   Back goes to Android — there is no history entry behind the page — and the app closes. No second Back → armed again.
   In a browser tab, on a computer and in other browsers Back behaves as usual (the 1.32 history sentinel is gone). */
const _isApp=()=>['standalone','minimal-ui','fullscreen'].some(m=>matchMedia('(display-mode: '+m+')').matches);
const _exitOn=_cwMode&&_isApp()&&matchMedia('(pointer:coarse)').matches;
let _exitWin=false,_exitT=0;
function _exitHit(){_exitWin=true;clearTimeout(_exitT);toast('Ще раз «Назад» — щоб вийти','',2000);_exitT=setTimeout(()=>{_exitWin=false;_cwSync();},2000);}
function _exitCancel(){if(_exitWin){_exitWin=false;clearTimeout(_exitT);}} /* something opened meanwhile: its Back closes it */
if(_exitOn)_cwSync();
if(_cwMode)window.addEventListener('popstate',()=>{ /* only entries left by an older version (a reload keeps the tab's history) */
  const h=history.state;if(h&&(h.ctLy||h.ctOv||h.wbSheet||h.tgSheet||h.ctExit))history.replaceState(null,'');
  if(_exitWin)_exitHit(); /* the second Back landed on such an entry instead of leaving: one more */
});

/* ── history entries (no CloseWatcher, or a computer) ── */
let _ovPushed=false;
const _ovOpen=()=>['nav-on','srch-on','fs-on'].some(c=>document.body.classList.contains(c));
function _ovBack(){navClose(true);searchClose(true);if(typeof fsClose==='function')fsClose(true);} /* menu, search and filters share one entry: only one of them is open */
function _ovPush(){if(_cwMode){_cwAdd('ov',_ovBack);return;}if(!_ovPushed){try{history.pushState({ctOv:1},'');_ovPushed=true;}catch(e){}}}
function _ovPop(){
  if(_cwMode){if(!_ovOpen())_cwDel('ov');return;}
  if(!_ovPushed||_ovOpen())return;
  _ovPushed=false;
  if(!_LY.some(l=>!l.dead))history.back(); /* a card/dialog is still on top of the menu entry: Back from it will skip the entry (popstate below) */
}
/* ── LAYERS: title card, dialogs (#mbox), the game window ── (with CloseWatcher on a touch screen: _cwAdd/_cwDel above instead)
   Each one pushes its own history entry when it opens ({ctLy:id}) so the phone's Back button / gesture closes the top one
   and nothing else (a card opened from the search: Back closes the card, the search stays; a dialog over a card: only the dialog).
   Opening: _lyOpen('key', closeFn). Closing by code (✕, Esc, a button): the close function ends with _lyDone('key'), which
   marks its entry «stale» and walks one step back; a stale entry the user lands on (or that lies under a newer layer) is skipped.
   A layer opened right after another closed (modal → modal) reuses the stale entry (replaceState), so nothing flickers. */
const _LY=[];const _lyStale=new Set();let _lyId=0,_lyT=0;
function _lyOpen(key,close){
  if(_cwMode){_cwAdd(key,close);return;}
  if(_LY.some(l=>l.key===key&&!l.dead))return;
  const id=++_lyId;_LY.push({id,key,close,dead:false});
  try{
    const top=history.state?.ctLy;
    if(top&&_lyStale.has(top)){_lyStale.delete(top);history.replaceState({ctLy:id},'');}
    else history.pushState({ctLy:id},'');
  }catch(e){}
}
function _lyDone(key){
  if(_cwMode){_cwDel(key);return;}
  const l=[..._LY].reverse().find(x=>x.key===key&&!x.dead);if(!l)return;
  l.dead=true;_lyStale.add(l.id);
  clearTimeout(_lyT);_lyT=setTimeout(()=>{if(_lyStale.has(history.state?.ctLy))history.back();},0);
}
if(!_cwMode)window.addEventListener('popstate',()=>{
  const st=history.state,sid=st?.ctLy||0;
  if(sid&&_lyStale.has(sid)){history.back();return;} /* a closed layer's entry: keep going back */
  while(_LY.length&&_LY[_LY.length-1].id>sid){const l=_LY.pop();_lyStale.delete(l.id);if(!l.dead){l.dead=true;try{l.close();}catch(e){}}}
  _inertSync();
  if(st?.ctOv){ /* landed on the menu/search entry: it stays, unless it was already closed (then this entry is a leftover) */
    if(!_ovPushed&&!_ovOpen())history.back();
    return;
  }
  if(sid)return; /* a layer's own entry: the sheets under it stay */
  _ovPushed=false;navClose(true);searchClose(true);if(typeof fsClose==='function')fsClose(true);});

/* the phone menu is the same dock: what is invisible in the current state is also inert (not focusable, not read out) */
function _navAria(on){
  document.querySelectorAll('.dk-mb,.dk-more').forEach(b=>b.setAttribute('aria-expanded',String(on)));
  const ph=matchMedia('(max-width:700px)').matches;
  document.querySelectorAll('.dk-big,.dk-top,.dk-rset').forEach(e=>{e.inert=!on;});
  document.querySelectorAll('.dk-lists').forEach(e=>{e.inert=on&&ph;});
}
_navAria(false);
function navOpen(){_dockWall();if(typeof fsClose==='function')fsClose(true);document.body.classList.add('nav-on');_navAria(true);_ovPush();}
function navClose(fromHistory){
  if(!document.body.classList.contains('nav-on'))return;
  document.body.classList.remove('nav-on');_navAria(false);
  if(!fromHistory)_ovPop();
}
/* on a phone the ☰ doubles as ✕ for the search layer as well */
function navToggle(){
  if(document.body.classList.contains('srch-on')){searchClose();return;}
  document.body.classList.contains('nav-on')?navClose():navOpen();
}
const _srchFocus={el:null}; /* the button that opened the search: Esc / ✕ puts focus back there */
function searchOpen(){
  _dockWall();
  const L=document.getElementById('srch');if(!L)return;
  navClose(true);if(typeof fsClose==='function')fsClose(true);
  if(!document.body.classList.contains('srch-on')){_srchFocus.el=document.activeElement;L.hidden=false;document.body.classList.add('srch-on');_ovPush();}
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
  _inertSync();if(fromHistory===true)_srchFocus.el=null;else _focusBack(_srchFocus);
  if(!fromHistory)_ovPop();
}
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape')return;
  if(_srchCovered())return; /* a card or dialog on top handles its own Esc */
  if(document.querySelector('.ct-menu'))return; /* a menu on top closes first */
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
    +(added.length?`<section class="se-s"><div class="se-h"><h3>Нещодавно додане</h3></div><div class="suggestions se-g">${added.map(i=>`<div class="sug-item" role="button" tabindex="0" data-act="seOpen" data-args="${A(i.imdbID)}">
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

/* ── BACKGROUND INERT ──
   While an overlay (search, filters, game window, «Дивлюсь» sheet, title card, dialog, tag sheet) is open, everything under it is
   `inert`: Tab and screen readers stay in the top layer, taps cannot reach the page. Computed from what is open, never remembered,
   so it cannot get stuck: _inertSync() runs from the open/close functions (before focus goes back) and from a MutationObserver. */
const _isOn=(id,cls)=>()=>document.body.classList.contains(cls)?document.getElementById(id):null;
const _OVL=[ /* bottom to top = by z-index */
  _isOn('srch','srch-on'),_isOn('fsh','fs-on'),
  ()=>{const e=document.getElementById('gameModalBg');return e&&!e.classList.contains('hidden')?e:null;},
  _isOn('wbSheet','wb-on'),
  ()=>{const e=document.getElementById('titleSheet');return e&&!e.classList.contains('hidden')?e:null;},
  ()=>{const e=document.getElementById('mbox');return e&&e.innerHTML.trim()?e:null;},
  _isOn('tgSheet','tg-on')];
const _inertSet=new Set();
function _inertSync(){
  const open=_OVL.map(f=>f()).filter(Boolean),top=open[open.length-1],want=new Set();
  if(top){
    document.querySelectorAll('#dock,.dk-drop,.ph-top,#main>*').forEach(e=>{if(e!==top&&!e.contains(top))want.add(e);});
    open.slice(0,-1).forEach(e=>want.add(e));
  }
  _inertSet.forEach(e=>{if(!want.has(e)){e.inert=false;_inertSet.delete(e);}});
  want.forEach(e=>{if(!_inertSet.has(e)){e.inert=true;_inertSet.add(e);}});
}
(function(){
  const mo=new MutationObserver(_inertSync);
  mo.observe(document.body,{attributes:true,attributeFilter:['class']});
  const t=document.getElementById('titleSheet'),g=document.getElementById('gameModalBg'),m=document.getElementById('mbox');
  if(t)mo.observe(t,{attributes:true,attributeFilter:['class']});
  if(g)mo.observe(g,{attributes:true,attributeFilter:['class']});
  if(m)mo.observe(m,{childList:true});
})();
/* an overlay opens: remember where focus was, so closing puts it back; run with the element that gets focus next */
function _focusIn(el,store){if(store&&!store.el)store.el=document.activeElement;if(el)el.focus({preventScroll:true});}
function _focusBack(store,fallback){
  const p=store&&store.el;if(store)store.el=null;
  const t=p&&p.isConnected?p:fallback&&fallback();
  if(t&&typeof t.focus==='function')t.focus({preventScroll:true});
}
/* a redraw of an open sheet replaces the focused button: find its twin (same action + arguments) and focus that */
function _keepFocus(root,redraw){
  const a=document.activeElement,inside=a&&root.contains(a)&&a!==root;
  const act=inside&&a.getAttribute('data-act'),args=inside&&a.getAttribute('data-args'),cls=inside&&a.className;
  redraw();
  if(!inside||document.activeElement!==document.body&&root.contains(document.activeElement))return;
  const t=[...root.querySelectorAll(act?`[data-act="${act}"]`:'.'+String(cls).split(' ')[0])].find(e=>!act||e.getAttribute('data-args')===args);
  if(t)t.focus({preventScroll:true});
}

/* ── skip link, role=button, strips ── */
function skipMain(ev){ev.preventDefault();const m=document.getElementById('main');if(m){m.focus({preventScroll:false});m.scrollIntoView({block:'start'});}}
/* a role=button that is not a <button> must work from the keyboard too: Enter / Space press it */
document.addEventListener('keydown',e=>{
  if((e.key!=='Enter'&&e.key!==' ')||e.isComposing||e.defaultPrevented)return;
  const t=e.target;if(!t||!t.matches||!t.matches('[role=button][data-act]')||t.matches('button,a,input,select,textarea'))return;
  e.preventDefault();t.click();
});
/* horizontal strips without a visible scrollbar (chips, faces, cards): a mouse wheel scrolls them sideways on a computer,
   only while the strip can still move that way (at its end the page scrolls as usual); touch and trackpads are untouched */
document.addEventListener('wheel',e=>{
  if(e.ctrlKey||Math.abs(e.deltaY)<=Math.abs(e.deltaX)||!matchMedia('(hover:hover) and (pointer:fine)').matches)return;
  for(let el=e.target;el&&el!==document.body&&el!==document.documentElement;el=el.parentElement){
    if(!(el instanceof HTMLElement)||el.scrollWidth<=el.clientWidth+1)continue;
    const cs=getComputedStyle(el);
    if(cs.scrollbarWidth!=='none'||!/auto|scroll/.test(cs.overflowX)||(el.scrollHeight>el.clientHeight+1&&/auto|scroll/.test(cs.overflowY)))continue;
    const d=e.deltaMode===1?e.deltaY*32:e.deltaY,max=el.scrollWidth-el.clientWidth;
    if((d<0&&el.scrollLeft<=0)||(d>0&&el.scrollLeft>=max-1))return; /* at the end: let the page scroll */
    el.scrollLeft+=d;e.preventDefault();return;
  }
},{passive:false});
