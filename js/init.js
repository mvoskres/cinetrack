/* ── INIT ── */
['watched','watching','planned'].forEach(buildBar);
rWatched();rWatching();rPlanned();rDash();updateStats();
if(!API)
  setTimeout(()=>toast('Додай OMDb API-ключ у Налаштуваннях, щоб застосунок запрацював.','',10000),800);
else if(!watched.length&&!watching.length&&!planned.length)
  setTimeout(()=>toast('Даних поки немає. Відновити бекап: Налаштування → Відновити.','',8000),600);
_backupStateRender();
_versionNotice();
setTimeout(_ukListFill,2500);
/* a user key that would not parse was left untouched in storage (core.js _lsJSON): say so, loudly */
if(_lsBad.size)setTimeout(()=>toast('Не вдалося прочитати збережене в браузері: '+[..._lsBad].join(', ')+'. Воно лишилось як є, нічого не перезаписано. Відновіть дані з бекапу: Налаштування','err',15000),500);
function _backupStateRender(){
  const last=parseInt(localStorage.getItem('ct_last_export')||'0');
  const days=last?Math.max(0,Math.floor((Date.now()-last)/864e5)):null;
  const t=days===null?'бекапу ще не було':days===0?'бекап сьогодні':days===1?'бекап учора':`бекап ${days} дн тому`,stale=days===null||days>=14;
  document.querySelectorAll('[data-bk]').forEach(el=>{el.textContent=t;el.classList.toggle('stale',stale);});
  document.querySelectorAll('.dock .av').forEach(el=>el.classList.toggle('stale',stale));
  const me=document.getElementById('backupState');if(me)me.title='Налаштування · '+t;
}
