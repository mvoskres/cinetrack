/* ── INIT ── */
['watched','watching','planned'].forEach(buildBar);['watched','watching','planned'].forEach(_barEmpty);
rWatched();rWatching();rPlanned();rDash();updateStats();
if(!TMDB_KEY&&(watched.length||watching.length||planned.length))
  setTimeout(()=>toast('Додай ключ TMDB у Налаштуваннях: без нього немає українських назв, пошуку, рекомендацій і статистики.','',10000),800);
_backupStateRender();
_versionNotice();
if(!API)setTimeout(_tmdbRatingFill,4000); /* 1.48: no OMDb key — TMDB scores for the titles that have none */
setTimeout(_ukListFill,2500);
/* a user key that would not parse was left untouched in storage (core.js _lsJSON): say so, loudly */
if(_lsBad.size)setTimeout(()=>toast('Не вдалося прочитати збережене в браузері: '+[..._lsBad].join(', ')+'. Воно лишилось як є, нічого не перезаписано. Віднови дані з бекапу: Налаштування','err',15000),500);
/* 1.45: 5+ titles and never backed up (no Drive, no file) — say where the lists live and offer both ways */
function _bkNudge(){
  const el=document.getElementById('bkNudge');if(!el)return;
  const later=+localStorage.getItem('ct_bk_later')||0;
  const show=_gdCount()>=5&&!_gdOn()&&!localStorage.getItem('ct_last_export')&&Date.now()>later;
  el.innerHTML=show?`<div class="nb" role="region" aria-label="Бекап">${ic('save')}<div><b>Збережи свої списки</b><small>Зараз усе лежить лише в цьому браузері: очистиш дані чи зміниш телефон — списки зникнуть.</small>
    <div class="nb-a"><button class="btn primary" data-act="gdSignIn">На Google Drive</button><button class="btn" data-act="doExport">У файл</button><button class="btn nb-later" data-act="bkLater">Пізніше</button></div>
    <small class="nb-n">Drive зберігає сам раз на кілька днів; файл — коли натиснеш.</small></div></div>`:'';
}
function bkLater(){_lsSet('ct_bk_later',String(Date.now()+7*864e5));_bkNudge();}
function _backupStateRender(){
  const last=parseInt(localStorage.getItem('ct_last_export')||'0');
  const days=last?Math.max(0,Math.floor((Date.now()-last)/864e5)):null;
  const t=!_gdCount()?'':days===null?'бекапу ще не було':days===0?'бекап сьогодні':days===1?'бекап учора':`бекап ${days} дн тому`,stale=!!_gdCount()&&(days===null||days>=14);
  document.querySelectorAll('[data-bk]').forEach(el=>{el.textContent=t;el.classList.toggle('stale',stale);});
  document.querySelectorAll('.dock .av').forEach(el=>el.classList.toggle('stale',stale));
  const me=document.getElementById('backupState');if(me)me.title='Налаштування · '+t;
  _bkNudge();
  const bs=document.querySelector('#stBackup .bk-st');if(bs&&typeof _stBackupHtml==='function'){const t=document.createElement('div');t.innerHTML=_stBackupHtml();const n=t.querySelector('.bk-st');if(n)bs.replaceWith(n);}
}
