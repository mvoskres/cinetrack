/* ── LIVE ── */
function _startLive(list){
  const now=Date.now();
  let dl=0;let anyFresh=false;
  list.forEach(i=>{
    if(i.type!=='series')return;
    /* Check if cached liveStatus is stale: nextEpDate passed OR cache >6h old */
    const ls=i.liveStatus;
    if(ls){
      /* Tiered TTL: ended→never, between-seasons→7 days, airing→6h.
         "Ended" read off OMDb's year range is a guess (Dorohedoro was "2020–2020"
         until season 2), so only TVmaze's word is kept forever; older entries
         without src get re-asked once */
      const SEVEN_DAYS=7*24*3600000;
      const ttl=ls.isEnded&&ls.src==='tvmaze'?Infinity:(ls.nextEpDate?SIX_HOURS:SEVEN_DAYS);
      const stale=ls._cachedAt&&(ls.src||!ls.isEnded)?now-ls._cachedAt>ttl:true;
      const nextPassed=ls.nextEpDate?new Date(ls.nextEpDate+'T23:59:59')<new Date():false;
      const noEps=!('seasonEps' in i); /* cached before season lengths were kept: fetch once, even for ended shows */
      if(!stale&&!nextPassed&&!noEps){renderLive(i.imdbID,ls);anyFresh=true;return;}
      /* Stale — re-fetch */
      const el=document.getElementById(`lv-${i.imdbID}`);
      if(el)el.innerHTML='<div class="live-loading">Оновлюю дані ефіру…</div>';
      setTimeout(()=>fetchLive(i.imdbID),dl);dl+=LIVE_STAGGER;
      return;
    }
    setTimeout(()=>fetchLive(i.imdbID),dl);dl+=LIVE_STAGGER;
  });
  /* Refresh dashboard for items that used cached liveStatus (fetchLive calls rDash itself) */
  if(anyFresh)rDash();
}
function renderLive(imdbID,ls){
  const el=document.getElementById(`lv-${imdbID}`);
  if(!el)return;
  el.innerHTML=buildLiveHTML(ls);
}
function buildLiveHTML(ls){
  const fd=s=>new Date(s+'T00:00:00').toLocaleDateString('uk-UA',{day:'numeric',month:'short'});
  const fresh=ls.lastAiredDate&&(Date.now()-new Date(ls.lastAiredDate+'T00:00:00'))/864e5<=7;
  const out=[];
  if(ls.isEnded)out.push(`<span class="ended"><span class="dot"></span>Серіал завершено</span>`);
  if(ls.lastAiredDate)out.push(`<span class="${fresh?'new':''}">${ls.isEnded?'':'<span class="dot"></span>'}Вийшла S${ls.lastAiredSeason}E${ls.lastAiredEp} · ${fd(ls.lastAiredDate)}</span>`);
  if(ls.nextEpDate)out.push(`<span>Далі S${ls.nextEpSeason}E${ls.nextEpNum} · ${fd(ls.nextEpDate)}</span>`);
  else if(!ls.isEnded)out.push(`<span>Дата наступної серії невідома</span>`);
  return `<div class="air">${out.join('')}</div>`;
}
/* strict: only a 404 means "not there" (null); 429/5xx/timeout throw, so callers can tell a miss from a failure */
function _fetchJson(url,ms=8000,strict=false){
  const ctrl=new AbortController(),tid=setTimeout(()=>ctrl.abort(),ms);
  return fetch(url,{signal:ctrl.signal}).then(r=>{if(r.ok)return r.json();if(strict&&r.status!==404)throw new Error('HTTP '+r.status);return null;}).finally(()=>clearTimeout(tid));
}
/* One TVmaze call per refresh: the IMDb lookup only redirects to the show id
   (and drops embed[]), so the id is resolved once and kept on the item; the
   show endpoint then returns status, last/next episode and seasons together.
   Was: 3 TVmaze calls + 1 OMDb call (out of the 1000/day quota) per show. */
/* Some TVmaze shows carry no IMDb id (Dorohedoro), so the lookup misses them;
   a title search matched on the premiere year finds them instead */
