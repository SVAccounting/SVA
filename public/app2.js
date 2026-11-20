// Бічне меню (як у BAS), налаштування підприємства, довідники, документи, сторно, шахматка, картка рахунка
const today=new Date().toISOString().slice(0,10),R2=n=>Math.round(n*100)/100;
const prevDay=d=>{const x=new Date(d+'T00:00:00Z');x.setUTCDate(x.getUTCDate()-1);return x.toISOString().slice(0,10)};
const nameOf=a=>accounts.find(x=>x.code===a)?.name||'';
const MENU=[['Головне',[['company','🏢 Підприємства'],['set','⚙ Облікова політика й налаштування'],['open','Початкові залишки']]],
['Довідники',[['plan','План рахунків'],['r_staff','Персонал'],['r_customer','Покупці'],['r_supplier','Постачальники'],['r_bank','Банки'],['r_wh','Склади'],['r_item','Номенклатура']]],
['Каса',[['pko','ПКО — прибутковий ордер'],['vko','ВКО — видатковий ордер'],['cashbook','Касова книга']]],
['Банк',[['bin','Надходження на р/р'],['bout','Списання з р/р']]],
['Склад',[['rcpt','Надходження ТМЦ'],['sale','Реалізація (накладна)']]],
['Операції',[['entries','Журнал операцій'],['add','Нова операція'],['tpl','Типові операції']]],
['Звіти',[['osv','Оборотно-сальдова відомість'],['chess','Шахматка'],['card','Картка рахунка'],['rep','Форми №1, №2']]],
['Навчання',[['tasks','Завдання']]]];
const HIDE_T=['add','tpl','pko','vko','bin','bout','rcpt','sale','open'];
function nav(){
  if(!me)return;
  $('#nav').innerHTML=MENU.map(([s,it])=>`<div class="ms">${s}</div>`+it.filter(([k])=>me.role!=='teacher'||!HIDE_T.includes(k)).map(([k,v])=>`<a class="${k===tab?'on':''}" onclick="go('${k}')">${v}</a>`).join('')).join('');
  $('#co').textContent=me.name+(me.role==='teacher'?' (адмін)':'')+(company?' · 🏢 '+company.name:'');
}
const NOCO=['company','plan','tasks'];
async function go(t){
  if(!NOCO.includes(t)&&!company){alert('Спочатку оберіть або створіть підприємство');t='company'}
  tab=t;nav();$('#app').innerHTML='<div class="card mut">Завантаження…</div>';
  try{await views[t]()}catch(e){$('#app').innerHTML=`<div class="card err">${esc(e.message)}</div>`}
}
// ---------- підприємство, облікова політика ----------
const DEF={vat:true,rate:20,tax:'general',inv:'fifo',dep:'line',mnma:20000};
const S=()=>({...DEF,...(company?.settings||{})});
const OPT=(a,v)=>a.map(([k,l])=>`<option value="${k}"${k===v?' selected':''}>${l}</option>`).join('');
const TAXES=[['general','Загальна система (податок на прибуток)'],['s1','Єдиний податок, 1 група'],['s2','Єдиний податок, 2 група'],['s3','Єдиний податок, 3 група'],['s4','Єдиний податок, 4 група']];
const INV=[['fifo','ФІФО'],['avg','Середньозважена собівартість'],['spec','Ідентифікована собівартість']];
const DEP=[['line','Прямолінійний'],['dec','Зменшення залишкової вартості'],['prod','Виробничий']];
const setForm=(s,name)=>`<div class="row"><div><label>Назва підприємства</label><input id="s_name" value="${esc(name)}"></div><div><label>ЄДРПОУ / ІПН</label><input id="s_code" value="${esc(s.code)}"></div><div><label>Початок ведення обліку</label><input id="s_start" type="date" value="${s.start||new Date().getFullYear()+'-01-01'}"></div></div>
<div class="row"><div><label>Система оподаткування</label><select id="s_tax">${OPT(TAXES,s.tax)}</select></div><div><label>Платник ПДВ</label><select id="s_vat">${OPT([['1','Так'],['0','Ні']],s.vat?'1':'0')}</select></div><div><label>Ставка ПДВ, %</label><input id="s_rate" type="number" value="${s.rate}"></div></div>
<div class="row"><div><label>Облікова політика: оцінка запасів при вибутті</label><select id="s_inv">${OPT(INV,s.inv)}</select></div><div><label>Метод амортизації ОЗ</label><select id="s_dep">${OPT(DEP,s.dep)}</select></div><div><label>Вартісна межа МНМА, грн</label><input id="s_mnma" type="number" value="${s.mnma}"></div></div>`;
const readSet=()=>({code:$('#s_code').value,start:$('#s_start').value,tax:$('#s_tax').value,vat:$('#s_vat').value==='1',rate:Number($('#s_rate').value)||0,inv:$('#s_inv').value,dep:$('#s_dep').value,mnma:Number($('#s_mnma').value)||0});
views.company=async()=>{
  const L=await api('companies'),T=me.role==='teacher';
  $('#app').innerHTML=(T?'':`<div class="card"><h3>Нове підприємство</h3>${setForm(DEF,'')}<p><button class="btn pri" onclick="createCo()">Створити й ввести залишки</button> <span id="msg" class="err"></span></p></div>`)+
  `<div class="card sc"><h3>Підприємства</h3><table><tbody>${L.map(c=>`<tr><td>${esc(c.name)}${c.owner?` <span class="mut">— ${esc(c.owner)}</span>`:''}</td><td class="mut">${(TAXES.find(x=>x[0]===(c.settings?.tax||'general'))||[])[1]||''}; ПДВ: ${c.settings?.vat===false?'ні':'так'}</td><td><button class="btn ${company?.id===c.id?'pri':''}" onclick="pick(${c.id})">${company?.id===c.id?'Обрано':'Обрати'}</button></td></tr>`).join('')}</tbody></table></div>`;
};
const saveCo=c=>{company=c;localStorage.setItem('company',JSON.stringify(c))};
async function pick(id){saveCo((await api('companies')).find(c=>c.id===id));go('entries')}
async function createCo(){try{saveCo(await api('companies',{method:'POST',body:{name:$('#s_name').value,settings:readSet()}}));go('open')}catch(e){$('#msg').textContent=e.message}}
views.set=async()=>{
  const ro=me.role==='teacher';
  $('#app').innerHTML=`<div class="card"><h3>Налаштування та облікова політика</h3>${setForm(S(),company.name)}${ro?'':'<p><button class="btn pri" onclick="saveSet()">Зберегти</button> <span id="msg"></span></p>'}</div>`;
  if(ro)document.querySelectorAll('#app input,#app select').forEach(e=>e.disabled=true);
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
const REF={staff:['Персонал',[['name','ПІБ'],['pos','Посада'],['salary','Оклад, грн'],['ipn','ІПН']]],customer:['Покупці',[['name','Назва'],['code','ЄДРПОУ / ІПН'],['phone','Телефон']]],supplier:['Постачальники',[['name','Назва'],['code','ЄДРПОУ / ІПН'],['phone','Телефон']]],bank:['Банки',[['name','Банк'],['mfo','МФО'],['iban','Рахунок (IBAN)']]],wh:['Склади',[['name','Назва складу'],['mvo','Матеріально відповідальна особа']]],item:['Номенклатура',[['name','Назва'],['unit','Од. виміру'],['price','Ціна, грн']]]};
let RL=[],RK='',RE=null;
Object.keys(REF).forEach(k=>views['r_'+k]=async()=>{RK=k;RE=null;RL=await api(`refs?company_id=${company.id}&kind=${k}`);drawRef()});
function drawRef(){
  const [t,F]=REF[RK],ro=me.role==='teacher',e=RE?RL.find(x=>x.id===RE):null;
  $('#app').innerHTML=(ro?'':`<div class="card"><h3>${t}: ${e?'редагування':'новий запис'}</h3><div class="row">${F.map(([f,l])=>`<div><label>${l}</label><input id="rf_${f}" value="${esc(f==='name'?e?.name:e?.data?.[f])}"></div>`).join('')}</div><p><button class="btn pri" onclick="saveRef()">Зберегти</button> ${e?'<button class="btn" onclick="RE=null;drawRef()">Скасувати</button>':''} <span id="msg" class="err"></span></p></div>`)+
  `<div class="card sc"><h3>${t}</h3><table><thead><tr>${F.map(([,l])=>`<th>${l}</th>`).join('')}<th></th></tr></thead><tbody>${RL.map(x=>`<tr>${F.map(([f])=>`<td>${esc(f==='name'?x.name:x.data[f])}</td>`).join('')}<td>${ro?'':`<button class="btn" onclick="RE=${x.id};drawRef()">✎</button> <button class="btn" onclick="delRef(${x.id})">✕</button>`}</td></tr>`).join('')||'<tr><td class="mut">Записів немає</td></tr>'}</tbody></table></div>`;
}
async function saveRef(){const data={};REF[RK][1].forEach(([f])=>{if(f!=='name')data[f]=$('#rf_'+f).value});try{await api('refs',{method:'POST',body:{company_id:company.id,kind:RK,id:RE,name:$('#rf_name').value,data}});views['r_'+RK]()}catch(e){$('#msg').textContent=e.message}}
async function delRef(id){if(confirm('Видалити запис?')){await api(`refs/${id}?company_id=${company.id}`,{method:'DELETE'});views['r_'+RK]()}}
// ---------- план рахунків (редагує викладач) ----------
views.plan=async()=>{
  const T=me.role==='teacher',KN={A:'Активний',P:'Пасивний',AP:'Активно-пасивний',O:'Позабалансовий'};
  $('#app').innerHTML=(T?`<div class="card"><h3>Додати або змінити рахунок (діє для всіх)</h3><div class="row"><div><label>Код</label><input id="pc"></div><div><label>Назва</label><input id="pn"></div><div><label>Тип</label><select id="pk">${OPT(Object.entries(KN),'A')}</select></div></div><p><button class="btn pri" onclick="saveAcc()">Зберегти</button> <span id="msg" class="err"></span></p></div>`:'')+
  `<div class="card sc"><h3>План рахунків</h3><table><thead><tr><th>Код</th><th>Назва</th><th>Тип</th><th></th></tr></thead><tbody>${accounts.map(a=>`<tr><td>${a.code}</td><td>${esc(a.name)}</td><td>${KN[a.kind]}</td><td>${T?`<button class="btn" onclick="editAcc('${a.code}')">✎</button> <button class="btn" onclick="delAcc('${a.code}')">✕</button>`:''}</td></tr>`).join('')}</tbody></table></div>`;
};
function editAcc(c){const a=accounts.find(x=>x.code===c);$('#pc').value=a.code;$('#pn').value=a.name;$('#pk').value=a.kind;scrollTo(0,0)}
async function saveAcc(){try{await api('accounts',{method:'POST',body:{code:$('#pc').value.trim(),name:$('#pn').value,kind:$('#pk').value}});accounts=await api('accounts');views.plan()}catch(e){$('#msg').textContent=e.message}}
async function delAcc(c){if(confirm('Видалити рахунок '+c+'?'))try{await api('accounts/'+c,{method:'DELETE'});accounts=await api('accounts');views.plan()}catch(e){alert(e.message)}}
// ---------- документи: каса, банк, склад ----------
const COST={'702':['902','281'],'701':['901','26'],'703':['903','231']};
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
  const e=(EL=await api('entries?company_id='+company.id)),T=me.role==='teacher',st=new Set(e.filter(x=>x.storno_of).map(x=>x.storno_of));
  $('#app').innerHTML=`<div class="card sc"><h3>Журнал операцій</h3><table><thead><tr><th>Дата</th><th>Документ</th><th>Контрагент</th><th>Зміст</th><th>Дт</th><th>Кт</th><th class="n">Сума</th><th></th></tr></thead><tbody>${e.map(x=>`<tr${x.amount<0?' style="color:#d33"':''}><td>${x.date}</td><td>${esc(x.doc)}</td><td>${esc(x.partner)}</td><td>${esc(x.description)}${x.storno_of?' ↩ №'+x.storno_of:''}${st.has(x.id)?' ✕ сторновано':''}</td><td>${x.debit_acc}</td><td>${x.credit_acc}</td><td class="n">${fmt(x.amount)}</td><td>${T?'':jbtn(x,st)}</td></tr>`).join('')||'<tr><td colspan="8" class="mut">Операцій ще немає</td></tr>'}</tbody></table></div>`;
};
async function storno(id,fix){
  const date=prompt('Дата сторно (РРРР-ММ-ДД)',today);if(!date)return;
  try{await api(`entries/${id}/storno`,{method:'POST',body:{company_id:company.id,date}});go(fix?'add':'entries')}catch(e){alert(e.message)}
}
function prev(){
  const t=TPL[$('#tp').value],s=Number($('#amt').value)||0,r=S().vat?S().rate/100:0;
  const L=t[2].map(([d,k,f])=>[d,k,f===0.2?r:f===1.2?1+r:f]).filter(l=>l[2]>0);
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
