/* ── ACCESS GATE ──
   Loaded in <head>, before anything renders. The app opens only in a browser where a Google sign-in through the
   app's OAuth client has succeeded once. The client is in Testing mode, so Google itself issues a token only to the
   emails listed as Test users in the Cloud console; everyone else is refused by Google and stays on this screen.
   A browser already connected to Drive (ct_gd_on) counts as passed, so existing users are not locked out.
   NOTE: this hides the app, not the source: the repository and the js files stay public on GitHub Pages. */
(function(){
  let ok=false;
  try{ok=localStorage.getItem('ct_gate')==='1'||localStorage.getItem('ct_gd_on')==='1';}catch(e){}
  if(ok)return;
  document.documentElement.classList.add('locked');
  document.addEventListener('DOMContentLoaded',()=>{
    const g=document.createElement('div');g.id='gate';
    g.innerHTML='<div class="gate-box"><div class="gate-logo">Кінопис</div>'
      +'<p class="gate-t">Вхід лише для запрошених</p>'
      +'<p class="gate-s">Увійди через Google тією поштою, яку додав власник.</p>'
      +'<button class="btn gate-btn" type="button">Увійти через Google</button>'
      +'<p class="gate-err" role="alert"></p></div>';
    document.body.appendChild(g);
    const btn=g.querySelector('.gate-btn'),err=g.querySelector('.gate-err');
    btn.addEventListener('click',async()=>{
      err.textContent='';btn.disabled=true;btn.textContent='Чекаю на Google…';
      try{
        await _gdTokFetch('select_account'); /* drive.js; Google refuses emails that are not Test users */
        try{localStorage.setItem('ct_gate','1');}catch(e){}
        document.documentElement.classList.remove('locked');g.remove();
      }catch(e){
        const m=e&&e.message||'';
        err.textContent=m==='net'?'Немає звʼязку з Google. Перевір інтернет і спробуй ще раз.'
          :m==='popup_closed'||m==='popup_failed_to_open'?'Вікно входу закрилось або його заблокував браузер. Спробуй ще раз.'
          :m==='scope'?'Google не дав дозволу на Drive. Увійди ще раз і залиш галочку біля Google Drive.'
          :'Ця пошта не має доступу. Попроси власника додати її, тоді увійди знову.';
        btn.disabled=false;btn.textContent='Увійти через Google';
      }
    });
  });
})();
