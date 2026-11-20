// Safe local draft autosave. Never automatically post accounting transactions.
(()=>{
 const FREQ=180000;
 const KEY='prooblik:autosave:v1';
 let enabled=localStorage.getItem(KEY)!=='off';
 const editableTabs=new Set(['add','tpl','set','open','pko','vko','bin','bout','inv','act','rcpt','sale','wo','mv','ost']);
 const draftKey=id=>`prooblik:draft:v1:${me?.id||'guest'}:${company?.id||'none'}:${id}`;
 const fields=()=>[...document.querySelectorAll('#app input,#app textarea,#app select')].filter(e=>!e.disabled&&!e.readOnly&&!['password','hidden','file','submit','button'].includes(e.type)&&!e.closest('.desk,.desk-option')&&e.id!=='');
 window.updateDraftToggle=()=>{let b=document.querySelector('#draft-toggle');if(b){b.textContent=enabled?'⏱ Автозбереження: увімк.':'⏱ Автозбереження: вимк.';b.setAttribute('aria-pressed',String(enabled));}};
 window.toggleDraftAutosave=()=>{enabled=!enabled;localStorage.setItem(KEY,enabled?'on':'off');window.updateDraftToggle();toast(enabled?'Чернетки зберігатимуться кожні 3 хвилини':'Автозбереження чернеток вимкнено');};
 window.saveDraftNow=(manual=false)=>{
  if(!me||!company||!editableTabs.has(tab)){if(manual)toast('На цьому екрані немає чернетки для збереження');return;}
  const list=fields();if(!list.length){if(manual)toast('Немає полів для збереження');return;}
  const data={at:Date.now(),values:Object.fromEntries(list.map(e=>[e.id,e.type==='checkbox'?e.checked:e.value]))};
  try{localStorage.setItem(draftKey(tab),JSON.stringify(data));if(manual)toast('Чернетку збережено в цьому браузері')}catch(e){toast('Не вдалося зберегти чернетку: '+e.message,'err')}
 };
 window.restoreDraft=id=>{
  if(!editableTabs.has(id))return;
  let d;try{d=JSON.parse(localStorage.getItem(draftKey(id))||'null')}catch{return}
  if(!d?.values)return;
  let count=0;
  fields().forEach(e=>{if(Object.hasOwn(d.values,e.id)){if(e.type==='checkbox')e.checked=!!d.values[e.id];else e.value=d.values[e.id];count++}});
  if(count){const el=document.createElement('p');el.className='draft-restored mut';el.textContent='↺ Відновлено локальну чернетку ('+new Date(d.at).toLocaleString('uk-UA')+'). Зміни ще не проведені в базі.';document.querySelector('#app')?.prepend(el)}
 };
 // Clear local draft only after the server has confirmed a write.
 const originalApi=window.api;
 window.api=async function(path,opt){
  const method=(opt?.method||'GET').toUpperCase(),id=tab,co=company?.id;
  const result=await originalApi(path,opt);
  if(method!=='GET'&&editableTabs.has(id)&&co===company?.id){try{localStorage.removeItem(draftKey(id))}catch{}}
  return result;
 };
 setInterval(()=>{if(enabled&&document.visibilityState==='visible')window.saveDraftNow(false)},FREQ);
 window.updateDraftToggle();
})();
