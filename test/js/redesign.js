/* ═══ TEST PAGE ONLY: redesign trial (11.11.2026), loaded last so these definitions win ═══
   1. Дивлюсь: «Можна дивитись» on top — the next episode of every series with unwatched aired episodes and a big +1;
      «Незабаром» under it. Replaces the Сьогодні/Нещодавно/Незабаром selector and the big card.
   2. Рекомендації: «Додати» and «✕» under the poster (not on it), one row of tiles (Для тебе · type · genres),
      «Оновити» as an icon, «приховані» as a link in the subtitle, one-line shelf notes.
   3. Пошук: an empty search shows recent queries, recently added titles and followed people;
      every result not in the lists gets «+ Додати» under it. */

/* ── 1. Дивлюсь ── */
let _nxAll=false;
const _nxNext=x=>{const len=x.se[x.s];return len&&x.e>=len?{s:x.s+1,e:1}:{s:x.s,e:x.e+1};};
function _nxRow(x){
  const i=x.i,n=_nxNext(x);
  const when=x.state==='new'?`<span class="nx-w g">вийшла ${_wbAgo(x.ls.lastAiredDate)}</span>`
    :`<span class="nx-w">ще ${x.ahead>99?'99+':x.ahead} ${_wbPl(x.ahead,'серія','серії','серій')}</span>`;
  return `<div class="nx-r">
    <img src="${posterSrc(i.poster)}" alt="" loading="lazy" data-act="wbOpen" data-args="${A(i.id)}">
    <div class="nx-i" data-act="wbOpen" data-args="${A(i.id)}" role="button" tabindex="0"><b>${esc(tn(i))}</b><span class="nx-e">${_wbEp(n.s,n.e)}</span>${when}</div>
    <button class="nx-p" data-act="nxPlus" data-args="${A(i.id)}" aria-label="Переглянув ${_wbEp(n.s,n.e)}: ${esc(tn(i))}">+1</button></div>`;
}
function _nxSoon(x){
  const i=x.i;
  return `<div class="nx-s" data-act="wbOpen" data-args="${A(i.id)}" role="button" tabindex="0"><img src="${posterSrc(i.poster)}" alt="" loading="lazy">
    <b>${esc(tn(i))}</b><span>${_wbEp(x.ls.nextEpSeason,x.ls.nextEpNum)} · ${_wbDow(x.nd)}, ${_wbDate(x.nd)}${_wbDays(x.nd)<=7?` · ${_wbWhen(x.nd)}`:''}</span></div>`;
}
function _nxBlock(xs){
  const la=x=>x.ls.lastAiredDate||'';
  const ready=xs.filter(x=>x.ser&&x.ahead>0).sort((a,b)=>(a.state==='new'?0:1)-(b.state==='new'?0:1)||(la(b)>la(a)?1:la(b)<la(a)?-1:0));
  const soon=xs.filter(x=>x.ser&&x.nd&&_wbDays(x.nd)<=14&&!(x.ahead>0)).sort((a,b)=>_wbDays(a.nd)-_wbDays(b.nd));
  if(!ready.length&&!soon.length)return '';
  const LIM=4,shown=_nxAll?ready:ready.slice(0,LIM);
  return `<section class="nx" aria-label="Можна дивитись">
    ${ready.length?`<div class="nx-h"><h2>Можна дивитись</h2><span>${ready.length}</span></div>
    <div class="nx-l">${shown.map(_nxRow).join('')}</div>
    ${ready.length>LIM?`<button class="nx-more" data-act="nxMore">${_nxAll?'Згорнути':`Ще ${ready.length-LIM}`}</button>`:''}`:''}
    ${soon.length?`<div class="nx-h sm"><h2>Незабаром</h2></div><div class="nx-sl">${soon.slice(0,4).map(_nxSoon).join('')}</div>`:''}
  </section>`;
}
function nxMore(){_nxAll=!_nxAll;rWatching(true);}
function nxPlus(id){
  const it=watching.find(w=>w.id===id);if(!it)return;
  const s0=it.season,e0=it.episode;
  adj(id,'e',1);
  if(it.season===s0&&it.episode===e0)return; /* nothing aired past this one: adj said so */
  const s1=it.season,e1=it.episode;
  document.querySelectorAll('.toast').forEach(t=>t.remove());
  const el=document.createElement('div');el.className='toast undo';el.setAttribute('role','status');el.setAttribute('aria-live','polite');
  const lbl=document.createElement('span');lbl.textContent=`«${tn(it)}» ${_wbEp(s1,e1)} переглянуто`;
  const btn=document.createElement('button');btn.className='t-undo';btn.innerHTML=ic('undo')+'Скасувати';
  const tm=setTimeout(()=>el.remove(),5000);
  btn.onclick=()=>{clearTimeout(tm);el.remove();if(it.season===s1&&it.episode===e1)adj(id,'e',-1);};
  el.append(lbl,btn);document.body.appendChild(el);
}
function rWatching(skipLive){
  const c=document.getElementById('wnList');if(!c)return;
  const list=applyF(watching,'watching');
  const xs=list.map(_wbInfo);
  if(!list.length){c.innerHTML=watching.length?`<div class="empty"><span class="empty-icon">${ic('search')}</span><div class="empty-txt">Нічого не знайдено</div></div>`:`<div class="empty"><span class="empty-icon">${ic('play')}</span><div class="empty-txt">Починай щось дивитись — додай серіал через пошук</div></div>`;return;}
  c.className='wb';
  const ts=document.getElementById('wbTopSeg');if(ts){ts.hidden=true;ts.innerHTML='';}
  c.innerHTML=_nxBlock(xs)+_wbShelves(xs);
  if(!skipLive&&!document.getElementById('tab-watching')?.classList.contains('hidden'))_startLive(list);
  if(_wbCur)_wbSheetDraw();
}

