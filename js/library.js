/* ── TAGS / URL ── */
function findItem(id){for(const l of[watched,watching,planned]){const it=l.find(i=>i.id===id);if(it)return it;}return null;}
/* ── DATA CHECK ──
   One scan for what drifts over time: the same title twice in a list, a title left in
   Планую/Дивлюсь after it was marked watched, hidden titles that are in the lists,
   and missing or doubtful categories. Every fix is a checkbox; one undo restores all. */
const CAT_L={movie:'Фільм',series:'Серіал',anime:'Аніме',cartoon:'Мульт'};
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
  watching.filter(i=>wById[i.imdbID]).forEach(i=>{const late=(wById[i.imdbID].addedAt||0)>(i.addedAt||0);
    fixes.push({grp:'cross',on:late,title:_ty(i),note:late?'позначено переглянутим уже після старту, прибрати з Дивлюсь':'є в Переглянутому, можливо, це повторний перегляд',
      run:()=>{const k=watching.indexOf(i);if(k>=0)watching.splice(k,1);}});});
  const inLists=new Set([...watched,...watching,...planned].map(i=>i.imdbID));
  const hid=hidden.filter(h=>h.imdbID&&inLists.has(h.imdbID));
  if(hid.length)fixes.push({grp:'hidden',on:true,title:`${hid.length} ${hid.length===1?'тайтл':'тайтли'}`,note:hid.map(h=>h.title).slice(0,6).join(', ')+(hid.length>6?'…':''),
    run:()=>{hidden=hidden.filter(h=>!hid.includes(h));}});
  [...watched,...watching,...planned].forEach(i=>{
    const cur=i.customCategory,g=_catGuess(i);
    if(!cur)fixes.push({grp:'cat',on:true,title:_ty(i),note:`без категорії → ${CAT_L[g]}`,run:()=>{i.customCategory=g;}});
    else if(i.genre&&cur!==g&&CAT_L[cur])fixes.push({grp:'cat',on:true,title:_ty(i),note:`${CAT_L[cur]} → ${CAT_L[g]} (${i.country||'країна невідома'})`,run:()=>{i.customCategory=g;}});
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
  }).join('')+`<button class="w-btn cl-go" id="cleanGo" onclick="cleanApply()"></button>`;
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


function addTag(id){
  const it=findItem(id);if(!it)return;
  modal(`<h2 class="modal-title" style="margin-bottom:.6rem">Новий тег</h2>
    <div class="modal-sub" style="margin-bottom:1rem">${esc(it.title)}</div>
    <div class="form-g"><label class="form-lbl">Назва тегу</label>
      <input class="api-inp" id="tagInp" type="text" placeholder="наприклад: улюблене, передивитись…" autofocus
        onkeydown="if(event.key==='Enter')saveTag(${id})">
      <div id="tagErr" style="font-size:.7rem;color:var(--rose);min-height:.85rem;margin-top:.25rem"></div>
    </div>
    <div class="modal-btns">
      <button class="m-btn g" data-act="saveTag" data-args="${A((id))}">Додати тег</button>
      <button class="m-btn can" onclick="closeModal()">Скасувати</button>
    </div>`);
  setTimeout(()=>document.getElementById('tagInp')?.focus(),120);
}
function saveTag(id){
  const it=findItem(id);if(!it)return;
  const t=document.getElementById('tagInp')?.value.trim();
  const err=document.getElementById('tagErr');
  if(!t){if(err)err.textContent='Введи назву тегу';return;}
  if(!it.tags)it.tags=[];
  if(it.tags.includes(t)){if(err)err.textContent=`Тег «${t}» вже є`;return;}
  it.tags.push(t);save();rWatched();rWatching();rPlanned();closeModal();
  toast(`«${t}» додано`,'ok',2400);
}
function rmTag(id,tag){tag=decodeURIComponent(tag);const it=findItem(id);if(!it||!it.tags)return;it.tags=it.tags.filter(t=>t!==tag);save();rWatched();rWatching();rPlanned();}
function delGlobalTag(tag){
  tag=decodeURIComponent(tag);
  const snap=[...watched,...watching,...planned].map(i=>({id:i.id,tags:i.tags?[...i.tags]:[]}));
  function _doUndo(){
    [...watched,...watching,...planned].forEach(i=>{const s=snap.find(x=>x.id===i.id);if(s)i.tags=s.tags;});
    save();rWatched();rWatching();rPlanned();rDash();
    ['watched','watching','planned'].forEach(t=>{const p=document.getElementById(panId(t));if(p&&p.style.display!=='none')buildPan(t);});
    toast('Тег відновлено','ok',2000);
  }
  [watched,watching,planned].forEach(arr=>arr.forEach(i=>{if(i.tags)i.tags=i.tags.filter(t=>t!==tag);}));
  save();rWatched();rWatching();rPlanned();rDash();
  ['watched','watching','planned'].forEach(t=>{const p=document.getElementById(panId(t));if(p&&p.style.display!=='none')buildPan(t);});
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
    <div class="form-g"><label class="form-lbl">URL для перегляду</label>
      <input class="api-inp" id="urlInp" type="url" placeholder="https://…" value="${esc(it.streamUrl||'')}" autofocus
        onkeydown="if(event.key==='Enter')saveUrl(${id})">
      <div id="urlErr" style="font-size:.7rem;color:var(--rose);min-height:.85rem;margin-top:.25rem"></div>
    </div>
    <div class="modal-btns">
      <button class="m-btn g" data-act="saveUrl" data-args="${A((id))}">Зберегти</button>
      ${hasUrl?`<button class="m-btn can" data-act="removeUrl" data-args="${A((id))}" style="border-color:var(--rose-b);color:var(--rose)">${ic('trash')}Видалити посилання</button>`:''}
      <button class="m-btn can" onclick="closeModal()">Скасувати</button>
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

