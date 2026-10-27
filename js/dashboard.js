/* ── MOVE ── */
function mvToW(id){
  const it=watching.find(i=>i.id===id);if(!it)return;
  modal(`
    <h2 class="modal-title" style="margin-bottom:.3rem">Переглянуто</h2>
    <div class="modal-sub" style="margin-bottom:1rem">${esc(it.title)}</div>
    <div class="form-g"><label class="form-lbl">Категорія</label>
      <select class="form-sel" id="mC">
        ${Object.entries(CAT).map(([v,l])=>`<option value="${v}"${(it.customCategory||it.type)===v?' selected':''}>${l}</option>`).join('')}
      </select></div>
    <div class="form-g"><label class="form-lbl">Моя оцінка</label>
      <div class="stars" id="starsBox">${buildStars(0)}</div>
      <input type="hidden" id="eR" value="0"></div>
    <div class="form-g"><label class="form-lbl">Враження</label>
      <textarea class="form-ta" id="eCm" rows="3" placeholder="Що сподобалось?"></textarea></div>
    <div class="modal-btns">
      <button class="m-btn g" data-act="confirmMv" data-args="${A((id))}">Перенести в переглянуте</button>
      <button class="m-btn can" onclick="closeModal()">Скасувати</button>
    </div>`);
}
function confirmMv(id){
  const it=watching.find(i=>i.id===id);if(!it)return;
  const existing=watched.find(x=>x.imdbID===it.imdbID);
  if(existing){ /* already in watched: keep that record, but don't silently drop the rating/comment just entered */
    const r=parseInt(document.getElementById('eR').value)||0,cm=document.getElementById('eCm').value.trim();
    if(r)existing.rating=r;if(cm)existing.comment=cm;
    if(it.tags?.length)existing.tags=[...new Set([...(existing.tags||[]),...it.tags])];
    if(it.streamUrl&&!existing.streamUrl)existing.streamUrl=it.streamUrl;
    if(it.runtime&&!existing.runtime)existing.runtime=it.runtime;
  }
  else watched.unshift({id:Date.now(),imdbID:it.imdbID,title:it.title,poster:it.poster,year:it.year,type:it.type,genre:it.genre,country:it.country||'',imdbUrl:it.imdbUrl,imdbRating:it.imdbRating||null,...(it.runtime?{runtime:it.runtime}:{}),...(it.tags?.length?{tags:[...it.tags]}:{}),...(it.streamUrl?{streamUrl:it.streamUrl}:{}),customCategory:document.getElementById('mC').value,rating:parseInt(document.getElementById('eR').value)||0,comment:document.getElementById('eCm').value.trim(),addedAt:Date.now()});
  watching=watching.filter(i=>i.id!==id);
  saveAll();rWatched();rWatching();closeModal();
}
async function plToWn(id){
  const it=planned.find(i=>i.id===id);if(!it)return;
  const origIdx=planned.indexOf(it);
  const snap=JSON.parse(JSON.stringify(it));
  /* addWn removes it from planned itself, and only once the add succeeded —
     removing it up front lost the item whenever OMDb was unreachable */
  let ok=false;
  try{ok=await addWn(it.imdbID);}catch(e){toast('Не вдалося перенести: немає зв\'язку з OMDb','err');}
  if(!ok)return;
  saveAll();rPlanned();
  _mvUndo(snap,'planned',origIdx,()=>{
    watching=watching.filter(x=>x.imdbID!==snap.imdbID);
    planned.splice(origIdx,0,snap);
    saveAll();rWatching();rPlanned();rDash();
  },`«${snap.title}» → Дивлюсь`);
}
async function plToW(id){
  const it=planned.find(i=>i.id===id);if(!it)return;
  const origIdx=planned.indexOf(it);
  const snap=JSON.parse(JSON.stringify(it));
  if(!_pendingMap[it.imdbID])_pmSet(it.imdbID,{imdbID:it.imdbID,Title:it.title,Poster:it.poster,Year:it.year,Type:it.type,Genre:it.genre,Country:it.country,imdbRating:it.imdbRating,Runtime:it.runtime?it.runtime+' min':''});
  let ok=false;
  const wasWatched=watched.find(x=>x.imdbID===it.imdbID);
  if(wasWatched){ /* keep the user's tags/stream link from the dropped planned copy */
    if(it.tags?.length)wasWatched.tags=[...new Set([...(wasWatched.tags||[]),...it.tags])];
    if(it.streamUrl&&!wasWatched.streamUrl)wasWatched.streamUrl=it.streamUrl;
    planned=planned.filter(i=>i.id!==id);ok=true;} /* already watched: just drop the planned duplicate */
  else try{ok=await addW(it.imdbID);}catch(e){toast('Не вдалося перенести: немає зв\'язку з OMDb','err');}
  if(!ok)return;
  saveAll();rPlanned();
  _mvUndo(snap,'planned',origIdx,()=>{
    if(!wasWatched)watched=watched.filter(x=>x.imdbID!==snap.imdbID);
    planned.splice(origIdx,0,snap);
    saveAll();rWatched();rPlanned();rDash();
  },`«${snap.title}» → Переглянуто`);
}