/* ── 2. Рекомендації ── */
function _recCard(it){
  const href=esc(/^tt\d+$/.test(it.imdbID||'')?`https://www.imdb.com/title/${it.imdbID}/`:`https://www.themoviedb.org/${it.mt==='tv'?'tv':'movie'}/${+it.id||0}`);
  const poster=esc(String(it.poster||'').startsWith('http')?ps(it.poster)||BLANK:_tsImg(it.poster,'w342')||BLANK);
  const score=it.imdbRating?`IMDb ${esc(it.imdbRating)}`:it.rating?`TMDB ${it.rating.toFixed(1)}`:'';
  const meta=[it.year?esc(it.year):'',_recTypeLabel(it),score].filter(Boolean).join(' · ');
  const open=`href="${href}" target="_blank" rel="noopener" data-act="_tsClickT" data-args="${A('$ev',`${it.mt}`,(it.id))}"`;
  return `<article class="rv-c" id="rc-${esc(String(it.k).replace(':','-'))}">
    <div class="rv-art"><a ${open} tabindex="-1"><img src="${poster}" alt="" loading="lazy" data-fb></a></div>
    <div class="fa-cap"><a class="fa-t" ${open}>${esc(it.title)}</a><span>${meta}</span>${it.note?`<em title="${esc(it.note)}">${esc(it.note)}</em>`:''}</div>
    <div class="rv-acts"><button class="rv-a" data-act="recMenu" data-args="${A('$ev',`${it.k}`)}" aria-label="Додати: ${esc(it.title)}">${ic('plus')}Додати</button>
      <button class="rv-n" data-act="recAct" data-args="${A(`${it.k}`,'hide')}" title="Не цікаво" aria-label="Не цікаво: ${esc(it.title)}">${ic('x')}</button></div>
  </article>`;
}
function _recPicksCount(){
  const known=_recKnown(),pool=(_recs?.shelves||[]).flatMap(s=>s.items).filter(it=>!known.has(it));
  const cnt={all:pool.length,movie:0,tv:0,anim:0};pool.forEach(i=>{cnt[i.anim?'anim':i.mt]++;});return cnt;
}
function _recTilesRender(){
  const el=document.getElementById('recsGenres');if(!el)return;
  const picks=_recView==='picks',cnt=_recPicksCount();
  const me=picks&&_recType==='all';
  const types=[['movie','Фільми'],['tv','Серіали'],['anim','Анімація']].filter(([k])=>cnt[k]);
  el.innerHTML=`<button class="rg-t rg-me${me?' on':''}" aria-pressed="${me}" data-act="recTile" data-args="[&quot;all&quot;]">
      <span class="rg-ic">${ic('spark')}</span><b>Для тебе</b><small>${cnt.all||''}</small></button>`+
    types.map(([k,l])=>{const on=picks&&_recType===k;return `<button class="rg-t rg-ty${on?' on':''}" aria-pressed="${on}" data-act="recTile" data-args="${A(k)}"><b>${l}</b><small>${cnt[k]}</small></button>`;}).join('')+
    _recGenresOk().map(([k,ua])=>{const bd=_recTiles[k],on=_recView==='genre'&&_recGenreState?.name===k;return `<button class="rg-t${on?' on':''}" aria-pressed="${on}" data-act="recGenre" data-args="${A(k)}">
      ${bd?`<img src="${esc(_tsImg(bd,'w500'))}" alt="" loading="lazy">`:''}<b>${ua}</b></button>`;}).join('');
  if(!_recTilesBusy)_recTilesFill();
}
function recTile(k){_recType=k;if(_recView!=='picks')recView('picks');else renderRecs();}
const _rdRenderRecs0=renderRecs;
renderRecs=function(){
  _rdRenderRecs0();
  const bar=document.getElementById('recsBar');if(bar)bar.querySelector('.cat-seg')?.remove();
  const sub=document.getElementById('recsSub');if(!sub)return;
  if(_recView==='hidden'){sub.innerHTML=`Тайтли, які ти сховав · <button class="rd-lnk" data-act="recTile" data-args="[&quot;all&quot;]">до підбірок</button>`;return;}
  if(hidden.length)sub.insertAdjacentHTML('beforeend',`${sub.textContent?' · ':''}<button class="rd-lnk" data-act="recView" data-args="[&quot;hidden&quot;]">приховані ${hidden.length}</button>`);
};

