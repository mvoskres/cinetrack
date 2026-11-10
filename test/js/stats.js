/* ═══════════════════════════════════════════════════════════════
   STATS — a portrait of what you watched, not a dashboard.
   NB: addedAt is when a title got into the app, NOT when it was watched
   (imports, long-ago titles) — so there is no timeline here on purpose.

   Extra data (series length, cast, directors, TMDB vote counts) is collected
   in the background while the page is open: one TMDB request per title, kept
   compactly in ct_stats_tmdb; names only for people seen in 2+ titles. */

/* ── Ukrainian labels for OMDb genres and countries ── */
const SX_GENRE={Action:'Бойовик',Adventure:'Пригоди',Animation:'Анімація',Biography:'Біографія',Comedy:'Комедія',Crime:'Кримінал',
  Documentary:'Документальне',Drama:'Драма',Family:'Сімейне',Fantasy:'Фентезі','Film-Noir':'Нуар',History:'Історичне',Horror:'Жахи',
  Music:'Музика',Musical:'Мюзикл',Mystery:'Детектив',News:'Новини','Reality-TV':'Реаліті',Romance:'Мелодрама','Sci-Fi':'Фантастика',
  Short:'Короткий метр',Sport:'Спорт','Talk-Show':'Ток-шоу',Thriller:'Трилер',War:'Воєнне',Western:'Вестерн','Game-Show':'Гра-шоу',Adult:'Для дорослих'};
/* for the portrait sentence: «найчастіше це пригоди та бойовики» */
const SX_GENRE_PL={Action:'бойовики',Adventure:'пригоди',Animation:'анімація',Biography:'біографії',Comedy:'комедії',Crime:'кримінальне кіно',
  Documentary:'документальне кіно',Drama:'драми',Family:'сімейне кіно',Fantasy:'фентезі',History:'історичне кіно',Horror:'жахи',Music:'музичне кіно',
  Musical:'мюзикли',Mystery:'детективи',Romance:'мелодрами','Sci-Fi':'фантастика',Sport:'спортивне кіно',Thriller:'трилери',War:'воєнне кіно',Western:'вестерни'};
const sxGenre=g=>SX_GENRE[g]||g;
const sxGenrePl=g=>SX_GENRE_PL[g]||sxGenre(g).toLowerCase();
/* OMDb gives English country names: map them to ISO codes once, then let the browser name them in Ukrainian */
const SX_COUNTRY_FIX={'Soviet Union':'Радянський Союз','West Germany':'Західна Німеччина','East Germany':'НДР','Yugoslavia':'Югославія',
  'Czechoslovakia':'Чехословаччина','Federal Republic of Yugoslavia':'Югославія','Serbia and Montenegro':'Сербія і Чорногорія','UK':'Велика Британія',
  'USA':'США','United States':'США','Czech Republic':'Чехія','Czechia':'Чехія','Turkey':'Туреччина','Türkiye':'Туреччина','Korea':'Корея','Republic of North Macedonia':'Північна Македонія','Occupied Palestinian Territory':'Палестина'};
let _sxCountryMap=null;
function sxCountry(c){
  if(SX_COUNTRY_FIX[c])return SX_COUNTRY_FIX[c];
  if(!_sxCountryMap){
    _sxCountryMap={};
    try{
      const en=new Intl.DisplayNames(['en'],{type:'region'}),uk=new Intl.DisplayNames(['uk'],{type:'region'});
      for(let a=65;a<91;a++)for(let b=65;b<91;b++){const code=String.fromCharCode(a,b);let n;try{n=en.of(code);}catch(e){continue;}if(n&&n!==code)_sxCountryMap[n]=uk.of(code);}
    }catch(e){}
  }
  return _sxCountryMap[c]||c;
}
/* 4 д 7 год / 9 год */
function sxDur(min){const d=Math.floor(min/1440),h=Math.floor(min%1440/60);return d?`${d.toLocaleString('uk-UA')} д ${h} год`:`${h} год`;}
/* Ukrainian plural: sxPl(5,['фільм','фільми','фільмів']) */
function sxPl(n,f){const a=n%10,b=n%100;return a===1&&b!==11?f[0]:a>=2&&a<=4&&(b<12||b>14)?f[1]:f[2];}