/* ── DASHBOARD ── */
function rDash(){
  const sec=document.getElementById('dashSection');if(!sec)return;
  const today=new Date();today.setHours(0,0,0,0);
  const localDate=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const tStr=localDate(today);
  const tTom=localDate(new Date(today.getTime()+86400000));
  const t7d =localDate(new Date(today.getTime()-7*86400000));
  const t2w =localDate(new Date(today.getTime()+14*86400000));

  const fdPast=s=>{
    const diff=Math.round((today-new Date(s+'T00:00:00'))/86400000);
    if(diff===0)return'Сьогодні';
    if(diff===1)return'Вчора';
    return new Date(s+'T00:00:00').toLocaleDateString('uk-UA',{day:'numeric',month:'short'});
  };
  const fdFuture=s=>{
    const diff=Math.round((new Date(s+'T00:00:00')-today)/86400000);
    if(diff===1)return'Завтра';
    return new Date(s+'T00:00:00').toLocaleDateString('uk-UA',{day:'numeric',month:'short'});
  };

  /* Build ordered card list — airing first, then recent (newest→oldest), then soon (soonest→latest) */
  const cards=[];

  /* Airing today/tomorrow — keyed on nextEpDate */
  const airing=watching.filter(i=>{const nd=i.liveStatus?.nextEpDate;return nd&&(nd===tStr||nd===tTom);})
    .sort((a,b)=>a.liveStatus.nextEpDate.localeCompare(b.liveStatus.nextEpDate));

  /* Recently aired (last 7 days) — keyed on lastAiredDate, exclude those already in airing */
  const airingIds=new Set(airing.map(i=>i.imdbID));
  const recent=watching.filter(i=>{
    const ls=i.liveStatus; if(!ls||airingIds.has(i.imdbID))return false;
    const ld=ls.lastAiredDate; return ld&&ld>=t7d&&ld<=tStr;
  }).sort((a,b)=>b.liveStatus.lastAiredDate.localeCompare(a.liveStatus.lastAiredDate));

  /* Coming soon (next 14 days beyond tomorrow) */
  const soon=watching.filter(i=>{const nd=i.liveStatus?.nextEpDate;return nd&&nd>tTom&&nd<=t2w;})
    .sort((a,b)=>a.liveStatus.nextEpDate.localeCompare(b.liveStatus.nextEpDate));

  if(!airing.length&&!recent.length&&!soon.length){sec.innerHTML='';return;}

  const mkCard=(i,type)=>{
    const ls=i.liveStatus;
    let ep,pill,cls;
    if(type==='airing'){
      ep=ls.nextEpSeason&&ls.nextEpNum?`S${ls.nextEpSeason}E${ls.nextEpNum}`:'Новий епізод';
      const isToday=ls.nextEpDate===tStr;
      pill=isToday?'Сьогодні':'Завтра';
      cls='dc-airing';
    }else if(type==='recent'){
      ep=ls.lastAiredSeason&&ls.lastAiredEp?`S${ls.lastAiredSeason}E${ls.lastAiredEp}`:'Новий епізод';
      pill=`Вийшла ${fdPast(ls.lastAiredDate)}`;
      cls='dc-recent';
    }else{
      ep=ls.nextEpSeason&&ls.nextEpNum?`S${ls.nextEpSeason}E${ls.nextEpNum}`:'Новий епізод';
      pill=fdFuture(ls.nextEpDate);
      cls='dc-soon';
    }
    return `<div class="dash-card ${cls}"><img class="dash-img" src="${i.poster||blank()}" loading="lazy" onerror="this.src=BLANK"><div class="dash-info"><div class="dash-title"><a href="${i.imdbUrl}" target="_blank">${esc(i.title)}</a></div><div class="dash-ep">${ep}</div><div class="dash-pill">${pill}</div></div></div>`;
  };

  const allCards=[
    ...airing.map(i=>mkCard(i,'airing')),
    ...recent.map(i=>mkCard(i,'recent')),
    ...soon.map(i=>mkCard(i,'soon')),
  ];

  /* Section label summarises what's shown */
  const parts=[];
  if(airing.length) parts.push(`<span style="color:var(--gold)">${airing.length} сьогодні/завтра</span>`);
  if(recent.length) parts.push(`<span style="color:var(--sky)">${recent.length} нещодавно</span>`);
  if(soon.length)   parts.push(`<span style="color:var(--jade-2)">${soon.length} скоро</span>`);

  sec.innerHTML=`<div class="dash-strip-wrap">
    <div class="dash-strip-head">Серіали в ефірі &nbsp;·&nbsp; ${parts.join(' &nbsp;·&nbsp; ')}</div>
    <div class="dash-strip-outer" id="dsOuter">
      <button class="ds-btn ds-btn-l" onclick="dsScroll(-1)" aria-label="Прокрутити ліворуч">‹</button>
      <div class="dash-strip" id="dsStrip">${allCards.join('')}</div>
      <button class="ds-btn ds-btn-r" onclick="dsScroll(1)" aria-label="Прокрутити праворуч">›</button>
    </div>
  </div>`;
  /* Init scroll state after render */
  requestAnimationFrame(dsSync);
}

/* ── DASHBOARD STRIP SCROLL ── */
function dsScroll(dir){
  const strip=document.getElementById('dsStrip');
  if(!strip)return;
  const cardW=strip.querySelector('.dash-card')?.offsetWidth||190;
  strip.scrollBy({left:dir*(cardW+10)*2,behavior:'smooth'});
}
function dsSync(){
  const strip=document.getElementById('dsStrip');
  const outer=document.getElementById('dsOuter');
  if(!strip||!outer)return;
  /* Wire scroll listener once */
  if(!strip._scrollWired){
    strip.addEventListener('scroll',dsSync,{passive:true});
    strip._scrollWired=true;
  }
  const atStart=strip.scrollLeft<=4;
  const atEnd=strip.scrollLeft>=strip.scrollWidth-strip.clientWidth-4;
  outer.classList.toggle('at-start',atStart);
  outer.classList.toggle('at-end',atEnd);
}

