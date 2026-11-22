// Superadmin service: versioned posting correspondence / financial-report formula builder.
// Only fixed declarative rules are saved. No arbitrary JavaScript or SQL is executed.
(function(){
  const POSTING=(window.POSTING_CATALOG||[]).map(b=>[b.key,b.title]);
  const REPORTS=[['F1A','Форма №1 — Актив'],['F1P','Форма №1 — Пасив'],['F2','Форма №2 — Фінансові результати']];
  const SOURCES={A:'Дебетове сальдо з урахуванням знака',P:'Кредитове сальдо з урахуванням знака',D:'Лише додатне дебетове сальдо',C:'Лише кредитове сальдо',K:'Кредитовий оборот мінус дебетовий',X:'Дебетовий оборот мінус кредитовий',E:'Дебетовий оборот',R:'Незакритий фінансовий результат'};
  let state={scope:'posting',key:(POSTING[0]||['doc:sale'])[0],versions:[],config:{mappings:[]},draftId:null,dirty:false,previewed:false};
  const keys=()=>state.scope==='posting'?POSTING:REPORTS;
  const rowDefs=()=>state.key==='F1A'?F1A:state.key==='F1P'?F1P:F2;
  const label=k=>([...POSTING,...REPORTS].find(x=>x[0]===k)||[])[1]||k;
  const h=(s)=>esc(s??'');
  const dateTomorrow=()=>{const d=new Date();d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10)};
  const activeFor=()=>state.versions.filter(v=>v.scope===state.scope&&v.rule_key===state.key&&v.status==='active').sort((a,b)=>(b.effective_from||'').localeCompare(a.effective_from||'')||b.id-a.id)[0];
  const parseConfig=c=>JSON.parse(JSON.stringify(c|| (state.scope==='posting'?{mappings:[]}:{rows:{}})));
  const roleCheck=()=>me?.role==='superadmin';

  async function refresh(){state.versions=await api('rulebook');}
  function selectConfig(){
    const v=activeFor();state.config=parseConfig(v?.config);
    state.draftId=null;state.dirty=false;state.previewed=false;
  }
  window.rbScope=async function(value){state.scope=value;state.key=keys()[0][0];selectConfig();paint()};
  window.rbKey=function(value){state.key=value;selectConfig();paint()};
  window.rbLoad=function(id){
    const v=state.versions.find(x=>x.id===Number(id));if(!v)return;
    state.scope=v.scope;state.key=v.rule_key;state.config=parseConfig(v.config);
    // Loading a historical published version ALWAYS creates a new draft on Save.
    state.draftId=null;state.dirty=true;state.previewed=false;paint();
    rbMessage('Версію #'+id+' скопійовано для створення нової чернетки. Історія не змінюється.');
  };
  window.rbDirty=function(){state.draftId=null;state.previewed=false;state.dirty=true;updateButtons()};
  function updateButtons(){
    const save=document.querySelector('#rb_save'),preview=document.querySelector('#rb_preview'),activate=document.querySelector('#rb_activate');
    if(save)save.disabled=false;
    if(preview)preview.disabled=!state.draftId;
    if(activate)activate.disabled=!state.draftId||!state.previewed;
    const status=document.querySelector('#rb_status');if(status)status.textContent=state.dirty?'Є незбережені зміни':state.draftId?'Чернетка #'+state.draftId+' збережена':'Редагування правил';
  }
  function postingEditor(){
    return `<p class="mut">Додайте заміну, якщо в проводці потрібно використати інші рахунки. Сума, ПДВ, собівартість і кількість розраховуються програмою — змінюються лише рахунки. Порожній список означає вбудовану логіку.</p>
      <div id="rb_mappings">${(state.config.mappings||[]).map(mapRow).join('')}</div>
      <p><button class="btn" onclick="rbAddMap()">+ Додати заміну кореспонденції</button></p>`;
  }
  function mapRow(m={from_debit:'',from_credit:'',to_debit:'',to_credit:''}){
    const inp=(c,ph,v,lbl)=>`<input class="${c}" placeholder="${ph}" inputmode="numeric" maxlength="4" value="${h(v)}" oninput="rbDirty()" aria-label="${lbl}">`;
    return `<div class="rb-map-row"><div class="rb-pair"><span class="rb-lbl">Було</span>${inp('rb-fd','Дт',m.from_debit,'Початковий дебет')}${inp('rb-fc','Кт',m.from_credit,'Початковий кредит')}</div>
      <span class="rb-arrow">→</span><div class="rb-pair"><span class="rb-lbl">Стане</span>${inp('rb-td','Дт',m.to_debit,'Новий дебет')}${inp('rb-tc','Кт',m.to_credit,'Новий кредит')}</div>
      <button class="btn" title="Прибрати цю заміну" onclick="this.closest('.rb-map-row').remove();rbDirty()">×</button><div class="rb-nm"></div></div>`;
  }
  window.rbAddMap=()=>{document.querySelector('#rb_mappings').insertAdjacentHTML('beforeend',mapRow());rbDirty()};
  function reportEditor(){
    const c=state.config.rows||{};
    return `<div class="rb-help"><b>Джерела:</b> ${Object.entries(SOURCES).map(([k,v])=>`<span><code>${k}:</code> ${v}</span>`).join('')}
      <p>Приклади: <code>P:301,311;C:312</code> (кілька рахунків), <code>A:20,22;-P:285</code> (віднімання), <code>=1095+1195+1200</code> (формула з рядків), <code>Z</code> (нуль). Префікси охоплюють відповідні субрахунки; не додавайте одночасно батьківський і дочірній префікси.</p></div>
      <label for="rb_filter">Пошук статті звіту</label><input id="rb_filter" placeholder="Код або назва статті" oninput="rbFilter(this.value)">
      <div class="rb-lines" id="rb_lines">${rowDefs().filter(r=>r[0]).map(([code,name,spec])=>`<div class="rb-report-row" data-search="${h(code+' '+name).toLowerCase()}"><span class="rb-code">${h(code)}</span>
      <span class="rb-name">${h(name.trim())}<small>За замовчуванням: ${h(spec)}</small></span>
      <input data-code="${h(code)}" value="${h(c[code]??'')}" oninput="rbDirty()" placeholder="${h(spec)}" aria-label="Формула рядка ${h(code)}"></div>`).join('')}</div>
      <p class="mut">Порожнє поле = нормативна формула, вбудована в цю версію ProOblik. Зміна розрахунку не редагує облікові проводки та не впливає на старі періоди.</p>`;
  }
  window.rbFilter=value=>{const q=String(value||'').toLowerCase();document.querySelectorAll('.rb-report-row').forEach(e=>e.hidden=!e.dataset.search.includes(q))};
  const history=()=>state.versions.filter(v=>v.scope===state.scope&&v.rule_key===state.key).map(v=>`<tr><td>#${v.id}</td><td>${v.status==='active'?'Опубліковано':'Чернетка'}</td><td>${h(v.effective_from||'—')}</td><td>${h(v.author||'')}</td><td>${h(v.note||'')}</td><td><button class="btn" onclick="rbLoad(${v.id})">Копіювати</button></td></tr>`).join('')||'<tr><td colspan="6" class="mut">Версій поки немає</td></tr>';
  const TODAY=()=>new Date().toISOString().slice(0,10);
  const catOf=k=>(window.POSTING_CATALOG||[]).find(b=>b.key===k);
  const GROUP_OF={'doc:pko':'Каса і банк','doc:vko':'Каса і банк','doc:bin':'Каса і банк','doc:bout':'Каса і банк','doc:rcpt':'Склад і реалізація','doc:prod':'Склад і реалізація','doc:ost':'Склад і реалізація','doc:sale':'Склад і реалізація','doc:wo':'Склад і реалізація','doc:mv':'Склад і реалізація','doc:inv':'Документи','doc:act':'Документи','payroll:accrual':'Зарплата','payroll:payment:wage':'Зарплата','payroll:payment:pit':'Зарплата','payroll:payment:military':'Зарплата','payroll:payment:esv':'Зарплата','financial:close':'Закриття періоду'};
  const GROUP_ORDER=['Каса і банк','Склад і реалізація','Документи','Зарплата','Закриття періоду'];
  const currentOf=(scope,key)=>state.versions.filter(v=>v.scope===scope&&v.rule_key===key&&v.status==='active'&&(v.effective_from||'')<=TODAY()).sort((a,b)=>(b.effective_from||'').localeCompare(a.effective_from||'')||b.id-a.id)[0];
  const changed=(scope,key)=>{const v=currentOf(scope,key);return !!v&&(scope==='posting'?(v.config?.mappings||[]).length>0:Object.keys(v.config?.rows||{}).length>0)};
  const navBtn=(scope,key,title)=>`<button class="rb-i${state.scope===scope&&String(state.key)===String(key)?' on':''}" data-t="${h(title.toLowerCase())}" onclick="rbPick('${scope}','${key}')"><span>${h(title)}</span>${changed(scope,key)?'<i class="rb-dot" title="Є системні зміни"></i>':''}</button>`;
  function rbNav(){
    const grp=(t,items,open)=>`<details class="rb-g"${open?' open':''}><summary>${h(t)} <span class="mut">${items.length}</span></summary>${items.join('')}</details>`;
    const posting=GROUP_ORDER.map(g=>grp(g,POSTING.filter(([k])=>GROUP_OF[k]===g).map(([k,n])=>navBtn('posting',k,n)),true));
    const rep=grp('Фінансова звітність',REPORTS.map(([k,n])=>navBtn('report',k,n)),true);
    const cats=[...new Set(TPL.map(t=>t[0]))];
    const typ=cats.map(c=>grp('Типові: '+c,TPL.map((t,i)=>t[0]===c?navBtn('tpl',i,t[1]):'').filter(Boolean),state.scope==='tpl'&&TPL[state.key]?.[0]===c));
    return `<aside class="rb-nav card"><input id="rb_find" placeholder="Знайти операцію…" oninput="rbFind(this.value)"><p class="rb-cap">Операції та форми</p>${posting.join('')}${rep}<p class="rb-cap">Типові операції (${TPL.length})</p>${typ.join('')}<p class="mut rb-legend"><i class="rb-dot"></i> є системні зміни</p></aside>`;
  }
  function baseTable(){
    const b=catOf(state.key);if(!b)return '';
    if(!b.rows.length)return '<p class="mut">Проводок немає: операція не формує запису в журналі.</p>';
    const maps=(currentOf('posting',state.key)?.config?.mappings)||[],by=new Map(maps.map(m=>[m.from_debit+'|'+m.from_credit,m]));
    const a=c=>`${h(c)} <span class="mut">${h(accName(c))}</span>`;
    return `<div class="rb-tbl"><table><thead><tr><th>Дебет</th><th>Кредит</th><th>Зміст</th><th>Діє зараз</th><th></th></tr></thead><tbody>${b.rows.map(r=>{const m=by.get(r.dt+'|'+r.kt);
      return `<tr><td>${a(r.dt)}</td><td>${a(r.kt)}</td><td style="white-space:normal;min-width:160px">${h(r.txt)}</td><td>${m?`<b>Дт ${h(m.to_debit)} Кт ${h(m.to_credit)}</b>`:'<span class="mut">без змін</span>'}</td><td><button class="btn" onclick="rbAddPair('${r.dt}','${r.kt}')">✎ Змінити</button></td></tr>`}).join('')}</tbody></table></div>`;
  }
  function tplPane(){
    const t=TPL[Number(state.key)];if(!t)return '<div class="card">Операцію не знайдено</div>';
    const r=S().vat?S().rate/100:0,mul=f=>f===0.2||f==='vat'?'ПДВ (ставка)':f===1.2||f==='vatincl'?'сума з ПДВ':(f===1?'вся сума':'× '+Math.round(f*1000)/1000);
    return `<div class="card rb-panel"><div class="rb-title"><h2>${h(t[1])}</h2><span class="rb-tag">Типова операція · ${h(t[0])}</span></div>
      <p class="mut">Типова операція — це набір проводок, який бухгалтер вибирає в розділі «Операції → Типові операції». Її логіку змінюють у редакторі типових операцій (категорія, назва, рахунки Дт/Кт та множники суми).</p>
      <table><thead><tr><th>Дебет</th><th>Кредит</th><th>Від суми</th></tr></thead><tbody>${t[2].map(([d,k,f])=>`<tr><td>${h(d)} <span class="mut">${h(accName(d))}</span></td><td>${h(k)} <span class="mut">${h(accName(k))}</span></td><td>${mul(f)}</td></tr>`).join('')}</tbody></table>
      <p>${(window.TPL_DB||[]).length?`<button class="btn pri" onclick="tedOpenByName(TPL[${Number(state.key)}][1])">✎ Редагувати в редакторі типових операцій</button>`:`<button class="btn pri" onclick="go('typeditor')">Відкрити редактор типових операцій</button> <span class="mut">Вбудований набір спершу переноситься в редактор.</span>`}</p></div>`;
  }
  function mainPane(){
    const b=catOf(state.key),active=activeFor(),title=b?.title||label(state.key);
    return `<div class="card rb-panel"><div class="rb-title"><h2>${h(title)}</h2><span class="rb-tag">${active?`Системні зміни: версія #${active.id} від ${h(active.effective_from)}`:'Вбудована логіка'}</span></div>
      <p class="mut">${b?h(b.where)+' · ':''}<code>${h(state.key)}</code></p>${b?.note?`<p class="mut">${h(b.note)}</p>`:''}
      <h3 class="rb-h"><span class="rb-n">1</span>Як це працює зараз</h3>
      ${state.scope==='posting'?baseTable():'<p class="mut">Нижче показано формули рядків форми. Змінюйте лише ті рядки, для яких потрібна інша формула.</p>'}
      <h3 class="rb-h"><span class="rb-n">2</span>${state.scope==='posting'?'Що змінити':'Формули рядків'}</h3>
      ${state.scope==='posting'?postingEditor():reportEditor()}
      <h3 class="rb-h"><span class="rb-n">3</span>Зберегти, перевірити, опублікувати</h3>
      <ol class="rb-steps">
        <li><b>Чернетка.</b> <div class="rb-wide"><label>Причина зміни</label><input id="rb_note" placeholder="Наприклад: виправлено кореспонденцію при продажу товарів"></div><button class="btn pri" id="rb_save" onclick="rbSave()">Зберегти чернетку</button></li>
        <li><b>Перевірка.</b> <span class="mut">Порівнює стару й нову логіку на контрольних прикладах — без змін у даних.</span><button class="btn" id="rb_preview" onclick="rbPreview()">Перевірити</button></li>
        <li><b>Публікація.</b> <span class="mut">Нова логіка діє з обраної дати й не змінює вже проведені записи.</span><div><label>Діє з</label><input id="rb_start" type="date" min="${dateTomorrow()}" value="${dateTomorrow()}"></div><button class="btn" id="rb_activate" onclick="rbActivate()">Активувати версію</button></li>
      </ol>
      <p class="mut" id="rb_status"></p><div id="rb_message" aria-live="polite"></div><div id="rb_test"></div></div>
      <details class="card sc rb-hist"><summary><b>Історія версій</b> <span class="mut">(${state.versions.filter(v=>v.scope===state.scope&&v.rule_key===state.key).length})</span></summary><table><thead><tr><th>ID</th><th>Стан</th><th>Початок дії</th><th>Автор</th><th>Причина</th><th>Дія</th></tr></thead><tbody>${history()}</tbody></table></details>`;
  }
  function paint(){
    $('#app').innerHTML=`<div class="card rb-head"><div class="rb-title"><h2>Конструктор бухгалтерської логіки</h2><span class="rb-tag">Суперадміністратор</span></div>
      <p class="mut">Оберіть операцію ліворуч → перегляньте, як вона проводиться → за потреби змініть рахунки → перевірте й опублікуйте. Версії діють лише на майбутні дати; старі записи не змінюються.</p></div>
      <div class="rb-shell">${rbNav()}<div class="rb-col">${state.scope==='tpl'?tplPane():mainPane()}</div></div>`;
    updateButtons();rbNames();
  }
  window.rbPick=(scope,key)=>{state.scope=scope;state.key=key;if(scope!=='tpl')selectConfig();paint();window.scrollTo({top:0,behavior:'smooth'})};
  window.rbFind=v=>{const q=String(v||'').trim().toLowerCase();document.querySelectorAll('.rb-g').forEach(g=>{let n=0;g.querySelectorAll('.rb-i').forEach(b=>{const ok=!q||b.dataset.t.includes(q);b.style.display=ok?'':'none';if(ok)n++});g.style.display=n?'':'none';if(q&&n)g.open=true})};
  window.rbNames=()=>(document.querySelectorAll?document.querySelectorAll('.rb-map-row'):[]).forEach(r=>{
    const v=c=>r.querySelector(c).value.trim(),t=(d,k)=>d||k?`Дт ${d||'?'} ${accName(d)} — Кт ${k||'?'} ${accName(k)}`:'';
    const nm=r.querySelector('.rb-nm');if(nm)nm.innerHTML=`<span class="mut">${h(t(v('.rb-fd'),v('.rb-fc')))}</span> <b>→</b> <span>${h(t(v('.rb-td'),v('.rb-tc')))}</span>`});
  window.rbAddPair=(dt,kt)=>{
    const rows=[...document.querySelectorAll('.rb-map-row')],ex=rows.find(r=>r.querySelector('.rb-fd').value===dt&&r.querySelector('.rb-fc').value===kt);
    if(!ex){rbAddMap();const r=[...document.querySelectorAll('.rb-map-row')].pop();r.querySelector('.rb-fd').value=dt;r.querySelector('.rb-fc').value=kt;r.querySelector('.rb-td').value=dt;r.querySelector('.rb-tc').value=kt;rbNames();(r.querySelector('.rb-td')).focus();r.scrollIntoView({behavior:'smooth',block:'center'})}
    else ex.scrollIntoView({behavior:'smooth',block:'center'});
    rbMessage('Вкажіть нові рахунки в блоці «Стане», потім збережіть чернетку, перевірте й активуйте.');
  };
  function rbMessage(msg,err=false){const box=$('#rb_message');if(box)box.innerHTML=`<p class="${err?'err':'mut'}">${h(msg)}</p>`};
  function collect(){
    if(state.scope==='posting')return {mappings:[...document.querySelectorAll('.rb-map-row')].map(row=>({
      from_debit:row.querySelector('.rb-fd').value.trim(),from_credit:row.querySelector('.rb-fc').value.trim(),to_debit:row.querySelector('.rb-td').value.trim(),to_credit:row.querySelector('.rb-tc').value.trim()}))};
    return {rows:Object.fromEntries([...document.querySelectorAll('[data-code]')].map(el=>[el.dataset.code,el.value.trim()]).filter(x=>x[1]))};
  }
  window.rbSave=async()=>{
    try{const conf=collect(),note=$('#rb_note').value;
      const result=await api('rulebook/save',{method:'POST',body:{scope:state.scope,rule_key:state.key,config:conf,note}});
      state.config=conf;state.draftId=result.id;state.dirty=false;state.previewed=false;
      await refresh();paint();rbMessage('Чернетку #'+result.id+' збережено. Тепер натисніть «Перевірити».');
    }catch(e){rbMessage(e.message,true)}
  };
  window.rbPreview=async()=>{
    if(!state.draftId)return;
    const box=$('#rb_test');box.innerHTML='<p class="mut">Триває перевірка…</p>';
    try{
      if(state.scope==='report'&&!company)throw new Error('Перед перевіркою звітної формули оберіть підприємство');
      const date=new Date().toISOString().slice(0,10);
      const checked=await api('rulebook/preview',{method:'POST',body:{id:state.draftId,company_id:company?.id,date}});
      if(state.scope==='posting'){
        const toTable=arr=>`<table><thead><tr><th>Дт</th><th>Кт</th><th class="n">Сума</th></tr></thead><tbody>${arr.map(x=>`<tr><td>${h(x.debit_acc)}</td><td>${h(x.credit_acc)}</td><td class="n">${fmt(x.amount)}</td></tr>`).join('')}</tbody></table>`;
        box.innerHTML=`<div class="rb-compare"><div><h4>Було</h4>${toTable(checked.before)}</div><div><h4>За новим правилом</h4>${toTable(checked.after)}</div></div>`;
      }else{
        const differences=checked.differences||[];
        box.innerHTML=`<h4>Контрольне порівняння на ${h(checked.date)} (${h(company.name)})</h4>`+
          (differences.length?`<div class="sc"><table><thead><tr><th>Рядок</th><th>Було, грн</th><th>Стане, грн</th></tr></thead><tbody>${differences.slice(0,60).map(x=>`<tr><td>${h(x.code)}</td><td class="n">${fmt(x.before)}</td><td class="n">${fmt(x.after)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="mut">На даних цього підприємства числових відмінностей не виявлено. Перевірте також випадок із ненульовими сумами.</p>');
      }
      state.previewed=true;updateButtons();rbMessage('Чернетку перевірено. Активація допускається з наступного дня.');
    }catch(e){state.previewed=false;updateButtons();rbMessage(e.message,true);box.innerHTML=''}
  };
  window.rbActivate=async()=>{
    if(!state.draftId||!state.previewed)return;
    const eff=$('#rb_start').value;
    if(!confirm('Активувати правило #'+state.draftId+' з '+eff+' для УСІХ підприємств? Уже проведені записи не зміняться.'))return;
    try{
      await api('rulebook/activate',{method:'POST',body:{id:state.draftId,effective_from:eff}});
      await refresh();selectConfig();paint();rbMessage('Версію активовано з '+eff+'. Старі періоди залишилися без змін.');
    }catch(e){rbMessage(e.message,true)}
  };
  views.ruleDiagnostics=async()=>{
    if(!roleCheck()){ $('#app').innerHTML='<div class="card err">Доступ лише для суперадміна</div>';return; }
    $('#app').innerHTML=`<div class="card"><h2>Діагностика бухгалтерської логіки</h2>
    <p class="mut">Перевірка арифметики ОСВ, балансу, незакритих рахунків та активних правил на вибрану дату. Це перевірка, а не автоматичне виправлення.</p>
    <label>Станом на дату</label><input id="rdiag_date" type="date" value="${new Date().toISOString().slice(0,10)}" style="max-width:260px">
    <button class="btn pri" onclick="runRuleDiagnostics()">Перевірити облік</button><div id="rdiag_result"></div></div>`;
  };
  window.runRuleDiagnostics=async()=>{
    const box=$('#rdiag_result');if(!company){box.innerHTML='<p class="err">Спочатку оберіть підприємство.</p>';return;}
    const d=$('#rdiag_date').value;
    box.innerHTML='<p class="mut">Перевіряємо...</p>';
    try{
      const [osv,pnl,custom]=await Promise.all([
        api(`osv?company_id=${company.id}&from=1900-01-01&to=${d}`),
        api(`pnl?company_id=${company.id}&from=${d.slice(0,4)}-01-01&to=${d}`),
        api('rulebook/active?at='+d)]);
      const leaves=osv.filter(x=>!osv.some(y=>y!==x&&y.code.length>x.code.length&&y.code.startsWith(x.code)));
      const sums=leaves.reduce((a,x)=>({open:a.open+Number(x.opening),debit:a.debit+Number(x.debit),credit:a.credit+Number(x.credit),close:a.close+Number(x.closing)}),{open:0,debit:0,credit:0,close:0});
      const act=calc(F1A,osv,[],custom.F1A?.rows||{}),pas=calc(F1P,osv,[],custom.F1P?.rows||{}),res=calc(F2,[],pnl,custom.F2?.rows||{});
      const open=osv.filter(x=>/^[789]/.test(x.code)&&!x.code.startsWith('79')&&Math.abs(x.closing)>0.005);
      const measures=[['Рівність оборотів Дт і Кт',sums.debit-sums.credit],['Контроль сальдо Дт / Кт',sums.close],['Актив 1300 мінус Пасив 1900', (act[1300]||0)-(pas[1900]||0)]];
      box.innerHTML=`<h3>Підприємство: ${h(company.name)} · ${h(d)}</h3><table><thead><tr><th>Перевірка</th><th class="n">Різниця, грн</th><th>Стан</th></tr></thead><tbody>
        ${measures.map(([name,value])=>`<tr><td>${h(name)}</td><td class="n">${fmt(value)}</td><td>${Math.abs(value)<0.01?'✓':'⚠ Потребує перевірки'}</td></tr>`).join('')}</tbody></table>
        <p>Чистий результат Ф.2 (2350−2355): <b>${fmt((res[2350]||0)-(res[2355]||0))} грн</b></p>
        <p class="${open.length?'err':'mut'}">${open.length?'Незакриті рахунки доходів/витрат: '+h(open.map(x=>x.code).join(', ')):'Незакритих рахунків класів 7–9 не виявлено.'}</p>
        <p class="mut">Застосовані редакції звітів: ${['F1A','F1P','F2'].map(k=>k+' — '+(custom[k]?'#'+custom[k].version_id:'базова')).join('; ')}.</p>
        <p class="mut">Діагностика не замінює перевірку економічної сутності операцій і правильності бухгалтерської кореспонденції.</p>`;
    }catch(e){box.innerHTML='<p class="err">'+h(e.message)+'</p>'}
  };
  const _rbDirty=window.rbDirty;window.rbDirty=function(){_rbDirty.apply(this,arguments);rbNames()};
  views.rulebook=async()=>{
    if(!roleCheck()){ $('#app').innerHTML='<div class="card err">Доступ лише для суперадміна</div>';return; }
    await refresh();selectConfig();paint();
  };
  // ---------- Діючі проводки за операціями (перегляд + перехід до редагування) ----------
  const today0=()=>new Date().toISOString().slice(0,10);
  const accName=c=>{try{return nameOf(c)||''}catch{return ''}};
  const acc=c=>`${h(c)} <span class="mut">${h(accName(c))}</span>`;
  window.rbOpen=async(key,dt,kt)=>{
    state.scope='posting';state.key=key;await go('rulebook');
    if(dt&&kt)rbAddPair(dt,kt);
  };
  views.postingLogic=async()=>{
    if(!roleCheck()){$('#app').innerHTML='<div class="card err">Доступ лише для суперадміна</div>';return}
    const all=await api('rulebook?scope=posting'),t=today0();
    const act=all.filter(v=>v.status==='active').sort((a,b)=>(b.effective_from||'').localeCompare(a.effective_from||'')||b.id-a.id);
    const current=k=>act.find(v=>v.rule_key===k&&(v.effective_from||'')<=t);
    const planned=k=>act.filter(v=>v.rule_key===k&&(v.effective_from||'')>t);
    const cat=window.POSTING_CATALOG||[];
    const changed=cat.filter(b=>(current(b.key)?.config?.mappings||[]).length).length;
    const block=b=>{
      const v=current(b.key),maps=v?.config?.mappings||[],by=new Map(maps.map(m=>[m.from_debit+'|'+m.from_credit,m])),used=new Set(),pl=planned(b.key);
      const rows=b.rows.map(r=>{const m=by.get(r.dt+'|'+r.kt);if(m)used.add(r.dt+'|'+r.kt);
        return `<tr><td>${acc(r.dt)}</td><td>${acc(r.kt)}</td><td style="white-space:normal;min-width:160px">${h(r.txt)}</td><td>${m?`<b>Дт ${h(m.to_debit)} Кт ${h(m.to_credit)}</b> <span class="mut">версія #${v.id}</span>`:'<span class="mut">без змін</span>'}</td><td><button class="btn" onclick="rbOpen('${b.key}','${r.dt}','${r.kt}')">✎ Змінити</button></td></tr>`}).join('');
      const extra=maps.filter(m=>!used.has(m.from_debit+'|'+m.from_credit));
      return `<div class="card sc"><div class="rb-title"><h3>${h(b.title)}</h3><span class="rb-tag">${maps.length?'Є системні заміни: версія #'+v.id+' від '+h(v.effective_from):'Вбудована логіка'}</span></div>
        <p class="mut">${h(b.where)} · <code>${h(b.key)}</code></p>
        ${b.rows.length?`<table><thead><tr><th>Дебет</th><th>Кредит</th><th>Зміст</th><th>Діє зараз</th><th>Дії</th></tr></thead><tbody>${rows}</tbody></table>`:''}
        ${extra.length?`<p><b>Інші активні заміни цієї операції:</b></p><table><thead><tr><th>Було</th><th>Стало</th></tr></thead><tbody>${extra.map(m=>`<tr><td>Дт ${h(m.from_debit)} Кт ${h(m.from_credit)}</td><td><b>Дт ${h(m.to_debit)} Кт ${h(m.to_credit)}</b></td></tr>`).join('')}</tbody></table>`:''}
        ${pl.length?`<p class="err">Заплановано: ${pl.map(x=>'версія #'+x.id+' з '+h(x.effective_from)).join('; ')}</p>`:''}
        ${b.note?`<p class="mut">${h(b.note)}</p>`:''}
        <p><button class="btn" onclick="rbOpen('${b.key}')">Відкрити редактор правил цієї операції</button></p></div>`};
    $('#app').innerHTML=`<div class="card rb-panel"><div class="rb-title"><h2>Діючі проводки за операціями</h2><span class="rb-tag">Суперадміністратор</span></div>
      <p class="mut">Стан на ${h(t)}. Для кожної операції показано вбудовану кореспонденцію та системні заміни, які діють зараз. Операцій із замінами: <b>${changed}</b> з ${cat.length}. «Змінити» відкриває конструктор з уже підставленою парою; нова версія діє лише з наступного дня й не змінює проведені документи.</p></div>`+cat.map(block).join('');
  };
  if(!MENU.some(([k])=>k==='Сервіс суперадміна'))MENU.push(['Сервіс суперадміна',[['postingLogic','Діючі проводки за операціями'],['rulebook','Конструктор бухгалтерської логіки'],['ruleDiagnostics','Діагностика обліку']]]);
  if(typeof NOCO!=='undefined')NOCO.push('postingLogic','rulebook');
  if(typeof EXP!=='undefined')EXP.push('postingLogic');
})();
