// ProOblik: брендинг, згортне меню, повідомлення, експорт (друк / Excel / PDF)
const LS=localStorage,BR=n=>({'Головне':'🏠','Довідники':'📚','Каса':'💵','Банк':'🏦','Склад':'📦','Документи':'🧾','Операції':'✍️','Виправлення':'↩️','Звіти':'📊'}[n]||'•');
// ---- повідомлення ----
function toast(msg,type){
  let box=$('#toasts');if(!box){document.body.insertAdjacentHTML('beforeend','<div id="toasts"></div>');box=$('#toasts')}
  const el=document.createElement('div'),set=(m,t)=>{el.className='toast '+t;el.innerHTML=(t==='wait'?'<span class="spin"></span>':t==='err'?'⚠ ':'✓ ')+esc(m)};let tm;
  set(msg,type||'ok');box.appendChild(el);if(type!=='wait')tm=setTimeout(()=>el.remove(),3200);
  return{done(m,t){clearTimeout(tm);set(m,t);tm=setTimeout(()=>el.remove(),t==='err'?6000:3000)},rm(){clearTimeout(tm);el.remove()}};
}
const OKM={docs:'Документ проведено',corrections:'Коригування проведено',refs:'Запис збережено',companies:'Збережено',entries:'Проводку проведено',periods:'Період оновлено',accounts:'Рахунок збережено'};
const _api0=window.api;let _busy=0;
window.api=async function(path,opt){
  const m=opt?.method||'GET',base=path.split(/[/?]/)[0],quiet=['login','register','me'].includes(base)||opt?.body?.preview;
  document.body.classList.toggle('busy',++_busy>0);
  try{const r=await _api0(path,opt);if(m!=='GET'&&!quiet)toast(OKM[base]||'Виконано');return r}
  catch(e){if(m!=='GET'&&!quiet)toast(e.message,'err');throw e}
  finally{document.body.classList.toggle('busy',--_busy>0)}
};
const RM={osv:'Оборотно-сальдову відомість сформовано',reports:'Форми №1 та №2 сформовано',chess:'Шахматку сформовано',card:'Картку рахунка сформовано',stock:'Залишки ТМЦ сформовано',scard:'Картку складського обліку сформовано',corrList:'Журнал оновлено'};
Object.keys(RM).forEach(n=>{const f=window[n];window[n]=async function(...a){const t=toast('Формується…','wait');try{const r=await f.apply(this,a);t.done(RM[n],'ok');return r}catch(e){t.done(e.message,'err');throw e}}});
// ---- меню ----
let GO={};try{GO=JSON.parse(LS.getItem('navOpen')||'{}')}catch{}
function nav(){
  if(!me)return;document.body.classList.add('authed');
  const hid=MENU.flatMap(([,it])=>it.map(([k])=>k)).filter(k=>!visibleTab(k));
  $('#nav').innerHTML=MENU.map(([s,it])=>{
    const items=it.filter(([k])=>!hid.includes(k) && (k!=='members'||me.role==='superadmin'||currentRights.manager));if(!items.length)return'';
    const open=GO[s]??(items.some(([k])=>k===tab)||s==='Головне'||s==='Операції');
    return `<div class="ng${open?' open':''}"><div class="nh" onclick="togG(this,'${s}')"><span>${BR(s)} ${s}</span><i>▾</i></div><div class="nb">${items.map(([k,v])=>`<a class="${k===tab?'on':''}" onclick="go('${k}')">${v}</a>`).join('')}</div></div>`}).join('');
  $('#co').textContent=me.name+(me.role==='superadmin'?' (суперадмін)':currentRights.manager?' (адмін підприємства)':' (користувач)')+(company?' · 🏢 '+company.name:'');
}
function togG(h,s){const g=h.parentElement;g.classList.toggle('open');GO[s]=g.classList.contains('open');LS.setItem('navOpen',JSON.stringify(GO))}
function toggleNav(){const c=document.body.classList.toggle('nav-closed');LS.setItem('navClosed',c?'1':'0')}
if(LS.getItem('navClosed')==='1'||(innerWidth<800&&LS.getItem('navClosed')===null))document.body.classList.add('nav-closed');
// ---- вхід ----
window.login=function login(){
  token=null;document.body.classList.remove('authed');$('#nav').innerHTML='';$('#co').textContent='';
  $('#app').innerHTML=`<div class="card hero"><div class="logo xl">Pro<b>Oblik</b></div><p>Інтерактивна система бухгалтерського обліку</p></div>
  <div class="card" style="max-width:440px;margin:0 auto 20px"><h3>Вхід</h3><label>Логін</label><input id="lg" autocomplete="username"><label>Пароль</label><input id="pw" type="password" autocomplete="current-password">
  <details><summary class="mut" style="margin-top:12px;cursor:pointer">Реєстрація нового користувача</summary><label>Прізвище та ім’я</label><input id="nm"></details>
  <p><button class="btn pri" onclick="auth('login')">Увійти</button> <button class="btn" onclick="auth('register')">Зареєструватись</button></p><p id="msg" class="err"></p></div>`;
};
// ---- перехід між розділами + панель експорту ----
const EXP=['entries','docs','osv','chess','card','cashbook','bank','stock','scard','rep','corr','audit','plan','r_staff','r_customer','r_supplier','r_bank','r_wh','r_item'],LAND=['entries','docs','osv','chess','card','cashbook','bank','corr','audit','stock','scard'];
async function go(t){
  if(!NOCO.includes(t)&&!company){toast('Спочатку оберіть або створіть підприємство','err');t='company'}
  if(t==='members'&&!currentRights.manager&&me?.role!=='superadmin'){toast('Недостатньо прав','err');return}
  if(!NOCO.includes(t)&&!visibleTab(t)){toast('Немає доступу до розділу','err');return}
  tab=t;nav();if(innerWidth<800)document.body.classList.add('nav-closed');
  $('#app').innerHTML='<div class="card mut"><span class="spin"></span> Завантаження…</div>';
  try{await views[t]();if(EXP.includes(t))$('#app').insertAdjacentHTML('afterbegin','<div class="tb noprint"><button class="btn" onclick="exPrint()">🖨 Друк</button><button class="btn" onclick="exXlsx()">📊 Excel</button><button class="btn" onclick="exPdf()">📄 PDF</button></div>')}
  catch(e){$('#app').innerHTML=`<div class="card err">${esc(e.message)}</div>`;toast(e.message,'err')}
  scrollTo(0,0);
}
// ---- експорт ----
const loadJS=(u,g)=>window[g]?Promise.resolve():new Promise((ok,no)=>{const s=document.createElement('script');s.src=u;s.onload=ok;s.onerror=()=>no(new Error('Не вдалося завантажити бібліотеку експорту (перевірте інтернет)'));document.head.appendChild(s)});
const fname=(n,ext)=>`ProOblik_${(n||tab).replace(/[^\wа-яіїєґ-]+/gi,'_')}_${today}.${ext}`;
function exPrint(){document.body.classList.remove('printing');window.print()}
async function exXlsx(root,name){
  const t=toast('Формується Excel…','wait');
  try{await loadJS('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js','XLSX');
    const tabs=[...(root||$('#app')).querySelectorAll('table')].filter(x=>!x.closest('.tb'));if(!tabs.length)throw new Error('Немає даних для експорту');
    const wb=XLSX.utils.book_new();
    tabs.forEach((tb,i)=>{
      const aoa=[...tb.rows].map(r=>[...r.cells].map(c=>{const v=c.innerText.trim().replace(/[\u00a0\u202f]/g,' ');return /^[−-]?\d[\d ]*(,\d+)?$/.test(v)&&!/^0\d/.test(v)?Number(v.replace(/ /g,'').replace(',','.').replace('−','-')):v}));
      const h=(tb.closest('.card')?.querySelector('h3')?.textContent||'Аркуш').replace(/[\\\/?*\[\]:]/g,'');
      XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(aoa),`${i+1}. ${h}`.slice(0,31));
    });
    XLSX.writeFile(wb,fname(name,'xlsx'));t.done('Файл Excel збережено','ok');
  }catch(e){t.done(e.message,'err')}
}
async function exPdf(root,name,land){
  const t=toast('Формується PDF…','wait');
  try{await loadJS('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js','html2pdf');
    document.body.classList.add('pdfmode');
    const source=root||$('#app');
    const isFinancial=tab==='rep' && !!source.querySelector('.financial-form');
    let exportRoot=source;
    if(isFinancial){
      exportRoot=document.createElement('div');
      exportRoot.style.cssText='width:720px;max-width:720px;background:#fff;color:#222;font-family:Arial,sans-serif';
      source.querySelectorAll('.financial-form').forEach((form,i)=>{
        const copy=form.cloneNode(true);
        copy.style.cssText='width:720px;max-width:720px;padding:0;margin:0 0 12px;border:0;border-radius:0;background:#fff;overflow:visible';
        if(i)copy.style.breakBefore='page';
        exportRoot.appendChild(copy);
      });
    }
    await html2pdf().set({margin:isFinancial?8:8,filename:fname(name,'pdf'),image:{type:'jpeg',quality:.95},html2canvas:{scale:2,backgroundColor:'#fff',windowWidth:isFinancial?760:undefined},jsPDF:{unit:'mm',format:'a4',orientation:isFinancial?'portrait':((land??LAND.includes(tab))?'landscape':'portrait')},pagebreak:{mode:['css','legacy'],before:isFinancial?'.financial-form + .financial-form':undefined}}).from(exportRoot).save();
    t.done('PDF збережено','ok');
  }catch(e){t.done('Не вдалося створити PDF: '+e.message+'. Скористайтеся «Друк» → «Зберегти як PDF».','err')}
  finally{document.body.classList.remove('pdfmode')}
}
// бланки документів: друк, PDF, Excel
window.showPrint=function(html){
  let p=$('#prn');if(!p){document.body.insertAdjacentHTML('beforeend','<div id="prn"></div>');p=$('#prn')}
  p.innerHTML=`<div class="noprint" style="margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn pri" onclick="window.print()">🖨 Друк</button><button class="btn" onclick="exPdf($('#prn .pdoc'),'документ',false)">📄 PDF</button><button class="btn" onclick="exXlsx($('#prn .pdoc'),'документ')">📊 Excel</button><button class="btn" onclick="closePrn()">Закрити</button></div><div class="pdoc">${html}</div>`;
  p.style.display='block';document.body.classList.add('printing');
};
// журнал документів: редагування, друк/PDF/Excel, сторно
views.docs=async()=>{
  const D=await api('docs?company_id='+company.id),canEdit=canDo('docs','update'),canStorno=canDo('corrections','create');
  $('#app').innerHTML=`<div class="card sc"><h3>Журнал документів</h3><table><thead><tr><th>Дата</th><th>Вид</th><th>№</th><th>Контрагент</th><th class="n">Сума</th><th></th></tr></thead><tbody>${D.map(x=>`<tr${x.storno?' style="opacity:.55"':''}><td>${x.date}</td><td>${esc(DT[x.type]?.h.replace(/ \(.*\)/,''))}</td><td>${esc(x.number)}${x.storno?' (сторновано)':''}</td><td>${esc(x.partner)}</td><td class="n">${fmt(x.total||0)}</td><td style="white-space:nowrap"><button class="btn" onclick="printDoc(${x.id})">🖨 Друк · PDF · Excel</button>${x.storno?'':`${canEdit?` <button class="btn" onclick="fixDoc(${x.id})">✎ Редагувати</button>`:''}${canStorno?` <button class="btn" onclick="stornoDoc(${x.id})">↩ Сторно</button>`:''}`} </td></tr>`).join('')||'<tr><td colspan="6" class="mut">Документів ще немає</td></tr>'}</tbody></table></div>`;
};
async function stornoDoc(id){
  EL=await api('entries?company_id='+company.id);const x=EL.find(e=>e.doc_id===id&&Number(e.amount)>0);if(x)return stornoDlg(x.id);
  CK=crypto.randomUUID();CKIND='storno';CDATA={doc_id:id};CGET=()=>({});
  mdl(`<h3>${mtag('storno')} документа</h3><p class="mut">Документ не має проводок і буде позначений сторнованим.</p>${cf(today)}`);
}
boot();

