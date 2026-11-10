/* TEST ONLY: People tab — filter among followed people + two layouts of the faces row (?v=A / ?v=B). */
const _ptV=(new URLSearchParams(location.search).get('v')||'A').toUpperCase()==='B'?'B':'A';
let _ptQ='',_ptOpen=false;
/* TEST ONLY: 15 demo people, in memory only — never saved to localStorage or the Drive backup */
const _PT_DEMO=[{"id": 3, "name": "Harrison Ford", "profile": "/pjBMJVPpcZK23Vt1nzr1zEBTWrP.jpg", "dept": "Acting"}, {"id": 2, "name": "Mark Hamill", "profile": "/zMQ93JTLW8KxusKhOlHFZhih3YQ.jpg", "dept": "Acting"}, {"id": 6384, "name": "Keanu Reeves", "profile": "/8RZLOyYGsoRe9p44q3xin9QkMHv.jpg", "dept": "Acting"}, {"id": 2037, "name": "Cillian Murphy", "profile": "/2lKs67r7FI4bPu0AXxMUJZxmUXn.jpg", "dept": "Acting"}, {"id": 1253360, "name": "Pedro Pascal", "profile": "/oKcMbVn0NJTNzQt0ClKKvVXkm60.jpg", "dept": "Acting"}, {"id": 5064, "name": "Meryl Streep", "profile": "/g5cVxQBAQ3AXt3LhdBXtbbN47Uc.jpg", "dept": "Acting"}, {"id": 287, "name": "Brad Pitt", "profile": "/ajNaPmXVVMJFg9GWmu6MJzTaXdV.jpg", "dept": "Acting"}, {"id": 1245, "name": "Scarlett Johansson", "profile": "/mjReG6rR7NPMEIWb1T4YWtV11ty.jpg", "dept": "Acting"}, {"id": 192, "name": "Morgan Freeman", "profile": "/jPsLqiYGSofU4s6BjrxnefMfabb.jpg", "dept": "Acting"}, {"id": 112, "name": "Cate Blanchett", "profile": "/1Rd567YFdGfkJjSlhNPR8joYkaX.jpg", "dept": "Acting"}, {"id": 6193, "name": "Leonardo DiCaprio", "profile": "/wo2hJpn04vbtmh0B9utCFdsQhxM.jpg", "dept": "Acting"}, {"id": 525, "name": "Christopher Nolan", "profile": "/xuAIuYSmsUzKlUMBFGVZaWsY3DZ.jpg", "dept": "Acting"}, {"id": 2231, "name": "Samuel L. Jackson", "profile": "/AiAYAqwpM5xmiFrAIeQvUXDCVvo.jpg", "dept": "Acting"}, {"id": 54693, "name": "Emma Stone", "profile": "/ak2Y9wOI3wi2pNQU6OWSvVvWPj5.jpg", "dept": "Acting"}, {"id": 30614, "name": "Ryan Gosling", "profile": "/lyUyVARQKhGxaxy0FbPJCQRpiaW.jpg", "dept": "Acting"}];
const _ptDemoIds=new Set(_PT_DEMO.map(p=>p.id));
if(new URLSearchParams(location.search).get('demo')!=='0'){
  _PT_DEMO.forEach(p=>{if(!_trackedPeople.some(t=>t.id===p.id))_trackedPeople.push(p);});
  /* everything that writes people out (localStorage, backup file, Drive, snapshot) sees only the real ones */
  const real=fn=>function(...a){const all=_trackedPeople.slice(),r=all.filter(p=>!_ptDemoIds.has(p.id));
    _trackedPeople.splice(0,_trackedPeople.length,...r);try{return fn.apply(this,a);}finally{_trackedPeople.splice(0,_trackedPeople.length,...all.filter(p=>_ptDemoIds.has(p.id)||_trackedPeople.some(t=>t.id===p.id)),..._trackedPeople.filter(t=>!all.some(p=>p.id===t.id)));}};
  _peopleSave=real(_peopleSave);_buildBackup=real(_buildBackup);_gdFp=real(_gdFp);_snapshotTake=real(_snapshotTake);
}

document.body.classList.add('pt-'+_ptV);

/* section head: the TMDB search becomes a filter among followed people */
(function(){
  const sw=document.querySelector('#tab-people .section-head .search-wrap');if(!sw)return;
  sw.className='local-search-wrap pt-filter';sw.removeAttribute('style');
  sw.innerHTML=`<span class="local-search-icon">${ic('search')}</span><input id="ptFilter" class="local-search" type="text" placeholder="Серед тих, за ким стежиш…" aria-label="Фільтр серед людей, за якими стежиш" autocomplete="off" data-input="ptFilter" data-args="[&quot;$value&quot;]"><button type="button" class="ls-x" data-act="lsClear" data-args="[&quot;$el&quot;]" aria-label="Очистити" title="Очистити">${ic('x')}</button>`;
  /* variant switcher (test page only) */
  const s=document.createElement('div');s.className='pt-switch';
  s.innerHTML=`<span>Тест · Люди</span><a href="?v=A" class="${_ptV==='A'?'on':''}">A Стрічка</a><a href="?v=B" class="${_ptV==='B'?'on':''}">Б Сітка</a>`;
  document.body.appendChild(s);
  if(!location.hash)setTimeout(()=>goTab('people',document.getElementById('ni-people')),300);
})();

