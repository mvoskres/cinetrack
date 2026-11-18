/* ── INIT ── */
['watched','watching','planned'].forEach(buildBar);['watched','watching','planned'].forEach(_barEmpty);
rWatched();rWatching();rPlanned();rDash();updateStats();
/* 1.51: the app opens on the list used last (Переглянуте / Дивлюсь / Планую) — a setting of this device (ct_last_tab), not in the backup.
   ?tab=watching|planned|watched|search comes from the home-screen shortcuts (manifest.webmanifest); it is taken once and dropped from the address */
const _START_TABS=['watched','watching','planned'];
{const _goTab0=goTab;goTab=function(id,btn){_goTab0(id,btn);if(_START_TABS.includes(id))_lsSet('ct_last_tab',id);};}
(()=>{
  let q=null,last=null;
  try{const u=new URL(location.href);q=u.searchParams.get('tab');if(q!==null){u.searchParams.delete('tab');history.replaceState(history.state,'',u.pathname+u.search+u.hash);}}catch(e){}
  try{last=localStorage.getItem('ct_last_tab');}catch(e){}
  const t=_START_TABS.includes(q)?q:_START_TABS.includes(last)?last:'watched';
  if(t!=='watched')goTab(t);
  if(q==='search')searchOpen();
})();
if(!TMDB_KEY&&(watched.length||watching.length||planned.length))
  setTimeout(()=>toast('Додай ключ TMDB у Налаштуваннях: без нього немає українських назв, пошуку, рекомендацій і статистики.','',10000),800);
_backupStateRender();
_versionNotice();
if(!API)setTimeout(_tmdbRatingFill,4000); /* 1.48: no OMDb key — TMDB scores for the titles that have none */
/* 1.49.3: Ukrainian films were stored without their Ukrainian title (it equals the original one) — ask TMDB again, once */
try{if(!localStorage.getItem('ct_uk_fix1')){let n=0;[...watched,...watching,...planned].forEach(i=>{if(/Ukraine/i.test(i.country||'')&&_ukList[i.imdbID]===''){delete _ukList[i.imdbID];n++;}});
  if(n)_lsSet('ct_uk_titles',JSON.stringify(_ukList));_lsSet('ct_uk_fix1','1');}}catch(e){}
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
/* 1.50: titles 1–19 — what the ratings feed, and how far to Статистика (10) and Ігри (20); ✕ hides it for good */
function _hlRender(){
  const el=document.getElementById('hlLine');if(!el)return;
  let hid=false;try{hid=localStorage.getItem('ct_hl_hide')==='1';}catch(e){}
  const n=watched.length;
  if(hid||n<1||n>=GAME_MIN){el.innerHTML='';return;}
  const rated=watched.filter(i=>+i.rating).length,bar=(v,m)=>`<i aria-hidden="true"><em style="width:${Math.min(100,Math.round(v/m*100))}%"></em></i>`;
  el.innerHTML=`<div class="hl" role="note">${ic('star')}<span class="hl-t"><b>Оціни переглянуте</b> — з оцінок будуються рекомендації й статистика · оцінено ${rated} з ${n}</span>
    <span class="hl-s"><span>Статистика ${bar(n,10)} ${Math.min(n,10)}/10</span><span>Ігри ${bar(n,GAME_MIN)} ${n}/${GAME_MIN}</span></span>
    <button class="hl-x" data-act="hlHide" aria-label="Сховати підказку">✕</button></div>`;
}
function hlHide(){_lsSet('ct_hl_hide','1');_hlRender();}
function bkLater(){_lsSet('ct_bk_later',String(Date.now()+7*864e5));_bkNudge();}
function _backupStateRender(){
  const last=parseInt(localStorage.getItem('ct_last_export')||'0');
  const days=last?Math.max(0,Math.floor((Date.now()-last)/864e5)):null;
  const t=!_gdCount()?'':days===null?'бекапу ще не було':days===0?'бекап сьогодні':days===1?'бекап учора':`бекап ${days} дн тому`,stale=!!_gdCount()&&(days===null||days>=14);
  document.querySelectorAll('[data-bk]').forEach(el=>{el.textContent=t;el.classList.toggle('stale',stale);});
  document.querySelectorAll('.dock .av').forEach(el=>el.classList.toggle('stale',stale));
  const me=document.getElementById('backupState');if(me)me.title='Налаштування · '+t;
  _bkNudge();_hlRender();
  const bs=document.querySelector('#stBackup .bk-st');if(bs&&typeof _stBackupHtml==='function'){const t=document.createElement('div');t.innerHTML=_stBackupHtml();const n=t.querySelector('.bk-st');if(n)bs.replaceWith(n);}
}