/* ── background TMDB data ── */
/* imdbID -> [kind('m'|'t'), voteCount, episodes, episodeMinutes, castIds(8), directorIds(2)] | 0 = TMDB does not know it */
let _sxT=_lsJSON('ct_stats_tmdb',{});
let _sxP=_lsJSON('ct_stats_people',{}); /* personId -> [name, profilePath] */
let _sxRun=false,_sxSaveT=null;
function _sxSave(){
  clearTimeout(_sxSaveT);
  _sxSaveT=setTimeout(()=>{
    /* keep names only for people met in 2+ titles: the rest can't make a «most seen» list */
    const cnt={};for(const k in _sxT){const r=_sxT[k];if(r){r[4].forEach(id=>cnt[id]=(cnt[id]||0)+1);r[5].forEach(id=>cnt[id]=(cnt[id]||0)+1);}}
    for(const id in _sxP)if(!(cnt[id]>=2))delete _sxP[id];
    _lsSet('ct_stats_tmdb',JSON.stringify(_sxT));_lsSet('ct_stats_people',JSON.stringify(_sxP));
  },800);
}
/* backup restore: only well-formed rows; what is already here wins */
function _sxRestore(t,p){
  let n=0;const okIds=a=>Array.isArray(a)&&a.length<=10&&a.every(x=>Number.isInteger(x)&&x>0&&x<1e9);
  if(t&&typeof t==='object'&&!Array.isArray(t))for(const k in t){
    if(!/^tt\d{5,10}$/.test(k)||k in _sxT)continue;
    const r=t[k];
    if(r===0){_sxT[k]=0;n++;continue;}
    if(Array.isArray(r)&&r.length===6&&(r[0]==='m'||r[0]==='t')&&[1,2,3].every(j=>Number.isInteger(r[j])&&r[j]>=0&&r[j]<1e8)&&okIds(r[4])&&okIds(r[5])){_sxT[k]=r;n++;}
  }
  if(p&&typeof p==='object'&&!Array.isArray(p))for(const id in p){
    const v=p[id];
    if(!/^\d{1,9}$/.test(id)||_sxP[id]||!Array.isArray(v)||typeof v[0]!=='string'||v[0].length>120||typeof v[1]!=='string'||(v[1]&&!/^\/[\w.-]{1,80}$/.test(v[1])))continue;
    _sxP[id]=[v[0],v[1]];n++;
  }
  if(n){_sxSig='';_sxSave();}
}
/* the page is rebuilt only when something it shows has changed */
let _sxSig='';
function _sxSignature(){
  let h=5381;const s=watched.map(i=>i.imdbID+(i.imdbRating||'')+(i.runtime||'')+(i.customCategory||'')+(i.genre||'').length).join('|');
  for(let k=0;k<s.length;k++)h=(h*33^s.charCodeAt(k))>>>0;
  return [h,watched.length,watching.length,planned.length,Object.keys(_sxT).length,Object.keys(_sxP).length,Object.keys(_collCache).length,Object.keys(_collDetails).length,_trackedPeople.length,Object.keys(_personCache).length].join(':');
}
function _sxTodo(){return watched.filter(i=>/^tt\d+$/.test(i.imdbID||'')&&!(i.imdbID in _sxT)&&(i.type==='movie'||i.type==='series'));}
async function _sxFetchOne(i){
  const f=await tmdbFindIds(i.imdbID);
  const kind=i.type==='series'?(f.t?'t':f.m?'m':null):(f.m?'m':f.t?'t':null);
  if(!kind){_sxT[i.imdbID]=0;return;}
  const ep=kind==='t'?`/tv/${f.t}?append_to_response=aggregate_credits`:`/movie/${f.m}?append_to_response=credits`;
  const d=await tmdbFetch(ep,10000);delete _tmdbCache[ep]; /* full answers are big: keep only the compact row */
  if(!d)throw new Error('no data');
  const cast=((kind==='t'?d.aggregate_credits:d.credits)?.cast||[]).slice().sort((a,b)=>(a.order??99)-(b.order??99)).slice(0,8);
  const dirs=kind==='t'?(d.created_by||[]).slice(0,2):((d.credits?.crew)||[]).filter(c=>c.job==='Director').slice(0,2);
  [...cast,...dirs].forEach(p=>{if(!_sxP[p.id])_sxP[p.id]=[p.name,p.profile_path||''];});
  const epRt=kind==='t'?(d.episode_run_time?.[0]||d.last_episode_to_air?.runtime||0):0;
  _sxT[i.imdbID]=[kind,d.vote_count||0,kind==='t'?(d.number_of_episodes||0):0,epRt,cast.map(p=>p.id),dirs.map(p=>p.id)];
}
function _sxVisible(){const t=document.getElementById('tab-stats');return !!t&&!t.classList.contains('hidden');}
async function _sxFill(){
  if(_sxRun||!TMDB_KEY||_tmdbBlocked)return;
  const todo=_sxTodo();if(!todo.length)return;
  _sxRun=true;let done=0,fails=0,lastPaint=Date.now();
  const left=()=>{const p=document.getElementById('sxProg');if(p)p.textContent=`Збираю акторів, режисерів і серії: ще ${(todo.length-done).toLocaleString('uk-UA')}`;};
  for(let k=0;k<todo.length&&fails<8;k+=4){
    if(!_sxVisible())break; /* left the page: continue next time */
    await Promise.all(todo.slice(k,k+4).map(async i=>{
      try{await _sxFetchOne(i);fails=0;}catch(e){fails++;if(e?.status===401)fails=99;}
      done++;
    }));
    left();
    if(k%40===0)_sxSave();
    if(Date.now()-lastPaint>6000){lastPaint=Date.now();renderStats();} /* the page fills in as data arrives */
  }
  _sxSave();_sxRun=false;
  if(_sxVisible())renderStats();
}