function ptFilter(v){_ptQ=v.trim();renderPeopleTab();}
function ptToggle(){_ptOpen=!_ptOpen;renderPeopleTab();}
function ptFindAll(){
  searchOpen();const si=document.getElementById('searchInput');
  if(si&&_ptQ){si.value=_ptQ;si.dispatchEvent(new Event('input',{bubbles:true}));}
}
function _pkFocusSearch(){ptFindAll();}
function _ptFace(p,cur){return `<button class="pk-face person-chip${p.id===cur?' active':''}" data-pid="${esc(p.id)}" data-act="openPerson" data-args="${A(p.id)}"><img src="${_tsImg(p.profile,'w185')||BLANK}" alt="" data-fb><b>${esc(p.name)}</b></button>`;}
function _ptWord(n){return n%10===1&&n%100!==11?'людиною':'людьми';}

function renderPeopleTab(){
  const box=document.getElementById('peopleTracked');
  const fw=document.querySelector('#tab-people .pt-filter');
  if(fw)fw.hidden=_trackedPeople.length<4;
  if(!_trackedPeople.length&&!_personPreview){
    box.innerHTML=`<div class="empty"><span class="empty-icon">${ic('person')}</span><div class="empty-txt">Знайди актора чи режисера через пошук угорі й натисни «Стежити»</div><button class="btn pt-find" data-act="ptFindAll">${ic('search')}Знайти людину</button></div>`;
    const d=document.getElementById('personDetail');if(d)d.innerHTML='';return;
  }
  const detail=document.getElementById('personDetail');
  const known=id=>_trackedPeople.some(t=>t.id===id)||_personPreview?.id===id;
  let cur=+detail?.dataset.pid;
  if(!detail?.innerHTML.trim()||!known(cur))cur=known(_personLast)?_personLast:(_trackedPeople[0]?.id??_personPreview.id);
  const n=_trackedPeople.length,q=_norm(_ptQ);
  const list=q?_trackedPeople.filter(p=>_norm(p.name).includes(q)):_trackedPeople;
  const add=`<button class="pk-face pk-add" data-act="ptFindAll"><span>${ic('plus')}</span><b>Додати</b></button>`;
  const none=q&&!list.length?`<div class="pt-none">Серед тих, за ким стежиш, немає «${esc(_ptQ)}»<button class="btn" data-act="ptFindAll">${ic('search')}Шукати серед усіх людей</button></div>`:'';
  let head=`<div class="pt-head"><b>Стежиш</b><span>${q?`${list.length} з ${n}`:n}</span>`;
  let body;
  if(_ptV==='A'){
    const grid=_ptOpen||!!q;
    head+=n>3&&!q?`<button class="pt-all${_ptOpen?' up':''}" data-act="ptToggle">${_ptOpen?'Згорнути':'Усі '+n}</button>`:'';
    body=none||`<div class="pk-faces pt-row${grid?' pt-grid':''}">${list.map(p=>_ptFace(p,cur)).join('')}${q?'':add}</div>`;
  }else{
    const cols=window.innerWidth<=700?4:Math.max(4,Math.floor((box.clientWidth||900)/110));
    const cap=cols*2-1; /* two rows: the last cell is "+ще N" */
    let vis=list,more=0;
    if(!q&&!_ptOpen&&list.length>cap+1){
      vis=list.slice(0,cap);more=list.length-cap;
      if(!vis.some(p=>p.id===cur)){const a=list.find(p=>p.id===cur);if(a)vis[cap-1]=a;}
    }
    const rest=list.filter(p=>!vis.includes(p)).slice(0,3);
    const moreBtn=more?`<button class="pk-face pt-more" data-act="ptToggle"><span>${rest.map(p=>`<img src="${_tsImg(p.profile,'w92')||BLANK}" alt="" data-fb>`).join('')}<em>+${more}</em></span><b>Ще ${more}</b></button>`:'';
    head+=_ptOpen&&!q?`<button class="pt-all up" data-act="ptToggle">Згорнути</button>`:`<button class="pt-add" data-act="ptFindAll">${ic('plus')}Додати</button>`;
    body=none||`<div class="pk-faces pt-grid pt-b" style="--pt-cols:${cols}">${vis.map(p=>_ptFace(p,cur)).join('')}${moreBtn}${_ptOpen&&!q?add:''}</div>`;
  }
  box.innerHTML=head+'</div>'+body;
  if(_ptV==='A')_ptEdges();
  if(!detail?.innerHTML.trim()||+detail.dataset.pid!==cur)openPerson(cur);
  else document.querySelectorAll('.person-chip').forEach(b=>b.classList.toggle('active',b.dataset.pid==String(cur)));
}
/* A: fades on the edges show there is more to swipe; they go away at the ends */
function _ptEdges(){
  const r=document.querySelector('.pt-row:not(.pt-grid)');if(!r)return;
  const f=()=>{r.classList.toggle('pt-l',r.scrollLeft>4);r.classList.toggle('pt-r',r.scrollLeft+r.clientWidth<r.scrollWidth-4);};
  r.addEventListener('scroll',f,{passive:true});f();
  const a=r.querySelector('.active');if(a&&a.offsetLeft>r.clientWidth-60)r.scrollLeft=a.offsetLeft-16;f();
}
window.addEventListener('resize',()=>{if(!document.getElementById('tab-people')?.classList.contains('hidden'))renderPeopleTab();});
