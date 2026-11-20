// Модуль виправлення помилок: меню «Дії», сторно, додатковий запис, виправлення документа, журнал коригувань, періоди, аудит, тренажер
let EL=[],CK=null,CKIND='',CDATA={},CGET=null;
document.head.insertAdjacentHTML('beforeend',`<style>.dd{position:relative;display:inline-block}.dd summary{list-style:none;cursor:pointer}.dd[open] .menu{display:block}.dd .menu{display:none;position:absolute;right:0;z-index:5;background:var(--card);border:1px solid var(--bd);border-radius:8px;min-width:200px;box-shadow:0 4px 14px #0003}.dd .menu a{display:block;padding:8px 12px;cursor:pointer}.dd .menu a:hover{background:var(--bg)}
#mdl{position:fixed;inset:0;background:#0007;display:none;z-index:98;align-items:center;justify-content:center}#mdl .box{background:var(--card);color:var(--tx);border-radius:12px;padding:18px;max-width:660px;width:94%;max-height:90vh;overflow:auto}
.tag{font-size:12px;padding:2px 8px;border-radius:10px;border:1px solid;white-space:nowrap}.t-red{color:#d33}.t-grn{color:#2a9d4a}.t-blu{color:#1f6feb}</style>`);
const MN={fix:'Виправлення документа',storno:'Червоне сторно',add:'Додатковий запис'},MC={fix:'t-blu',storno:'t-red',add:'t-grn'};
const mtag=m=>`<span class="tag ${MC[m]}">${MN[m]}</span>`;
const mdl=h=>{let m=$('#mdl');if(!m){document.body.insertAdjacentHTML('beforeend','<div id="mdl"><div class="box"></div></div>');m=$('#mdl')}m.querySelector('.box').innerHTML=h;m.style.display='flex'};
const mclose=()=>{$('#mdl').style.display='none'};
const effOf=x=>R2(Number(x.amount)+EL.filter(y=>y.storno_of===x.id||y.add_of===x.id).reduce((s,y)=>s+Number(y.amount),0));
const ln=(d,k,a,c)=>`<div class="${c||''}">Дт ${d} ${esc(nameOf(d))} — Кт ${k} ${esc(nameOf(k))}: <b>${fmt(a)}</b></div>`;
// меню і розділи
const ti=MENU.findIndex(m=>m[0]==='Навчання');if(ti>=0)MENU.splice(ti,1);delete views.tasks;
MENU.splice(MENU.findIndex(m=>m[0]==='Звіти'),0,['Виправлення',[['corr','Журнал коригувань'],['period','Облікові періоди'],['audit','Журнал аудиту'],['trainer','Навчальний режим']]]);
// контекстне меню «Дії»
const actionsMenu=(x)=>{
  const T=me.role==='superadmin',it=[`<a onclick="viewEntry(${x.id})">Переглянути</a>`];
  if(!T&&Number(x.amount)>0&&!x.storno_of&&!x.add_of){
    if(x.doc_id)it.push(`<a onclick="fixDoc(${x.doc_id})">Виправити документ</a>`);
    it.push(`<a onclick="stornoDlg(${x.id})">Сторнувати</a>`,`<a onclick="addDlg(${x.id})">Створити додатковий запис</a>`);
  }
  it.push(`<a onclick="history_('${x.doc_id?'doc':'entry'}',${x.doc_id||x.id})">Історія змін</a>`);
  return `<details class="dd"><summary class="btn">Дії ▾</summary><div class="menu">${it.join('')}</div></details>`;
};
function viewEntry(id){
  const x=EL.find(e=>e.id===id),L=EL.filter(y=>y.storno_of===id||y.add_of===id);
  mdl(`<h3>Операція №${x.id}</h3><p>${x.date} · ${esc(x.doc)} · ${esc(x.description)}</p>${ln(x.debit_acc,x.credit_acc,x.amount)}<p>Діюча сума: <b>${fmt(effOf(x))}</b></p>${L.map(y=>`<p>${y.storno_of?mtag('storno'):mtag('add')} ${y.date} ${esc(y.doc)}: ${fmt(y.amount)}</p>`).join('')}<p><button class="btn" onclick="mclose()">Закрити</button></p>`);
}
// спільні поля діалогів
const cf=src=>`<div class="row"><div><label>Дата коригування</label><input id="c_d" type="date" value="${today}" oninput="cNat('${src}')"></div></div><div id="c_nat"></div><label>Причина виправлення *</label><input id="c_r"><p id="c_m" class="err"></p><p><button class="btn pri" id="c_ok" onclick="cSubmit()">Підтвердити</button> <button class="btn" onclick="mclose()">Скасувати</button></p>`;
function cNat(src){$('#c_nat').innerHTML=$('#c_d').value.slice(0,4)>src.slice(0,4)?`<label>Помилка минулого звітного року — її характер (НП(С)БО 6)</label><select id="c_n"><option value="">— оберіть —</option><option value="material">Суттєва</option><option value="immaterial">Несуттєва</option></select><p class="mut">Система не формує проводку на нерозподілений прибуток автоматично: за потреби створіть її окремою операцією після визначення характеру помилки.</p>`:''}
async function cSubmit(){
  const b=$('#c_ok');b.disabled=true;$('#c_m').textContent='';
  try{await api('corrections/'+CKIND,{method:'POST',body:{company_id:company.id,request_key:CK,date:$('#c_d').value,reason:$('#c_r').value,nature:$('#c_n')?.value||'',...CDATA,...(CGET?CGET():{})}});mclose();go(tab==='corr'||tab==='docs'?tab:'entries')}
  catch(e){$('#c_m').textContent=e.message;b.disabled=false}
}
function stornoDlg(id){
  const x=EL.find(e=>e.id===id),doc=!!x.doc_id,eff=effOf(x),rows=doc?EL.filter(e=>e.doc_id===x.doc_id&&Number(e.amount)>0&&!e.storno_of):[x];
  CK=crypto.randomUUID();CKIND='storno';CDATA=doc?{doc_id:x.doc_id}:{entry_id:id};CGET=()=>doc?{}:{amount:$('#c_a').value};
  mdl(`<h3>${mtag('storno')} ${doc?'документа':'операції'}</h3><p class="mut">Анулює помилкову операцію записами з від’ємною сумою тієї ж кореспонденції. Початковий запис не видаляється.</p><h4>Початкові проводки</h4>${rows.map(r=>ln(r.debit_acc,r.credit_acc,r.amount)).join('')}
  ${doc?`<h4>Сторнувальні проводки</h4>${rows.map(r=>ln(r.debit_acc,r.credit_acc,-r.amount,'t-red')).join('')}<p class="mut">Документ сторнується повністю разом зі складськими рухами.</p>`:`<label>Сума сторнування (доступно ${fmt(eff)})</label><input id="c_a" type="number" step="0.01" value="${eff}" oninput="stPrev(${id})"><h4>Сторнувальні проводки</h4><div id="c_p"></div>`}${cf(x.date)}`);
  if(!doc)stPrev(id);cNat(x.date);
}
const stPrev=id=>{const x=EL.find(e=>e.id===id);$('#c_p').innerHTML=ln(x.debit_acc,x.credit_acc,-(Number($('#c_a').value)||0),'t-red')};
function addDlg(id){
  const x=EL.find(e=>e.id===id),eff=effOf(x);CK=crypto.randomUUID();CKIND='add';CDATA={entry_id:id};CGET=()=>({newTotal:$('#c_t').value,increase:$('#c_i').value});
  mdl(`<h3>${mtag('add')}</h3><p class="mut">Для виправлення заниженої суми за правильної кореспонденції.</p><h4>Початкова проводка</h4>${ln(x.debit_acc,x.credit_acc,x.amount)}<p>Діюча сума: <b>${fmt(eff)}</b></p>
  <div class="row"><div><label>Правильна загальна сума</label><input id="c_t" type="number" step="0.01" oninput="adPrev(${id},'t')"></div><div><label>або сума збільшення</label><input id="c_i" type="number" step="0.01" oninput="adPrev(${id},'i')"></div></div><h4>Додаткова проводка</h4><div id="c_p"></div><p id="c_w" class="err"></p>${cf(x.date)}`);cNat(x.date);
}
function adPrev(id,w){
  const x=EL.find(e=>e.id===id),eff=effOf(x);if(w==='t')$('#c_i').value='';else $('#c_t').value='';
  const t=$('#c_t').value,d=w==='t'?R2(Number(t)-eff):R2(Number($('#c_i').value)||0);
  $('#c_w').textContent=t&&Number(t)<eff?'Правильна сума менша за відображену — скористайтеся червоним сторно (дія «Сторнувати»).':'';
  $('#c_p').innerHTML=d>0?ln(x.debit_acc,x.credit_acc,d,'t-grn')+`<p>Результат: <b>${fmt(eff+d)}</b></p>`:'';
}
async function fixDoc(id){
  const d=await api('docs/'+id),X=d.data,cash=!X.lines?.length,rf=k=>api(`refs?company_id=${company.id}&kind=${k}`),P=[...await rf('customer'),...await rf('supplier')];
  CK=crypto.randomUUID();CKIND='fix';CDATA={doc_id:id,expected_version:d.version};
  CGET=()=>({changes:{date:$('#f_d').value,partner:$('#f_p').value,corr:$('#f_c').value,basis:$('#f_b').value,...(cash?{sum:$('#f_s').value}:{lines:[...document.querySelectorAll('#f_l .row')].map((r,i)=>({...X.lines[i],qty:r.querySelector('.fq').value,price:r.querySelector('.fp').value}))})}});
  mdl(`<h3>${mtag('fix')}</h3><p class="mut">Документ буде перепроведено. Попередню версію й проводки збережено в історії.</p><p><b>${esc(DT[d.type]?.h||d.type)} № ${esc(d.number)}</b> (версія ${d.version})</p>
  <div class="row"><div><label>Дата</label><input id="f_d" type="date" value="${d.date}"></div><div><label>Контрагент</label><input id="f_p" list="f_dl" value="${esc(d.partner)}"><datalist id="f_dl">${P.map(x=>`<option value="${esc(x.name)}">`).join('')}</datalist></div><div><label>Рахунок (кореспонденція)</label><select id="f_c"><option value="">— без змін —</option>${accOpts()}</select></div></div>
  ${cash?`<label>Сума</label><input id="f_s" type="number" step="0.01" value="${X.total}">`:`<div id="f_l">${X.lines.map(l=>`<div class="row" style="grid-template-columns:3fr 100px 110px;margin-bottom:6px"><input value="${esc(l.name)}" disabled><input class="fq" type="number" step="0.001" value="${l.qty}"><input class="fp" type="number" step="0.01" value="${l.price}"></div>`).join('')}</div>`}
  <label>Підстава</label><input id="f_b" value="${esc(X.basis)}"><p><button class="btn" onclick="fixPrev()">Попередній перегляд змін</button></p><div id="f_pv"></div>${cf(d.date)}`);cNat(d.date);
}
async function fixPrev(){
  try{const r=await api('corrections/fix',{method:'POST',body:{company_id:company.id,preview:true,date:today,...CDATA,...CGET()}});
  $('#f_pv').innerHTML=`<h4>Було</h4>${r.old.map(e=>ln(e.debit_acc,e.credit_acc,e.amount,'mut')).join('')}<h4>Стане</h4>${r.new.map(e=>ln(e.debit_acc,e.credit_acc,e.amount,'t-blu')).join('')}`}
  catch(e){$('#f_pv').innerHTML=`<p class="err">${esc(e.message)}</p>`}
}
async function history_(t,id){
  const r=await api(`history?company_id=${company.id}&${t}_id=${id}`);
  mdl(`<h3>Історія змін</h3><h4>Коригування</h4>${r.corr.map(k=>`<p>${mtag(k.method)} ${k.number} · ${k.cdate} · ${esc(k.user_name)}<br>${fmt(k.orig_amount)} → ${fmt(k.result_amount)} (${Number(k.delta)>0?'+':''}${fmt(k.delta)})<br><span class="mut">${esc(k.reason)}</span></p>`).join('')||'<p class="mut">Коригувань немає</p>'}
  <h4>Версії документа</h4>${r.vers.map(v=>`<p>Версія ${v.version} (${v.at}, ${esc(v.user_name)}): ${v.snapshot.entries.map(e=>`Дт ${e.debit_acc} Кт ${e.credit_acc} ${fmt(e.amount)}`).join('; ')}<br><span class="mut">${esc(v.reason)}</span></p>`).join('')||'<p class="mut">—</p>'}
  <h4>Журнал аудиту</h4>${r.audit.map(a=>`<p class="mut">${a.at} · ${esc(a.user_name)} · ${esc(a.action)}${a.reason?' · '+esc(a.reason):''}</p>`).join('')||'<p class="mut">—</p>'}<p><button class="btn" onclick="mclose()">Закрити</button></p>`);
}
// журнал коригувань
views.corr=async()=>{
  $('#app').innerHTML=`<div class="card"><h3>Журнал коригувань</h3><div class="row"><div><label>З</label><input id="kf" type="date"></div><div><label>По</label><input id="kt" type="date"></div><div><label>Метод</label><select id="km"><option value="">Усі</option>${Object.entries(MN).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></div><div><label>Користувач</label><input id="ku"></div><div><label>Пошук (документ, причина)</label><input id="kq"></div></div><p><button class="btn pri" onclick="corrList()">Знайти</button></p></div><div id="res"></div>`;corrList();
};
async function corrList(){
  const L=await api('corrections?'+new URLSearchParams({company_id:company.id,from:$('#kf').value,to:$('#kt').value,method:$('#km').value,user:$('#ku').value,q:$('#kq').value}));
  $('#res').innerHTML=`<div class="card sc"><table><thead><tr><th>Дата</th><th>№ коригування</th><th>Початковий документ</th><th>Метод</th><th class="n">Початкова сума</th><th class="n">Коригування</th><th class="n">Результат</th><th>Причина</th><th>Користувач</th><th>Статус</th><th></th></tr></thead><tbody>${L.map(k=>`<tr><td>${k.cdate}</td><td>${esc(k.number)}</td><td>${esc(k.source)}</td><td>${mtag(k.method)}</td><td class="n">${fmt(k.orig_amount)}</td><td class="n ${Number(k.delta)<0?'t-red':'t-grn'}">${Number(k.delta)>0?'+':''}${fmt(k.delta)}</td><td class="n">${fmt(k.result_amount)}</td><td>${esc(k.reason)}</td><td>${esc(k.user_name)}</td><td>${esc(k.status)}</td><td><button class="btn" onclick="history_('${k.source_doc_id?'doc':'entry'}',${k.source_doc_id||k.source_entry_id})">Історія</button></td></tr>`).join('')||'<tr><td colspan="11" class="mut">Коригувань немає</td></tr>'}</tbody></table></div>`;
}
views.period=async()=>{
  const c=(await api('companies')).find(x=>x.id===company.id),T=me.role==='superadmin';
  $('#app').innerHTML=`<div class="card"><h3>Облікові періоди</h3><p>Статус: <span class="tag">${c.closed_until?'Закрито до '+c.closed_until+' включно':'Усі періоди відкриті'}</span></p>${T?'':`<div class="row"><div><label>Закрити періоди по дату (включно)</label><input id="pd" type="date" value="${c.closed_until||''}"></div></div><p><button class="btn pri" onclick="setPeriod(true)">Закрити</button> <button class="btn" onclick="setPeriod(false)">Відкрити всі періоди</button> <span id="msg" class="err"></span></p>`}<p class="mut">У закритому періоді заборонено вводити, редагувати й перепроводити документи. Виправлення оформлюють поточною датою (сторно, додатковий запис) з посиланням на початковий документ. Помилки минулих років — за НП(С)БО 6: система просить визначити їх характер, але не формує автоматично проводку на нерозподілений прибуток.</p></div>`;
};
async function setPeriod(close){try{const v=close?$('#pd').value:null;await api('periods',{method:'POST',body:{company_id:company.id,closed_until:v}});saveCo({...company,closed_until:v});views.period()}catch(e){$('#msg').textContent=e.message}}
views.audit=async()=>{
  const L=await api('audit?company_id='+company.id);
  $('#app').innerHTML=`<div class="card sc"><h3>Журнал аудиту (лише перегляд)</h3><table><thead><tr><th>Час</th><th>Користувач</th><th>Дія</th><th>Об’єкт</th><th>Було</th><th>Стало</th><th>Причина</th></tr></thead><tbody>${L.map(a=>`<tr><td>${a.at}</td><td>${esc(a.user_name)}</td><td>${esc(a.action)}</td><td>${esc(a.object_type)} №${esc(a.object_id)}</td><td class="mut">${esc(JSON.stringify(a.old_data)?.slice(0,120))}</td><td class="mut">${esc(JSON.stringify(a.new_data)?.slice(0,120))}</td><td>${esc(a.reason)}</td></tr>`).join('')||'<tr><td colspan="7" class="mut">Записів немає</td></tr>'}</tbody></table></div>`;
};
// навчальний режим (без запису в базу)
const CASES=[
{t:'Придбані матеріали на 10 000 грн помилково проведено як товари: Дт 281 Кт 631 — 10 000.',o:['281','631',10000],m:'storno',a:[['281','631',-10000],['201','631',10000]],w:'Кореспонденція хибна повністю: червоне сторно анулює її, потім вводять правильну проводку Дт 201 Кт 631.'},
{t:'Зарплату адміністрації нараховано 7 000 грн замість 9 000: Дт 92 Кт 661 — 7 000.',o:['92','661',7000],m:'add',a:[['92','661',2000]],w:'Кореспонденція правильна, сума занижена — додатковий запис на різницю 2 000.'},
{t:'Зарплату нараховано 12 000 грн замість 9 000: Дт 92 Кт 661 — 12 000.',o:['92','661',12000],m:'storno',a:[['92','661',-3000]],w:'Сума завищена, кореспонденція правильна — часткове червоне сторно на суму завищення 3 000.'},
{t:'Витрати на рекламу 5 000 грн проведено, але послугу не надавали: Дт 93 Кт 631 — 5 000.',o:['93','631',5000],m:'storno',a:[['93','631',-5000]],w:'Операції не було — повне червоне сторно.'},
{t:'ЄСВ 2 200 грн адміністрації віднесено на загальновиробничі: Дт 91 Кт 651 — 2 200.',o:['91','651',2200],m:'storno',a:[['91','651',-2200],['92','651',2200]],w:'Хибний рахунок витрат: сторно помилкової проводки і нова проводка на Дт 92.'}];
views.trainer=async()=>{
  $('#app').innerHTML=`<div class="card"><h3>Навчальний режим: виправлення помилок</h3><p class="mut">Тренування на тестових даних — записи в облік не вносяться.</p><label>Ситуація</label><select id="tc" onchange="trShow()">${CASES.map((c,i)=>`<option value="${i}">Ситуація ${i+1}</option>`).join('')}</select><div id="tt"></div><label>Метод виправлення</label><select id="tm"><option value="storno">Червоне сторно</option><option value="add">Додатковий запис</option><option value="fix">Виправлення документа</option></select><label>Ваші коригувальні проводки (суми сторно — від’ємні)</label><div id="ln">${lineRows(3)}</div><p><button class="btn pri" onclick="trCheck()">Перевірити</button></p><div id="tr"></div></div>`;trShow();
};
const trShow=()=>{const c=CASES[$('#tc').value];$('#tt').innerHTML=`<p><b>${esc(c.t)}</b></p>`;$('#tr').innerHTML=''};
function trCheck(){
  const c=CASES[$('#tc').value],got=readLines($('#ln')).map(l=>`${l.debit_acc}|${l.credit_acc}|${Number(l.amount).toFixed(2)}`).sort(),exp=c.a.map(l=>`${l[0]}|${l[1]}|${l[2].toFixed(2)}`).sort(),ok=JSON.stringify(got)===JSON.stringify(exp),mok=$('#tm').value===c.m;
  const T={};[c.o,...readLines($('#ln')).map(l=>[l.debit_acc,l.credit_acc,Number(l.amount)])].forEach(([d,k,a])=>{(T[d]??=[0,0])[0]+=a;(T[k]??=[0,0])[1]+=a});
  $('#tr').innerHTML=`<p class="${ok&&mok?'t-grn':'err'}"><b>${ok&&mok?'✅ Правильно.':'❌ Є помилки.'}</b> ${mok?'':'Метод обрано невірно. '}${ok?'':'Проводки не збігаються з очікуваними. '}</p><p>${esc(c.w)}</p><p class="mut">Правильна відповідь: ${c.a.map(l=>`Дт ${l[0]} Кт ${l[1]} ${fmt(l[2])}`).join('; ')}</p><h4>Вплив на рахунки (з урахуванням початкової проводки)</h4><table><thead><tr><th>Рахунок</th><th class="n">Оборот Дт</th><th class="n">Оборот Кт</th></tr></thead><tbody>${Object.entries(T).map(([k,v])=>`<tr><td>${k} ${esc(nameOf(k))}</td><td class="n">${fmt(v[0])}</td><td class="n">${fmt(v[1])}</td></tr>`).join('')}</tbody></table>`;
}
