/* ── «Дивлюсь» variant Б (TEST): a wall of posters + a sheet with the counter.
   Overrides rWatching / rDash from lists.js / dashboard.js; adj() from live.js is reused for ±1.
   Demo air states (test only, never saved): ?demo=0 turns them off. */
const _WB_DEMO_ON=new URLSearchParams(location.search).get('demo')!=='0';
const _WB_DEMO={ /* title → overrides of the air data, days relative to today */
  'Rick and Morty':{la:0,las:9,lae:10},
  'Ted Lasso':{la:-1,las:4,lae:10},
  'Dorohedoro':{la:-3,las:2,lae:11},
  'Invincible':{la:-10,las:4,lae:9,nd:4,nds:4,nde:10},
  'Severance':{nd:2,nds:3,nde:1},
  'Wednesday':{nd:6,nds:3,nde:1},
  'From':{nd:1,nds:4,nde:11,las:4,lae:10},
};
const _wbDay=864e5;
function _wbIso(off){const d=new Date(Date.now()+off*_wbDay);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function _wbLs(i){
  const ls={...(i.liveStatus||{})},o=_WB_DEMO_ON&&_WB_DEMO[i.title];
  if(o){if('la'in o)ls.lastAiredDate=_wbIso(o.la);if('las'in o){ls.lastAiredSeason=o.las;ls.lastAiredEp=String(o.lae);}
    if('nd'in o){ls.nextEpDate=_wbIso(o.nd);ls.nextEpSeason=o.nds;ls.nextEpNum=String(o.nde);}}
  return {ls,demo:!!o};
}
const _wbDays=s=>s?Math.round((new Date(s+'T00:00:00')-new Date(new Date().toDateString()))/_wbDay):null;
const _wbPl=(n,a,b,c)=>n%10===1&&n%100!==11?a:n%10>=2&&n%10<=4&&(n%100<12||n%100>14)?b:c;
const _WB_MON=['січ.','лют.','бер.','квіт.','трав.','черв.','лип.','серп.','вер.','жовт.','лист.','груд.'];
const _WB_DOW=['нд','пн','вт','ср','чт','пт','сб'];
function _wbAgo(s){const n=-_wbDays(s);return n<=0?'сьогодні':n===1?'вчора':n<30?`${n} ${_wbPl(n,'день','дні','днів')} тому`:n<365?`${Math.floor(n/30)} міс. тому`:`${Math.floor(n/365)} р. тому`;}
function _wbWhen(s){const n=_wbDays(s),d=new Date(s+'T00:00:00');return n<=0?'сьогодні':n===1?'завтра':n<8?`через ${n} ${_wbPl(n,'день','дні','днів')}`:`${d.getDate()} ${_WB_MON[d.getMonth()]}`;}
function _wbDow(s){return _WB_DOW[new Date(s+'T00:00:00').getDay()];}
/* everything the wall and the sheet show about one title */
function _wbInfo(i){
  const {ls,demo}=_wbLs(i),ser=i.type==='series';
  const se={};Object.entries(i.seasonEps||{}).forEach(([k,v])=>se[+k]=+v);
  const s=+i.season||1,e=+i.episode||0,las=+ls.lastAiredSeason||0,lae=+ls.lastAiredEp||0;
  if(las&&!(se[las]>=lae))se[las]=lae;
  let ahead=0;
  if(ser&&las)ahead=las===s?Math.max(0,lae-e):las>s?Math.max(0,(se[s]||e)-e)+Object.keys(se).filter(k=>k>s&&k<las).reduce((a,k)=>a+se[k],0)+lae:0;
  const aired=las?Object.keys(se).filter(k=>k<las).reduce((a,k)=>a+se[k],0)+lae:0;
  const seen=Object.keys(se).filter(k=>k<s).reduce((a,k)=>a+se[k],0)+e;
  const pct=ser?(aired?Math.min(100,Math.round(100*seen/aired)):_seasonPct(i)):0;
  const nd=ls.nextEpDate&&_wbDays(ls.nextEpDate)>=0?ls.nextEpDate:null;
  const fresh=ahead>0&&ls.lastAiredDate&&-_wbDays(ls.lastAiredDate)<=14;
  const state=!ser?'movie':fresh?'new':ahead>0?'go':'wait';
  return {i,ls,demo,ser,s,e,se,las,lae,ahead,aired,seen,pct,nd,state,tot:i.totalSeasons||Object.keys(se).length||1};
}
const _wbEp=(s,e)=>`S${s}·E${e}`;
function _wbBadge(x){
  if(x.state==='new')return `<span class="wb-bd g">${_wbAgo(x.ls.lastAiredDate)}</span>`;
  if(x.state==='go')return `<span class="wb-bd n">ще ${x.ahead>99?'99+':x.ahead}</span>`;
    return '';
}
const _wbDate=s=>{const d=new Date(s+'T00:00:00');return `${d.getDate()} ${_WB_MON[d.getMonth()]}`;};
function _wbLast(x){ /* «Вийшла S38·E6 · вчора» (fresh) or «· 8 лист.» */
  if(!x.ser||!x.las||!x.ls.lastAiredDate)return '';
  const n=-_wbDays(x.ls.lastAiredDate),w=n<=14?_wbAgo(x.ls.lastAiredDate):_wbDate(x.ls.lastAiredDate)+(n>300?' '+x.ls.lastAiredDate.slice(0,4):'');
  return `<span class="wb-a${x.state==='new'?' g':''}">Вийшла ${_wbEp(x.las,x.lae)} · ${w}</span>`;
}
function _wbNext(x){ /* «Далі S38·E7 · нд, 15 лист.» / «Серіал завершено» / «Нова серія: дата невідома» */
  if(!x.ser)return '';
  if(x.nd)return `<span class="wb-a b">Далі ${_wbEp(x.ls.nextEpSeason,x.ls.nextEpNum)} · ${_wbDow(x.nd)}, ${_wbDate(x.nd)}${_wbDays(x.nd)<=7?' · '+_wbWhen(x.nd):''}</span>`;
  if(x.ls.isEnded)return `<span class="wb-a end">■ Серіал завершено</span>`;
  if(x.ls.lastAiredSeason)return `<span class="wb-a">Триває · дата невідома</span>`;
  return `<span class="wb-a">Дані ефіру завантажуються…</span>`;
}
function _wbStatus(x){return `<div class="wb-air">${_wbLast(x)}${_wbNext(x)}</div>`;}
function _wbStatusOld(x){
  if(x.state==='new'||x.state==='go')return `<div class="wb-st${x.state==='new'?' g':''}">Вийшла ${_wbEp(x.las,x.lae)} · ${_wbAgo(x.ls.lastAiredDate)} · ще ${x.ahead} ${_wbPl(x.ahead,'серія','серії','серій')}</div>`;
  if(x.nd)return `<div class="wb-st b">Наступна ${_wbEp(x.ls.nextEpSeason,x.ls.nextEpNum)} · ${_wbWhen(x.nd)}, ${_wbDow(x.nd)}</div>`;
  if(x.ser&&x.ls.isEnded)return `<div class="wb-st">Серіал завершено</div>`;
  if(x.ser&&x.ls.lastAiredSeason)return `<div class="wb-st">Наздогнав · дата нової серії невідома</div>`;
  return x.ser?`<div class="wb-st">Дані ефіру завантажуються…</div>`:'';
}
const _wbYear=i=>esc(String(i.year||'').replace(/[^\d–-]/g,'').replace(/-/g,'–'));
function _wbMeta(i,full){
  const g=full&&i.genre?(i.genre.split(',').slice(0,3).map(s=>{s=s.trim();return (typeof SX_GENRE!=='undefined'&&SX_GENRE[s])||s;}).join(', ')):'';
  return [catLabel(i.customCategory||i.type),_wbYear(i),i.imdbRating&&i.imdbRating!=='N/A'?'★ '+esc(i.imdbRating):'',esc(g)].filter(Boolean).join(' · ');
}
function _wbTile(x){
  const i=x.i;
  const pos=x.ser?`<div class="wb-pos"><b>S${x.s}</b><span>·</span><b>E${x.e}</b></div>`:'';
  const sub=x.ser?`<b>сезон ${x.s} з ${x.tot}</b>${x.state==='new'||x.state==='go'?' · ':''}${x.state==='new'||x.state==='go'?`ще ${x.ahead>99?'99+':x.ahead} ${_wbPl(x.ahead,'серія','серії','серій')}`:''}`:'фільм';
  const run=!x.ser?'':x.ls.isEnded?'<span class="wb-run end">Завершено</span>':x.ls.lastAiredSeason?`<span class="wb-run on">Триває<small>${x.nd?`${_wbEp(x.ls.nextEpSeason,x.ls.nextEpNum)} · ${_wbDow(x.nd)}, ${_wbDate(x.nd)}`:'дата невідома'}</small></span>`:'';
  return `<div class="wb-t" id="wb-${esc(i.id)}" data-act="wbOpen" data-args="${A(i.id)}" role="button" tabindex="0" aria-label="${esc(tn(i))}">
    <div class="wb-pp"><img src="${posterSrc(i.poster)}" data-pf="${esc(i.imdbID)}" alt="" loading="lazy"><div class="wb-tl">${_wbBadge(x)}${run}${_tagPill(i)}</div>${x.demo?'<i class="wb-demo">демо</i>':''}${pos}${x.ser?`<div class="wb-fill"><i style="width:${x.pct}%"></i></div>`:''}</div>
    <b class="wb-n">${esc(tn(i))}</b><div class="wb-m">${_wbMeta(i)}</div><div class="wb-p">${sub}</div></div>`;
}
function _wbCard(x){
  const i=x.i,l=_wbLast(x)+_wbNext(x);
  return `<div class="wb-c" data-act="wbOpen" data-args="${A(i.id)}" role="button" tabindex="0"><img class="wb-cbg" src="${posterSrc(i.poster)}" alt=""><img class="wb-cp" src="${posterSrc(i.poster)}" alt="">
    <div class="wb-ci">${x.demo?'<i class="wb-demo">демо</i>':''}<b>${esc(tn(i))}</b>${l}</div></div>`;
}
const _WB_ORDER={new:0,go:2,wait:3,movie:4};
function rWatching(skipLive){
  const c=document.getElementById('wnList');if(!c)return;
  const list=applyF(watching,'watching');
  const xs=list.map(_wbInfo);
  const fresh=xs.filter(x=>x.state==='new').sort((a,b)=>_wbDays(b.ls.lastAiredDate)-_wbDays(a.ls.lastAiredDate));
  const soon=xs.filter(x=>x.state==='wait'&&x.nd&&_wbDays(x.nd)<=14).sort((a,b)=>_wbDays(a.nd)-_wbDays(b.nd));
  const rank=x=>x.state==='wait'&&soon.includes(x)?1:_WB_ORDER[x.state];
  const ordered=[...xs].sort((a,b)=>rank(a)-rank(b)||(a.state==='new'?_wbDays(b.ls.lastAiredDate)-_wbDays(a.ls.lastAiredDate):0));
  if(!list.length){c.innerHTML=watching.length?`<div class="empty"><span class="empty-icon">${ic('search')}</span><div class="empty-txt">Нічого не знайдено</div></div>`:`<div class="empty"><span class="empty-icon">${ic('play')}</span><div class="empty-txt">Починай щось дивитись — додай серіал через пошук</div></div>`;return;}
  const top=[...fresh,...soon];
  c.className='wb';
  c.innerHTML=(top.length?`<div class="wb-h"><b>Свіжі й найближчі</b></div><div class="wb-cs">${top.map(_wbCard).join('')}</div>`:'')
    +`<div class="wb-h"><b>Усі</b><span>${list.length}</span></div><div class="wb-g">${ordered.map(_wbTile).join('')}</div>`;
  if(!skipLive&&!document.getElementById('tab-watching')?.classList.contains('hidden'))_startLive(list);
  if(_wbCur)_wbSheetDraw();
}
/* fetchLive/_startLive call rDash after new air data: redraw the wall (without starting the fetches again) */
let _wbRT;
function rDash(){clearTimeout(_wbRT);_wbRT=setTimeout(()=>{if(!document.getElementById('tab-watching')?.classList.contains('hidden'))rWatching(true);},120);}

/* ── sheet ── */
let _wbCur=null;
function wbOpen(id){
  _wbCur=id;let L=document.getElementById('wbSheet');
  if(!L){L=document.createElement('div');L.id='wbSheet';L.className='wb-sh';document.body.appendChild(L);}
  _wbSheetDraw();document.body.classList.add('wb-on');
  try{history.pushState({wbSheet:1},'');}catch(e){}
}
function wbClose(fromHistory){
  if(!document.body.classList.contains('wb-on'))return;
  document.body.classList.remove('wb-on');_wbCur=null;const L=document.getElementById('wbSheet');if(L)L.innerHTML='';
  if(!fromHistory&&history.state?.wbSheet)history.back();
}
window.addEventListener('popstate',()=>wbClose(true));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('wb-on'))wbClose();});
function _wbSheetDraw(){
  const L=document.getElementById('wbSheet'),i=watching.find(w=>w.id===_wbCur);
  if(!L)return;if(!i){wbClose();return;}
  const x=_wbInfo(i);
  const segs=x.ser?Array.from({length:x.tot},(_,k)=>{const n=k+1,len=x.se[n]||0;const f=n<x.s?100:n===x.s&&len?Math.min(100,Math.round(100*x.e/len)):0;return `<i title="Сезон ${n}"><u style="width:${f}%"></u></i>`;}).join(''):'';
  const counter=x.ser?`<div class="wb-cnt">
      <button class="wb-sq" data-act="wbAdj" data-args="${A(i.id,-1)}" aria-label="Мінус серія">${ic('minus')}</button>
      <div class="wb-cv"><b>${_wbEp(x.s,x.e)}</b><span>сезон ${x.s} з ${x.tot}${x.se[x.s]?` · серія ${x.e} з ${x.se[x.s]}`:''}</span></div>
      <button class="wb-sq p" data-act="wbAdj" data-args="${A(i.id,1)}" aria-label="Плюс серія">${ic('plus')}</button></div>
    <div class="wb-prog"><div class="wb-bar"><i style="width:${x.pct}%"></i></div><div class="wb-pl"><span>Переглянуто ${x.pct}%${x.aired?` · ${x.seen} з ${x.aired} серій, що вийшли`:''}</span></div>
      ${x.tot>1&&x.tot<=40?`<div class="wb-segs" style="--n:${x.tot}">${segs}</div>`:''}</div>`:'';
  if(!L.querySelector('.wb-in'))L.innerHTML=`<div class="wb-dim" data-act="wbClose"></div><div class="wb-pan" role="dialog"><div class="wb-grab"></div>
    <button class="wb-x" data-act="wbClose" aria-label="Закрити">${ic('x')}</button><div class="wb-in"></div></div>`;
  L.querySelector('.wb-pan').setAttribute('aria-label',tn(i));
  L.querySelector('.wb-in').innerHTML=`
    <div class="wb-hd"><img src="${posterSrc(i.poster)}" alt="" data-act="openTitle" data-args="${A(i.imdbID)}"><div>${x.demo?'<i class="wb-demo">демо</i>':''}
      <b class="wb-tt">${esc(tn(i))}</b>${tn(i)!==i.title?`<div class="wb-or">${esc(i.title)}</div>`:''}<div class="wb-mt">${_wbMeta(i,true)}</div>${_wbStatus(x)}</div></div>
    ${counter}
    <div class="wb-tags">${_tagsHtml(i)||'<span class="wb-notag">Без тегів</span>'}<button class="wb-tgb" data-act="tagEdit" data-args="${A(i.id)}">${ic('tag')}Теги</button></div>
    <div class="wb-acts">${x.ser?`<button class="wb-b" data-act="wbDone" data-args="${A(i.id)}">${ic('check')}Весь серіал переглянуто</button>`:`<button class="wb-b" data-act="wbDone" data-args="${A(i.id)}">${ic('check')}Переглянуто</button>`}
      <button class="wb-b" data-act="wbCard" data-args="${A(i.imdbID)}">Картка</button>
      ${i.streamUrl&&safeUrl(i.streamUrl)?`<a class="wb-b sq" href="${esc(safeUrl(i.streamUrl))}" target="_blank" rel="noopener" aria-label="Дивитись">${ic('play')}</a>`:''}
      <button class="wb-b sq" data-act="cardMenu" data-args="${A('$ev','watching',i.id,'sheet')}" aria-label="Ще дії">${ic('dots')}</button></div>`;
}
function wbAdj(id,d){adj(id,'e',d);rWatching(true);}
function wbDone(id){wbClose();mvToW(id);}
function wbCard(imdbID){wbClose();openTitle(imdbID);}