async function _tvmazeByTitle(item){
  const y=parseInt(item?.year);if(!item?.title||!y)return null;
  const res=await _fetchJson(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(item.title)}`,8000,true); /* throws on failure: that is not "no such show" */
  const hit=(res||[]).map(r=>r.show).find(s=>parseInt(s?.premiered)===y&&(!s.externals?.imdb||s.externals.imdb===item.imdbID));
  return hit?.id||null;
}
const _liveBusy=new Set(); /* imdbIDs with a fetchLive on the wire: re-renders and tab switches must not stack requests */
async function fetchLive(imdbID){
  if(_liveBusy.has(imdbID))return;
  _liveBusy.add(imdbID);
  try{
    const item=watching.find(x=>x.imdbID===imdbID);
    const today=new Date();today.setHours(0,0,0,0);
    let show=null,noShow=false;
    /* Any failure (429/5xx/timeout) throws to the outer catch, which keeps the old liveStatus and seasonEps;
       the OMDb guess below is only for shows TVmaze genuinely does not have */
    let tvId=item?.tvmazeId;
    if(!tvId){
      tvId=(await _fetchJson(`https://api.tvmaze.com/lookup/shows?imdb=${imdbID}`,8000,true))?.id||await _tvmazeByTitle(item);
      if(tvId){if(item)item.tvmazeId=tvId;}else noShow=true;
    }
    if(tvId){show=await _fetchJson(`https://api.tvmaze.com/shows/${tvId}?embed[]=previousepisode&embed[]=nextepisode&embed[]=seasons`,8000,true);if(!show)throw new Error('TVmaze: show '+tvId+' not found');}
    let isEnded,ts,lastS,lastE=null,lastD=null,nextS=null,nextN=null,nextD=null;
    if(show){
      const em=show._embedded||{};
      isEnded=show.status==='Ended';
      const aired=(em.seasons||[]).filter(x=>x.premiereDate&&new Date(x.premiereDate+'T00:00:00')<=today).length;
      ts=aired||item?.totalSeasons||1;lastS=ts;
      const eps={};(em.seasons||[]).forEach(x=>{if(x.number>0&&x.episodeOrder)eps[x.number]=x.episodeOrder;}); /* season lengths for the episode counter */
      if(item)item.seasonEps=eps; /* empty when TVmaze has no lengths: still marks the show as asked */
      const p=em.previousepisode;if(p?.airdate){lastS=p.season;lastE=String(p.number);lastD=p.airdate;}
      const n=em.nextepisode;
      if(n?.airdate){if(new Date(n.airdate+'T00:00:00')>=today){nextS=n.season;nextN=String(n.number);nextD=n.airdate;}else{lastS=n.season;lastE=String(n.number);lastD=n.airdate;}}
    }else{
      /* Not on TVmaze: OMDb has the season count; "2010–2015" vs "2019–" tells ended from running */
      const info=await aFetch(`i=${imdbID}`);
      if(!noShow||!info||info.Response==='False')throw new Error('OMDb: '+(info?.Error||'no data'));
      ts=parseInt(info.totalSeasons)||item?.totalSeasons||1;lastS=ts;
      isEnded=/–\s*\d{4}$/.test(info.Year||'');
      if(item)item.seasonEps={}; /* no season lengths off TVmaze; don't refetch for them */
    }
    if(item)item.totalSeasons=ts;
    const ls={isEnded,src:show?'tvmaze':'omdb',lastAiredSeason:lastS,lastAiredEp:lastE,lastAiredDate:lastD,nextEpSeason:nextS,nextEpNum:nextN,nextEpDate:nextD,_cachedAt:Date.now()};
    if(item){item.liveStatus=ls;save();
      const bar=document.querySelector(`#wc-${item.id} .tr-bar i`);if(bar)bar.style.width=_seasonPct(item)+'%';} /* the bar depends on aired episodes */
    renderLive(imdbID,ls);rDash();
  }catch(e){
    const el=document.getElementById(`lv-${imdbID}`),old=watching.find(x=>x.imdbID===imdbID)?.liveStatus;
    if(old)renderLive(imdbID,old); /* old status beats an error box */
    else if(el)el.innerHTML='<div class="live-loading" style="color:var(--rose)">Не вдалося оновити дані ефіру</div>';
  }finally{_liveBusy.delete(imdbID);}
}
function relive(imdbID){const it=watching.find(x=>x.imdbID===imdbID);if(it){delete it.liveStatus;save();}const el=document.getElementById(`lv-${imdbID}`);if(el)el.innerHTML='<div class="live-loading">Оновлюю дані ефіру…</div>';fetchLive(imdbID);}
function _epLabel(it){return `S${String(it.season).padStart(2,'0')} E${String(it.episode).padStart(2,'0')}`;}
/* seasons finished + the share of the current season: aired episodes for the airing season,
   the season length from TVmaze for the others; reaching the last aired episode fills the bar */
function _seasonPct(it){
  const ls=it.liveStatus,lastE=+ls?.lastAiredEp,len=it.seasonEps?.[it.season];
  const part=lastE&&it.season===+ls.lastAiredSeason?Math.min(1,it.episode/lastE):len?Math.min(1,it.episode/len):0;
  return Math.round(Math.min(1,(it.season-1+part)/Math.max(1,it.totalSeasons||1))*100);
}
function adj(id,dim,d){
  const it=watching.find(i=>i.id===id);if(!it)return;
  /* "− серія" on E01 steps back into the previous season, so an accidental "+ сезон" is undone from the card */
  if(dim==='e'&&d<0&&it.episode<=1&&it.season>1){dim='s';d=-1;}
  /* "+ серія" on the last episode of a season moves on to the next one, when TVmaze told us the season length */
  const len=it.seasonEps?.[it.season];
  if(dim==='e'&&d>0&&len&&it.episode>=len&&it.season<(it.totalSeasons||1))dim='s';
  /* no counting past what exists: the last aired episode of the airing season, else the season length */
  if(dim==='e'&&d>0){
    const ls=it.liveStatus,max=+ls?.lastAiredEp&&it.season===+ls.lastAiredSeason?+ls.lastAiredEp:len;
    if(max&&it.episode>=max){toast(`Більше серій у ${it.season} сезоні поки немає`,'err',2200);return;}
  }
  if(dim==='s'){const prev=it.season;it.season=Math.max(1,it.season+d);
    if(it.season!==prev){
      if(d>0){it.prevEp={s:prev,e:it.episode};it.episode=1;} /* new season starts at episode 1, remember where we were */
      else{it.episode=it.prevEp&&it.prevEp.s===it.season?it.prevEp.e:(it.seasonEps?.[it.season]||1);delete it.prevEp;} /* back: restore that episode, else the season's last one */
    }}
  else it.episode=Math.max(1,it.episode+d);
  save();const c=document.getElementById(`wc-${id}`);
  if(c){
    c.querySelector('.ep-v').textContent=_epLabel(it);
    c.querySelector('.ep-of').textContent=`сезон ${it.season} з ${it.totalSeasons||1}`;
    const bar=c.querySelector('.tr-bar i');if(bar)bar.style.width=_seasonPct(it)+'%';
  }
}

