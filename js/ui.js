/* ── MOBILE SIDEBAR ──
   Below 900px the sidebar is a drawer: the last tab-bar button toggles it (toggleSidebar), a tap on the dimmed
   page or on a section closes it, and widening the window closes it. (A separate hamburger button used to be
   built here as well; CSS has always hidden it, so it is gone.) */
(function(){
  const sb=document.querySelector('.sidebar');
  const BREAK=900;

  /* full-screen overlay: sits between the sidebar (z 500) and the content */
  const ov=document.createElement('div');
  ov.style.cssText=[
    'position:fixed','inset:0','z-index:499',
    'background:rgba(0,0,0,.72)',
    'display:none','cursor:pointer',
    'pointer-events:none',
    '-webkit-tap-highlight-color:transparent'
  ].join(';');
  document.body.appendChild(ov);

  function openSb(){
    sb.classList.add('open');
    ov.style.display='block';
    ov.style.pointerEvents='auto';
    document.body.style.overflow='hidden';
    document.body.style.touchAction='none';
    document.querySelectorAll('.toast').forEach(t=>t.style.opacity='0');
  }
  function closeSb(){
    sb.classList.remove('open');
    ov.style.display='none';
    ov.style.pointerEvents='none';
    document.body.style.overflow='';
    document.body.style.touchAction='';
    document.querySelectorAll('.toast').forEach(t=>t.style.opacity='');
  }
  window.toggleSidebar=()=>sb.classList.contains('open')?closeSb():openSb();

  ov.addEventListener('click',closeSb);
  ov.addEventListener('touchstart',e=>{e.preventDefault();closeSb();},{passive:false});

  /* close on nav tap (mobile) */
  document.querySelectorAll('.nav-item').forEach(b=>
    b.addEventListener('click',()=>{if(window.innerWidth<BREAK)closeSb();})
  );

  let _rTimer;
  window.addEventListener('resize',()=>{
    clearTimeout(_rTimer);
    _rTimer=setTimeout(()=>{if(window.innerWidth>=BREAK)closeSb();},80);
  });
})();