/* ── 3. Пошук ── */
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
const _rdSearchOpen0=searchOpen;
searchOpen=function(){_rdSearchOpen0();_seRender();_seShow();};
const _rdHandleSearch0=handleSearch;
handleSearch=function(...a){const r=_rdHandleSearch0(...a);_seShow();return r;};
function seRun(q){const i=document.getElementById('searchInput');if(!i)return;i.value=q;handleSearch();i.focus({preventScroll:true});}
function seClear(){_lsSet(_SE_KEY,'[]');_seRender();_seShow();}
function seOpen(imdb){searchSuspend();openTitle(imdb);}
function seFace(id,name,profile){searchClose();_tsPerson(id,name,profile);}
const _rdSugOpen0=_sugOpen;_sugOpen=function(...a){_seRemember();return _rdSugOpen0(...a);};
const _rdSugPerson0=_sugPerson;_sugPerson=function(...a){_seRemember();return _rdSugPerson0(...a);};
/* results: «+ Додати» under every title that is not in the lists yet */
const _rdSugSync0=_sugSync;
_sugSync=function(inp,box){
  _rdSugSync0(inp,box);
  if(box!=='suggestions')return;
  document.querySelectorAll('#suggestions .sug-item[data-act="_sugOpen"]').forEach(it=>{
    if(it.querySelector('.sug-badge,.sug-add'))return;
    const [mt,id]=JSON.parse(it.getAttribute('data-args')||'[]');
    it.insertAdjacentHTML('beforeend',`<button class="sug-add" data-act="sugAdd" data-args="${A('$ev',mt,id)}">${ic('plus')}Додати</button>`);
  });
};
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
