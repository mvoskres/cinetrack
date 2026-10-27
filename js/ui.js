/* ── MOBILE SIDEBAR ── */
(function(){
  const sb   = document.querySelector('.sidebar');
  const BREAK = 900;

  /* ── Hamburger ── */
  const ham = document.createElement('button');
  ham.className = 'mobile-ham';
  ham.setAttribute('aria-label','Меню');
  ham.innerHTML = '<svg width="16" height="12" viewBox="0 0 16 12" fill="none"><rect width="16" height="2" rx="1" fill="#dde1e8"/><rect y="5" width="16" height="2" rx="1" fill="#dde1e8"/><rect y="10" width="16" height="2" rx="1" fill="#dde1e8"/></svg>';
  ham.style.cssText = [
    'position:fixed','top:10px','left:10px','z-index:600',
    'width:40px','height:40px','border-radius:10px',
    'background:rgba(14,18,24,.97)',
    'border:1px solid rgba(255,255,255,.18)',
    'display:none','align-items:center','justify-content:center',
    'cursor:pointer',
    'box-shadow:0 2px 16px rgba(0,0,0,.6)',
    'flex-shrink:0','-webkit-tap-highlight-color:transparent'
  ].join(';');
  document.body.appendChild(ham);

  /* ── Full-screen overlay — sits between sidebar and content ── */
  const ov = document.createElement('div');
  ov.style.cssText = [
    'position:fixed','inset:0','z-index:499',
    'background:rgba(0,0,0,.72)',
    'display:none','cursor:pointer',
    'pointer-events:none',
    '-webkit-tap-highlight-color:transparent'
  ].join(';');
  document.body.appendChild(ov);

  /* sidebar must be ABOVE overlay */
  sb.style.zIndex = '500';

  function openSb() {
    sb.classList.add('open');
    ov.style.display        = 'block';
    ov.style.pointerEvents  = 'auto';
    document.body.style.overflow    = 'hidden';
    document.body.style.touchAction = 'none';
    /* hamburger would otherwise sit on top of the drawer's own logo; overlay tap / nav tap still close it */
    ham.style.display = 'none';
    document.querySelectorAll('.toast').forEach(t=>t.style.opacity='0');
  }

  function closeSb() {
    sb.classList.remove('open');
    ov.style.display        = 'none';
    ov.style.pointerEvents  = 'none';
    document.body.style.overflow    = '';
    document.body.style.touchAction = '';
    if (window.innerWidth < BREAK) ham.style.display = 'flex';
    document.querySelectorAll('.toast').forEach(t=>t.style.opacity='');
  }

  ham.addEventListener('click', () =>
    sb.classList.contains('open') ? closeSb() : openSb()
  );
  ov.addEventListener('click',       closeSb);
  ov.addEventListener('touchstart',  e => { e.preventDefault(); closeSb(); }, {passive:false});

  /* close on nav tap (mobile) */
  document.querySelectorAll('.nav-item').forEach(b =>
    b.addEventListener('click', () => { if (window.innerWidth < BREAK) closeSb(); })
  );

  let _rTimer;
  function onResize() {
    clearTimeout(_rTimer);
    _rTimer=setTimeout(()=>{
      if (window.innerWidth < BREAK) {
        ham.style.display = 'flex';
      } else {
        ham.style.display = 'none';
        closeSb();
      }
    },80);
  }
  window.addEventListener('resize', onResize);
  onResize();
})();

/* ── MOBILE CARD DISMISS ── */
/* Toggle overlay open/close on poster tap */
function toggleOv(ev,el){
  ev.stopPropagation();
  const card=el.closest('.card');
  const wasOpen=card.classList.contains('ov-open');
  /* Close all other overlays first */
  document.querySelectorAll('.card.ov-open').forEach(c=>c.classList.remove('ov-open'));
  /* Toggle this card (re-open if it was closed) */
  if(!wasOpen) card.classList.add('ov-open');
}
/* Close overlays when tapping outside */
document.addEventListener('click', function(e){
  /* Don't interfere with button clicks or the poster toggle button */
  if(e.target.closest('.card-overlay .ab, .card-overlay a.ab, .card-toggle'))return;
  /* Tapping overlay background — close this card */
  const ov=e.target.closest('.card-overlay');
  if(ov){ov.closest('.card')?.classList.remove('ov-open');return;}
  /* Tapping outside any card — close all */
  document.querySelectorAll('.card.ov-open').forEach(c=>c.classList.remove('ov-open'));
});


