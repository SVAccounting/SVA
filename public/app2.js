// Бічне меню (як у BAS), налаштування підприємства, довідники, документи, сторно, шахматка, картка рахунка
const today=new Date().toISOString().slice(0,10),R2=n=>Math.round(n*100)/100;
const prevDay=d=>{const x=new Date(d+'T00:00:00Z');x.setUTCDate(x.getUTCDate()-1);return x.toISOString().slice(0,10)};
const nameOf=a=>accounts.find(x=>x.code===a)?.name||'';
const MENU=[['Головне',[['company','🏢 Підприємства'],['members','👥 Користувачі та права'],['set','⚙ Облікова політика й налаштування'],['open','Початкові залишки']]],
['Довідники',[['plan','План рахунків'],['r_staff','Персонал'],['r_customer','Покупці'],['r_supplier','Постачальники'],['r_bank','Банки'],['r_wh','Склади'],['r_item','Номенклатура'],['r_item_type','Види номенклатури'],['r_uom','Одиниці виміру'],['r_price_type','Види цін'],['taxnorm','Податкові нормативи']]],
['Ціноутворення',[['prices','Встановлення цін'],['r_price_type','Види цін']]],
['Каса',[['pko','ПКО — прибутковий ордер'],['vko','ВКО — видатковий ордер'],['cashbook','Касова книга']]],
['Банк',[['bin','Надходження на р/р'],['bout','Списання з р/р']]],
['Склад',[['rcpt','Надходження ТМЦ'],['sale','Реалізація (накладна)'],['prod','Випуск готової продукції']]],
['Операції',[['entries','Журнал операцій'],['add','Нова операція'],['tpl','Типові операції']]],
['Кадри',[['r_staff','Персонал'],['taxnorm','Податкові нормативи'],['payroll','Нарахування зарплати'],['paystatement','Зарплатна відомість']]],
['Звіти',[['osv','Оборотно-сальдова відомість'],['chess','Шахматка'],['card','Картка рахунка'],['rep','Форми №1, №2']]],
['Навчання',[['tasks','Завдання']]]];
const HIDE_T=['add','pko','vko','bin','bout','rcpt','sale','open'];
function nav(){
  if(!me)return;
  $('#nav').innerHTML=MENU.map(([s,it])=>`<div class="ms">${s}</div>`+it.filter(([k])=>me.role!=='superadmin'||!HIDE_T.includes(k)).map(([k,v])=>`<a class="${k===tab?'on':''}" onclick="go('${k}')">${v}</a>`).join('')).join('');
  $('#co').textContent=me.name+(me.role==='superadmin'?' (адмін)':'')+(company?' · 🏢 '+company.name:'');
}
const NOCO=['company','plan','tasks'];
async function go(t){
  if(!NOCO.includes(t)&&!company){alert('Спочатку оберіть або створіть підприємство');t='company'}
  tab=t;nav();$('#app').innerHTML='<div class="card mut">Завантаження…</div>';
  try{await views[t]()}catch(e){$('#app').innerHTML=`<div class="card err">${esc(e.message)}</div>`}
}
// ---------- підприємство, облікова політика ----------
const DEF={inv_scope:'warehouse',vat:true,rate:20,tax:'general',inv:'fifo',dep:'line',mnma:20000};
const S=()=>({...DEF,...(company?.settings||{})});
const OPT=(a,v)=>a.map(([k,l])=>`<option value="${k}"${k===v?' selected':''}>${l}</option>`).join('');
const TAXES=[['general','Загальна система (податок на прибуток)'],['s1','Єдиний податок, 1 група'],['s2','Єдиний податок, 2 група'],['s3','Єдиний податок, 3 група'],['s4','Єдиний податок, 4 група']];
const INV=[['fifo','FIFO — першими придбані'],['avg','Середньозважена (на дату вибуття)'],['spec','Ідентифікована (вибір партії)']];
const INVSCOPE=[['warehouse','Окремо за кожним складом'],['company','У цілому за підприємством (склади разом)']];
const DEP=[['line','Прямолінійний'],['dec','Зменшення залишкової вартості'],['prod','Виробничий']];
const setForm=(s,name)=>`<div class="row"><div><label>Назва підприємства</label><input id="s_name" value="${esc(name)}"></div><div><label>ЄДРПОУ / ІПН</label><input id="s_code" value="${esc(s.code)}"></div><div><label>Початок ведення обліку</label><input id="s_start" type="date" value="${s.start||new Date().getFullYear()+'-01-01'}"></div></div>
<div class="row"><div><label>Система оподаткування</label><select id="s_tax">${OPT(TAXES,s.tax)}</select></div><div><label>Платник ПДВ</label><select id="s_vat">${OPT([['1','Так'],['0','Ні']],s.vat?'1':'0')}</select></div><div><label>Ставка ПДВ, %</label><input id="s_rate" type="number" value="${s.rate}"></div></div>
<div class="row"><div><label>Метод оцінки запасів при вибутті</label><select id="s_inv">${OPT(INV,s.inv)}</select></div><div><label>Рівень визначення собівартості (FIFO / середньозважена)</label><select id="s_inv_scope">${OPT(INVSCOPE,s.inv_scope||'warehouse')}</select></div><div><label>Метод амортизації ОЗ</label><select id="s_dep">${OPT(DEP,s.dep)}</select></div><div><label>Вартісна межа МНМА, грн</label><input id="s_mnma" type="number" value="${s.mnma}"></div></div>
<h3>Реквізити для фінансової звітності</h3><div class="row">${[['territory','Територія'],['katottg','КАТОТТГ'],['legal_form','Організаційно-правова форма'],['kopfg','КОПФГ'],['activity','Вид економічної діяльності'],['kved','КВЕД'],['employees','Середня кількість працівників'],['address','Адреса'],['phone','Телефон']].map(([k,t])=>`<div><label>${t}</label><input id="s_${k}" value="${esc(s[k]||'')}"></div>`).join('')}</div>`;
const directorFields=[['head_staff','Керівник'],['chief_accountant_staff','Головний бухгалтер'],['finance_director_staff','Фінансовий директор'],['hr_head_staff','Керівник відділу кадрів']];
const staffLeadership=st=>`<h3>Посадові особи (з довідника «Персонал»)</h3><div class="row">${directorFields.map(([k,t])=>`<div><label>${t}</label><select id="s_${k}" data-staff-role="${k}" data-selected="${esc(st[k]||'')}"><option value="">Не призначено</option></select></div>`).join('')}</div>`;
async function fillStaffLeadership(){if(!company)return;const people=await api(`refs?company_id=${company.id}&kind=staff`);document.querySelectorAll('[data-staff-role]').forEach(el=>{const v=el.dataset.selected;el.innerHTML='<option value="">Не призначено</option>'+people.map(u=>`<option value="${u.id}" data-pos="${esc(u.data?.pos||'')}">${esc(u.name)}</option>`).join('');el.value=v});}
const readLeadership=()=>Object.fromEntries(directorFields.flatMap(([key])=>[[key,$('#s_'+key)?.value||''],[key.replace('_staff','_name'),$('#s_'+key)?.selectedOptions?.[0]?.textContent?.replace('Не призначено','')||''],[key.replace('_staff','_pos'),$('#s_'+key)?.selectedOptions?.[0]?.dataset?.pos||'']]));
const readSet=()=>({code:$('#s_code').value,start:$('#s_start').value,tax:$('#s_tax').value,vat:$('#s_vat').value==='1',rate:Number($('#s_rate').value)||0,inv:$('#s_inv').value,inv_scope:$('#s_inv_scope').value,dep:$('#s_dep').value,mnma:Number($('#s_mnma').value)||0,...Object.fromEntries(['territory','katottg','legal_form','kopfg','activity','kved','employees','address','phone'].map(k=>[k,$('#s_'+k)?.value||''])),...readLeadership()});
views.company=async()=>{
  const L=await api('companies'),T=me.role==='superadmin';
  const mayCreate=T||(await api('company-create-permission')).allowed;
  $('#app').innerHTML=(!mayCreate?'':`<div class="card"><h3>Нове підприємство</h3>${setForm(DEF,'')}<p><button class="btn pri" onclick="createCo()">Створити й ввести залишки</button> <span id="msg" class="err"></span></p></div>`)+
  `<div class="card sc"><h3>Підприємства</h3><table><tbody>${L.map(c=>`<tr><td>${esc(c.name)}${c.owner?` <span class="mut">— ${esc(c.owner)}</span>`:''}</td><td class="mut">${(TAXES.find(x=>x[0]===(c.settings?.tax||'general'))||[])[1]||''}; ПДВ: ${c.settings?.vat===false?'ні':'так'}</td><td><button class="btn ${company?.id===c.id?'pri':''}" onclick="pick(${c.id})">${company?.id===c.id?'Обрано':'Обрати'}</button> ${T?`<button class="btn" onclick="assignAdmin(${c.id})">Призначити адміна</button>`:''} ${(T||currentRights.manager&&company?.id===c.id)?`<button class="btn" onclick="deleteCompany(${c.id},decodeURIComponent('${encodeURIComponent(c.name)}'))">Видалити</button>`:''}</td></tr>`).join('')}</tbody></table></div>`;
};
const saveCo=c=>{company=c;localStorage.setItem('company',JSON.stringify(c))};
async function pick(id){const c=(await api('companies')).find(c=>c.id===id);if(!c)throw new Error('Підприємство недоступне');saveCo(c);await loadRights();nav();return go('home')}
async function createCo(){try{saveCo(await api('companies',{method:'POST',body:{name:$('#s_name').value,settings:readSet()}}));await loadRights();nav();go('open')}catch(e){$('#msg').textContent=e.message}}
views.set=async()=>{
  const ro=!canDo('settings','update');
  $('#app').innerHTML=`<div class="card"><h3>Налаштування та облікова політика</h3>${setForm(S(),company.name)}${staffLeadership(S())}${ro?'':'<p><button class="btn pri" onclick="saveSet()">Зберегти</button> <span id="msg"></span></p>'}</div>`;
  await fillStaffLeadership(); if(ro)document.querySelectorAll('#app input,#app select').forEach(e=>e.disabled=true);
};
async function saveSet(){try{saveCo(await api('companies/'+company.id,{method:'POST',body:{name:$('#s_name').value,settings:readSet()}}));nav();$('#msg').textContent='✓ Збережено'}catch(e){$('#msg').textContent=e.message;$('#msg').className='err'}}
// ---------- початкові залишки ----------
views.open=async()=>{
  const E=(await api('entries?company_id='+company.id)).filter(e=>e.doc==='Початкові залишки');
  $('#app').innerHTML=`<div class="card"><h3>Початкові залишки на ${S().start||'початок обліку'}</h3><p class="mut">Сума залишків за дебетом має дорівнювати сумі за кредитом. Помилку виправляють сторно в журналі операцій.</p><div id="ob"></div><p><button class="btn" onclick="obRow()">+ рядок</button> <button class="btn pri" onclick="obSave()">Провести залишки</button> <span id="msg" class="err"></span></p><div id="obs" class="mut"></div></div>
  <div class="card sc"><h3>Проведені залишки</h3><table><tbody>${E.map(e=>`<tr><td>${e.date}</td><td>Дт ${e.debit_acc}</td><td>Кт ${e.credit_acc}</td><td class="n">${fmt(e.amount)}</td></tr>`).join('')||'<tr><td class="mut">Залишків ще не введено</td></tr>'}</tbody></table></div>`;
  for(let i=0;i<5;i++)obRow();
};
const obRow=()=>$('#ob').insertAdjacentHTML('beforeend',`<div class="row" style="grid-template-columns:2fr 1fr 1fr;margin-bottom:6px"><select class="oa"><option value="">Рахунок…</option>${accOpts()}</select><input class="od" type="number" step="0.01" min="0" placeholder="Сальдо Дт" oninput="obSum()"><input class="ok" type="number" step="0.01" min="0" placeholder="Сальдо Кт" oninput="obSum()"></div>`);
const obRows=()=>[...document.querySelectorAll('#ob .row')].map(r=>({a:r.querySelector('.oa').value,d:Number(r.querySelector('.od').value)||0,k:Number(r.querySelector('.ok').value)||0})).filter(x=>x.a&&(x.d||x.k));
function obSum(){const r=obRows(),d=r.reduce((s,x)=>s+x.d,0),k=r.reduce((s,x)=>s+x.k,0);$('#obs').textContent=`Дт: ${fmt(d)} · Кт: ${fmt(k)} · різниця: ${fmt(d-k)}`}
async function obSave(){
  const lines=[];let d=0,k=0;
  obRows().forEach(x=>{if(x.d){d+=x.d;lines.push({debit_acc:x.a,credit_acc:'000',amount:x.d})}if(x.k){k+=x.k;lines.push({debit_acc:'000',credit_acc:x.a,amount:x.k})}});
  if(!lines.length)return $('#msg').textContent='Введіть залишки';
  if(Math.abs(d-k)>0.005)return $('#msg').textContent='Сума Дт не дорівнює сумі Кт';
  try{await api('entries',{method:'POST',body:{company_id:company.id,date:prevDay(S().start||today),doc:'Початкові залишки',description:'Введення початкових залишків',lines}});go('osv')}catch(e){$('#msg').textContent=e.message}
}
// ---------- довідники ----------
const REF={staff:['Персонал',[['name','ПІБ'],['pos','Посада'],['salary','Оклад, грн'],['payroll_debit','Рахунок витрат на оплату праці (92, 23, 91 тощо)'],['ipn','ІПН'],['group','Група'],['psp_eligible','ПСП: так / ні'],['psp_pct','ПСП, % (100 / 150 / 200)'],['psp_children','Кількість дітей до 18 років'],['esv_rate','Ставка ЄСВ, % (за замовч. 22)'],['esv_cap_mw','Гранична база ЄСВ, кількість МЗП (за замовч. 20; для окремих категорій 15)']]],customer:['Покупці',[['name','Назва'],['code','ЄДРПОУ / ІПН'],['phone','Телефон'],['group','Група']]],supplier:['Постачальники',[['name','Назва'],['code','ЄДРПОУ / ІПН'],['phone','Телефон'],['group','Група']]],bank:['Банки',[['name','Банк'],['mfo','МФО'],['iban','Рахунок (IBAN)'],['group','Група']]],wh:['Склади',[['name','Назва складу'],['mvo','Матеріально відповідальна особа'],['group','Група']]],item:['Номенклатура',[['name','Назва'],['item_type_id','Вид номенклатури'],['uom_id','Одиниця виміру'],['sku','Артикул'],['barcode','Штрихкод / код'],['group','Група']]],item_type:['Види номенклатури',[['name','Назва виду'],['code','Системний код'],['stockable','Веде складський облік'],['stock_acc','Рахунок запасів'],['cost_acc','Рахунок собівартості продажу'],['revenue_acc','Рахунок доходу']]],uom:['Одиниці виміру',[['name','Назва одиниці'],['code','Скорочення']]],price_type:['Види цін',[['name','Назва типу ціни'],['code','Код']]]};
let RL=[],RK='',RE=null,INV_TYPES=[],INV_UNITS=[];
let inventoryBarcodeSearchExact='';
Object.keys(REF).forEach(k=>views['r_'+k]=async()=>{RK=k;RE=null;const tasks=[api(`refs?company_id=${company.id}&kind=${k}`)];if(k==='item')tasks.push(api(`refs?company_id=${company.id}&kind=item_type`),api(`refs?company_id=${company.id}&kind=uom`));const values=await Promise.all(tasks);RL=values[0];if(k==='item'){INV_TYPES=values[1];INV_UNITS=values[2];}drawRef()});
function drawRef(){
 inventoryBarcodeSearchExact='';
 const [title,F]=REF[RK],canCreate=canDo('refs','create'),canUpdate=canDo('refs','update'),canDelete=canDo('refs','delete'),e=RE?RL.find(x=>x.id===RE):null;
 const groups=[...new Set(RL.map(x=>String(x.data?.group||'').trim()).filter(Boolean))].sort();
 const input=(f,l)=>{const v=esc(f==='name'?e?.name:e?.data?.[f]);
  if(RK==='item'&&['item_type_id','uom_id'].includes(f)){
    const options=f==='item_type_id'?INV_TYPES:INV_UNITS;
    return `<div><label>${l}</label><select id="rf_${f}"><option value="">Оберіть із довідника</option>${options.map(x=>`<option value="${x.id}" ${String(x.id)===String(e?.data?.[f]||'')?'selected':''}>${esc(x.name)}${f==='item_type_id'?' — '+esc(x.data?.stock_acc||'без складу'):''}</option>`).join('')}</select></div>`;
  }
  if(RK==='item_type'&&['stock_acc','cost_acc','revenue_acc'].includes(f))return `<div><label>${l}</label><select id="rf_${f}"><option value="">Без рахунку</option>${accounts.filter(x=>x.kind!=='O').map(x=>`<option value="${x.code}" ${x.code===String(e?.data?.[f]||'')?'selected':''}>${x.code} — ${esc(x.name)}</option>`).join('')}</select></div>`;
  if(RK==='item_type'&&f==='stockable')return `<div><label>${l}</label><select id="rf_stockable"><option value="yes" ${v!=='no'?'selected':''}>Так, запаси на складі</option><option value="no" ${v==='no'?'selected':''}>Ні, послуга / робота</option></select></div>`;
  if(f==='esv_cap_mw')return `<div><label>${l}</label><input id="rf_${f}" type="number" step="0.5" min="1" max="40" list="esv_cap_list" value="${v||20}" inputmode="decimal"><datalist id="esv_cap_list"><option value="20">20 МЗП — загальний випадок</option><option value="15">15 МЗП — окремі категорії</option></datalist></div>`;
  if(f==='psp_eligible')return `<div><label>${l}</label><select id="rf_${f}"><option value="no" ${v==='no'?'selected':''}>Ні</option><option value="yes" ${v==='yes'?'selected':''}>Так (за заявою та документами)</option></select></div>`;if(f==='barcode'&&RK==='item')return `<div><label for="rf_barcode">${l}</label><div class="barcode-input-row"><input id="rf_barcode" value="${v}" autocomplete="off" inputmode="numeric" placeholder="Введіть або скануйте код"><button type="button" class="btn barcode-camera-btn" onclick="scanInventoryBarcode()" title="Сканувати штрихкод камерою" aria-label="Сканувати штрихкод камерою">📷</button></div></div>`;return `<div><label>${l}</label><input id="rf_${f}" value="${v}" ${f==='group'?`list="ref_groups"`:''} ${['price','salary','psp_pct','psp_children','esv_rate'].includes(f)?'inputmode="decimal"':''}></div>`};
 $('#app').innerHTML=`${canCreate||e&&canUpdate?`<details class="card ref-editor" ${e||!window.matchMedia("(max-width:700px)").matches?"open":""}><summary>${title}: ${e?'редагування':'додати новий запис'}</summary><div class="row">${F.map(([f,l])=>input(f,l)).join('')}</div><datalist id="ref_groups">${groups.map(g=>`<option value="${esc(g)}">`).join('')}</datalist>${RK==='item'&&e&&!e.data?.item_type_id?'<label class="company-create-option"><input type="checkbox" id="rf_legacy"> Підтверджую первинну класифікацію старого товару. Перевірив історичні рахунки: наявні проводки не перераховуються.</label>':''}<p><button class="btn pri" onclick="saveRef()">Зберегти</button> ${e?'<button class="btn" onclick="RE=null;drawRef()">Скасувати</button>':''} <span id="msg" class="err"></span></p></details>`:''}
 <div class="card"><div class="ref-toolbar"><h3>${title}</h3><label>Група <select id="ref_group_filter" onchange="filterRefRows()"><option value="">Усі групи</option>${groups.map(g=>`<option value="${esc(g)}">${esc(g)}</option>`).join('')}</select></label><div class="ref-search-field"><label for="ref_search">Пошук</label><div class="barcode-input-row"><input id="ref_search" placeholder="${RK==='item'?'Назва, артикул, штрихкод':'Назва, код, група'}" oninput="inventoryBarcodeSearchExact='';filterRefRows()" autocomplete="off">${RK==='item'?'<button type="button" class="btn barcode-camera-btn" onclick="scanInventoryBarcode(&quot;search&quot;)" title="Знайти товар за штрихкодом камерою" aria-label="Сканувати штрихкод для пошуку">📷</button>':''}</div></div></div><div class="sc"><table class="ref-table"><thead><tr>${F.map(([,l])=>`<th>${l}</th>`).join('')}<th>Дії</th></tr></thead><tbody>${RL.map(x=>`<tr data-barcode="${esc(x.data?.barcode||'')}" data-group="${esc(x.data?.group||'')}" data-search="${esc([x.name,...Object.values(x.data||{})].join(' ').toLowerCase())}">${F.map(([f,l],i)=>`<td data-label="${esc(l)}" class="${i===0?'ref-primary':''}">${esc(f==='name'?x.name:f==='item_type_id'?INV_TYPES.find(t=>t.id===Number(x.data?.[f]))?.name||'Не визначено':f==='uom_id'?INV_UNITS.find(u=>u.id===Number(x.data?.[f]))?.data?.code||x.data?.unit||'Не визначено':x.data?.[f])}</td>`).join('')}<td class="ref-actions" data-label="Дії">${canUpdate?`<button class="btn" onclick="RE=${x.id};drawRef();window.scrollTo({top:0,behavior:'smooth'})" title="Редагувати">✎</button>`:''} ${canDelete?`<button class="btn" onclick="delRef(${x.id})" title="Видалити">✕</button>`:''}</td></tr>`).join('')||'<tr class="ref-empty"><td>Записів немає</td></tr>'}</tbody></table></div><p id="ref_result_count" class="mut"></p></div>`;
 filterRefRows();
}
function filterRefRows(){const g=$('#ref_group_filter')?.value||'',q=($('#ref_search')?.value||'').trim().toLowerCase();let n=0;document.querySelectorAll('.ref-table tbody tr[data-search]').forEach(tr=>{const on=(!g||g===tr.dataset.group)&&(inventoryBarcodeSearchExact?tr.dataset.barcode===inventoryBarcodeSearchExact:(!q||tr.dataset.search.includes(q)));tr.hidden=!on;if(on)n++});if($('#ref_result_count'))$('#ref_result_count').textContent=inventoryBarcodeSearchExact&&n===0?`Товар зі штрихкодом ${inventoryBarcodeSearchExact} не знайдено. Показано: 0 із ${RL.length}`:`Показано: ${n} із ${RL.length}`}
async function saveRef(){const data={...((RE?RL.find(x=>x.id===RE):null)?.data||{})};REF[RK][1].forEach(([f])=>{if(f!=='name')data[f]=$('#rf_'+f).value});if(RK==='item'){const selected=INV_UNITS.find(x=>x.id===Number(data.uom_id));data.unit=selected?.data?.code||selected?.name||'';const duplicated=RL.find(x=>x.id!==RE&&data.barcode&&x.data?.barcode===data.barcode);if(duplicated)return $('#msg').textContent='Штрихкод уже використовується в іншому товарі'}try{await api('refs',{method:'POST',body:{company_id:company.id,kind:RK,id:RE,name:$('#rf_name').value,data,legacy_classify:Boolean($('#rf_legacy')?.checked)}});views['r_'+RK]()}catch(e){$('#msg').textContent=e.message}}
async function delRef(id){if(confirm('Видалити запис?')){await api(`refs/${id}?company_id=${company.id}`,{method:'DELETE'});views['r_'+RK]()}}
// План рахунків: глобальні реквізити та три субконто поточного підприємства.
const SUBCONTO_CHOICES=[['','— Не використовується —'],['counterparty','Контрагент'],['contract','Договір'],['warehouse','Склад'],['item','Номенклатура'],['lot','Партія'],['bank','Банківський рахунок'],['staff','Працівник'],['cost_center','Центр витрат'],['project','Проєкт'],['document','Документ'],['free','Інше значення']];
const PLAN_ACCOUNT_KINDS={A:'Активний',P:'Пасивний',AP:'Активно-пасивний',O:'Позабалансовий'};
const PLAN_TRI_OPTIONS=[['','Не визначено'],['1','Так'],['0','Ні']];
const planTriValue=x=>x===true?'1':x===false?'0':'';
const planReadTri=x=>x==='1'?true:x==='0'?false:null;
const planTriText=x=>x===true?'Так':x===false?'Ні':'Не визначено';
let ACCOUNT_SUBCONTO=[], PLAN_SEARCH_QUERY='';
const planAccountSlots=c=>ACCOUNT_SUBCONTO.find(x=>x.account_code===c)?.slots||[];
const planSlotFields=(prefix,slots,readonly=false)=>`<div class="subconto-slots">${[0,1,2].map(i=>`<div class="subconto-slot"><b>Субконто ${i+1}</b><label for="${prefix}type_${i}">Тип аналітики</label><select id="${prefix}type_${i}" ${readonly?'disabled':''}>${SUBCONTO_CHOICES.map(([v,n])=>`<option value="${v}" ${v===(slots[i]?.kind||'')?'selected':''}>${n}</option>`).join('')}</select><label for="${prefix}label_${i}">Назва в обліку</label><input id="${prefix}label_${i}" value="${esc(slots[i]?.label||'')}" maxlength="80" placeholder="Наприклад, Контрагент" ${readonly?'readonly':''}></div>`).join('')}</div>`;
const planReadSlots=prefix=>[0,1,2].map(i=>({kind:document.getElementById(prefix+'type_'+i)?.value||'',label:document.getElementById(prefix+'label_'+i)?.value.trim()||''})).filter(x=>x.kind).map(x=>({kind:x.kind,label:x.label||(SUBCONTO_CHOICES.find(c=>c[0]===x.kind)||[])[1]||x.kind}));
const planPropertySelect=(id,value)=>`<select id="${id}">${OPT(PLAN_TRI_OPTIONS,planTriValue(value))}</select>`;
// Існуючі рахунки редагують у вікні; форма додавання згорнута за замовчуванням.
views.plan=async()=>{
  ACCOUNT_SUBCONTO=company?await api('account-subconto?company_id='+company.id):[];
  const T=me.role==='superadmin',lookup=new Map(ACCOUNT_SUBCONTO.map(x=>[x.account_code,x.slots]));
  $('#app').innerHTML=`<div class="plan-page">
    ${T?`<details class="card plan-new-details" id="plan_new_details"><summary><span>＋ Додати новий рахунок</span><span class="plan-collapse-indicator" aria-hidden="true">⌄</span></summary><div class="plan-new-body"><div class="plan-fields-grid"><label>Код рахунку<input id="plan_new_code" autocomplete="off" maxlength="4" inputmode="numeric" placeholder="Наприклад, 281"></label><label>Назва<input id="plan_new_name" maxlength="240" placeholder="Назва рахунку"></label><label>Тип<select id="plan_new_kind">${OPT(Object.entries(PLAN_ACCOUNT_KINDS),'A')}</select></label></div><p class="mut">Створення рахунку діє для всіх підприємств. Після створення відкриється його картка для налаштування властивостей і субконто.</p><div class="plan-add-actions"><button type="button" class="btn pri" onclick="createPlanAccount()">Створити рахунок</button><span id="plan_new_error" class="err" role="alert"></span></div></div></details>`:''}
    <section class="card plan-table-card"><div class="plan-toolbar"><div><h3>План рахунків <span class="plan-count">${accounts.length} позицій</span></h3><div class="mut plan-scope-note">Загальні властивості · ${company?'Субконто: '+esc(company.name):'Оберіть підприємство для налаштування субконто'}</div></div><label class="plan-search-box" for="plan_find"><span>Пошук рахунку</span><div class="plan-search-controls"><input id="plan_find" type="search" autocomplete="off" value="${esc(PLAN_SEARCH_QUERY)}" placeholder="Код, назва, тип, аналітика, субконто" oninput="planSearch(this.value)"><button type="button" class="btn" onclick="planClearSearch()" title="Очистити пошук">Очистити</button></div></label></div>
    <div class="plan-scroll-help mut">Прокручуйте таблицю горизонтально, щоб переглянути всі стовпці. Натисніть на рахунок для відкриття його картки.</div>
    <div class="plan-scroll" tabindex="0" role="region" aria-label="План рахунків з горизонтальним прокручуванням"><table class="account-table plan-accounts-table"><thead><tr><th>Код</th><th>Назва рахунку</th><th>Тип</th><th>Аналітичний облік</th><th>Кількісний облік</th><th>Субконто підприємства</th><th>Дія</th></tr></thead><tbody>${accounts.map(a=>{
      const slots=lookup.get(a.code)||[],search=[a.code,a.name,PLAN_ACCOUNT_KINDS[a.kind]||'',a.analytic_dimensions||'',a.quantity_policy||'',planTriText(a.analytic_enabled),planTriText(a.quantity_enabled),...slots.map(x=>x.label+' '+x.kind)].join(' ').toLocaleLowerCase('uk');
      return `<tr class="plan-row" data-search="${esc(search)}" data-code="${esc(a.code)}" role="button" tabindex="0" aria-label="Відкрити картку рахунку ${esc(a.code)} ${esc(a.name)}" onclick="openPlanAccount(this.dataset.code)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openPlanAccount(this.dataset.code)}"><td><b class="plan-code">${esc(a.code)}</b></td><td class="plan-account-name">${esc(a.name)}</td><td>${esc(PLAN_ACCOUNT_KINDS[a.kind]||a.kind)}</td><td title="${esc(a.analytic_dimensions||'')}">${planTriText(a.analytic_enabled)}${a.analytic_dimensions?`<small>${esc(a.analytic_dimensions)}</small>`:''}</td><td>${planTriText(a.quantity_enabled)}${a.quantity_policy?`<small>${esc(a.quantity_policy)}</small>`:''}</td><td>${slots.length?slots.map(x=>`<span class="plan-subchip">${esc(x.label)}</span>`).join(''):'<span class="mut">—</span>'}</td><td><button type="button" class="btn plan-open-btn" onclick="event.stopPropagation();openPlanAccount('${a.code}')">Відкрити</button></td></tr>`;
    }).join('')}</tbody></table></div><p id="plan_result_count" class="plan-result-count mut" aria-live="polite"></p></section><div id="plan_dialog_host"></div></div>`;
  planSearch(PLAN_SEARCH_QUERY);
};
function planSearch(q){
  PLAN_SEARCH_QUERY=String(q||'');const s=PLAN_SEARCH_QUERY.trim().toLocaleLowerCase('uk');let n=0;
  document.querySelectorAll('.plan-row').forEach(r=>{const matched=!s||r.dataset.search.includes(s);r.hidden=!matched;if(matched)n++});
  const counter=$('#plan_result_count');if(counter)counter.textContent=`Знайдено: ${n} із ${accounts.length}`;
}
function planClearSearch(){PLAN_SEARCH_QUERY='';const input=$('#plan_find');if(input){input.value='';input.focus()}planSearch('')}
async function createPlanAccount(){
  const code=$('#plan_new_code')?.value.trim()||'',name=$('#plan_new_name')?.value.trim()||'',msg=$('#plan_new_error');
  if(!/^\d{1,4}$/.test(code)||!name){msg.textContent='Вкажіть цифровий код (1–4 цифри) та назву рахунку.';return}
  if(accounts.some(x=>x.code===code)){msg.textContent='Такий рахунок уже існує. Відкрийте його картку для редагування.';return}
  const button=document.querySelector('.plan-add-actions button');if(button)button.disabled=true;
  try{
    await api('accounts',{method:'POST',body:{code,name,kind:$('#plan_new_kind').value,analytic_enabled:null,analytic_dimensions:'',quantity_enabled:null,quantity_policy:''}});
    accounts=await api('accounts');await views.plan();openPlanAccount(code);if(typeof toast==='function')toast('Рахунок створено','ok');
  }catch(e){msg.textContent=e.message;if(button)button.disabled=false}
}
function openPlanAccount(code){
  const a=accounts.find(x=>x.code===code);if(!a)return;
  const T=me.role==='superadmin',local=Boolean(company&&(T||currentRights.manager));
  const slots=planAccountSlots(code);const host=$('#plan_dialog_host');if(!host)return;
  host.innerHTML=`<dialog class="plan-account-dialog" id="plan_account_dialog" aria-labelledby="plan_dialog_title"><div class="plan-dialog-head"><div><span class="plan-overline">КАРТКА РАХУНКУ</span><h2 id="plan_dialog_title">${esc(a.code)} · ${esc(a.name)}</h2></div><button type="button" class="btn plan-dialog-close" onclick="closePlanAccount()" aria-label="Закрити">✕</button></div>
    <div class="plan-dialog-content"><section class="plan-detail-section"><div class="plan-detail-heading"><h3>Властивості рахунку</h3><span class="plan-scope-badge">Для всіх підприємств</span></div><div class="plan-fields-grid"><label>Код<input id="plan_edit_code" value="${esc(a.code)}" readonly aria-readonly="true" title="Код наявного рахунку не змінюється"></label><label>Назва<input id="plan_edit_name" value="${esc(a.name)}" maxlength="240" ${T?'':'readonly'}></label><label>Тип<select id="plan_edit_kind" ${T?'':'disabled'}>${OPT(Object.entries(PLAN_ACCOUNT_KINDS),a.kind)}</select></label><label>Аналітичний облік${planPropertySelect('plan_edit_analytic',a.analytic_enabled)}</label><label>Кількісний облік${planPropertySelect('plan_edit_quantity',a.quantity_enabled)}</label></div>
    <div class="plan-fields-grid plan-wide-fields"><label>Розрізи аналітичного обліку<input id="plan_edit_dimensions" value="${esc(a.analytic_dimensions||'')}" ${T?'':'readonly'}></label><label>Правило кількісного обліку<input id="plan_edit_policy" value="${esc(a.quantity_policy||'')}" ${T?'':'readonly'}></label></div>
    ${T?'<p class="plan-note">Зміна назви, типу й загальних ознак рахунку вплине на всі підприємства. Код існуючого рахунку збережено, щоб не порушити посилання у проводках.</p>':'<p class="plan-note">Загальні властивості доступні для редагування лише суперадміністратору.</p>'}</section>
    <section class="plan-detail-section"><div class="plan-detail-heading"><h3>Субконто (до трьох)</h3><span class="plan-scope-badge local">${company?esc(company.name):'Підприємство не вибране'}</span></div>
    ${company?`${planSlotFields('plan_modal_',slots,!local)}<p class="plan-note">Субконто змінюються лише для цього підприємства. Заповнюйте розрізи послідовно; існуючі проведення не перераховуються.</p>`:'<p class="plan-note">Для налаштування субконто спершу виберіть підприємство.</p>'}</section></div>
    <div class="plan-dialog-footer"><span id="plan_modal_error" class="err" role="alert"></span><div class="plan-dialog-actions">${T?`<button type="button" class="btn plan-delete-btn" onclick="deletePlanAccount('${a.code}')">Видалити</button>`:''}<button type="button" class="btn" onclick="closePlanAccount()">Закрити</button>${(T||local)?'<button type="button" class="btn pri" id="plan_modal_save" onclick="savePlanAccount()">Зберегти зміни</button>':''}</div></div></dialog>`;
  if(!T){['plan_edit_analytic','plan_edit_quantity'].forEach(id=>{const el=document.getElementById(id);if(el)el.disabled=true})}
  host.querySelector('dialog').showModal();
}
function closePlanAccount(){document.getElementById('plan_account_dialog')?.close()}
async function savePlanAccount(){
  const code=$('#plan_edit_code')?.value,a=accounts.find(x=>x.code===code);if(!a)return;
  const T=me.role==='superadmin',local=Boolean(company&&(T||currentRights.manager));const msg=$('#plan_modal_error'),btn=$('#plan_modal_save');
  const next={code,name:$('#plan_edit_name').value.trim(),kind:$('#plan_edit_kind').value,analytic_enabled:planReadTri($('#plan_edit_analytic').value),analytic_dimensions:$('#plan_edit_dimensions').value.trim(),quantity_enabled:planReadTri($('#plan_edit_quantity').value),quantity_policy:$('#plan_edit_policy').value.trim()};
  const changedGlobal=T&&['name','kind','analytic_enabled','analytic_dimensions','quantity_enabled','quantity_policy'].some(k=>(a[k]??'')!==(next[k]??''));
  const oldSlots=planAccountSlots(code),nextSlots=local?planReadSlots('plan_modal_'):oldSlots;
  const changedLocal=local&&JSON.stringify(nextSlots)!==JSON.stringify(oldSlots);
  if(!changedGlobal&&!changedLocal){msg.textContent='Змін немає.';return}
  if(changedGlobal&&!next.name){msg.textContent='Назва рахунку не може бути порожньою.';return}
  if(changedLocal&&new Set(nextSlots.map(s=>s.kind)).size!==nextSlots.length){msg.textContent='Типи субконто не повинні повторюватися.';return}
  if(changedGlobal&&!confirm('Змінити загальні властивості рахунку '+code+' для всіх підприємств?'))return;
  btn.disabled=true;msg.textContent='';let globalSaved=false;
  try{
    if(changedGlobal){await api('accounts',{method:'POST',body:next});globalSaved=true}
    if(changedLocal)await api('account-subconto',{method:'POST',body:{company_id:company.id,account_code:code,slots:nextSlots}});
    if(changedGlobal)accounts=await api('accounts');
    const savedSearch=PLAN_SEARCH_QUERY;await views.plan();PLAN_SEARCH_QUERY=savedSearch;
    if(typeof toast==='function')toast('Зміни рахунку '+code+' збережено','ok');
  }catch(e){
    msg.textContent=(globalSaved?'Загальні властивості збережено, але зміни субконто не вдалося зберегти. ':'')+e.message;
    if(globalSaved)accounts=await api('accounts').catch(()=>accounts);
    btn.disabled=false;
  }
}
async function deletePlanAccount(code){
  if(!confirm('Видалити рахунок '+code+'? Рахунки, використані в проводках, видалити не можна.'))return;
  const msg=$('#plan_modal_error');try{await api('accounts/'+code,{method:'DELETE'});accounts=await api('accounts');await views.plan();if(typeof toast==='function')toast('Рахунок видалено','ok')}catch(e){msg.textContent=e.message}
}
// ---------- документи: каса, банк, склад ----------
const COST={'702':['902','281'],'701':['901','26'],'703':['903','23']};
const DOCS={
pko:{p:'ПКО',h:'Прибутковий касовий ордер (ПКО)',pk:'customer',c:['361','311','372','703','702','40','685'],post:v=>[['301',v.c,v.s]]},
vko:{p:'ВКО',h:'Видатковий касовий ордер (ВКО)',pk:'supplier',c:['631','661','372','311','641','685'],post:v=>[[v.c,'301',v.s]]},
bin:{p:'БВ-Н',h:'Банківська виписка: надходження на р/р',pk:'customer',c:['361','301','60','50','681','40','685'],post:v=>[['311',v.c,v.s]]},
bout:{p:'БВ-С',h:'Банківська виписка: списання з р/р',pk:'supplier',c:['631','661','641','651','60','301','685'],post:v=>[[v.c,'311',v.s]]},
rcpt:{p:'НТМЦ',h:'Надходження ТМЦ (сума без ПДВ)',pk:'supplier',wh:1,c:['281','201','203','207','209','22'],post:v=>[[v.c,'631',v.s],['644','631',R2(v.s*v.r)]]},
sale:{p:'РН',h:'Видаткова накладна (сума без ПДВ)',pk:'customer',wh:1,cost:1,c:['702','701','703'],post:v=>[['361',v.c,R2(v.s*(1+v.r))],[v.c,'641',R2(v.s*v.r)],...(v.cost>0?[[COST[v.c][0],COST[v.c][1],v.cost]]:[])]}};
Object.keys(DOCS).forEach(k=>views[k]=async()=>{
  const d=DOCS[k],E=await api('entries?company_id='+company.id),n=new Set(E.filter(e=>(e.doc||'').startsWith(d.p+'-')).map(e=>e.doc)).size+1;
  const ref=kind=>api(`refs?company_id=${company.id}&kind=${kind}`),op=a=>a.map(x=>`<option>${esc(x.name)}</option>`).join('');
  const P=await ref(d.pk),W=d.wh?await ref('wh'):[],I=d.wh?await ref('item'):[];
  $('#app').innerHTML=`<div class="card"><h3>${d.h}</h3><div class="row"><div><label>Дата</label><input id="d_d" type="date" value="${today}"></div><div><label>Номер</label><input id="d_n" value="${d.p}-${n}"></div><div><label>Контрагент</label><select id="d_p"><option value="">—</option>${op(P)}</select></div></div>
  ${d.wh?`<div class="row"><div><label>Склад</label><select id="d_w"><option value="">—</option>${op(W)}</select></div><div><label>Номенклатура</label><select id="d_i"><option value="">—</option>${op(I)}</select></div><div><label>Кількість</label><input id="d_q" type="number" oninput="dsum()"></div><div><label>Ціна без ПДВ</label><input id="d_pr" type="number" oninput="dsum()"></div></div>`:''}
  <div class="row"><div><label>Сума, грн</label><input id="d_s" type="number" step="0.01"></div><div><label>${d.wh?(k==='rcpt'?'Облік (дебет)':'Рахунок доходу'):'Кореспондуючий рахунок'}</label><select id="d_c">${d.c.map(a=>`<option value="${a}">${a} — ${esc(nameOf(a))}</option>`).join('')}</select></div>${d.cost?'<div><label>Собівартість списання, грн</label><input id="d_k" type="number" step="0.01"></div>':''}</div>
  <label>Підстава / зміст</label><input id="d_b"><p><button class="btn pri" onclick="docSave('${k}')">Провести</button> <span id="msg" class="err"></span></p>${S().vat?'':'<p class="mut">Підприємство не є платником ПДВ — ПДВ-проводки не формуються.</p>'}</div>`;
});
function dsum(){const q=Number($('#d_q').value),p=Number($('#d_pr').value);if(q>0&&p>0)$('#d_s').value=R2(q*p)}
async function docSave(k){
  const d=DOCS[k],g=i=>$('#'+i)?.value||'',s=Number(g('d_s')),r=S().vat?S().rate/100:0;
  if(!(s>0)||!g('d_d'))return $('#msg').textContent='Вкажіть дату та суму';
  const lines=d.post({c:g('d_c'),s,r,cost:Number(g('d_k'))||0}).filter(l=>l[2]>0).map(l=>({debit_acc:l[0],credit_acc:l[1],amount:l[2]}));
  const txt=d.h.replace(/ \(.*\)/,'')+' №'+g('d_n')+(g('d_i')?` · ${g('d_i')}${g('d_q')?' × '+g('d_q'):''}`:'')+(g('d_w')?' · склад: '+g('d_w'):'')+(g('d_b')?' · '+g('d_b'):'');
  try{await api('entries',{method:'POST',body:{company_id:company.id,date:g('d_d'),doc:g('d_n'),description:txt,partner:g('d_p'),lines}});go(k==='pko'||k==='vko'?'cashbook':'entries')}catch(e){$('#msg').textContent=e.message}
}
// ---------- журнал, сторно ----------
views.entries=async()=>{
  const e=(EL=await api('entries?company_id='+company.id)),T=!canDo('corrections','read'),st=new Set(e.filter(x=>x.storno_of).map(x=>x.storno_of));
  $('#app').innerHTML=`<div class="card sc"><h3>Журнал операцій</h3><table><thead><tr><th>Дата</th><th>Документ</th><th>Контрагент</th><th>Зміст</th><th>Дт</th><th>Кт</th><th class="n">Сума</th><th></th></tr></thead><tbody>${e.map(x=>`<tr${x.amount<0?' style="color:#d33"':''}><td>${x.date}</td><td>${esc(x.doc)}</td><td>${esc(x.partner)}</td><td>${esc(x.description)}${x.storno_of?' ↩ №'+x.storno_of:''}${st.has(x.id)?' ✕ сторновано':''}</td><td>${x.debit_acc}${x.debit_subconto?.filter(Boolean).length?`<div class="mut">${esc(x.debit_subconto.filter(Boolean).join(' · '))}</div>`:''}</td><td>${x.credit_acc}${x.credit_subconto?.filter(Boolean).length?`<div class="mut">${esc(x.credit_subconto.filter(Boolean).join(' · '))}</div>`:''}</td><td class="n">${fmt(x.amount)}</td><td>${T?'':jbtn(x,st)}</td></tr>`).join('')||'<tr><td colspan="8" class="mut">Операцій ще немає</td></tr>'}</tbody></table></div>`;
};
async function storno(id,fix){
  const date=prompt('Дата сторно (РРРР-ММ-ДД)',today);if(!date)return;
  try{await api(`entries/${id}/storno`,{method:'POST',body:{company_id:company.id,date}});go(fix?'add':'entries')}catch(e){alert(e.message)}
}
function legacyPrev(){
  const t=TPL[$('#tp').value],s=Number($('#amt').value)||0,r=S().vat?S().rate/100:0;
  const L=t[2].map(([d,k,f])=>[d,k,f===0.2||f==='vat'?r:f===1.2||f==='vatincl'?1+r:f]).filter(l=>l[2]>0);
  $('#pv').innerHTML=`<table><thead><tr><th>Дт</th><th>Кт</th><th class="n">Сума</th></tr></thead><tbody>${L.map(([d,k,f])=>`<tr data-d="${d}" data-k="${k}"><td>${d} <span class="mut">${esc(nameOf(d))}</span></td><td>${k} <span class="mut">${esc(nameOf(k))}</span></td><td class="n"><input class="la" type="number" step="0.01" value="${(s*f).toFixed(2)}" style="width:130px"></td></tr>`).join('')}</tbody></table>${!S().vat&&t[1].includes('ПДВ')?'<p class="mut">Підприємство не є платником ПДВ — ПДВ-проводки не формуються.</p>':''}`;
}
// ---------- звіти ----------
const DC=`<div class="row"><div><label>З</label><input id="f" type="date" value="${new Date().getFullYear()}-01-01"></div><div><label>По</label><input id="t" type="date" value="${new Date().getFullYear()}-12-31"></div>`;
views.chess=async()=>{
  $('#app').innerHTML=`<div class="card"><h3>Шахматка (шахова відомість)</h3>${DC}<div><label>Рівень</label><select id="lv"><option value="2">Синтетичні рахунки</option><option value="9">Субрахунки</option></select></div></div><p><button class="btn pri" onclick="chess()">Сформувати</button></p></div><div id="res"></div>`;
  chess();
};
async function chess(){
  const f=$('#f').value,t=$('#t').value,L=Number($('#lv').value);
  const E=(await api('entries?company_id='+company.id)).filter(e=>e.date>=f&&e.date<=t&&e.debit_acc!=='000'&&e.credit_acc!=='000');
  const m={},rs=new Set(),cs=new Set();
  E.forEach(e=>{const d=e.debit_acc.slice(0,L),k=e.credit_acc.slice(0,L);rs.add(d);cs.add(k);m[d]=m[d]||{};m[d][k]=(m[d][k]||0)+Number(e.amount)});
  const R=[...rs].sort(),C=[...cs].sort();
  $('#res').innerHTML=`<div class="card sc"><table><thead><tr><th>Дт \\ Кт</th>${C.map(c=>`<th class="n">${c}</th>`).join('')}<th class="n">Разом Дт</th></tr></thead><tbody>${R.map(r=>`<tr><td><b>${r}</b></td>${C.map(c=>`<td class="n">${m[r][c]?fmt(m[r][c]):''}</td>`).join('')}<td class="n"><b>${fmt(C.reduce((s,c)=>s+(m[r][c]||0),0))}</b></td></tr>`).join('')||'<tr><td class="mut">Немає проводок за період</td></tr>'}</tbody><tfoot><tr><td>Разом Кт</td>${C.map(c=>`<td class="n">${fmt(R.reduce((s,r)=>s+(m[r][c]||0),0))}</td>`).join('')}<td class="n">${fmt(E.reduce((s,e)=>s+Number(e.amount),0))}</td></tr></tfoot></table></div>`;
}
views.card=async()=>cardView('');
views.cashbook=async()=>cardView('301');
function cardView(a){
  $('#app').innerHTML=`<div class="card"><h3>${a?'Касова книга':'Картка рахунка'}</h3>${DC}<div><label>Рахунок</label><select id="ca">${accOpts()}</select></div></div><p><button class="btn pri" onclick="card()">Сформувати</button></p></div><div id="res"></div>`;
  if(a)$('#ca').value=a;card();
}
async function card(){
  const f=$('#f').value,t=$('#t').value,a=$('#ca').value,sd=v=>Math.abs(v)<0.005?'0,00':fmt(Math.abs(v))+(v>0?' Дт':' Кт');
  const E=(await api('entries?company_id='+company.id)).filter(e=>e.debit_acc.startsWith(a)||e.credit_acc.startsWith(a)).reverse();
  let bal=0,td=0,tk=0;
  E.filter(e=>e.date<f).forEach(e=>bal+=e.debit_acc.startsWith(a)?Number(e.amount):-Number(e.amount));
  const open=bal;
  const rows=E.filter(e=>e.date>=f&&e.date<=t).map(e=>{const d=e.debit_acc.startsWith(a),v=Number(e.amount);bal+=d?v:-v;if(d)td+=v;else tk+=v;
    return `<tr><td>${e.date}</td><td>${esc(e.doc)}</td><td>${esc(e.description)}</td><td>${d?e.credit_acc:e.debit_acc}</td><td class="n">${d?fmt(v):''}</td><td class="n">${d?'':fmt(v)}</td><td class="n">${sd(bal)}</td></tr>`}).join('');
  $('#res').innerHTML=`<div class="card sc"><table><thead><tr><th>Дата</th><th>Документ</th><th>Зміст</th><th>Кореспонд.</th><th class="n">Дебет</th><th class="n">Кредит</th><th class="n">Сальдо</th></tr></thead><tbody><tr style="font-weight:700"><td colspan="6">Сальдо на початок</td><td class="n">${sd(open)}</td></tr>${rows}</tbody><tfoot><tr><td colspan="4">Обороти за період / сальдо на кінець</td><td class="n">${fmt(td)}</td><td class="n">${fmt(tk)}</td><td class="n">${sd(bal)}</td></tr></tfoot></table></div>`;
}

