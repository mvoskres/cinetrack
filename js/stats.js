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
    [longS?.i,'Найдовший серіал',()=>`${nf(longS.eps)} ${sxPl(longS.eps,['серія','серії','серій'])} · ${nf(Math.round(longS.m/60))} год`],
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
    return{name:(det.name||'').replace(/ Collection$/,''),owned:cc.owned,total:cc.total};
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
    next.push({t:`Найвище ти оцінюєш ${sxGenrePl(g)}: середній IMDb ${gAvg(g).toFixed(1)}`,s:p?`У «Планую» їх ${nf(p)}`:'У «Планую» таких поки немає',a:['goTab','recs'],b:'Рекомендації'});}
  if(oneLeft.length)next.push({t:`${oneLeft.length===1?'Одна франшиза':`${nf(oneLeft.length)} ${sxPl(oneLeft.length,['франшиза','франшизи','франшиз'])}`} за крок до повної`,s:oneLeft.slice(0,4).map(f=>`${esc(f.name)} (${f.owned} з ${f.total})`).join(', '),a:['goTab','collections'],b:'Франшизи'});
  else if(!Object.keys(_collCache).length)next.push({t:'Франшизи ще не пораховані',s:'Відкрий вкладку, і тут з\'явиться, де лишилось подивитись одну частину',a:['goTab','collections'],b:'Франшизи'});
  if(watching.length)next.push({t:`Зараз дивишся ${nf(watching.length)} ${sxPl(watching.length,['тайтл','тайтли','тайтлів'])}`,s:watching.slice(0,3).map(i=>esc(i.title)).join(', '),a:['goTab','watching'],b:'Дивлюсь'});

  /* ── portrait ── */
  const g2=genres.slice(0,2).map(([g])=>sxGenrePl(g));
  const topA=actors[0];
  const mv=catCount.movie||0,sr=catCount.series||0;
  const portrait=[
    `${nf(total)} ${sxPl(total,['переглянутий тайтл','переглянуті тайтли','переглянутих тайтлів'])}: ${nf(mv)} ${sxPl(mv,['фільм','фільми','фільмів'])}, ${nf(sr)} ${sxPl(sr,['серіал','серіали','серіалів'])}${anim?` і ${nf(anim)} анімації`:''}.`,
    g2.length?`Найчастіше це ${g2.join(' та ')}${favDec?`, найбільше ${favDec===1960?'старого кіно, до 1970-х':`з ${favDec}-х`}`:''}.`:'',
    bestGenre&&!g2.includes(sxGenrePl(bestGenre[0]))?`Найвище оцінюєш ${sxGenrePl(bestGenre[0])}.`:'',
    countries.length?`Кіно з ${nf(countries.length)} ${sxPl(countries.length,['країни','країн','країн'])}, найбільше: ${countries.slice(0,3).map(c=>esc(c[0])).join(', ')}.`:'',
    topA?`Найчастіше на екрані: ${esc(topA.name)}, ${nf(topA.c)} ${sxPl(topA.c,['тайтл','тайтли','тайтлів'])}.`:'',
  ].filter(Boolean).join(' ');

  /* ── pieces ── */
  const poster=(i,lbl,val)=>`<a class="sx-pc" href="${imdbHref(i)}" target="_blank" rel="noopener" data-act="_tsClick" data-args="${A('$ev',`${i.imdbID}`)}" title="${esc(i.title)}">
    ${lbl?`<span class="sx-pc-lbl">${lbl}</span>`:''}<img src="${posterSrc(i.poster)}" data-pf="${esc(i.imdbID)}" alt="" loading="lazy">
    <span class="sx-pc-t">${esc(i.title)}</span>${val?`<span class="sx-pc-v num">${val}</span>`:''}</a>`;
  const person=p=>`<button class="sx-person" data-act="_tsPerson" data-args="${A(p.id,p.name,p.pic||'')}">
    ${p.pic?`<img src="https://image.tmdb.org/t/p/w185${esc(p.pic)}" alt="" loading="lazy">`:`<span class="sx-person-0">${esc(p.name.slice(0,1))}</span>`}
    <span class="sx-person-n">${esc(p.name)}</span><span class="sx-person-c num">${nf(p.c)} ${sxPl(p.c,['тайтл','тайтли','тайтлів'])}</span></button>`;
  const rows=(items,max,limit=5)=>{
    const row=r=>`<div class="sx-row"><div class="sx-row-head"><span class="sx-row-lbl">${esc(r.lbl)}</span><span class="sx-row-val"><span class="num">${nf(r.n)}</span>${r.extra?`<small>${r.extra}</small>`:''}</span></div>
      <div class="sx-bar"><i style="width:${Math.max(1,Math.min(100,Math.round(r.n/(r.max||max)*100)))}%"></i></div></div>`;
    return `<div class="sx-rows">${items.slice(0,limit).map(row).join('')}</div>${items.length>limit?`<details class="sx-more"><summary>Усі ${nf(items.length)}</summary><div class="sx-rows">${items.slice(limit).map(row).join('')}</div></details>`:''}`;
  };
  const rMax=Math.max(...rb,1),meanPct=Math.max(0,Math.min(100,(parseFloat(avgRating)-1)/10*100));

  el.innerHTML=`
  <section class="sx-portrait">
    <div class="sx-time"><span class="sx-time-n">${days>0?`${nf(days)} ${sxPl(days,['день','дні','днів'])}`:`${hrs} год`}</span>
      <span class="sx-time-l">${days>0&&hrs?`і ${hrs} год `:''}перед екраном</span></div>
    <p class="sx-story">${portrait}</p>
    <p class="sx-split"><span><b class="num">${sxDur(movieMin)}</b> фільми</span><span><b class="num">${sxDur(seriesMin)}</b> серіали</span></p>
    <p class="sx-note">Фільми за тривалістю${movies.length<mv?` (відома для ${nf(movies.length)})`:''}. Серіали так, ніби переглянуто всі серії${seriesKnown<seriesAll.length?` (пораховано ${nf(seriesKnown)} з ${nf(seriesAll.length)})`:''}${longS&&longS.m>seriesMin*.25?`; найбільше дає ${esc(longS.i.title)}, ${nf(longS.eps)} ${sxPl(longS.eps,['серія','серії','серій'])}`:''}. Середній IMDb переглянутого: <b class="num">${avgRating}</b>.</p>
    ${collecting?`<p class="sx-prog" id="sxProg">Збираю акторів, режисерів і серії: ще ${nf(sxTodo)}</p>`:''}
  </section>

  <section class="sx-sec"><h3 class="sx-h">Рекорди</h3>
    <div class="sx-strip">${recs.map(([i,l,v])=>poster(i,l,v(i))).join('')}</div></section>

  ${actors.length?`<section class="sx-sec"><h3 class="sx-h">Кого ти бачив найчастіше</h3>
    <p class="sx-sub">Актори з головних ролей${directors.length?' · нижче режисери й автори серіалів':''}</p>
    <div class="sx-strip sx-people">${actors.map(person).join('')}</div>
    ${directors.length?`<div class="sx-strip sx-people sx-dirs">${directors.map(person).join('')}</div>`:''}</section>`:
    collecting?`<section class="sx-sec"><h3 class="sx-h">Кого ти бачив найчастіше</h3><p class="sx-sub">З'явиться, щойно зберуться актори</p></section>`:''}

  ${next.length?`<section class="sx-sec"><h3 class="sx-h">Що далі</h3><div class="sx-next">${next.map(n=>`<div class="sx-next-i"><b>${n.t}</b><span>${n.s}</span>
    <button class="link-btn" data-act="${n.a[0]}" data-args="${A(n.a[1])}">${n.b} →</button></div>`).join('')}</div></section>`:''}

  ${finds.length>=3?`<section class="sx-sec"><h3 class="sx-h">Твої знахідки</h3>
    <p class="sx-sub">Високий IMDb, але на TMDB за них голосувало менше 400 людей</p>
    <div class="sx-strip">${finds.map(i=>poster(i,'',`IMDb ${esc(i.imdbRating)}`)).join('')}</div></section>`:''}

  <section class="sx-sec"><h3 class="sx-h">За десятиліттями</h3>
    <p class="sx-sub">Коли вийшло переглянуте · у кожному спершу найвище оцінене</p>
    <div class="sx-decs">${decKeys.map(d=>{const l=dec[d],rr=l.filter(i=>parseFloat(i.imdbRating)>0);const a=rr.length?(rr.reduce((s,i)=>s+parseFloat(i.imdbRating),0)/rr.length).toFixed(1):'';
      return `<div class="sx-dec"><div class="sx-dec-h"><b>${decName(d)}</b><span class="num">${nf(l.length)}</span>${a?`<small>IMDb ${a}</small>`:''}</div>
      <div class="sx-strip sx-mini-strip">${l.slice().sort((x,y)=>(parseFloat(y.imdbRating)||0)-(parseFloat(x.imdbRating)||0)).slice(0,10).map(i=>poster(i,'','')).join('')}</div></div>`;}).join('')}</div></section>

  <div class="sx-grid">
    <section class="stat-card"><h3 class="sx-h">Жанри</h3><p class="sx-sub">Тайтл може мати кілька · ★ середній IMDb</p>
      ${rows(genres.map(([g,n])=>({lbl:sxGenre(g),n,extra:gAvg(g)?`★ ${gAvg(g).toFixed(1)}`:''})),genres[0]?.[1]||1)}</section>
    <section class="stat-card"><h3 class="sx-h">Країни</h3><p class="sx-sub">${nf(countries.length)} ${sxPl(countries.length,['країна','країни','країн'])} · у фільму їх може бути кілька</p>
      ${rows(countries.map(([c,n])=>({lbl:c,n})),countries[0]?.[1]||1)}</section>
    <section class="stat-card"><h3 class="sx-h">Рейтинги IMDb</h3><p class="sx-sub">Скільки переглянутого в кожному діапазоні</p>
      <div class="sx-cols" role="list" aria-label="Розподіл рейтингів IMDb"><div class="sx-mean${meanPct>62?' r':''}" style="left:${meanPct}%" aria-hidden="true"><span>середній ${avgRating}</span></div>
      ${rb.map((n,k)=>{const tip=`IMDb ${k+1}${k<9?'–'+(k+1)+'.9':''}: ${nf(n)}`;return `<div class="sx-col" role="listitem" tabindex="0" data-tip="${tip}" aria-label="${tip}"><div class="sx-col-track"><div class="sx-col-bar" style="height:${Math.round(n/rMax*100)}%"></div></div><div class="sx-col-lbl">${k+1}</div></div>`;}).join('')}</div></section>
    ${franchises.length||tracked.length?`<section class="stat-card">
      ${franchises.length?`<h3 class="sx-h">Франшизи</h3><div class="sx-mini"><div><b>${nf(franchises.length)}</b><span>усього</span></div><div><b>${nf(fullF)}</b><span>повних</span></div><div><b>${nf(franchises.length-fullF)}</b><span>у процесі</span></div></div>`:''}
      ${tracked.length?`<h3 class="sx-h"${franchises.length?' style="margin-top:.8rem"':''}>Люди, за якими стежиш</h3>${rows(tracked.map(p=>({lbl:p.name,n:p.m,max:p.t,extra:`з ${p.t}`})),1,6)}`:''}
    </section>`:''}
  </div>`;
  if(collecting&&!_sxRun)setTimeout(_sxFill,300);
}