function renderStats(){
  const el=document.getElementById('statsContent');if(!el)return;
  const sig=_sxSignature();
  if(sig===_sxSig&&el.firstElementChild&&!el.querySelector('.spinner')){if(_sxTodo().length&&!_sxRun)setTimeout(_sxFill,300);return;}
  _sxSig=sig;
  const nf=n=>Number(n).toLocaleString('uk-UA');
  const total=watched.length;
  if(!total){el.innerHTML=`<p class="sx-sub">Тут з'явиться твій кінопортрет, щойно в «Переглянутому» будуть тайтли.</p>`;return;}

  /* ── categories ── */
  const catCount={movie:0,series:0,anime:0,cartoon:0,other:0};
  watched.forEach(i=>{const c=i.customCategory||gc(i)||'movie';catCount[c]=(catCount[c]||0)+1;});
  const anim=(catCount.anime||0)+(catCount.cartoon||0);

  /* ── genres: count and mean IMDb ── */
  const gN={},gS={},gR={};
  watched.forEach(i=>{const r=parseFloat(i.imdbRating||0);(i.genre||'').split(',').forEach(g=>{g=g.trim();if(!g||g==='N/A')return;gN[g]=(gN[g]||0)+1;if(r>0){gS[g]=(gS[g]||0)+r;gR[g]=(gR[g]||0)+1;}});});
  const gAvg=g=>gR[g]?gS[g]/gR[g]:0;
  const genres=Object.entries(gN).sort((a,b)=>b[1]-a[1]);
  const bestGenre=genres.filter(([g,n])=>n>=Math.max(10,total*.03)&&g!=='Animation').sort((a,b)=>gAvg(b[0])-gAvg(a[0]))[0];

  /* ── countries ── */
  const cN={};
  watched.forEach(i=>(i.country||'').split(',').forEach(c=>{c=c.trim();if(c&&c!=='N/A'){c=sxCountry(c);cN[c]=(cN[c]||0)+1;}}));
  const countries=Object.entries(cN).sort((a,b)=>b[1]-a[1]);

  /* ── decades ── */
  const yOf=i=>parseInt(String(i.year||'').replace(/[^0-9]/g,'').slice(0,4));
  const dec={};
  watched.forEach(i=>{const y=yOf(i);if(!y||y<1900||y>2035)return;const d=y<1970?1960:Math.floor(y/10)*10;(dec[d]=dec[d]||[]).push(i);});
  const decKeys=Object.keys(dec).map(Number).sort((a,b)=>b-a);
  const favDec=decKeys.slice().sort((a,b)=>dec[b].length-dec[a].length)[0];
  const decName=d=>d===1960?'до 1970-х':`${d}-ті`;

  /* ── rating distribution ── */
  const rated=watched.filter(i=>parseFloat(i.imdbRating)>0);
  const avgRating=rated.length?(rated.reduce((s,i)=>s+parseFloat(i.imdbRating),0)/rated.length).toFixed(2):'—';
  const rb=Array(10).fill(0);rated.forEach(i=>{const r=parseFloat(i.imdbRating);rb[Math.min(9,Math.max(0,Math.floor(r)-1))]++;});

  /* ── screen time: movies from runtime, series = episodes × episode length (as if watched in full) ── */
  let movieMin=0,seriesMin=0,seriesKnown=0;const seriesAll=watched.filter(i=>i.type==='series');
  watched.forEach(i=>{if(i.type==='movie'&&i.runtime)movieMin+=i.runtime;});
  const seriesLen=[];
  seriesAll.forEach(i=>{const r=_sxT[i.imdbID];if(r&&r[2]&&r[3]){const m=r[2]*r[3];seriesMin+=m;seriesKnown++;seriesLen.push({i,m,eps:r[2]});}});
  const totMin=movieMin+seriesMin,days=Math.floor(totMin/1440),hrs=Math.floor(totMin%1440/60);
  const sxTodo=_sxTodo().length,collecting=sxTodo>0&&!!TMDB_KEY&&!_tmdbBlocked;

  /* ── people: most seen actors and directors (top-8 billing, creators for series) ── */
  const aN={},dN={};
  watched.forEach(i=>{const r=_sxT[i.imdbID];if(!r)return;r[4].forEach(id=>aN[id]=(aN[id]||0)+1);r[5].forEach(id=>dN[id]=(dN[id]||0)+1);});
  const topPeople=(m,n)=>Object.entries(m).filter(([id,c])=>c>=2&&_sxP[id]).sort((a,b)=>b[1]-a[1]).slice(0,n).map(([id,c])=>({id:+id,c,name:_sxP[id][0],pic:_sxP[id][1]}));
  const actors=topPeople(aN,14),directors=topPeople(dN,8);

  /* ── finds: highly rated, but few people voted on TMDB ── */
  /* one per series of films: «Demon Slayer: …» three times is one find, not three */
  const fSeen=new Set();
  const finds=watched.filter(i=>_sxT[i.imdbID]&&parseFloat(i.imdbRating)>=7.4&&_sxT[i.imdbID][1]>0&&_sxT[i.imdbID][1]<400)
    .sort((a,b)=>parseFloat(b.imdbRating)-parseFloat(a.imdbRating))
    .filter(i=>{const c=_collCache[i.imdbID]?.collId,k=String(i.title).toLowerCase().split(/[:\-–(]/)[0].trim();if((c&&fSeen.has('c'+c))||[...fSeen].some(x=>x[0]==='t'&&(x.slice(1).startsWith(k)||k.startsWith(x.slice(1)))))return false;if(c)fSeen.add('c'+c);fSeen.add('t'+k);return true;}).slice(0,14);

  /* ── records ── */
  const movies=watched.filter(i=>i.type==='movie'&&i.runtime);
  const withYear=watched.filter(i=>{const y=yOf(i);return y>1880&&y<=2035;});
  const by=(arr,f)=>arr.slice().sort(f)[0];
  const longS=by(seriesLen,(a,b)=>b.m-a.m);
  const recs=[
    [by(movies,(a,b)=>b.runtime-a.runtime),'Найдовший фільм',i=>`${i.runtime} хв`],
    [by(movies.filter(i=>i.runtime>=40),(a,b)=>a.runtime-b.runtime),'Найкоротший повний метр',i=>`${i.runtime} хв`],
    [longS?.i,'Найдовший серіал',()=>`${nf(longS.eps)} ${sxPl(longS.eps,['серія','серії','серій'])}`],
    [by(withYear,(a,b)=>yOf(a)-yOf(b)),'Найстаріший',i=>esc(i.year)],
    [by(withYear,(a,b)=>yOf(b)-yOf(a)),'Найновіший',i=>esc(i.year)],
    [by(rated,(a,b)=>parseFloat(b.imdbRating)-parseFloat(a.imdbRating)),'Найвищий IMDb',i=>`IMDb ${esc(i.imdbRating)}`],
    [by(rated,(a,b)=>parseFloat(a.imdbRating)-parseFloat(b.imdbRating)),'Найнижчий IMDb',i=>`IMDb ${esc(i.imdbRating)}`],
  ].filter(r=>r[0]);

  /* ── franchises (from the Франшизи tab cache, no network here) ── */
  const fIds=new Set();
  [...watched,...watching,...planned].filter(i=>i.type==='movie'&&i.imdbID).forEach(it=>{const c=_collCache[it.imdbID];if(c&&!c.none&&c.collId)fIds.add(c.collId);});
  const fOwned=_ownedMovieMap();
  const franchises=[...fIds].map(id=>{
    const det=_collDetails[id];if(!det?.parts?.length)return null;
    const cc=_collCounts({list:det.parts},fOwned);
    return{name:_collName(det),owned:cc.owned,total:cc.total};
  }).filter(Boolean);
  const oneLeft=franchises.filter(f=>f.total>1&&f.owned>0&&f.total-f.owned===1).sort((a,b)=>b.total-a.total);
  const fullF=franchises.filter(f=>f.total>1&&f.owned>=f.total).length;

  /* ── tracked people progress (cached filmographies only) ── */
  const pOwn=_personOwnedFns(),pToday=_todayISO();
  const tracked=_trackedPeople.map(p=>{
    const cr=_personCache[p.id];if(!cr)return null;
    const all=_personAllCredits(cr).filter(c=>!_creditMinor(c)&&c.date&&c.date<=pToday);
    let m=0;all.forEach(c=>{if(pOwn(c)?.status==='ok')m++;});
    return all.length?{name:p.name,m,t:all.length}:null;
  }).filter(Boolean).sort((a,b)=>b.m-a.m).slice(0,6);

  /* ── what next ── */
  const plannedOf=g=>planned.filter(i=>(i.genre||'').split(',').some(x=>x.trim()===g)).length;
  const next=[];
  if(bestGenre){const g=bestGenre[0],p=plannedOf(g);
    next.push({t:`Більше ${sxGenrePl(g)}`,s:p?`Твій найвищий бал, ★ ${gAvg(g).toFixed(1)}. У «Планую» їх ${nf(p)}`:`Твій найвищий бал, ★ ${gAvg(g).toFixed(1)}, а в «Планую» жодної`,a:['goTab','recs'],b:'Рекомендації'});}
  if(oneLeft.length)next.push({t:`${oneLeft.length===1?'Одна франшиза':`${nf(oneLeft.length)} ${sxPl(oneLeft.length,['франшиза','франшизи','франшиз'])}`} за крок до повної`,s:oneLeft.slice(0,4).map(f=>`${esc(f.name)} (${f.owned} з ${f.total})`).join(', '),a:['goTab','collections'],b:'Франшизи'});
  else if(!Object.keys(_collCache).length)next.push({t:'Порахувати франшизи',s:'Покажу, де лишилась одна частина',a:['goTab','collections'],b:'Франшизи'});
  if(watching.length)next.push({t:`Зараз дивишся ${nf(watching.length)} ${sxPl(watching.length,['тайтл','тайтли','тайтлів'])}`,s:watching.slice(0,3).map(i=>esc(i.title)).join(', '),a:['goTab','watching'],b:'Дивлюсь'});

  /* ── layout: «стрічка й афіша» — posters and big numbers carry the page, words stay short ── */
  const mv=catCount.movie||0,sr=catCount.series||0;
  const topA=actors[0],g1=genres[0];
  const pc=(i,lbl,val)=>`<a class="sv-pc" href="${imdbHref(i)}" target="_blank" rel="noopener" data-act="_tsClick" data-args="${A('$ev',`${i.imdbID}`)}" title="${esc(i.title)}">
    <img src="${posterSrc(i.poster)}" data-pf="${esc(i.imdbID)}" alt="" loading="lazy">
    ${lbl?`<span class="sv-pc-lbl">${lbl}</span>`:''}<span class="sv-pc-foot"><span class="sv-pc-t">${esc(i.title)}</span>${val?`<b class="num">${val}</b>`:''}</span></a>`;
  const face=p=>`<button class="sv-face" data-act="_tsPerson" data-args="${A(p.id,p.name,p.pic||'')}" title="${esc(p.name)}: ${nf(p.c)}">
    <span class="sv-face-ph">${p.pic?`<img src="https://image.tmdb.org/t/p/w185${esc(p.pic)}" alt="" loading="lazy">`:`<i>${esc(p.name.slice(0,1))}</i>`}<b class="num">${nf(p.c)}</b></span>
    <span class="sv-face-n">${esc(p.name)}</span></button>`;

  /* hero wall: the best rated posters you watched */
  const wall=rated.filter(i=>ps(i.poster)).sort((a,b)=>parseFloat(b.imdbRating)-parseFloat(a.imdbRating)).slice(0,36);
  /* credits: six facts, value + two words */
  const credits=[
    [nf(total),sxPl(total,['тайтл','тайтли','тайтлів']),`${nf(mv)} фільм. · ${nf(sr)} сер. · ${nf(anim)} анім.`],
    g1&&[sxGenre(g1[0]),'жанр №1',`${nf(g1[1])} тайтлів`],
    favDec&&[favDec===1960?'класика':`${String(favDec).slice(2)}-ті`,'твоє десятиліття',`${nf(dec[favDec].length)} тайтлів`],
    bestGenre&&[sxGenre(bestGenre[0]),'найвищий бал',`★ ${gAvg(bestGenre[0]).toFixed(1)}`],
    countries.length&&[nf(countries.length),sxPl(countries.length,['країна','країни','країн']),countries.slice(0,2).map(c=>esc(c[0])).join(', ')],
    topA&&[esc(topA.name),'найчастіше на екрані',`${nf(topA.c)} тайтлів`,topA],
  ].filter(Boolean);
  /* decades as columns built from posters */
  const decAsc=decKeys.slice().sort((a,b)=>a-b),decMax=Math.max(...decAsc.map(d=>dec[d].length),1);
  /* genres as a word cloud: size by count, gold when rated above your mean */
  const gTop=genres.slice(0,16),gMax=gTop[0]?.[1]||1,mean=parseFloat(avgRating)||0;
  const gCloud=gTop.slice().sort((a,b)=>sxGenre(a[0]).localeCompare(sxGenre(b[0]),'uk'));
  const rMax=Math.max(...rb,1),meanPct=Math.max(0,Math.min(100,(mean-1)/10*100));

  el.innerHTML=`
  <section class="sv-hero">
    <div class="sv-wall" aria-hidden="true">${wall.map(i=>`<img src="${esc(_posterSm(i.poster))}" data-pf="${esc(i.imdbID)}" alt="" decoding="async">`).join('')}</div>
    <div class="sv-hero-in">
      <div class="sv-big num">${nf(days)}</div>
      <div class="sv-big-l">${sxPl(days,['день','дні','днів'])} перед екраном</div>
      <div class="sv-split"><span><b class="num">${sxDur(movieMin)}</b>фільми</span><span><b class="num">${sxDur(seriesMin)}</b>серіали</span></div>
      ${collecting?`<div class="sv-prog" id="sxProg">Збираю акторів і серії: ще ${nf(sxTodo)}</div>`:''}
    </div>
  </section>

  <section class="sv-credits" aria-label="Коротко">${credits.map(([v,l,s,p])=>`<div class="sv-cr">
    ${p?.pic?`<img class="sv-cr-ph" src="https://image.tmdb.org/t/p/w185${esc(p.pic)}" alt="">`:''}
    <div class="sv-cr-v">${v}</div><div class="sv-cr-l">${l}</div><div class="sv-cr-s">${s}</div></div>`).join('')}</section>

  <section class="sv-sec"><h3 class="sv-h">Рекорди</h3>
    <div class="sv-strip">${recs.map(([i,l,v])=>pc(i,l,v(i))).join('')}</div></section>

  ${actors.length?`<section class="sv-sec"><h3 class="sv-h">Обличчя твого кіно</h3>
    <div class="sv-strip sv-faces">${actors.map(face).join('')}</div>
    ${directors.length?`<h4 class="sv-h4">За камерою</h4><div class="sv-strip sv-faces sv-faces-s">${directors.map(face).join('')}</div>`:''}</section>`:''}

  <section class="sv-sec"><h3 class="sv-h">Десятиліття</h3>
    <div class="sv-decs">${decAsc.map(d=>{const top=dec[d].slice().sort((x,y)=>(parseFloat(y.imdbRating)||0)-(parseFloat(x.imdbRating)||0)).find(i=>ps(i.poster));
      return `<div class="sv-dec" title="${decName(d)}: ${nf(dec[d].length)}"><span class="sv-dec-n num">${nf(dec[d].length)}</span>
        ${top?`<img class="sv-dec-pc" src="${posterSrc(top.poster)}" data-pf="${esc(top.imdbID)}" alt="" loading="lazy" title="${esc(top.title)}">`:''}
        <div class="sv-dec-bar" style="--r:${Math.max(.02,dec[d].length/decMax).toFixed(3)}"></div>
        <span class="sv-dec-l">${d===1960?'&lt;70':String(d).slice(2)}</span></div>`;}).join('')}</div></section>

  <div class="sv-duo">
    <section class="sv-sec"><h3 class="sv-h">Жанри</h3>
      <div class="sv-cloud">${gCloud.map(([g,n])=>{const a=gAvg(g);return `<span class="sv-w${a>mean+.15?' hi':''}" style="font-size:${(.85+1.75*Math.sqrt(n/gMax)).toFixed(2)}rem" title="${esc(sxGenre(g))}: ${nf(n)}${a?`, IMDb ${a.toFixed(1)}`:''}">${esc(sxGenre(g))}</span>`;}).join('')}</div>
      <p class="sv-cap"><i class="hi"></i> оцінюєш вище за свій середній ${avgRating}</p></section>
    <section class="sv-sec"><h3 class="sv-h">Країни</h3>
      <ol class="sv-countries">${countries.slice(0,5).map(([c,n],k)=>`<li><span class="num">${k+1}</span><b>${esc(c)}</b><em class="num">${nf(n)}</em></li>`).join('')}</ol>
      ${countries.length>5?`<details class="sv-more"><summary>і ще ${nf(countries.length-5)}</summary><p>${countries.slice(5).map(([c,n])=>`${esc(c)} <span class="num">${n}</span>`).join(' · ')}</p></details>`:''}</section>
  </div>

  ${finds.length>=3?`<section class="sv-sec"><h3 class="sv-h">Твої знахідки</h3><p class="sv-cap">Високий IMDb, мало хто бачив</p>
    <div class="sv-strip">${finds.map(i=>pc(i,'',`IMDb ${esc(i.imdbRating)}`)).join('')}</div></section>`:''}

  <div class="sv-duo">
    <section class="sv-sec"><h3 class="sv-h">Оцінки IMDb</h3>
      <div class="sv-hist" role="list" aria-label="Розподіл оцінок IMDb">${rb.map((n,k)=>`<div class="sv-hb${k+1===Math.floor(mean)?' on':''}" role="listitem" title="IMDb ${k+1}: ${nf(n)}"><i style="height:${Math.max(2,Math.round(n/rMax*100))}%"></i><span>${k+1}</span></div>`).join('')}
        <div class="sv-mean" style="left:${meanPct}%"><span>${avgRating}</span></div></div></section>
    ${next.length?`<section class="sv-sec"><h3 class="sv-h">Що далі</h3><div class="sv-next">${next.map(n=>`<button class="sv-nx" data-act="${n.a[0]}" data-args="${A(n.a[1])}"><b>${n.t}</b><span>${n.s}</span></button>`).join('')}</div></section>`:''}
  </div>

  ${franchises.length||tracked.length?`<div class="sv-duo">
    ${franchises.length?`<section class="sv-sec"><h3 class="sv-h">Франшизи</h3><div class="sv-fr"><div><b class="num">${nf(franchises.length)}</b>усього</div><div><b class="num">${nf(fullF)}</b>повних</div><div><b class="num">${nf(franchises.length-fullF)}</b>у процесі</div></div></section>`:''}
    ${tracked.length?`<section class="sv-sec"><h3 class="sv-h">Люди, за якими стежиш</h3><ol class="sv-countries">${tracked.map(p=>`<li><span></span><b>${esc(p.name)}</b><em class="num">${p.m} з ${p.t}</em></li>`).join('')}</ol></section>`:''}
  </div>`:''}`;
  if(collecting&&!_sxRun)setTimeout(_sxFill,300);
}
