/* ── TAGS / URL ── */
function findItem(id){for(const l of[watched,watching,planned]){const it=l.find(i=>i.id===id);if(it)return it;}return null;}
/* ── DATA CHECK ──
   One scan for what drifts over time: the same title twice in a list, a title left in
   Планую/Дивлюсь after it was marked watched, hidden titles that are in the lists,
   and missing or doubtful categories. Every fix is a checkbox; one undo restores all. */
/* the categories the data check may suggest: «Інше» is only ever set by hand */
const CAT_L=Object.fromEntries(Object.entries(CAT).filter(([k])=>k!=='other'));
const LIST_L={watched:'Переглянуте',watching:'Дивлюсь',planned:'Планую'};
function _catGuess(i){return gc({Genre:i.genre,Country:i.country,Type:i.type});}
const _richness=i=>(i.rating?4:0)+(i.comment?2:0)+((i.tags||[]).length?2:0)+(i.streamUrl?1:0)+(i.season?1:0);
function _mergeInto(keep,other){
  ['rating','comment','streamUrl','imdbRating','poster','genre','country','runtime','imdbUrl'].forEach(k=>{if(!keep[k]&&other[k])keep[k]=other[k];});
  if((other.tags||[]).length)keep.tags=[...new Set([...(keep.tags||[]),...other.tags])];
  if(other.addedAt&&(!keep.addedAt||other.addedAt<keep.addedAt))keep.addedAt=other.addedAt;
}
let _clean=[];
const _ty=i=>i.year?`${i.title} (${i.year})`:i.title;
function cleanScan(){
  const fixes=[],L={watched,watching,planned};
  for(const [ln,list] of Object.entries(L)){
    const by={};list.forEach(i=>{if(i.imdbID)(by[i.imdbID]=by[i.imdbID]||[]).push(i);});
    Object.values(by).filter(g=>g.length>1).forEach(g=>{
      const [keep,...rest]=g.slice().sort((a,b)=>_richness(b)-_richness(a)||(a.addedAt||0)-(b.addedAt||0));
      fixes.push({grp:'dup',on:true,title:_ty(keep),note:`${LIST_L[ln]}: ${g.length} записи → 1, оцінки й теги злито`,
        run:()=>{rest.forEach(r=>{_mergeInto(keep,r);const k=L[ln].indexOf(r);if(k>=0)L[ln].splice(k,1);});}});
    });
  }
  const wById={};watched.forEach(i=>{if(i.imdbID)wById[i.imdbID]=i;});
  planned.filter(i=>wById[i.imdbID]).forEach(i=>fixes.push({grp:'cross',on:true,title:_ty(i),note:'вже в Переглянутому, прибрати з Планую',
    run:()=>{const k=planned.indexOf(i);if(k>=0)planned.splice(k,1);}}));
  /* Marked watched after it was started: a leftover. Otherwise it may be a rewatch, so off by default. */
  watching.filter(i=>wById[i.imdbID]&&!_isRewatch(i)).forEach(i=>{ /* a rewatch is not a leftover */const late=(wById[i.imdbID].addedAt||0)>(i.addedAt||0);
    fixes.push({grp:'cross',on:late,title:_ty(i),note:late?'позначено переглянутим уже після старту, прибрати з Дивлюсь':'є в Переглянутому, можливо, це повторний перегляд',
      run:()=>{const k=watching.indexOf(i);if(k>=0)watching.splice(k,1);}});});
  const inLists=new Set([...watched,...watching,...planned].map(i=>i.imdbID));
  const hid=hidden.filter(h=>h.imdbID&&inLists.has(h.imdbID));
  if(hid.length)fixes.push({grp:'hidden',on:true,title:`${hid.length} ${hid.length===1?'тайтл':'тайтли'}`,note:hid.map(h=>h.title).slice(0,6).join(', ')+(hid.length>6?'…':''),
    run:()=>{hidden=hidden.filter(h=>!hid.includes(h));}});
  [...watched,...watching,...planned].forEach(i=>{
    const cur=i.customCategory,g=_catGuess(i);
    if(!cur)fixes.push({grp:'cat',on:true,title:_ty(i),note:`без категорії → ${CAT_L[g]}`,run:()=>{i.customCategory=g;}});
    /* a category someone set by hand is only a suggestion: off until ticked */
    else if(i.genre&&cur!==g&&CAT_L[cur])fixes.push({grp:'cat',on:false,title:_ty(i),note:`${CAT_L[cur]} → ${CAT_L[g]} (${i.country||'країна невідома'}), категорія виставлена вручну чи раніше`,run:()=>{i.customCategory=g;}});
  });
  return fixes;
}
function runCleanScan(){
  _clean=cleanScan();
  const box=document.getElementById('cleanList'),msg=document.getElementById('cleanMsg');if(!box)return;
  if(!_clean.length){msg.className='cl-msg ok';msg.textContent='Усе чисто: дублів, хвостів і сумнівних категорій немає';box.innerHTML='';return;}
  msg.className='cl-msg';msg.textContent=`Знайдено ${_clean.length}. Зніми галочку з того, що чіпати не треба`;
  const G={dup:'Дублі в одному списку',cross:'Один тайтл у двох списках',hidden:'Приховані, але є у списках',cat:'Категорії'};
  box.innerHTML=Object.entries(G).map(([g,lbl])=>{
    const rows=_clean.map((f,k)=>({f,k})).filter(x=>x.f.grp===g);if(!rows.length)return'';
    return `<div class="cl-grp"><div class="cl-h">${lbl} <span class="num">${rows.length}</span></div>${rows.map(({f,k})=>
      `<label class="cl-row"><input type="checkbox" data-change="cleanToggle" data-args="${A(k,'$el')}"${f.on?' checked':''}><span><b>${esc(f.title)}</b><small>${esc(f.note)}</small></span></label>`).join('')}</div>`;
  }).join('')+`<button class="w-btn cl-go" id="cleanGo" data-act="cleanApply"></button>`;
  _cleanCount();
}
function cleanToggle(k,el){_clean[k].on=el.checked;_cleanCount();}
function _cleanCount(){const b=document.getElementById('cleanGo'),n=_clean.filter(f=>f.on).length;if(b){b.disabled=!n;b.textContent=n?`Виправити вибране (${n})`:'Нічого не вибрано';}}
function cleanApply(){
  const todo=_clean.filter(f=>f.on);if(!todo.length)return;
  const snap=JSON.stringify({watched,watching,planned,hidden});
  todo.forEach(f=>f.run());
  save();rWatched();rWatching();rPlanned();updateStats();runCleanScan();
  if(_undo){clearTimeout(_undo.timer);_undo=null;}
  document.querySelectorAll('.toast').forEach(t=>t.remove());
  const el=document.createElement('div');el.className='toast undo';
  const lbl=document.createElement('span');lbl.textContent=`Виправлено: ${todo.length}`;
  const btn=document.createElement('button');btn.className='t-undo';btn.innerHTML=ic('undo')+'Відновити';
  btn.onclick=()=>{
    clearTimeout(_undo?.timer);_undo=null;
    const o=JSON.parse(snap);
    [[watched,o.watched],[watching,o.watching],[planned,o.planned]].forEach(([cur,old])=>cur.splice(0,cur.length,...old));
    hidden=o.hidden;
    save();rWatched();rWatching();rPlanned();updateStats();runCleanScan();
    el.remove();toast('Дані повернуто як було','ok',2400);
  };
  el.append(lbl,btn);document.body.appendChild(el);
  const timer=setTimeout(()=>{el.remove();_undo=null;},8000);_undo={timer};
}


