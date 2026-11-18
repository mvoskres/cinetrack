/* ── «Дивлюсь» variant Б (TEST): a wall of posters + a sheet with the counter.
   Overrides rWatching / rDash from lists.js / dashboard.js; adj() from live.js is reused for ±1.
   Demo air states (test only, never saved): ?demo=0 turns them off. */
const _WB_DEMO_ON=location.pathname.includes('/test/')&&new URLSearchParams(location.search).get('demo')!=='0'; /* demo air states only on the test page */
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
  /* the current season alone, back to zero with every new season: aired episodes for the airing season, else its length */
  const slen=ser?(las===s&&lae?lae:se[s]||0):0,spct=slen?Math.min(100,Math.round(100*e/slen)):0;
  const nd=ls.nextEpDate&&_wbDays(ls.nextEpDate)>=0?ls.nextEpDate:null;
  /* 1.51: «new» only when the new episode is the NEXT one for you — you caught up to it (1–2 episodes behind
     a release of the last 14 days). Seasons behind, the show has episodes to watch («go»), but nothing «new». */
  const fresh=ahead>0&&ahead<=2&&ls.lastAiredDate&&-_wbDays(ls.lastAiredDate)<=14;
  const state=!ser?'movie':fresh?'new':ahead>0?'go':'wait';
  const ns=ser&&s===1&&e===0; /* not started: S1·E0 */
  /* the last activity: an episode marked (seenAt) or the release of your next episode — the «Є нові серії» order */
  const act=Math.max(+i.seenAt||0,fresh?new Date(ls.lastAiredDate+'T00:00:00').getTime():0);
  return {i,ls,demo,ser,s,e,se,las,lae,ahead,aired,seen,pct,slen,spct,nd,state,ns,act,nx:ser?_nextEp(i):null,block:ser?_adjPlusBlock(i):'',tot:i.totalSeasons||Object.keys(se).length||1};
}
/* why «+» waits: shown under the counter and said on a tap */
function _wbWhy(x){
  if(x.nd)return `наступна серія ще не вийшла · ${_wbDow(x.nd)}, ${_wbDate(x.nd)}`;
  return x.ls.isEnded?'усе переглянуто · серіал завершено':'наступна серія ще не вийшла';
}
const _wbEp=(s,e)=>`S${s}·E${e}`;
function _wbBadge(x){
  if(x.state==='new')return `<span class="wb-bd g">${_wbAgo(x.ls.lastAiredDate)}</span>`;
  /* «ще N» lives in the caption under the poster, not on it */
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
const _wbYear=i=>esc(String(i.year||'').replace(/[^\d–-]/g,'').replace(/-/g,'–'));
function _wbMeta(i,full){
  const g=full&&i.genre?(i.genre.split(',').slice(0,3).map(s=>{s=s.trim();return typeof sxGenre==='function'?sxGenre(s):s;}).join(', ')):'';
  return [catLabel(i.customCategory||i.type),_wbYear(i),rateL(i),esc(g)].filter(Boolean).join(' · ');
}
function _wbTile(x){
  const i=x.i;
  const pos=!x.ser?'':x.ns?'<div class="wb-pos z"><b>Не почато</b></div>':`<div class="wb-pos"><b>S${x.s}</b><span>·</span><b>E${x.e}</b></div>`; /* S·E = the last watched episode */
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
function rWatching(skipLive){
  const c=document.getElementById('wnList');if(!c)return;
  const list=applyF(watching,'watching');
  const xs=list.map(_wbInfo);
  const fresh=xs.filter(x=>x.state==='new').sort((a,b)=>_wbDays(b.ls.lastAiredDate)-_wbDays(a.ls.lastAiredDate));
  if(!list.length){c.innerHTML=watching.length?`<div class="empty"><span class="empty-icon">${ic('search')}</span><div class="empty-txt">Нічого не знайдено</div></div>`:`<div class="es"><span class="empty-icon">${ic('play')}</span><b>Що дивишся зараз?</b><p>Додай серіал — тут буде видно, на якій ти серії і коли вийде нова.</p><button class="btn primary" data-act="searchOpen">${ic('search')}Знайти серіал</button></div>`;return;}
  /* the strip on top: a selector of three groups; a group with nothing in it has no button, no groups — no strip */
  const groups=[['today','Сьогодні',fresh.filter(x=>_wbDays(x.ls.lastAiredDate)===0)],
    ['recent','Нещодавно',fresh.filter(x=>_wbDays(x.ls.lastAiredDate)<0)],
    /* 1.51: «Незабаром» — only shows you caught up with: for the others the coming episode is not your next one */
    ['soon','Незабаром',xs.filter(x=>x.ser&&x.ahead===0&&x.nd&&_wbDays(x.nd)<=14).sort((a,b)=>_wbDays(a.nd)-_wbDays(b.nd))]].filter(g=>g[2].length);
  if(!groups.some(g=>g[0]===_wbTop))_wbTop=groups[0]?.[0]||null;
  const cur=groups.find(g=>g[0]===_wbTop);
  c.className='wb';
  /* computer: the same choice sits in the toolbar, styled like Сітка/Список/Полиці on the other lists */
  const ts=document.getElementById('wbTopSeg');
  if(ts){ts.hidden=!cur;ts.innerHTML=cur?groups.map(([k,l,a])=>`<button class="seg-b${k===_wbTop?' on':''}" aria-pressed="${k===_wbTop}" data-act="wbTopSet" data-args="${A(k)}">${l}<span class="wb-tn">${a.length}</span></button>`).join(''):'';}
  c.innerHTML=(cur?`<div class="wb-sel" style="--n:${groups.length}" role="group" aria-label="Що показати вгорі">${groups.map(([k,l,a])=>`<button aria-pressed="${k===_wbTop}" class="${k===_wbTop?'on':''}" data-act="wbTopSet" data-args="${A(k)}">${l}<span>${a.length}</span></button>`).join('')}</div>
      <div class="wb-cs">${cur[2].map(_wbCard).join('')}</div>`:'')
    +_wbShelves(xs);
  if(!skipLive&&!document.getElementById('tab-watching')?.classList.contains('hidden'))_startLive(list);
  if(_wbCur)_wbSheetDraw();
}
/* fetchLive/_startLive call rDash after new air data: redraw the wall (without starting the fetches again) */
/* 1.51: the wall in shelves by what you can do, not by what is known about the air dates:
   episodes to watch (seasons behind and ended shows with a rest included) → waiting for a new one → all watched (ended) →
   not started → films. «За ефіром» orders each shelf by itself; any other sort keeps its own order inside every shelf. */
function _wbShelves(xs){
  const la=x=>x.ls.lastAiredDate||'',byLa=(a,b)=>la(b)>la(a)?1:la(b)<la(a)?-1:0;
  const sh=[
    ['Є нові серії',xs.filter(x=>x.ser&&!x.ns&&x.ahead>0)],
    ['Чекаю нову серію',xs.filter(x=>x.ser&&!x.ns&&x.ahead===0&&!x.ls.isEnded)],
    ['Усе переглянуто',xs.filter(x=>x.ser&&!x.ns&&x.ahead===0&&x.ls.isEnded)],
    ['Не почато',xs.filter(x=>x.ns)],
    ['Фільми',xs.filter(x=>!x.ser)]];
  if(F.watching.sort==='air'){
    sh[0][1].sort((a,b)=>b.act-a.act||byLa(a,b)); /* marked lately / your next episode just out — first; then the freshest releases */
    sh[1][1].sort((a,b)=>(a.nd?0:1)-(b.nd?0:1)||(a.nd&&b.nd?_wbDays(a.nd)-_wbDays(b.nd):0)||b.act-a.act||byLa(a,b)); /* nearest date first, unknown last */
    sh[2][1].sort((a,b)=>b.act-a.act||byLa(a,b));
    sh[3][1].sort((a,b)=>(b.i.addedAt||0)-(a.i.addedAt||0));
  }
  return sh.filter(g=>g[1].length).map(([t,a])=>`<div class="wb-h"><b>${t}</b><span>${a.length}</span></div><div class="wb-g">${a.map(_wbTile).join('')}</div>`).join('');
}
let _wbTop=null;
function wbTopSet(k){_wbTop=k;rWatching(true);}
let _wbRT;
function rDash(){clearTimeout(_wbRT);_wbRT=setTimeout(()=>{if(!document.getElementById('tab-watching')?.classList.contains('hidden'))rWatching(true);},120);}

/* ── sheet ── */
let _wbCur=null;
const _wbFocus={el:null}; /* the tile that opened the sheet: focus goes back to it */
function wbOpen(id){
  _wbCur=id;let L=document.getElementById('wbSheet');
  if(!L){L=document.createElement('div');L.id='wbSheet';L.className='wb-sh';document.body.appendChild(L);}
  if(!document.body.classList.contains('wb-on'))_wbFocus.el=null;
  _wbSheetDraw();document.body.classList.add('wb-on');_inertSync();
  _focusIn(L.querySelector('.wb-pan'),_wbFocus);
  if(_cwMode)_cwAdd('wb',()=>wbClose(true));else try{history.pushState({wbSheet:1},'');}catch(e){} /* Back closes the sheet (ui.js BACK) */
}
function wbClose(fromHistory){
  if(!document.body.classList.contains('wb-on'))return;
  const id=_wbCur;
  document.body.classList.remove('wb-on');_wbCur=null;const L=document.getElementById('wbSheet');if(L)L.innerHTML='';
  _inertSync();
  _focusBack(_wbFocus,()=>[...document.querySelectorAll('#wnList [data-act="wbOpen"]')].find(e=>e.getAttribute('data-args')===JSON.stringify([id]))); /* the wall may have been redrawn: find the tile again */
  if(_cwMode)_cwDel('wb');else if(!fromHistory&&history.state?.wbSheet)history.back();
}
window.addEventListener('popstate',()=>{if(!_cwMode&&!history.state?.wbSheet&&!history.state?.ctLy)wbClose(true);}); /* Back from a sheet/card on top lands on our entry or the card's: stay */
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('wb-on'))wbClose();});
function _wbSheetDraw(){const L=document.getElementById('wbSheet');if(L)_keepFocus(L,_wbSheetDraw0);} /* ± redraws the sheet: focus stays on the pressed button */
function _wbSheetDraw0(){
  const L=document.getElementById('wbSheet'),i=watching.find(w=>w.id===_wbCur);
  if(!L)return;if(!i){wbClose();return;}
  const x=_wbInfo(i);
  const segs=x.ser?Array.from({length:x.tot},(_,k)=>{const n=k+1,len=x.se[n]||0;const f=n<x.s?100:n===x.s&&len?Math.min(100,Math.round(100*x.e/len)):0;return `<i title="Сезон ${n}"><u style="width:${f}%"></u></i>`;}).join(''):'';
  /* 1.51: the big S·E is the LAST WATCHED episode, the line under it says so and names the next one;
     nothing out yet — «+» is a quiet button and the line says why (a tap repeats it) */
  const why=x.block?_wbWhy(x):'',sub=why||(x.ns?`далі ${_wbEp(1,1)}`:`остання переглянута · далі ${_wbEp(x.nx.s,x.nx.e)}`);
  const counter=x.ser?`<div class="wb-cnt">
      <button class="wb-sq${x.ns?' off':''}" data-act="wbAdj" data-args="${A(i.id,-1)}" aria-label="Мінус серія"${x.ns?' aria-disabled="true"':''}>${ic('minus')}</button>
      <div class="wb-cv"><b${x.ns?' class="z"':''}>${x.ns?'Не почато':_wbEp(x.s,x.e)}</b><span id="wbCvSub">${sub}</span></div>
      <button class="wb-sq${why?' off':' p'}" data-act="wbAdj" data-args="${A(i.id,1)}" aria-label="Плюс серія" aria-describedby="wbCvSub"${why?' aria-disabled="true"':''}>${ic('plus')}</button></div>
    <div class="wb-prog"><div class="wb-bar"><i style="width:${x.spct}%"></i></div><div class="wb-pl"><span>Сезон ${x.s}${x.slen?` · ${x.e} з ${x.slen} серій${x.s===x.las&&!x.ls.isEnded?', що вийшли':''}`:''}</span><span>${x.slen?x.spct+'%':''}</span></div>
      ${x.tot>1&&x.tot<=40?`<div class="wb-segs" style="--n:${x.tot}">${segs}</div>`:''}
      ${x.tot>1?`<div class="wb-pl"><span>Весь серіал${x.aired?` · ${x.seen} з ${x.aired} серій, що вийшли`:''}</span><span>${x.pct}%</span></div>`:''}</div>`:'';
  if(!L.querySelector('.wb-in'))L.innerHTML=`<div class="wb-dim" data-act="wbClose"></div><div class="wb-pan" role="dialog" aria-modal="true" tabindex="-1"><div class="wb-grab"></div>
    <button class="wb-x" data-act="wbClose" aria-label="Закрити">${ic('x')}</button><div class="wb-in"></div></div>`;
  L.querySelector('.wb-pan').setAttribute('aria-label',tn(i));
  sheetSwipe(L.querySelector('.wb-pan'),{close:()=>wbClose(),up:()=>{const it=watching.find(w=>w.id===_wbCur);if(it)wbCard(it.imdbID);},handle:'.wb-grab,.wb-hd'});
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
/* every ±episode / ±season (the sheet, the ⋯ menu) redraws the wall and the open sheet */
const _wbAdj0=adj;adj=function(...a){_wbAdj0(...a);rWatching(true);};
/* a redraw of the wall (air data arrived, ±) must not drop the keyboard focus from the tile that has it */
const _rWatching0=rWatching;
rWatching=function(...a){const c=document.getElementById('wnList');if(c)_keepFocus(c,()=>_rWatching0(...a));else _rWatching0(...a);};
function wbAdj(id,d){
  const it=watching.find(w=>w.id===id);
  if(it&&it.type==='series'){
    if(d<0&&it.season===1&&it.episode===0)return; /* not started: nothing below */
    if(d>0&&_adjPlusBlock(it)){toast(_wbWhy(_wbInfo(it)).replace(/^./,c=>c.toUpperCase()),'',2400);return;} /* the reason, not an error */
  }
  adj(id,'e',d);
}
function wbDone(id){wbClose();mvToW(id);}
function wbCard(imdbID){openTitle(imdbID);} /* the card opens over the sheet; closing it shows the sheet again */
