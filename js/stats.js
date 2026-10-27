function renderStats(){
  const el=document.getElementById('statsContent');if(!el)return;
  const all=[...watched,...watching];
  const total=watched.length,wn=watching.length,pl=planned.length;

  /* ── Category counts ── */
  const catCount={movie:0,series:0,anime:0,cartoon:0,other:0};
  watched.forEach(i=>{const c=i.customCategory||gc(i)||'movie';catCount[c]=(catCount[c]||0)+1;});
  const catIcons={movie:ic('film'),series:ic('tv'),anime:ic('spark'),cartoon:ic('frame'),other:ic('dots')};
  const catNames={movie:'Фільми',series:'Серіали',anime:'Аніме',cartoon:'Мультфільми',other:'Інше'};

  /* ── Genre frequency (+ avg rating per genre — often tells a different
     story than raw count: what you watch most vs what you rate highest) ── */
  const genreFreq={};const genreRatingSum={};const genreRatingN={};
  watched.forEach(i=>{
    const r=parseFloat(i.imdbRating||0);
    (i.genre||'').split(',').forEach(g=>{
      g=g.trim();if(!g)return;
      genreFreq[g]=(genreFreq[g]||0)+1;
      if(r>0){genreRatingSum[g]=(genreRatingSum[g]||0)+r;genreRatingN[g]=(genreRatingN[g]||0)+1;}
    });
  });
  const topGenres=Object.entries(genreFreq).sort((a,b)=>b[1]-a[1]).slice(0,7);
  const maxGenre=topGenres[0]?.[1]||1;
  const genreAvg=g=>genreRatingN[g]?(genreRatingSum[g]/genreRatingN[g]).toFixed(1):null;

  /* ── Fun facts / personal records ── */
  const moviesWithRuntime=watched.filter(i=>i.type==='movie'&&i.runtime);
  const withRating=watched.filter(i=>i.imdbRating&&i.imdbRating!=='N/A');
  const withYear=watched.filter(i=>{const y=parseInt((i.year||'').slice(0,4));return y>1880&&y<=2030;});
  const totalRuntimeMin=moviesWithRuntime.reduce((s,i)=>s+i.runtime,0);
  const rtDays=Math.floor(totalRuntimeMin/1440),rtHrs=Math.floor((totalRuntimeMin%1440)/60);
  const missingRuntime=watched.filter(i=>i.type==='movie').length-moviesWithRuntime.length;
  const longest =moviesWithRuntime.slice().sort((a,b)=>b.runtime-a.runtime)[0];
  const shortest=moviesWithRuntime.filter(i=>i.runtime>=40).sort((a,b)=>a.runtime-b.runtime)[0]; /* features only: shorts/extras skew it */
  const oldest  =withYear.slice().sort((a,b)=>parseInt(a.year)-parseInt(b.year))[0];
  const newest  =withYear.slice().sort((a,b)=>parseInt(b.year)-parseInt(a.year))[0];
  const highest =withRating.slice().sort((a,b)=>parseFloat(b.imdbRating)-parseFloat(a.imdbRating))[0];
  const lowest  =withRating.slice().sort((a,b)=>parseFloat(a.imdbRating)-parseFloat(b.imdbRating))[0];
  const facts=[
    longest &&{lbl:'Найдовший',item:longest, val:`${longest.runtime} хв`},
    shortest&&{lbl:'Найкоротший повнометражний',item:shortest,val:`${shortest.runtime} хв`},
    oldest  &&{lbl:'Найстаріший',item:oldest,  val:oldest.year},
    newest  &&{lbl:'Найновіший', item:newest,  val:newest.year},
    highest &&{lbl:'Найвищий IMDb',item:highest,val:`IMDb ${highest.imdbRating}`},
    lowest  &&{lbl:'Найнижчий IMDb',item:lowest, val:`IMDb ${lowest.imdbRating}`},
  ].filter(Boolean);

  /* ── Franchise stats — reuses whatever's already cached from the
     Колекції tab (localStorage), no network calls triggered from here ── */
  const fGroups={};
  [...watched,...watching,...planned].filter(i=>i.type==='movie'&&i.imdbID).forEach(it=>{
    const c=_collCache[it.imdbID];
    if(!c||c.none||!c.collId)return;
    (fGroups[c.collId]=fGroups[c.collId]||{name:c.collName,ownedImdb:new Set()}).ownedImdb.add(it.imdbID);
  });
  /* same counting as the Франшизи tab (_collCounts over _ownedMovieMap): watched or skipped out of released parts */
  const fOwnedMap=_ownedMovieMap();
  const franchiseRowsFull=Object.entries(fGroups).map(([id,g])=>{
    const det=_collDetails[id];
    const hasParts=!!det?.parts?.length;
    const cc=hasParts?_collCounts({list:det.parts},fOwnedMap):null;
    /* no loaded details: the real part list is unknown, so it can't be called complete */
    const total=cc?cc.total:g.ownedImdb.size;
    const owned=cc?cc.owned:[...g.ownedImdb].filter(x=>fOwnedMap[x]?.status==='ok').length;
    return{name:(det?.name||g.name||'').replace(/ Collection$/,''),owned,total,known:hasParts};
  });
  /* Rank by owned count first, then by % complete, then name — so ties
     don't just fall back to arbitrary insertion order */
  const franchiseRows=franchiseRowsFull.slice().sort((a,b)=>
    b.owned-a.owned || (b.total?b.owned/b.total:0)-(a.total?a.owned/a.total:0) || a.name.localeCompare(b.name,'uk')
  ).slice(0,5);
  const franchiseTotalCount=franchiseRowsFull.length;
  const franchiseCompletedCount=franchiseRowsFull.filter(f=>f.known&&f.total>0&&f.owned>=f.total).length;
  const franchiseAnalyzed=Object.keys(_collCache).length>0;

  /* ── Tracked people progress — from whatever filmography is already
     cached (localStorage), no network calls triggered from here ── */
  /* identical rules to the person tab header: _personAllCredits + _creditMinor (incl. selfOnly) + TMDB-id ownership */
  const pOwn=_personOwnedFns(),pToday=_todayISO();
  const peopleRows=_trackedPeople.map(p=>{
    const credits=_personCache[p.id];if(!credits)return null;
    const all=_personAllCredits(credits).filter(c=>!_creditMinor(c)&&c.date&&c.date<=pToday);
    let matched=0;
    all.forEach(c=>{if(pOwn(c)?.status==='ok')matched++;});
    return all.length?{name:p.name,matched,total:all.length}:null;
  }).filter(Boolean).sort((a,b)=>b.matched-a.matched).slice(0,5);
  const peopleAnalyzed=_trackedPeople.length>0;

  /* ── Top tags ── */
  const tagFreq={};
  [...watched,...watching,...planned].forEach(i=>(i.tags||[]).forEach(t=>{tagFreq[t]=(tagFreq[t]||0)+1;}));
  const topTags=Object.entries(tagFreq).sort((a,b)=>b[1]-a[1]).slice(0,10);

  /* ── Decade distribution — merge pre-1970 into one bucket ── */
  const decadeRaw={};const decadeRating={};const decadeN={};
  watched.forEach(i=>{
    const y=parseInt((i.year||'').replace(/[^0-9]/g,'').slice(0,4));
    if(!y||y<1900||y>2030)return;
    const d=y<1970?1960:Math.floor(y/10)*10; /* pre-1970 → "60s & earlier" */
    decadeRaw[d]=(decadeRaw[d]||0)+1;
    const r=parseFloat(i.imdbRating||0);
    if(r>0){decadeRating[d]=(decadeRating[d]||0)+r;decadeN[d]=(decadeN[d]||0)+1;}
  });
  const decades=Object.keys(decadeRaw).map(Number).sort((a,b)=>a-b);
  const maxDecade=Math.max(...Object.values(decadeRaw),1);
  const decadeLabel=d=>d===1960?'<70s':`${String(d).slice(2)}s`;

  /* ── IMDb rating distribution ── */
  const ratingBuckets=Array(10).fill(0);
  watched.forEach(i=>{
    const r=parseFloat(i.imdbRating||0);
    if(r>=1&&r<=10)ratingBuckets[Math.min(9,Math.floor(r)-1+(r===10?1:0))]++;
  });
  const maxRating=Math.max(...ratingBuckets,1);
  const avgRating=(watched.filter(i=>i.imdbRating&&i.imdbRating!=='N/A')
    .reduce((s,i)=>s+parseFloat(i.imdbRating),0)/
    (watched.filter(i=>i.imdbRating&&i.imdbRating!=='N/A').length||1)).toFixed(2);

  /* ── Countries (a title can list several) ── */
  const countryFreq={};
  watched.forEach(i=>{(i.country||'').split(',').forEach(c=>{c=c.trim();if(c&&c!=='N/A')countryFreq[c]=(countryFreq[c]||0)+1;});});
  const countryList=Object.entries(countryFreq).sort((a,b)=>b[1]-a[1]);
  const maxCountry=countryList[0]?.[1]||1;

  const nf=n=>Number(n).toLocaleString('uk-UA');
  /* Ukrainian plural: 1 тайтл, 3 тайтли, 5 тайтлів, 21 тайтл */
  const titles=n=>{const a=n%10,b=n%100;return `${nf(n)} ${a===1&&b!==11?'тайтл':a>=2&&a<=4&&(b<12||b>14)?'тайтли':'тайтлів'}`;};
  const anim=(catCount.anime||0)+(catCount.cartoon||0);
  /* single-series column chart: one hue, the peak labelled, every column has a hover/focus tip */
  const cols=(items,aria,extra='')=>`<div class="sx-cols" role="list" aria-label="${aria}">${extra}${items.map(c=>
    `<div class="sx-col" role="listitem" tabindex="0" data-tip="${esc(c.tip)}" aria-label="${esc(c.tip)}">
      <div class="sx-col-track">${c.cap?`<span class="sx-cap">${c.cap}</span>`:''}<div class="sx-col-bar" style="height:${c.h}%"></div></div>
      <div class="sx-col-lbl">${c.lbl}</div></div>`).join('')}</div>`;
  /* horizontal bars: label + value in text colours, the bar carries the data;
     r.max makes a row its own scale (franchise progress: owned of its own total) */
  const rows=(items,max)=>`<div class="sx-rows">${items.map(r=>
    `<div class="sx-row" tabindex="0" data-tip="${esc(r.tip)}">
      <div class="sx-row-head"><span class="sx-row-lbl">${esc(r.lbl)}</span><span class="sx-row-val"><span class="num">${nf(r.n)}</span>${r.extra?`<small>${r.extra}</small>`:''}</span></div>
      <div class="sx-bar"><i style="width:${Math.max(1,Math.min(100,Math.round(r.n/(r.max||max)*100)))}%"></i></div></div>`).join('')}</div>`;

  const decMax=Math.max(...decades.map(d=>decadeRaw[d]),1);
  const decCols=decades.map(d=>{const n=decadeRaw[d],avg=decadeN[d]?(decadeRating[d]/decadeN[d]).toFixed(1):null;
    return{h:Math.round(n/decMax*100),lbl:decadeLabel(d),cap:n===decMax?nf(n):'',
      tip:`${d===1960?'До 1970':d+'-ті'}: ${titles(n)}${avg?` · середній IMDb ${avg}`:''}`};});
  const rMax=Math.max(...ratingBuckets,1);
  const rCols=ratingBuckets.map((n,i)=>({h:Math.round(n/rMax*100),lbl:String(i+1),cap:'', /* the mean line carries the label here; counts are in the tips */
    tip:`IMDb ${i+1}${i<9?'–'+(i+1)+'.9':''}: ${titles(n)}`}));
  /* mean marker: bucket i spans [i+1, i+2) across 10 equal columns */
  const meanPct=Math.max(0,Math.min(100,(parseFloat(avgRating)-1)/10*100));
  const meanLine=`<div class="sx-mean" style="left:${meanPct}%" aria-hidden="true"><span>середній ${avgRating}</span></div>`;

  el.innerHTML=`
  <section class="sx-kpis" aria-label="Підсумок">
    <div class="sx-hero">
      <div class="sx-hero-num">${rtDays>0?`${rtDays} д ${rtHrs} год`:`${rtHrs} год`}</div>
      <div class="sx-lbl">перегляду фільмів</div>
      <div class="sx-note">${missingRuntime>0?`За ${nf(moviesWithRuntime.length)} із ${nf(moviesWithRuntime.length+missingRuntime)} фільмів з відомою тривалістю. `:''}Серіали не враховані: для них немає однієї тривалості.</div>
    </div>
    <div class="sx-tiles">
      <div class="sx-tile"><div class="sx-tile-num">${nf(total)}</div><div class="sx-lbl">переглянуто</div></div>
      <div class="sx-tile"><div class="sx-tile-num">${nf(catCount.movie||0)}</div><div class="sx-lbl">фільмів</div></div>
      <div class="sx-tile"><div class="sx-tile-num">${nf(catCount.series||0)}</div><div class="sx-lbl">серіалів</div></div>
      <div class="sx-tile"><div class="sx-tile-num">${nf(anim)}</div><div class="sx-lbl">анімації <span class="sx-dim">· аніме ${nf(catCount.anime||0)}, мульт ${nf(catCount.cartoon||0)}</span></div></div>
      <div class="sx-tile"><div class="sx-tile-num">${avgRating}</div><div class="sx-lbl">середній IMDb</div></div>
      <div class="sx-tile"><div class="sx-tile-num">${nf(countryList.length)}</div><div class="sx-lbl">країн виробництва</div></div>
    </div>
  </section>

  ${facts.length?`<section class="sx-facts" aria-label="Рекорди">${facts.map(f=>`
    <div class="sx-fact">
      <img src="${posterSrc(f.item.poster)}" data-pf="${f.item.imdbID}" onerror="fixBrokenPoster(this,'${f.item.imdbID}')" loading="lazy" alt="">
      <div class="sx-fact-body">
        <div class="sx-fact-lbl">${f.lbl}</div>
        <div class="sx-fact-title" title="${esc(f.item.title)}">${f.item.imdbUrl?`<a href="${f.item.imdbUrl}" target="_blank" rel="noopener" data-act="_tsClick" data-args="${A('$ev',`${f.item.imdbID}`)}">${esc(f.item.title)}</a>`:esc(f.item.title)}</div>
        <div class="sx-fact-val num">${esc(f.val)}</div>
      </div>
    </div>`).join('')}</section>`:''}

  <div class="sx-grid">
    <section class="stat-card">
      <h3 class="sx-h">За десятиліттями</h3>
      <p class="sx-sub">Коли вийшло те, що ти переглянув. Наведи на стовпчик, щоб побачити середній IMDb</p>
      ${cols(decCols,'Переглянуте за десятиліттями')}
    </section>
    <section class="stat-card">
      <h3 class="sx-h">Рейтинги IMDb</h3>
      <p class="sx-sub">Скільки переглянутого в кожному діапазоні оцінок</p>
      ${cols(rCols,'Розподіл рейтингів IMDb',meanLine)}
    </section>
    <section class="stat-card">
      <h3 class="sx-h">Жанри</h3>
      <p class="sx-sub">Тайтл може мати кілька жанрів · ★ середній IMDb жанру</p>
      ${rows(topGenres.map(([g,n])=>({lbl:g,n,extra:genreAvg(g)?`★ ${genreAvg(g)}`:'',tip:`${g}: ${nf(n)}${genreAvg(g)?`, середній IMDb ${genreAvg(g)}`:''}`})),maxGenre)}
    </section>
    <section class="stat-card">
      <h3 class="sx-h">Країни виробництва</h3>
      <p class="sx-sub">${nf(countryList.length)} країн · у фільму їх може бути кілька</p>
      ${rows(countryList.slice(0,10).map(([c,n])=>({lbl:c,n,tip:`${c}: ${nf(n)}`})),maxCountry)}
      ${countryList.length>10?`<details class="sx-more"><summary>Ще ${countryList.length-10} країн</summary><p>${countryList.slice(10).map(([c,n])=>`${esc(c)} <span class="num">${n}</span>`).join(' · ')}</p></details>`:''}
    </section>
  </div>

  <div class="sx-grid sx-grid-3">
    <section class="stat-card">
      <h3 class="sx-h">Франшизи</h3>
      ${!franchiseAnalyzed?`<p class="sx-sub">Відкрий <button class="link-btn" onclick="goTab('collections',document.getElementById('ni-collections'))">Франшизи</button>, щоб порахувати прогрес</p>`:
        !franchiseRowsFull.length?`<p class="sx-sub">Серед твоїх фільмів поки немає франшиз із кількох частин</p>`:`
        <div class="sx-mini">
          <div><b>${nf(franchiseTotalCount)}</b><span>усього</span></div>
          <div><b>${nf(franchiseCompletedCount)}</b><span>повних</span></div>
          <div><b>${nf(franchiseTotalCount-franchiseCompletedCount)}</b><span>у процесі</span></div>
        </div>
        <p class="sx-sub">Найбільше переглянутих частин</p>
        ${rows(franchiseRows.map(f=>({lbl:f.name,n:f.owned,max:Math.max(1,f.total),extra:`з ${f.total}`,tip:`${f.name}: ${f.owned} з ${f.total}`})),1)}
        <button class="link-btn" onclick="goTab('collections',document.getElementById('ni-collections'))">Усі франшизи</button>`}
    </section>
    <section class="stat-card">
      <h3 class="sx-h">Люди, за якими стежиш</h3>
      ${!peopleAnalyzed?`<p class="sx-sub">Додай актора чи режисера у вкладці <button class="link-btn" onclick="goTab('people',document.getElementById('ni-people'))">Люди</button></p>`:
        !peopleRows.length?`<p class="sx-sub">Відкрий людину у вкладці «Люди», щоб порахувати прогрес</p>`:`
        <p class="sx-sub">Переглянуто з помітної фільмографії</p>
        ${rows(peopleRows.map(p=>({lbl:p.name,n:p.matched,extra:`з ${p.total}`,tip:`${p.name}: ${p.matched} з ${p.total}`})),Math.max(...peopleRows.map(p=>p.total),1))}`}
    </section>
    ${topTags.length>=3?`<section class="stat-card">
      <h3 class="sx-h">Твої теги</h3>
      <div class="sx-tags">${topTags.map(([t,n])=>`<span class="utag">${esc(t)} <b class="num">${n}</b></span>`).join('')}</div>
    </section>`:''}
  </div>`;
}