/* ── TAG SHEET: every tag you already use as a toggle + a field for a new one; changes save at once ── */
let _tgId=null;
function _tgAll(){const c={};[...watched,...watching,...planned].forEach(i=>(i.tags||[]).forEach(t=>c[t]=(c[t]||0)+1));return Object.keys(c).sort((a,b)=>c[b]-c[a]||a.localeCompare(b,'uk')).map(t=>[t,c[t]]);}
function tagEdit(id){
  if(!findItem(id))return;_tgId=id;closeMenu?.();
  let L=document.getElementById('tgSheet');
  if(!L){L=document.createElement('div');L.id='tgSheet';L.className='tg-sh';document.body.appendChild(L);}
  L.innerHTML=`<div class="tg-dim" data-act="tagClose"></div><div class="tg-pan" role="dialog" aria-label="Теги"><div class="tg-grab"></div><div class="tg-in"></div></div>`;
  _tgDraw();document.body.classList.add('tg-on');
  try{history.pushState({tgSheet:1},'');}catch(e){}
}
function addTag(id){tagEdit(id);} /* old name, still used by the title card */
function tagClose(fromHistory){
  if(!document.body.classList.contains('tg-on'))return;
  document.body.classList.remove('tg-on');_tgId=null;const L=document.getElementById('tgSheet');if(L)L.innerHTML='';
  if(!fromHistory&&history.state?.tgSheet)history.back();
}
window.addEventListener('popstate',()=>tagClose(true));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('tg-on')){e.stopPropagation();tagClose();}},true);
function _tgDraw(){
  const L=document.getElementById('tgSheet'),it=findItem(_tgId);if(!L||!it){tagClose();return;}
  const mine=it.tags||[],all=_tgAll();
  L.querySelector('.tg-in').innerHTML=`<div class="tg-hd"><div><b>Теги</b><span>${esc(tn(it))}</span></div><button class="tg-ok" data-act="tagClose">Готово</button></div>
    <div class="tg-new"><input id="tgInp" class="tg-inp" type="text" maxlength="40" placeholder="Новий тег: улюблене, передивитись…" data-enter="tagNew" autocomplete="off"><button class="tg-add" data-act="tagNew">${ic('plus')}Додати</button></div>
    ${all.length?`<div class="tg-lbl">Твої теги · тапни, щоб додати чи зняти</div><div class="tg-chips">${all.map(([t,n])=>{const on=mine.includes(t);return `<button class="tg-ch${on?' on':''}" aria-pressed="${on}" data-act="tagTog" data-args="${A(`${uriSafe(t)}`)}">${on?ic('check'):''}#${esc(t)}<span>${n}</span></button>`;}).join('')}</div>`
      :`<div class="tg-lbl">Тегів ще немає — створи перший: ним можна позначати фільми й потім показувати лише їх (Фільтри → Теги)</div>`}`;
}
function _tgSaved(){save();rWatched();rWatching();rPlanned();_tgDraw();}
function tagTog(t){t=decodeURIComponent(t);const it=findItem(_tgId);if(!it)return;it.tags=it.tags||[];const k=it.tags.indexOf(t);if(k>=0)it.tags.splice(k,1);else it.tags.push(t);_tgSaved();}
function tagNew(){
  const inp=document.getElementById('tgInp'),t=(inp?.value||'').trim().replace(/^#+/,'');const it=findItem(_tgId);if(!it||!t)return;
  it.tags=it.tags||[];if(!it.tags.includes(t))it.tags.push(t);_tgSaved();
  const ni=document.getElementById('tgInp');if(ni){ni.value='';ni.focus();}
}
function saveTag(id){tagNew();}
/* a tag on a card/poster: show the list filtered by it (the tab that is open) */
function tagGo(ev,t){
  ev?.stopPropagation?.();ev?.preventDefault?.();t=decodeURIComponent(t);
  const tab=['watched','watching','planned'].find(k=>!document.getElementById('tab-'+k)?.classList.contains('hidden'))||'watched';
  if(document.body.classList.contains('wb-on'))wbClose?.();
  F[tab].tags=[t];buildBar(tab);buildTags(tab);rerender(tab);window.scrollTo({top:0,behavior:'smooth'});
}
function rmTag(id,tag){tag=decodeURIComponent(tag);const it=findItem(id);if(!it||!it.tags)return;it.tags=it.tags.filter(t=>t!==tag);save();rWatched();rWatching();rPlanned();}
function delGlobalTag(tag){
  tag=decodeURIComponent(tag);
  const snap=[...watched,...watching,...planned].map(i=>({id:i.id,tags:i.tags?[...i.tags]:[]}));
  function _doUndo(){
    [...watched,...watching,...planned].forEach(i=>{const s=snap.find(x=>x.id===i.id);if(s)i.tags=s.tags;});
    save();rWatched();rWatching();rPlanned();rDash();
    buildPan();
    toast('Тег відновлено','ok',2000);
  }
  [watched,watching,planned].forEach(arr=>arr.forEach(i=>{if(i.tags)i.tags=i.tags.filter(t=>t!==tag);}));
  save();rWatched();rWatching();rPlanned();rDash();
  buildPan();
  /* Show undo toast matching existing del() UX */
  document.querySelectorAll('.toast').forEach(t=>t.remove());
  const el=document.createElement('div');el.className='toast undo';
  el.innerHTML=`<span>Тег «${esc(tag)}» видалено</span>`;
  const btn=document.createElement('button');btn.className='t-undo';btn.innerHTML=ic('undo')+'Відновити';
  btn.onclick=()=>{el.remove();clearTimeout(_tagUndoTimer);_doUndo();};
  el.appendChild(btn);document.body.appendChild(el);
  let _tagUndoTimer=setTimeout(()=>el.remove(),5000);
}
function editUrl(id){
  const it=findItem(id);if(!it)return;
  const hasUrl=!!it.streamUrl;
  modal(`<h2 class="modal-title" style="margin-bottom:.6rem">Посилання для перегляду</h2>
    <div class="modal-sub" style="margin-bottom:1rem">${esc(it.title)}</div>
    <div class="form-g"><label class="form-lbl" for="urlInp">URL для перегляду</label>
      <input class="api-inp" id="urlInp" type="url" placeholder="https://…" value="${esc(it.streamUrl||'')}" autofocus
        data-enter="saveUrl" data-args="${A(+id)}">
      <div id="urlErr" style="font-size:.7rem;color:var(--rose);min-height:.85rem;margin-top:.25rem"></div>
    </div>
    <div class="modal-btns">
      <button class="m-btn g" data-act="saveUrl" data-args="${A((id))}">Зберегти</button>
      ${hasUrl?`<button class="m-btn can" data-act="removeUrl" data-args="${A((id))}" style="border-color:var(--rose-b);color:var(--rose)">${ic('trash')}Видалити посилання</button>`:''}
      <button class="m-btn can" data-act="closeModal">Скасувати</button>
    </div>`);
  setTimeout(()=>document.getElementById('urlInp')?.focus(),120);
}
function saveUrl(id){
  const it=findItem(id);if(!it)return;
  const u=document.getElementById('urlInp')?.value.trim()||'';
  const err=document.getElementById('urlErr');
  if(u && !/^https?:\/\/.+/.test(u)){if(err)err.textContent='Посилання має починатися з http:// або https://';return;}
  it.streamUrl=u;save();rWatched();rWatching();rPlanned();closeModal();
  if(u)toast('Посилання збережено','ok',2200);
  else toast('Посилання видалено','',2000);
}
function removeUrl(id){
  const it=findItem(id);if(!it)return;
  it.streamUrl='';save();rWatched();rWatching();rPlanned();closeModal();
  toast('Посилання видалено','',2000);
}

