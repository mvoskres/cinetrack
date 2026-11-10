/* ── NAV DOCK + SEARCH LAYER ──
   One «dock» (index.html header.dock): on a computer it is the top bar; ≤1100px the five pages fold into «Ще»
   (a drop-down, .dk-drop); on a phone (≤700px) it is a floating dock at the bottom that grows into the full
   menu. navOpen/navClose toggle body.nav-on for both. The search is a full-screen layer (#srch, body.srch-on).
   Both push one history entry, so the phone's Back button closes them instead of leaving the site. */
try{history.scrollRestoration='manual';}catch(e){} /* closing the menu/search goes «back»; the browser must not restore an old scroll then */
let _ovPushed=false;
function _ovPush(){if(!_ovPushed){try{history.pushState({ctOv:1},'');_ovPushed=true;}catch(e){}}}
function _ovPop(){if(_ovPushed&&!document.body.classList.contains('nav-on')&&!document.body.classList.contains('srch-on')){_ovPushed=false;history.back();}}
window.addEventListener('popstate',()=>{_ovPushed=false;navClose(true);searchClose(true);});

function navOpen(){_dockWall();document.body.classList.add('nav-on');document.querySelector('.dk-mb')?.setAttribute('aria-expanded','true');_ovPush();}
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
  navClose(true);
  if(!document.body.classList.contains('srch-on')){L.hidden=false;document.body.classList.add('srch-on');_ovPush();}
  _srchFit();
  const si=document.getElementById('searchInput');if(si){si.focus({preventScroll:true});si.select();}
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