async function assignAdmin(id){
 const login=prompt('Логін користувача, якому призначити підприємство:');if(!login)return;
 if(!confirm('Передати повне адміністрування підприємства цьому користувачу?'))return;
 try{await api('company-admin',{method:'POST',body:{company_id:id,login}});go('company')}catch(e){alert(e.message)}
}

async function deleteCompany(id,name){
 if(!confirm(`УВАГА! Безповоротно видалити підприємство «${name}» та всі його документи, проводки, довідники й залишки? Перед цим зробіть резервну копію Neon.`))return;
 const typed=prompt(`Для підтвердження введіть точну назву підприємства:\n${name}`);
 if(typed!==name){alert('Назва не збігається. Видалення скасовано.');return}
 try{await api('companies/'+id,{method:'DELETE'});
  if(company?.id===id){company=null;localStorage.removeItem('company');currentRights={manager:false,permissions:{}}}
  await go('company');
 }catch(e){alert(e.message)}
}

// Окремі ціни реалізації: історія за датами, тип ціни й номенклатура.
views.prices=async()=>{
 const [items,types,prices]=await Promise.all([
  api(`refs?company_id=${company.id}&kind=item`),api(`refs?company_id=${company.id}&kind=price_type`),
  api(`prices?company_id=${company.id}&history=1`)]);
 const mayEdit=canDo('refs','create')||canDo('refs','update');
 const opts=(arr)=>arr.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('');
 $('#app').innerHTML=`${mayEdit?`<div class="card"><h3>Встановлення / зміна ціни</h3>
  <p class="mut">Це ціна продажу, а не собівартість. Кожна зміна зберігається окремим записом із датою початку дії.</p>
  <div class="row"><div><label>Номенклатура</label><select id="ip_item">${opts(items)}</select></div>
  <div><label>Вид ціни</label><select id="ip_type">${opts(types)}</select></div>
  <div><label>Дата початку дії</label><input id="ip_date" type="date" value="${today}"></div>
  <div><label>Ціна без ПДВ, грн</label><input id="ip_value" type="number" min="0" step="0.01"></div></div>
  <p><button class="btn pri" onclick="setItemPrice()">Зберегти ціну</button> <span id="ip_msg" class="err"></span></p></div>`:''}
 <div class="card sc"><h3>Історія встановлених цін</h3><table class="mobile-card-table"><thead><tr><th>Номенклатура</th><th>Вид ціни</th><th>Діє з</th><th class="n">Ціна без ПДВ</th></tr></thead><tbody>
 ${prices.map(x=>`<tr><td class="record-title" data-label="Номенклатура">${esc(x.item_name)}</td><td data-label="Вид ціни">${esc(x.type_name)}</td><td data-label="Діє з">${x.effective_from}</td><td data-label="Ціна" class="n">${fmt(x.price)}</td></tr>`).join('')||'<tr><td colspan="4">Цін не встановлено</td></tr>'}</tbody></table></div>`;
};
async function setItemPrice(){
 const g=id=>$('#'+id)?.value;
 try{await api('prices',{method:'POST',body:{company_id:company.id,item_id:Number(g('ip_item')),price_type_id:Number(g('ip_type')),effective_from:g('ip_date'),price:g('ip_value')}});views.prices()}
 catch(e){$('#ip_msg').textContent=e.message}
}
