// Navigation history and ten recently visited sections.
(()=>{
 const baseGo=go;
 let history=[],position=-1,restoring=false,sequence=0,scope='';
 const storeKey=()=>`prooblik:recent:v1:${me?.id||me?.login||'guest'}:${company?.id||'none'}`;
 const allowed=id=>id==='home'||id==='company'||(typeof visibleTab==='function'&&visibleTab(id));
 const known=id=>MENU.some(([,items])=>items.some(([key])=>key===id));
 const title=id=>MENU.flatMap(([,items])=>items).find(([key])=>key===id)?.[1]?.replace(/^[^\p{L}\p{N}]+/u,'')||id;
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const read=()=>{try{const value=JSON.parse(localStorage.getItem(storeKey())||'[]');return Array.isArray(value)?value.filter(x=>typeof x==='string'&&known(x)&&allowed(x)).slice(0,10):[]}catch{return []}};
 const remember=id=>{const next=[id,...read().filter(x=>x!==id)].slice(0,10);try{localStorage.setItem(storeKey(),JSON.stringify(next))}catch{}};
 function toolbar(){
  let bar=document.getElementById('recent-navigation');
  if(!bar){bar=document.createElement('div');bar.id='recent-navigation';bar.className='recent-navigation noprint';document.querySelector('.lay')?.before(bar)}
  const active=!!me;
  bar.hidden=!active;
  if(!active)return;
  const items=read();
  bar.innerHTML=`<div class="history-controls"><button class="btn" onclick="navHistoryBack()" title="Назад" aria-label="Назад" ${position<=0?'disabled':''}>←</button><button class="btn" onclick="navHistoryForward()" title="Вперед" aria-label="Вперед" ${position<0||position>=history.length-1?'disabled':''}>→</button></div><div class="recent-tabs" role="tablist" aria-label="Останні десять розділів">${items.map(id=>`<button class="recent-tab ${tab===id?'active':''}" role="tab" aria-selected="${tab===id}" title="${escape(title(id))}" onclick="go('${id}')"><span class="recent-tab-label">${escape(title(id))}</span><span class="recent-tab-close" role="button" tabindex="0" title="Закрити вкладку" aria-label="Закрити ${escape(title(id))}" onclick="event.stopPropagation();closeRecentTab('${id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();closeRecentTab('${id}')}">×</span></button>`).join('')}</div>`;
 }
 window.closeRecentTab=id=>{
  const next=read().filter(x=>x!==id);
  try{localStorage.setItem(storeKey(),JSON.stringify(next))}catch{}
  toolbar();
 };
 async function navigate(id,mode){
  if(!me){toolbar();return baseGo(id)}
  if(!known(id)||!allowed(id)){if(typeof toast==='function')toast('Немає доступу до розділу','err');return}
  // Keep the history separate for different companies and signed-in users.
  const currentScope=storeKey();
  if(scope!==currentScope){scope=currentScope;history=[];position=-1}
  if(id!=='company'&&!company)id='company';
  if(mode!=='history'){
   if(history[position]!==id){history=history.slice(0,position+1);history.push(id);position=history.length-1}
  }
  const seq=++sequence;
  remember(id);toolbar();
  await baseGo(id);
  if(seq===sequence)toolbar();
 }
 go=async function(id){return navigate(id,'normal')};
 window.navHistoryBack=async()=>{if(position<=0)return;const next=history[--position];await navigate(next,'history')};
 window.navHistoryForward=async()=>{if(position>=history.length-1)return;const next=history[++position];await navigate(next,'history')};
 const originalNav=nav;
 nav=function(){originalNav();toolbar()};
 const originalLogin=window.login;
 if(typeof originalLogin==='function')window.login=function(...args){history=[];position=-1;scope='';originalLogin(...args);toolbar()};
 toolbar();
})();
