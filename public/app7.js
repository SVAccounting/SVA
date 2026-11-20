// Persistent home tab, closeable recent tabs and race-safe navigation.
(()=>{
 const baseGo=go;
 let history=[],position=-1,sequence=0,scope='',closed=new Set();
 const storeKey=()=>`prooblik:recent:v1:${me?.id||me?.login||'guest'}:${company?.id||'none'}`;
 const known=id=>id==='home'||MENU.some(([,items])=>items.some(([key])=>key===id));
 const allowed=id=>id==='home'||id==='company'||(typeof visibleTab==='function'&&visibleTab(id));
 const title=id=>id==='home'?'Робочий стіл':MENU.flatMap(([,items])=>items).find(([key])=>key===id)?.[1]?.replace(/^[^\p{L}\p{N}]+/u,'')||id;
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const read=()=>{try{const a=JSON.parse(localStorage.getItem(storeKey())||'[]');return Array.isArray(a)?[...new Set(a.filter(x=>typeof x==='string'&&x!=='home'&&known(x)&&allowed(x)))].slice(0,9):[]}catch{return []}};
 const write=a=>{try{localStorage.setItem(storeKey(),JSON.stringify(a.filter(x=>x!=='home').slice(0,9)))}catch{}};
 const remember=id=>{if(id!=='home')write([id,...read().filter(x=>x!==id)])};
 function toolbar(){
  let bar=document.getElementById('recent-navigation');
  if(!bar){bar=document.createElement('div');bar.id='recent-navigation';bar.className='recent-navigation noprint';document.querySelector('.lay')?.before(bar)}
  bar.hidden=!me;if(!me)return;
  const items=['home',...read()];
  bar.innerHTML=`<div class="history-controls"><button class="btn" onclick="navHistoryBack()" aria-label="Назад" ${position<=0?'disabled':''}>←</button><button class="btn" onclick="navHistoryForward()" aria-label="Вперед" ${position<0||position>=history.length-1?'disabled':''}>→</button></div><div class="recent-tabs" role="tablist" aria-label="Відкриті вкладки">${items.map(id=>`<div class="recent-tab ${tab===id?'active':''} ${id==='home'?'home-tab':''}" role="presentation"><button class="recent-tab-open" role="tab" aria-selected="${tab===id}" title="${escape(title(id))}" onclick="go('${id}')"><span class="recent-tab-label">${escape(title(id))}</span></button>${id==='home'?'':`<button class="recent-tab-close" title="Закрити вкладку" aria-label="Закрити ${escape(title(id))}" onclick="closeRecentTab('${id}')">×</button>`}</div>`).join('')}</div><div class="draft-nav-actions"><button class="btn" type="button" onclick="saveDraftNow(true)" title="Зберегти чернетку поточної форми">💾 Чернетка</button></div>`;
 }
 async function navigate(id,mode='normal'){
  if(!me){toolbar();return baseGo(id)}
  if(!known(id)||!allowed(id)){toast?.('Немає доступу до розділу','err');return}
  const currentScope=storeKey();if(scope!==currentScope){scope=currentScope;history=[];position=-1}
  if(id!=='company'&&!company)id='company';
  if(mode!=='history'&&history[position]!==id){history=history.slice(0,position+1);history.push(id);position=history.length-1}
  const seq=++sequence;remember(id);toolbar();
  // Clear stale view immediately; async previous navigation must not remain visible.
  if(id==='home'){
   tab='home';nav();if(isMob())closeNav();
   await views.home();window.scrollTo(0,0);
  }else await baseGo(id);
  if(seq===sequence){ window.restoreDraft?.(id); toolbar(); }
 }
 go=id=>navigate(id);
 window.closeRecentTab=id=>{
  if(id==='home')return;
  write(read().filter(x=>x!==id));
  history=history.filter(x=>x!==id);
  position=Math.min(position,history.length-1);
  if(tab===id){go('home');return}
  toolbar();
 };
 window.navHistoryBack=async()=>{if(position<=0)return;const id=history[--position];await navigate(id,'history')};
 window.navHistoryForward=async()=>{if(position>=history.length-1)return;const id=history[++position];await navigate(id,'history')};
 const originalNav=nav;nav=function(){originalNav();toolbar()};
 toolbar();
})();
