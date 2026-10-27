/* ── INIT ── */
['watched','watching','planned'].forEach(buildBar);
rWatched();rWatching();rPlanned();rDash();updateStats();
if(!API)
  setTimeout(()=>toast('Додай OMDb API-ключ у Налаштуваннях, щоб застосунок запрацював.','',10000),800);
else if(!watched.length&&!watching.length&&!planned.length)
  setTimeout(()=>toast('Даних поки немає. Відновити бекап: Налаштування → Дані → Імпорт.','',8000),600);
_backupStateRender();
function _backupStateRender(){
  const el=document.getElementById('backupState');if(!el)return;
  const last=parseInt(localStorage.getItem('ct_last_export')||'0');
  const days=last?Math.max(0,Math.floor((Date.now()-last)/864e5)):null;
  el.querySelector('span').textContent=days===null?'Бекапу ще не було':days===0?'Бекап сьогодні':`Бекап: ${days} дн тому`;
  el.classList.toggle('stale',days===null||days>=14);
}
