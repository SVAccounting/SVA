// Закриття фінансових результатів (кінець місяця / року).
// Крок 1: рахунки доходів і витрат (класи 7 і 9) → 791 / 792 / 793 (податок на прибуток, рахунок 98, — на 793 за Інструкцією №291).
// Крок 2: сальдо 791, 792, 793 → 44 «Нерозподілені прибутки (непокриті збитки)».
// Клас 8 (елементи витрат) не закривається — це позабалансова/статистична група для Форми №2 (розділ ІІІ).
(function(){
  const TARGET=[ // [префікс рахунка, рахунок фінрезультату]
    ['70','791'],['71','791'],['72','792'],['73','792'],['74','793'],
    ['90','791'],['92','791'],['93','791'],['94','791'],
    ['95','792'],['96','792'],['97','793'],['98','793'],['99','793']];
  const NAMES={'791':'Результат операційної діяльності','792':'Результат фінансових операцій','793':'Результат іншої звичайної діяльності','44':'Нерозподілені прибутки (непокриті збитки)'};
  const r2=x=>Math.round((x+Number.EPSILON)*100)/100;
  const targetOf=code=>(TARGET.find(([p])=>code.startsWith(p))||[])[1];

  // Чиста функція: з ОСВ (рядки {code,name,closing}) будує проводки закриття.
  window.buildClosingEntries=function(rows){
    const leaf=rows.filter(x=>!rows.some(y=>y!==x&&y.code.length>x.code.length&&y.code.startsWith(x.code)));
    const lines=[],bal={'791':0,'792':0,'793':0},warn=[];
    for(const x of leaf){
      if(/^79/.test(x.code)){ // вже наявні залишки на 79x (напр. після часткового закриття)
        if(bal[x.code]!==undefined)bal[x.code]=r2(bal[x.code]+x.closing);
        continue;
      }
      if(x.code.startsWith('91')&&Math.abs(x.closing)>=0.005){warn.push(`Рахунок ${x.code} «${x.name}» має сальдо ${fmt(x.closing)} — загальновиробничі витрати спершу розподіліть (Дт 23 / 90 Кт 91), вони не закриваються на 79.`);continue}
      const t=targetOf(x.code);if(!t)continue;
      const v=r2(x.closing);if(Math.abs(v)<0.005)continue;
      if(v<0){lines.push({debit_acc:x.code,credit_acc:t,amount:r2(-v),description:`Закриття ${x.code} на ${t}`});bal[t]=r2(bal[t]+v)}   // Кт 79x збільшує кредит (v<0)
      else{lines.push({debit_acc:t,credit_acc:x.code,amount:v,description:`Закриття ${x.code} на ${t}`});bal[t]=r2(bal[t]+v)}
    }
    // сальдо 79x у форматі «дебет +, кредит −»; кредит = прибуток
    for(const t of ['791','792','793']){
      const v=bal[t];if(Math.abs(v)<0.005)continue;
      if(v<0)lines.push({debit_acc:t,credit_acc:'44',amount:r2(-v),description:`Прибуток: ${t} → 44`});
      else lines.push({debit_acc:'44',credit_acc:t,amount:v,description:`Збиток: 44 ← ${t}`});
    }
    const result=r2(-Object.values(bal).reduce((s,x)=>s+x,0)); // >0 прибуток, <0 збиток
    return {lines,warn,result,bal};
  };

  views.closefin=async function(){
    const y=new Date().getFullYear();
    const closed=company?.closed_until;
    $('#app').innerHTML=`<div class="card"><h3>Закриття фінансових результатів</h3>
      <p class="mut">Доходи й витрати (рахунки 70–74, 90–99) переносяться на рахунки 791/792/793, а їх сальдо — на рахунок 44. Спочатку формується попередній перегляд, проводки створюються лише після підтвердження.</p>
      ${closed?`<p class="err">Облікові періоди закрито до ${esc(closed)} включно — дата закриття має бути пізнішою.</p>`:''}
      <div class="row"><div><label>Дата закриття (останній день періоду)</label><input id="cf_d" type="date" value="${y}-12-31"></div></div>
      <p><button class="btn pri" onclick="closefinPreview()">Сформувати проводки</button></p></div><div id="cf_res"></div>`;
  };

  window.closefinPreview=async function(){
    const d=$('#cf_d').value;if(!d)return toast('Вкажіть дату','err');
    const box=$('#cf_res');box.innerHTML='<div class="card mut"><span class="spin"></span> Розрахунок…</div>';
    try{
      const rows=await api(`osv?company_id=${company.id}&from=1900-01-01&to=${d}`);
      const R=buildClosingEntries(rows);
      window._cfLines=R.lines;window._cfDate=d;
      const warn=R.warn.map(w=>`<p class="err">⚠ ${esc(w)}</p>`).join('');
      if(!R.lines.length){box.innerHTML=`<div class="card">${warn}<p>Немає залишків на рахунках доходів і витрат на ${esc(d)} — закривати нічого.</p></div>`;return}
      const tot=R.lines.reduce((s,l)=>s+l.amount,0);
      box.innerHTML=`<div class="card sc"><h3>Попередній перегляд проводок на ${esc(d)}</h3>${warn}
        <table><thead><tr><th>Дт</th><th>Кт</th><th>Зміст</th><th class="n">Сума</th></tr></thead><tbody>
        ${R.lines.map(l=>`<tr><td>${l.debit_acc} ${esc(NAMES[l.debit_acc]||nameOf(l.debit_acc))}</td><td>${l.credit_acc} ${esc(NAMES[l.credit_acc]||nameOf(l.credit_acc))}</td><td>${esc(l.description)}</td><td class="n">${fmt(l.amount)}</td></tr>`).join('')}
        </tbody><tfoot><tr style="font-weight:700"><td colspan="3">Разом обороти</td><td class="n">${fmt(tot)}</td></tr></tfoot></table>
        <p><b>Фінансовий результат: ${R.result>=0?'прибуток':'збиток'} ${fmt(Math.abs(R.result))} грн</b></p>
        <p><button class="btn pri" onclick="closefinPost()">Провести закриття</button> <span id="cf_msg" class="err"></span></p>
        <p class="mut">Проводки створюються однією транзакцією. Щоб скасувати закриття, видаліть їх у журналі операцій (документ «Закриття фінансових результатів») — доки період не закрито.</p></div>`;
    }catch(e){box.innerHTML=`<div class="card err">${esc(e.message)}</div>`}
  };

  window.closefinPost=async function(){
    const lines=window._cfLines,d=window._cfDate;if(!lines?.length)return;
    if(lines.length>100)return $('#cf_msg').textContent='Занадто багато рядків для одного проведення (понад 100) — закрийте менші періоди.';
    if(!confirm(`Провести ${lines.length} проводок закриття на ${d}?`))return;
    try{
      await api('entries',{method:'POST',body:{company_id:company.id,date:d,doc:'Закриття фінансових результатів',description:'Закриття рахунків доходів і витрат та визначення фінансового результату',lines:lines.map(({debit_acc,credit_acc,amount})=>({debit_acc,credit_acc,amount}))}});
      toast('Фінансові результати закрито','ok');window._cfLines=null;go('osv');
    }catch(e){$('#cf_msg').textContent=e.message}
  };

  // пункт меню та права (модуль «Журнал операцій»)
  const g=MENU.find(m=>m[0]==='Операції');if(g&&!g[1].some(x=>x[0]==='closefin'))g[1].push(['closefin','Закриття фінрезультатів']);
  if(typeof TAB_MODULE==='object')TAB_MODULE.closefin='entries';
})();
