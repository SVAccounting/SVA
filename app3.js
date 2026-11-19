// Документи (накладні, рахунки, акти, каса, банк), складський облік, друк бланків
document.head.insertAdjacentHTML('beforeend',`<style>
#prn{display:none;position:fixed;inset:0;background:#fff;color:#000;overflow:auto;z-index:99;padding:20px}
.pdoc{max-width:800px;margin:0 auto;font:14px/1.5 'Times New Roman',serif;color:#000}
.pdoc .pt{border-collapse:collapse;width:100%}.pdoc .pt td,.pdoc .pt th{border:1px solid #000;padding:4px 6px;color:#000}
@media print{aside,header,.noprint{display:none!important}.lay{display:block}body.printing>*:not(#prn){display:none!important}body.printing #prn{position:static;padding:0}}
</style>`);
const fq=n=>Number(n).toLocaleString('uk-UA',{maximumFractionDigits:3}),dfmt=d=>d.slice(8,10)+'.'+d.slice(5,7)+'.'+d.slice(0,4);
let ITEMS=[];
const CASHC={pko:['361','311','372','703','702','40','685'],vko:['631','661','372','311','641','685'],bin:['361','301','60','50','681','40','685'],bout:['631','661','641','651','60','301','685']};
const DT={
pko:{h:'Прибутковий касовий ордер (ПКО)',p:'ПКО',cash:1,pk:'customer'},vko:{h:'Видатковий касовий ордер (ВКО)',p:'ВКО',cash:1,pk:'supplier'},
bin:{h:'Банківська виписка: надходження на р/р',p:'БВ-Н',cash:1,pk:'customer'},bout:{h:'Банківська виписка: списання з р/р',p:'БВ-С',cash:1,pk:'supplier'},
rcpt:{h:'Прибуткова накладна (надходження ТМЦ)',p:'ПН',lines:1,pk:'supplier',wh:1,c:['281','201','203','207','209','22'],cl:'Рахунок обліку (дебет)'},
ost:{h:'Початкові залишки ТМЦ (кількісні, без проводок)',p:'ОЗТ',lines:1,wh:1},
sale:{h:'Видаткова накладна',p:'ВН',lines:1,pk:'customer',wh:1,c:['702','701'],cl:'Рахунок доходу'},
wo:{h:'Акт списання ТМЦ',p:'АС',lines:1,wh:1,c:['947','91','92','93','949'],cl:'Рахунок витрат (дебет)',st:1},
mv:{h:'Переміщення між складами',p:'ПМ',lines:1,wh:1,wh2:1},
inv:{h:'Рахунок-фактура (рахунок на оплату)',p:'РФ',lines:1,pk:'customer'},
act:{h:'Акт виконаних робіт (наданих послуг)',p:'АВР',lines:1,pk:'customer'}};
MENU[4][1].splice(0,2,['stock','Залишки ТМЦ'],['scard','Картка складського обліку'],['rcpt','Прибуткова накладна'],['sale','Видаткова накладна'],['wo','Акт списання'],['mv','Переміщення'],['ost','Початкові залишки ТМЦ']);
MENU[3][1].push(['bank','Виписка з банку']);
MENU.splice(5,0,['Документи',[['inv','Рахунок-фактура'],['act','Акт виконаних робіт'],['docs','Журнал документів і друк']]]);
HIDE_T.push('wo','mv','ost','inv','act');
const jbtn=(x,st)=>x.doc_id?`<button class="btn" onclick="stornoDoc(${x.doc_id})">Сторно документа</button>`:(x.storno_of||st.has(x.id)?'':`<button class="btn" onclick="storno(${x.id},0)">Сторно</button> <button class="btn" onclick="storno(${x.id},1)">Виправити</button> `)+`<button class="btn" onclick="del(${x.id})">✕</button>`;
// ---------- форми документів ----------
Object.keys(DT).forEach(k=>views[k]=async()=>{
  const d=DT[k],ref=x=>api(`refs?company_id=${company.id}&kind=${x}`);
  const [D,P,W,I]=await Promise.all([api('docs?company_id='+company.id),d.pk?ref(d.pk):[],d.wh?ref('wh'):[],d.lines?ref('item'):[]]);
  ITEMS=I;const n=D.filter(x=>x.type===k).length+1,op=a=>a.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('');
  const co=a=>a.map(c=>`<option value="${c}">${c} — ${esc(nameOf(c))}</option>`).join('');
  $('#app').innerHTML=`<div class="card"><h3>${d.h}</h3><div class="row"><div><label>Дата</label><input id="d_d" type="date" value="${today}"></div><div><label>Номер</label><input id="d_n" value="${d.p}-${n}"></div>${d.pk?`<div><label>Контрагент</label><select id="d_p"><option value="">—</option>${P.map(x=>`<option>${esc(x.name)}</option>`).join('')}</select></div>`:''}</div>
  ${d.wh?`<div class="row"><div><label>Склад${d.wh2?' (звідки)':''}</label><select id="d_w">${op(W)}</select></div>${d.wh2?`<div><label>Склад (куди)</label><select id="d_w2">${op(W)}</select></div>`:''}</div>`:''}
  ${d.cash?`<div class="row"><div><label>Сума, грн</label><input id="d_s" type="number" step="0.01"></div><div><label>Кореспондуючий рахунок</label><select id="d_c">${co(CASHC[k])}</select></div></div>`:`${d.c?`<div class="row"><div><label>${d.cl}</label><select id="d_c">${co(d.c)}</select></div>${d.st?`<div><label>Списується зі складського рахунку</label><select id="d_st">${co(['281','201','203','207','209','22','26'])}</select></div>`:''}</div>`:''}
  <div id="ln"></div><datalist id="dl">${I.map(x=>`<option value="${esc(x.name)}">`).join('')}</datalist><p><button class="btn" onclick="lnRow()">+ рядок</button></p><p id="tot" class="mut"></p>
  ${d.wh&&!I.length?'<p class="err">Спочатку заповніть довідники «Номенклатура» та «Склади».</p>':''}`}
  <label>Підстава / примітка</label><input id="d_b"><p><button class="btn pri" onclick="docPost('${k}')">Провести</button> <span id="msg" class="err"></span></p>
  ${d.lines&&!d.wh?'':''}${S().vat?'':'<p class="mut">Підприємство не є платником ПДВ — ПДВ не нараховується.</p>'}${k==='sale'||k==='wo'||k==='mv'?`<p class="mut">Собівартість списання розраховується автоматично: ${S().inv==='avg'?'середньозважена':'ФІФО'} (за обліковою політикою${S().inv==='spec'?'; ідентифікована собівартість наразі розраховується як ФІФО':''}).</p>`:''}</div>`;
  if(d.lines)lnRow();
});
function lnRow(){$('#ln').insertAdjacentHTML('beforeend',`<div class="row lr" style="grid-template-columns:3fr 70px 90px 110px 110px;margin-bottom:6px"><input class="ln_n" list="dl" placeholder="Найменування" onchange="lnFill(this)"><input class="ln_u" placeholder="од." readonly><input class="ln_q" type="number" step="0.001" placeholder="К-сть" oninput="lnTot()"><input class="ln_p" type="number" step="0.01" placeholder="Ціна" oninput="lnTot()"><input class="ln_s" readonly placeholder="Сума"></div>`)}
function lnFill(el){const r=el.closest('.lr'),it=ITEMS.find(x=>x.name===el.value);if(it){r.querySelector('.ln_u').value=it.data.unit||'';if(!r.querySelector('.ln_p').value)r.querySelector('.ln_p').value=it.data.price||''}lnTot()}
function lnTot(){let s=0;document.querySelectorAll('.lr').forEach(r=>{const v=R2((Number(r.querySelector('.ln_q').value)||0)*(Number(r.querySelector('.ln_p').value)||0));r.querySelector('.ln_s').value=v||'';s+=v});const vr=S().vat?S().rate/100:0;$('#tot').textContent=`Разом без ПДВ: ${fmt(s)} · ПДВ${S().vat?' '+S().rate+'%':''}: ${fmt(R2(s*vr))} · Всього: ${fmt(R2(s*(1+vr)))}`}
async function docPost(k){
  const g=i=>$('#'+i)?.value||'';
  const lines=[...document.querySelectorAll('.lr')].map(r=>{const n=r.querySelector('.ln_n').value,it=ITEMS.find(x=>x.name===n);return{item_id:it?.id,name:n,unit:r.querySelector('.ln_u').value,qty:r.querySelector('.ln_q').value,price:r.querySelector('.ln_p').value}}).filter(l=>l.name&&Number(l.qty)>0);
  try{const r=await api('docs',{method:'POST',body:{company_id:company.id,type:k,date:g('d_d'),number:g('d_n'),partner:g('d_p'),wh_id:Number(g('d_w'))||null,wh2_id:Number(g('d_w2'))||null,corr:g('d_c'),stock:g('d_st'),basis:g('d_b'),sum:g('d_s'),lines}});await go('docs');printDoc(r.id)}catch(e){$('#msg').textContent=e.message}
}
views.docs=async()=>{
  const D=await api('docs?company_id='+company.id),T=me.role==='teacher';
  $('#app').innerHTML=`<div class="card sc"><h3>Журнал документів</h3><table><thead><tr><th>Дата</th><th>Вид</th><th>№</th><th>Контрагент</th><th class="n">Сума</th><th></th></tr></thead><tbody>${D.map(x=>`<tr${x.storno?' style="opacity:.55"':''}><td>${x.date}</td><td>${esc(DT[x.type]?.h.replace(/ \(.*\)/,''))}</td><td>${esc(x.number)}${x.storno?' (сторновано)':''}</td><td>${esc(x.partner)}</td><td class="n">${fmt(x.total||0)}</td><td><button class="btn" onclick="printDoc(${x.id})">Друк</button> ${T||x.storno?'':`<button class="btn" onclick="stornoDoc(${x.id})">Сторно</button>`}</td></tr>`).join('')||'<tr><td class="mut">Документів ще немає</td></tr>'}</tbody></table></div>`;
};
async function stornoDoc(id){
  const date=prompt('Дата сторно документа (РРРР-ММ-ДД)',today);if(!date)return;
  try{await api(`docs/${id}/storno`,{method:'POST',body:{date}});go(tab==='docs'?'docs':'entries')}catch(e){alert(e.message)}
}
// ---------- склад ----------
views.stock=async()=>{
  $('#app').innerHTML=`<div class="card"><h3>Залишки ТМЦ на складах</h3><div class="row"><div><label>На дату</label><input id="t" type="date" value="${today}"></div></div><p><button class="btn pri" onclick="stock()">Сформувати</button> <button class="btn" onclick="window.print()">Друк</button></p></div><div id="res"></div>`;stock();
};
async function stock(){
  const r=await api(`stock?company_id=${company.id}&to=${$('#t').value}`);let A=0;
  $('#res').innerHTML=`<div class="card sc"><table><thead><tr><th>Склад</th><th>Номенклатура</th><th>Од.</th><th class="n">Кількість</th><th class="n">Собівартість за од.</th><th class="n">Сума</th></tr></thead><tbody>${r.map(x=>{A+=Number(x.amount);return `<tr><td>${esc(x.wh)}</td><td>${esc(x.item)}</td><td>${esc(x.unit)}</td><td class="n">${fq(x.qty)}</td><td class="n">${Number(x.qty)?fmt(x.amount/x.qty):''}</td><td class="n">${fmt(x.amount)}</td></tr>`}).join('')||'<tr><td colspan="6" class="mut">Залишків немає</td></tr>'}</tbody><tfoot><tr><td colspan="5">Разом</td><td class="n">${fmt(A)}</td></tr></tfoot></table></div>`;
}
views.scard=async()=>{
  const I=await api(`refs?company_id=${company.id}&kind=item`);
  $('#app').innerHTML=`<div class="card"><h3>Картка складського обліку</h3>${DC}<div><label>Номенклатура</label><select id="si">${I.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></div></div><p><button class="btn pri" onclick="scard()">Сформувати</button> <button class="btn" onclick="window.print()">Друк</button></p></div><div id="res"></div>`;
  if(I.length)scard();
};
async function scard(){
  const f=$('#f').value,t=$('#t').value,M=await api(`stock?company_id=${company.id}&item_id=${$('#si').value}`);let q=0,a=0;
  M.filter(m=>m.date<f).forEach(m=>{q+=Number(m.qty);a+=Number(m.amount)});const oq=q,oa=a;
  const rows=M.filter(m=>m.date>=f&&m.date<=t).map(m=>{const v=Number(m.qty);q+=v;a+=Number(m.amount);return `<tr><td>${m.date}</td><td>${esc(m.number)}</td><td>${esc(m.wh)}</td><td class="n">${v>0?fq(v):''}</td><td class="n">${v<0?fq(-v):''}</td><td class="n">${fq(q)}</td><td class="n">${fmt(a)}</td></tr>`}).join('');
  $('#res').innerHTML=`<div class="card sc"><table><thead><tr><th>Дата</th><th>Документ</th><th>Склад</th><th class="n">Прихід</th><th class="n">Видаток</th><th class="n">Залишок, к-сть</th><th class="n">Залишок, сума</th></tr></thead><tbody><tr style="font-weight:700"><td colspan="5">Залишок на початок</td><td class="n">${fq(oq)}</td><td class="n">${fmt(oa)}</td></tr>${rows}</tbody></table></div>`;
}
function cardView(a){
  $('#app').innerHTML=`<div class="card"><h3>${a==='301'?'Касова книга':a==='311'?'Виписка з банку':'Картка рахунка'}</h3>${DC}<div><label>Рахунок</label><select id="ca">${accOpts()}</select></div></div><p><button class="btn pri" onclick="card()">Сформувати</button> <button class="btn" onclick="window.print()">Друк</button></p></div><div id="res"></div>`;
  if(a)$('#ca').value=a;card();
}
views.bank=async()=>cardView('311');
// ---------- сума прописом ----------
function sw(x){
  const u=['','один','два','три','чотири','п’ять','шість','сім','вісім','дев’ять'],uf=['','одна','дві'],t10=['десять','одинадцять','дванадцять','тринадцять','чотирнадцять','п’ятнадцять','шістнадцять','сімнадцять','вісімнадцять','дев’ятнадцять'],tn=['','','двадцять','тридцять','сорок','п’ятдесят','шістдесят','сімдесят','вісімдесят','дев’яносто'],hn=['','сто','двісті','триста','чотириста','п’ятсот','шістсот','сімсот','вісімсот','дев’ятсот'];
  const tri=(n,f)=>{const r=n%100,t=Math.floor(r/10),o=r%10;return [hn[Math.floor(n/100)],r>=10&&r<20?t10[r-10]:tn[t],r>=10&&r<20?'':(f&&o<3?uf[o]:u[o])].filter(Boolean).join(' ')};
  const pl=(n,a,b,c)=>{const r=n%100,o=n%10;return r>10&&r<20?c:o===1?a:o>1&&o<5?b:c};
  let g=Math.floor(Math.abs(x)+1e-9),k=Math.round((Math.abs(x)-g)*100);if(k>=100){g++;k-=100}
  const mi=Math.floor(g/1e6)%1000,th=Math.floor(g/1000)%1000,un=g%1000;
  const s=[mi?tri(mi,0)+' '+pl(mi,'мільйон','мільйони','мільйонів'):'',th?tri(th,1)+' '+pl(th,'тисяча','тисячі','тисяч'):'',un?tri(un,1):(g?'':'нуль')].filter(Boolean).join(' ')+' '+pl(g,'гривня','гривні','гривень')+' '+String(k).padStart(2,'0')+' '+pl(k,'копійка','копійки','копійок');
  return s[0].toUpperCase()+s.slice(1);
}
// ---------- друк бланків ----------
function showPrint(html){
  let p=$('#prn');if(!p){document.body.insertAdjacentHTML('beforeend','<div id="prn"></div>');p=$('#prn')}
  p.innerHTML=`<div class="noprint" style="margin-bottom:12px"><button class="btn pri" onclick="window.print()">Друк</button> <button class="btn" onclick="closePrn()">Закрити</button></div><div class="pdoc">${html}</div>`;
  p.style.display='block';document.body.classList.add('printing');
}
function closePrn(){$('#prn').style.display='none';document.body.classList.remove('printing')}
async function printDoc(id){
  const d=await api('docs/'+id),X=d.data,ref=k=>api(`refs?company_id=${company.id}&kind=${k}`);
  const [cu,su,bk]=await Promise.all([ref('customer'),ref('supplier'),ref('bank')]);
  const pt=[...cu,...su].find(x=>x.name===d.partner),b=bk[0],cs=company.settings||{},dt=dfmt(d.date),Z=x=>esc(x);
  const my=`<b>${Z(company.name)}</b>${cs.code?', ЄДРПОУ/ІПН '+Z(cs.code):''}${b?`<br>р/р ${Z(b.data.iban)} у ${Z(b.name)}, МФО ${Z(b.data.mfo)}`:''}`;
  const pp=d.partner?`<b>${Z(d.partner)}</b>${pt?.data.code?', ЄДРПОУ/ІПН '+Z(pt.data.code):''}${pt?.data.phone?', тел. '+Z(pt.data.phone):''}`:'—';
  const sig=(...a)=>`<table style="width:100%;margin-top:28px"><tr>${a.map(x=>`<td>${x}: ______________</td>`).join('')}</tr></table>`;
  const H=t=>`<h3 style="text-align:center;margin:0 0 14px">${t} № ${Z(d.number)}<br>від ${dt}</h3>`;
  const tb=cost=>`<table class="pt"><thead><tr><th>№</th><th>Найменування</th><th>Од.</th><th>К-сть</th>${cost?'<th>Собівартість, грн</th>':'<th>Ціна без ПДВ</th><th>Сума без ПДВ</th>'}</tr></thead><tbody>${X.lines.map((l,i)=>`<tr><td>${i+1}</td><td>${Z(l.name)}</td><td>${Z(l.unit)}</td><td>${fq(l.qty)}</td>${cost?`<td>${fmt(l.cost??l.sum)}</td>`:`<td>${fmt(l.price)}</td><td>${fmt(l.sum)}</td>`}</tr>`).join('')}</tbody></table>`;
  const tot=`<p style="text-align:right">Разом без ПДВ: ${fmt(X.sum)}<br>ПДВ${X.rate?' '+X.rate+'%':''}: ${fmt(X.vat)}<br><b>Всього з ПДВ: ${fmt(X.total)}</b></p><p>Всього на суму: <b>${sw(X.total)}</b></p>`;
  const cash=(t,who,dr,kr)=>`${H(t)}<p>${my}</p><p>${who}: ${pp}</p><p>Підстава: ${Z(X.basis)}</p><p>Дебет ${dr}, Кредит ${kr}</p><p>Сума: <b>${fmt(X.total)} грн</b><br>(${sw(X.total)})</p>`;
  const H2={
    pko:()=>`${cash('ПРИБУТКОВИЙ КАСОВИЙ ОРДЕР','Прийнято від','301',X.corr)}${sig('Головний бухгалтер','Касир')}<hr style="border-top:1px dashed #000;margin:26px 0"><h4 style="text-align:center">КВИТАНЦІЯ до ПКО № ${Z(d.number)} від ${dt}</h4><p>Прийнято від: ${pp}</p><p>Підстава: ${Z(X.basis)}</p><p>Сума: <b>${fmt(X.total)} грн</b> (${sw(X.total)})</p>${sig('Головний бухгалтер','Касир')}`,
    vko:()=>`${cash('ВИДАТКОВИЙ КАСОВИЙ ОРДЕР','Видати',X.corr,'301')}${sig('Керівник','Головний бухгалтер','Одержав')}<p>Документ, що посвідчує особу: ______________</p>`,
    bin:()=>`${cash('БАНКІВСЬКА ВИПИСКА: НАДХОДЖЕННЯ НА Р/Р','Платник','311',X.corr)}`,
    bout:()=>`${cash('БАНКІВСЬКА ВИПИСКА: СПИСАННЯ З Р/Р','Одержувач',X.corr,'311')}`,
    rcpt:()=>`${H('ПРИБУТКОВА НАКЛАДНА')}<p>Постачальник: ${pp}</p><p>Одержувач: ${my}</p><p>Склад: ${Z(X.wh)}</p>${tb()}${tot}${sig('Відпустив','Прийняв')}`,
    sale:()=>`${H('ВИДАТКОВА НАКЛАДНА')}<p>Постачальник: ${my}</p><p>Одержувач: ${pp}</p><p>Склад: ${Z(X.wh)}</p>${tb()}${tot}${sig('Відпустив','Отримав')}`,
    inv:()=>`${H('РАХУНОК-ФАКТУРА')}<p>Постачальник: ${my}</p><p>Платник: ${pp}</p>${tb()}${tot}<p class="mut">Рахунок дійсний до оплати протягом 5 банківських днів.</p>${sig('Керівник','Головний бухгалтер')}`,
    act:()=>`${H('АКТ ВИКОНАНИХ РОБІТ (НАДАНИХ ПОСЛУГ)')}<p>Виконавець: ${my}</p><p>Замовник: ${pp}</p><p>Виконавець виконав, а Замовник прийняв наведені роботи (послуги). Претензій щодо обсягу, якості й строків немає.</p>${tb()}${tot}${sig('Від Виконавця','Від Замовника')}`,
    wo:()=>`${H('АКТ СПИСАННЯ ТМЦ')}<p>${my}</p><p>Склад: ${Z(X.wh)}; рахунок витрат: ${Z(X.corr)}</p><p>Підстава: ${Z(X.basis)}</p>${tb(1)}<p>Всього списано на суму: <b>${fmt(X.total)} грн</b> (${sw(X.total)})</p>${sig('Голова комісії','Члени комісії','МВО')}`,
    mv:()=>`${H('НАКЛАДНА НА ВНУТРІШНЄ ПЕРЕМІЩЕННЯ')}<p>${my}</p><p>Зі складу: ${Z(X.wh)} → на склад: ${Z(X.wh2)}</p>${tb(1)}<p>Всього на суму: <b>${fmt(X.total)} грн</b></p>${sig('Відпустив','Прийняв')}`,
    ost:()=>`${H('ВВЕДЕННЯ ПОЧАТКОВИХ ЗАЛИШКІВ ТМЦ')}<p>${my}</p><p>Склад: ${Z(X.wh)}</p>${tb()}${tot}`};
  showPrint(H2[d.type]());
}
boot();