// Company-level permissions are loaded after each company selection.
let currentRights={manager:false,permissions:{}};
const canDo=(module,action='read')=>me?.role==='superadmin'||currentRights.permissions?.[module]?.[action]===true;
const visibleTab=k=>{const map={set:'settings',open:'entries',entries:'entries',add:'entries',tpl:'entries',pko:'docs',vko:'docs',bin:'docs',bout:'docs',rcpt:'docs',sale:'docs',cashbook:'reports',bank:'reports',osv:'reports',chess:'reports',card:'reports',rep:'reports',plan:'reports',tasks:'reports',members:'settings'};return k==='company'||k==='plan'||k==='tasks'||canDo(k.startsWith('r_')?'refs':map[k]||'reports','read')};
window.pick=async function(id){const selected=(await api('companies')).find(c=>c.id===id);if(!selected)throw new Error('Підприємство недоступне');saveCo(selected);await loadRights();nav();await go('entries')};
async function loadRights(){
  currentRights={manager:false,permissions:{}};
  if(!company)return;
  try{currentRights=await api('permissions?company_id='+company.id)}catch(e){console.warn(e.message)}
}
const _bootWithRights=window.boot;
window.boot=async function(){
  if(token){try{me=await api('me')}catch(e){}}
  if(token && me){
    try{
      const available=await api('companies');
      const selected=available.find(c=>c.id===company?.id);
      if(selected)saveCo(selected);
      else if(available.length)saveCo(available[0]);
      else {company=null;localStorage.removeItem('company')}
      await loadRights();
    }catch(e){console.warn(e.message)}
  }
  return _bootWithRights();
};
views.members=async function(){
 if(!company)return go('company');
 const r=await api('permissions?company_id='+company.id);
 if(!r.manager){$('#app').innerHTML='<div class="card err">Лише для адміністратора підприємства</div>';return}
 const members=await api('members?company_id='+company.id);
 const mods=[['refs','Довідники'],['entries','Операції'],['docs','Документи'],['reports','Звіти'],['stock','Склад'],['corrections','Виправлення'],['settings','Налаштування'],['audit','Журнал змін']];
 $('#app').innerHTML=`<div class="card"><h3>Користувачі підприємства: ${esc(company.name)}</h3><p class="mut">Створіть користувача або введіть логін чи email уже зареєстрованого користувача. Пароль потрібен лише для нового облікового запису.</p><div class="row"><div><label>Логін або email</label><input id="ul" autocomplete="off"></div><div><label>Ім’я</label><input id="un"></div><div><label>Пароль нового користувача (від 10 символів)</label><input id="up" type="password" autocomplete="new-password"></div></div><div class="row"><div><label for="member_company_role">Роль у підприємстві</label><select id="member_company_role"><option value="user">Користувач</option><option value="admin">Адміністратор</option></select></div></div><h3>Дозволи</h3><label class="company-create-option" for="allow_company_create"><input id="allow_company_create" type="checkbox"><span>Дозволити користувачу створювати нові підприємства</span></label><table><thead><tr><th>Розділ</th>${[['read','Перегляд'],['create','Створення'],['update','Редагування'],['delete','Видалення']].map(([a,n])=>`<th><label class="permission-column-all"><span>${n}</span><span class="permission-all-control"><input type="checkbox" data-select-all="${a}" aria-label="Усі права: ${n}"><span>Усі права</span></span></label></th>`).join('')}</tr></thead><tbody>${mods.map(([k,n])=>`<tr><td>${n}</td>${['read','create','update','delete'].map(a=>`<td><input type="checkbox" data-module="${k}" data-action="${a}"></td>`).join('')}</tr>`).join('')}</tbody></table><p><button class="btn pri" onclick="saveMember()">Зберегти доступ</button> <span id="msg"></span></p></div><div class="card"><h3>Користувачі з доступом</h3><table><tbody>${members.map(u=>`<tr><td>${esc(u.name)}</td><td>${esc(u.login)}<div class="mut" style="font-size:11px">ID: ${esc(u.public_id||String(u.id))}</div></td><td>${u.company_role==='admin'?'Адмін':'Користувач'}</td><td><button class="btn" onclick="editMember(${u.id})">Права</button> <button class="btn" onclick="removeMember(${u.id})">Відкликати</button></td></tr>`).join('')||'<tr><td>Поки немає користувачів</td></tr>'}</tbody></table></div>`;
 window.memberCache=members;
 // Column-level selection: checked / unchecked / mixed state.
 const syncPermissionColumns=()=>{
  document.querySelectorAll('[data-select-all]').forEach(all=>{
   const cells=[...document.querySelectorAll('[data-module][data-action="'+all.dataset.selectAll+'"]')];
   const count=cells.filter(el=>el.checked).length;
   all.checked=cells.length>0&&count===cells.length;
   all.indeterminate=count>0&&count<cells.length;
  });
 };
 const permissionsTable=$('#app').querySelector('table');
 permissionsTable.addEventListener('change',e=>{
  const el=e.target;
  if(el.matches('[data-select-all]')){
   permissionsTable.querySelectorAll('[data-module][data-action="'+el.dataset.selectAll+'"]').forEach(cell=>cell.checked=el.checked);
  }
  if(el.matches('[data-select-all], [data-module]'))syncPermissionColumns();
 });
 window.syncPermissionColumns=syncPermissionColumns;
 syncPermissionColumns();
};
window.editMember=function(id){const u=window.memberCache.find(x=>x.id===id);if(!u)return;$('#ul').value=u.login;$('#ul').readOnly=true;$('#un').value=u.name;$('#up').value='';$('#allow_company_create').checked=u.can_create_company===true;$('#member_company_role').value=u.company_role||'user';document.querySelectorAll('[data-module]').forEach(el=>el.checked=u.permissions?.[el.dataset.module]?.[el.dataset.action]===true);window.syncPermissionColumns?.()};
window.saveMember=async function(){
 const permissions={};document.querySelectorAll('[data-module]').forEach(el=>{const k=el.dataset.module;permissions[k]??={};permissions[k][el.dataset.action]=el.checked});
 try{await api('members',{method:'POST',body:{company_id:company.id,login:$('#ul').value,name:$('#un').value,password:$('#up').value,permissions,can_create_company:$('#allow_company_create').checked,company_role:$('#member_company_role').value}});await views.members()}catch(e){$('#msg').textContent=e.message}
};
window.removeMember=async function(id){if(!confirm('Відкликати доступ до підприємства?'))return;try{await api(`members/${id}?company_id=${company.id}`,{method:'DELETE'});await views.members()}catch(e){alert(e.message)}};
