// Superadmin service: versioned posting correspondence / financial-report formula builder.
// Only fixed declarative rules are saved. No arbitrary JavaScript or SQL is executed.
(function(){
  const POSTING=(window.POSTING_CATALOG||[]).map(b=>[b.key,b.title]);
  const REPORTS=[['F1A','Форма №1 — Актив'],['F1P','Форма №1 — Пасив'],['F2','Форма №2 — Фінансові результати']];
  const SOURCES={A:'Дебетове сальдо з урахуванням знака',P:'Кредитове сальдо з урахуванням знака',D:'Лише додатне дебетове сальдо',C:'Лише кредитове сальдо',K:'Кредитовий оборот мінус дебетовий',X:'Дебетовий оборот мінус кредитовий',E:'Дебетовий оборот',R:'Незакритий фінансовий результат'};
  let state={scope:'posting',key:(POSTING[0]||['doc:sale'])[0],versions:[],config:{mappings:[],additions:[]},draftId:null,dirty:false,previewed:false,activationDate:null};
  const keys=()=>state.scope==='posting'?POSTING:REPORTS;
  const rowDefs=()=>state.key==='F1A'?F1A:state.key==='F1P'?F1P:F2;
  const label=k=>([...POSTING,...REPORTS].find(x=>x[0]===k)||[])[1]||k;
  const h=(s)=>esc(s??'');
  // Calendar dates must follow the company's Ukrainian operating day, not UTC midnight.
  const localDay=()=>{const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const v=Object.fromEntries(parts.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));return v.year+'-'+v.month+'-'+v.day;};
  const dateTomorrow=()=>{const d=new Date(localDay()+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10)};
  const activeFor=()=>state.versions.filter(v=>v.scope===state.scope&&v.rule_key===state.key&&v.status==='active').sort((a,b)=>(b.effective_from||'').localeCompare(a.effective_from||'')||b.id-a.id)[0];
  const parseConfig=c=>JSON.parse(JSON.stringify(c|| (state.scope==='posting'?{mappings:[],additions:[]}:{rows:{}})));
  const roleCheck=()=>me?.role==='superadmin';

  async function refresh(){state.versions=await api('rulebook');}
  function selectConfig(){
    const v=activeFor();state.config=parseConfig(v?.config);
    state.draftId=null;state.dirty=false;state.previewed=false;state.note='';state.activationDate=dateTomorrow();
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
    const items=state.config.mappings||[];
    const extra=state.config.additions||[];
    const options=[['net','Сума без ПДВ'],['total','Повна сума документа'],['vat','Розрахований ПДВ'],['cost','Собівартість'],['lines_total','Сума базових проводок'],['fixed','Фіксована сума']];
    const extraRow=(a,i)=>`<div class="rb-extra-card"><div class="rb-extra-title"><b>Проводка №${i+1}</b><button class="btn" onclick="rbExtraRemove(${i})">× Видалити</button></div>
      <div class="rb-extra-grid"><label>Дебет<input inputmode="numeric" maxlength="4" value="${h(a.debit||'')}" oninput="rbExtraChange(${i},'debit',this.value)"></label>
      <label>Кредит<input inputmode="numeric" maxlength="4" value="${h(a.credit||'')}" oninput="rbExtraChange(${i},'credit',this.value)"></label>
      <label>Джерело суми<select onchange="rbExtraChange(${i},'basis',this.value)">${options.map(([v,n])=>`<option value="${v}" ${a.basis===v?'selected':''}>${n}</option>`).join('')}</select></label>
      <label>Множник / фіксована сума<input type="number" min="0.0001" step="0.0001" value="${h(a.factor??1)}" oninput="rbExtraChange(${i},'factor',this.value)"></label></div>
      <label>Суть операції<input maxlength="500" value="${h(a.description||'')}" oninput="rbExtraChange(${i},'description',this.value)"></label>
      <details><summary>Субконто цього рядка</summary><div class="rb-extra-grid">
        <label>Дебет (значення 1 | 2 | 3)<input value="${h((a.debit_subconto||[]).join(' | '))}" placeholder="{counterparty} | {contract}" oninput="rbExtraChange(${i},'debit_subconto',this.value)"></label>
        <label>Кредит (значення 1 | 2 | 3)<input value="${h((a.credit_subconto||[]).join(' | '))}" placeholder="{counterparty}" oninput="rbExtraChange(${i},'credit_subconto',this.value)"></label>
      </div></details></div>`;
    return `<div id="rb_mappings" class="rb-edit-list">${items.length?items.map(mapRow).join(''):'<p class="mut">Змін кореспонденцій немає.</p>'}</div>
      <button class="btn" onclick="rbAddMap()">+ Замінити кореспонденцію</button>
      <div class="rb-extra-section"><div class="rb-extra-head"><h3>Додаткові проводки документа</h3><button class="btn pri" onclick="rbExtraAdd()">+ Додати проводку</button></div>
      ${extra.map(extraRow).join('')||'<p class="mut">Можна додати до 30 проводок із власними сумами та субконто.</p>'}
      <p class="mut">Складські та податкові рахунки у додаткових проводках заблоковані: їх обчислюють модулі запасів і ПДВ.</p></div>`;
  }
  function mapRow(m,i){
    return `<div class="rb-editline"><div><strong>Дт ${h(m.from_debit)} · Кт ${h(m.from_credit)}</strong>
        ${m.from_debit!==m.to_debit||m.from_credit!==m.to_credit?`<span class="mut"> → Дт ${h(m.to_debit)} · Кт ${h(m.to_credit)}</span>`:''}
        <div class="rb-edit-desc">${h(m.description||'Без зміни змісту')}</div></div>
        <div class="rb-edit-actions"><button class="btn" onclick="rbEditMap(${i})">✎ Редагувати</button>
        <button class="btn" title="Прибрати зміну" onclick="rbRemoveMap(${i})">×</button></div></div>`;
  }
  function repaintDraft(){
    const note=document.querySelector('#rb_note');if(note)state.note=note.value;
    paint();
  }
  function editModal(idx,seed){
    let dlg=document.getElementById('rb_edit_dialog');
    if(!dlg){
      dlg=document.createElement('dialog');dlg.id='rb_edit_dialog';dlg.className='rb-edit-dialog';
      dlg.addEventListener('click',e=>{if(e.target===dlg)dlg.close()});document.body.appendChild(dlg);
    }
    const m=idx>=0?state.config.mappings[idx]:seed||{};
    dlg.dataset.index=String(idx);
    const field=(key,label,val,locked)=>`<div class="rb-dialog-field"><label for="rb_modal_${key}">${label}</label><input id="rb_modal_${key}" inputmode="numeric" maxlength="4" value="${h(val||'')}" ${locked?'readonly':''}></div>`;
    dlg.innerHTML=`<div class="rb-dialog-head"><h3>Редагування проводки</h3><button class="btn" type="button" onclick="rbModalClose()" aria-label="Закрити">×</button></div>
      <div class="rb-dialog-grid">${field('fd','Початковий дебет',m.from_debit,!!m.from_debit)}${field('fc','Початковий кредит',m.from_credit,!!m.from_credit)}
      ${field('td','Новий дебет',m.to_debit||m.from_debit,false)}${field('tc','Новий кредит',m.to_credit||m.from_credit,false)}</div>
      <label for="rb_modal_desc">Суть операції</label><textarea id="rb_modal_desc" rows="3" maxlength="500" placeholder="Наприклад: отримано оплату від покупця">${h(m.description??seed?.description??'')}</textarea>
      <div id="rb_modal_err" class="err" role="alert"></div>
      <div class="rb-dialog-buttons"><button class="btn" type="button" onclick="rbModalClose()">Скасувати</button><button class="btn pri" type="button" onclick="rbModalSave()">Зберегти зміни</button></div>`;
    if(typeof dlg.showModal==='function')dlg.showModal();else dlg.setAttribute('open','');
    setTimeout(()=>dlg.querySelector('#rb_modal_desc')?.focus(),0);
  }
  window.rbModalClose=()=>{const dlg=document.getElementById('rb_edit_dialog');if(dlg){if(typeof dlg.close==='function'&&dlg.open)dlg.close();else dlg.removeAttribute('open')}};
  window.rbModalSave=()=>{
    const dlg=document.getElementById('rb_edit_dialog');if(!dlg)return;
    const get=k=>dlg.querySelector('#rb_modal_'+k)?.value.trim()||'';
    const m={from_debit:get('fd'),from_credit:get('fc'),to_debit:get('td'),to_credit:get('tc'),description:get('desc')};
    const err=dlg.querySelector('#rb_modal_err');
    if(![m.from_debit,m.from_credit,m.to_debit,m.to_credit].every(v=>/^\d{1,4}$/.test(v))){err.textContent='Вкажіть коректні рахунки дебету й кредиту.';return}
    if(m.to_debit===m.to_credit){err.textContent='Дебет і кредит не можуть збігатися.';return}
    if(!m.description){err.textContent='Вкажіть суть операції.';return}
    const list=state.config.mappings||(state.config.mappings=[]),idx=Number(dlg.dataset.index);
    const prev=list.findIndex(x=>x.from_debit===m.from_debit&&x.from_credit===m.from_credit);
    if(prev>=0&&prev!==idx){err.textContent='Для цієї кореспонденції зміна вже існує.';return}
    const orig=catOf(state.key)?.rows.find(x=>x.dt===m.from_debit&&x.kt===m.from_credit)?.txt;
    const noChange=m.from_debit===m.to_debit&&m.from_credit===m.to_credit&&m.description===orig;
    if(idx>=0){if(noChange)list.splice(idx,1);else list[idx]=m}
    else if(!noChange)list.push(m);
    window.rbModalClose();rbDirty();repaintDraft();
  };
  window.rbExtraAdd=()=>{(state.config.additions||(state.config.additions=[])).push({debit:'',credit:'',basis:'net',factor:1,description:'',debit_subconto:[],credit_subconto:[]});rbDirty();repaintDraft()};
  window.rbExtraRemove=i=>{state.config.additions?.splice(i,1);rbDirty();repaintDraft()};
  window.rbExtraChange=(i,k,v)=>{const x=state.config.additions?.[i];if(!x)return;
    x[k]=['debit_subconto','credit_subconto'].includes(k)?(v.trim()?v.split('|').map(t=>t.trim()):[]):k==='factor'?Number(v):v;
    rbDirty();};
  window.rbAddMap=()=>editModal(-1,{from_debit:'',from_credit:'',to_debit:'',to_credit:'',description:''});
  window.rbEditMap=i=>{if(state.config.mappings?.[i])editModal(i,{})};
  window.rbRemoveMap=i=>{state.config.mappings?.splice(i,1);rbDirty();repaintDraft()};
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
  const TODAY=()=>localDay();
  const catOf=k=>(window.POSTING_CATALOG||[]).find(b=>b.key===k);
  const GROUP_OF={'doc:pko':'Каса і банк','doc:vko':'Каса і банк','doc:bin':'Каса і банк','doc:bout':'Каса і банк','doc:rcpt':'Склад і реалізація','doc:prod':'Склад і реалізація','doc:ost':'Склад і реалізація','doc:sale':'Склад і реалізація','doc:wo':'Склад і реалізація','doc:mv':'Склад і реалізація','doc:inv':'Документи','doc:act':'Документи','payroll:accrual':'Зарплата','payroll:payment:wage':'Зарплата','payroll:payment:pit':'Зарплата','payroll:payment:military':'Зарплата','payroll:payment:esv':'Зарплата','financial:close':'Закриття періоду'};
  const GROUP_ORDER=['Каса і банк','Склад і реалізація','Документи','Зарплата','Закриття періоду'];
  const currentOf=(scope,key)=>state.versions.filter(v=>v.scope===scope&&v.rule_key===key&&v.status==='active'&&(v.effective_from||'')<=TODAY()).sort((a,b)=>(b.effective_from||'').localeCompare(a.effective_from||'')||b.id-a.id)[0];
  // Published does not mean effective: a new version starts no earlier than tomorrow.
  // Show scheduled correspondence explicitly while keeping today's postings unchanged.
  const scheduledFor=(scope,key)=>{const v=state.versions.filter(x=>x.scope===scope&&x.rule_key===key&&x.status==='active'&&(x.effective_from||'')>TODAY())
    .sort((a,b)=>(a.effective_from||'').localeCompare(b.effective_from||'')||a.id-b.id)[0];return v||null};
  const pairKey=(d,k)=>d+'|'+k;
  const scheduledHint=(r,currentMap,nextMap,nextDate)=>{
    if(!nextMap)return '';
    const d=nextMap.to_debit||r.dt,k=nextMap.to_credit||r.kt,meaning=nextMap.description||r.txt;
    const currentD=currentMap?.to_debit||r.dt,currentK=currentMap?.to_credit||r.kt,currentMeaning=currentMap?.description||r.txt;
    if(d===currentD&&k===currentK&&meaning===currentMeaning)return '';
    return `<div class="rb-scheduled-hint">З ${h(nextDate)}: Дт ${h(d)} · Кт ${h(k)}${meaning!==currentMeaning?' — '+h(meaning):''}</div>`;
  };
  const changed=(scope,key)=>{const v=currentOf(scope,key);return !!v&&(scope==='posting'?((v.config?.mappings||[]).length>0||(v.config?.additions||[]).length>0):Object.keys(v.config?.rows||{}).length>0)};
  const navBtn=(scope,key,title)=>`<button class="rb-i${state.scope===scope&&String(state.key)===String(key)?' on':''}" data-t="${h(title.toLowerCase())}" onclick="rbPick('${scope}','${key}')"><span>${h(title)}</span>${changed(scope,key)?'<i class="rb-dot" title="Є системні зміни"></i>':''}</button>`;
  function rbNav(){
    const grp=(t,items,open)=>`<details class="rb-g"${open?' open':''}><summary>${h(t)} <span class="mut">${items.length}</span></summary>${items.join('')}</details>`;
    const posting=GROUP_ORDER.map(g=>grp(g,POSTING.filter(([k])=>GROUP_OF[k]===g).map(([k,n])=>navBtn('posting',k,n)),true));
    const rep=grp('Фінансова звітність',REPORTS.map(([k,n])=>navBtn('report',k,n)),true);
    const cats=[...new Set(TPL.map(t=>t[0]))];
    const typ=cats.map(c=>grp('Типові: '+c,TPL.map((t,i)=>t[0]===c?navBtn('tpl',i,t[1]):'').filter(Boolean),state.scope==='tpl'&&TPL[state.key]?.[0]===c));
    return `<aside class="rb-nav card"><input id="rb_find" placeholder="Знайти операцію…" oninput="rbFind(this.value)"><p class="rb-cap">Операції та форми</p>${posting.join('')}${rep}<p class="rb-cap">Типові операції (${TPL.length})</p>${typ.join('')}</aside>`;
  }
  function baseTable(){
    const b=catOf(state.key);if(!b)return '';
    if(!b.rows.length)return '<p class="mut">Бухгалтерські проводки для цієї форми не формуються.</p>';
    const maps=(currentOf('posting',state.key)?.config?.mappings)||[],by=new Map(maps.map(m=>[pairKey(m.from_debit,m.from_credit),m]));
    const upcoming=scheduledFor('posting',state.key),futureBy=new Map((upcoming?.config?.mappings||[]).map(m=>[pairKey(m.from_debit,m.from_credit),m]));
    const a=c=>`${h(c)} <span class="mut">${h(accName(c))}</span>`;
    return `<div class="rb-tbl"><table><thead><tr><th>Дебет</th><th>Кредит</th><th>Суть операції</th><th></th></tr></thead><tbody>${b.rows.map(r=>{const m=by.get(pairKey(r.dt,r.kt));
      return `<tr><td>${a(m?.to_debit||r.dt)}</td><td>${a(m?.to_credit||r.kt)}</td><td class="rb-meaning">${h(m?.description||r.txt)}${scheduledHint(r,m,futureBy.get(pairKey(r.dt,r.kt)),upcoming?.effective_from)}</td><td><button class="btn" onclick="rbAddPair('${r.dt}','${r.kt}')">✎ Змінити</button></td></tr>`}).join('')}</tbody></table></div>`;
  }
  function tplPane(){
    const t=TPL[Number(state.key)];if(!t)return '<div class="card">Операцію не знайдено</div>';
    const r=S().vat?S().rate/100:0,mul=f=>f===0.2||f==='vat'?'ПДВ (ставка)':f===1.2||f==='vatincl'?'сума з ПДВ':(f===1?'вся сума':'× '+Math.round(f*1000)/1000);
    return `<div class="card rb-panel"><div class="rb-title"><h2>${h(t[1])}</h2><span class="rb-tag">Типова операція · ${h(t[0])}</span></div>
      <p class="mut">Типова операція — це набір проводок, який бухгалтер вибирає в розділі «Операції → Типові операції». Її логіку змінюють у редакторі типових операцій (категорія, назва, рахунки Дт/Кт та множники суми).</p>
      <table><thead><tr><th>Дебет</th><th>Кредит</th><th>Від суми</th></tr></thead><tbody>${t[2].map(([d,k,f])=>`<tr><td>${h(d)} <span class="mut">${h(accName(d))}</span></td><td>${h(k)} <span class="mut">${h(accName(k))}</span></td><td>${mul(f)}</td></tr>`).join('')}</tbody></table>
      <p>${(window.TPL_DB||[]).length?`<button class="btn pri" onclick="tedOpenByName(TPL[${Number(state.key)}][1])">✎ Редагувати в редакторі типових операцій</button>`:`<button class="btn pri" onclick="go('typeditor')">Відкрити редактор типових операцій</button> <span class="mut">Вбудований набір спершу переноситься в редактор.</span>`}</p></div>`;
  }
  function publishPanel(){
    const when=state.activationDate||dateTomorrow();
    const now=when===TODAY();
    return `<section class="rb-publish-panel" aria-label="Збереження та активація правила">
      <div class="rb-publish-head"><h3>Зміни правила</h3><span id="rb_status" class="rb-save-status" aria-live="polite"></span></div>
      <div class="rb-publish-reason"><label for="rb_note">Причина зміни <span class="rb-required">*</span></label>
        <input id="rb_note" maxlength="500" value="${h(state.note||'')}" placeholder="Наприклад: уточнено субрахунок за Планом рахунків"></div>
      <div class="rb-publish-bottom">
        <div class="rb-date-block"><label for="rb_start">Дата початку дії</label>
          <input id="rb_start" type="date" min="${TODAY()}" value="${h(when)}" onchange="rbDateChanged()">
          <small id="rb_date_hint">${now?'Сьогодні — потрібно підтвердити паролем':'За замовчуванням — наступний день'}</small></div>
        <div class="rb-publish-buttons">
          <button class="btn rb-save-button" id="rb_save" onclick="rbSave()">1. Зберегти</button>
          <button class="btn rb-preview-button" id="rb_preview" onclick="rbPreview()">2. Перевірити</button>
          <button class="btn pri rb-activate-button" id="rb_activate" onclick="rbActivate()">3. Активувати${now?' сьогодні':''}</button>
        </div>
      </div>
      <div id="rb_message" aria-live="polite"></div><div id="rb_test"></div>
    </section>`;
  }
  window.rbDateChanged=()=>{
    const el=document.getElementById('rb_start');if(!el)return;
    state.activationDate=el.value;
    const today=state.activationDate===TODAY();
    const hint=document.getElementById('rb_date_hint');if(hint)hint.textContent=today?'Сьогодні — потрібно підтвердити паролем':'За замовчуванням — наступний день';
    const btn=document.getElementById('rb_activate');if(btn)btn.textContent='3. Активувати'+(today?' сьогодні':'');
  };
  function mainPane(){
    const b=catOf(state.key),active=activeFor(),title=b?.title||label(state.key),posting=state.scope==='posting';
    const scheduled=active&&(active.effective_from||'')>TODAY();
    return `<div class="card rb-panel"><div class="rb-title"><h2>${h(title)}</h2>${active?`<span class="rb-tag">${scheduled?'Запланована версія':'Чинна версія'} #${active.id}${scheduled?' · з '+h(active.effective_from):''}</span>`:''}</div>
      ${publishPanel()}
      ${posting?'':`<h3 class="rb-h">Формули звіту</h3>`}
      ${posting?baseTable():reportEditor()}
      ${posting?`<h3 class="rb-h">${scheduled?'Зміни, заплановані з '+h(active.effective_from):'Зміни кореспонденцій'}</h3>${postingEditor()}`:''}</div>
      <details class="card sc rb-hist"><summary><b>Історія версій</b> <span class="mut">(${state.versions.filter(v=>v.scope===state.scope&&v.rule_key===state.key).length})</span></summary><table><thead><tr><th>ID</th><th>Стан</th><th>Початок дії</th><th>Автор</th><th>Причина</th><th>Дія</th></tr></thead><tbody>${history()}</tbody></table></details>`;
  }
  function paint(){
    $('#app').innerHTML=`<h2 class="rb-page-title">Конструктор бухгалтерської логіки — глобальні правила</h2><div class="rb-shell">${rbNav()}<div class="rb-col">${state.scope==='tpl'?tplPane():mainPane()}</div></div>`;
    updateButtons();rbNames();
  }
  window.rbPick=(scope,key)=>{state.scope=scope;state.key=key;if(scope!=='tpl')selectConfig();paint();window.scrollTo({top:0,behavior:'smooth'})};
  window.rbFind=v=>{const q=String(v||'').trim().toLowerCase();document.querySelectorAll('.rb-g').forEach(g=>{let n=0;g.querySelectorAll('.rb-i').forEach(b=>{const ok=!q||b.dataset.t.includes(q);b.style.display=ok?'':'none';if(ok)n++});g.style.display=n?'':'none';if(q&&n)g.open=true})};
  window.rbNames=()=>(document.querySelectorAll?document.querySelectorAll('.rb-map-row'):[]).forEach(r=>{
    const v=c=>r.querySelector(c).value.trim(),t=(d,k)=>d||k?`Дт ${d||'?'} ${accName(d)} — Кт ${k||'?'} ${accName(k)}`:'';
    const nm=r.querySelector('.rb-nm');if(nm)nm.innerHTML=`<span class="mut">${h(t(v('.rb-fd'),v('.rb-fc')))}</span> <b>→</b> <span>${h(t(v('.rb-td'),v('.rb-tc')))}</span>`});
  window.rbAddPair=(dt,kt)=>{
    const idx=(state.config.mappings||[]).findIndex(m=>m.from_debit===dt&&m.from_credit===kt);
    const base=catOf(state.key)?.rows.find(r=>r.dt===dt&&r.kt===kt);
    editModal(idx,{from_debit:dt,from_credit:kt,to_debit:dt,to_credit:kt,description:base?.txt||''});
  };
  function rbMessage(msg,err=false){const box=$('#rb_message');if(box)box.innerHTML=`<p class="${err?'err':'mut'}">${h(msg)}</p>`};
  function collect(){
    if(state.scope==='posting')return {mappings:(state.config.mappings||[]).map(m=>({...m})),additions:(state.config.additions||[]).map(x=>({...x}))};
    return {rows:Object.fromEntries([...document.querySelectorAll('[data-code]')].map(el=>[el.dataset.code,el.value.trim()]).filter(x=>x[1]))};
  }
  window.rbSave=async()=>{
    try{const conf=collect(),note=$('#rb_note').value;
      state.note=note;const result=await api('rulebook/save',{method:'POST',body:{scope:state.scope,rule_key:state.key,config:conf,note}});
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
      state.previewed=true;updateButtons();rbMessage('Перевірено. Правило готове до активації.');
    }catch(e){state.previewed=false;updateButtons();rbMessage(e.message,true);box.innerHTML=''}
  };
  async function publishRule(eff,password){
    const payload={id:state.draftId,effective_from:eff};
    if(eff===TODAY())payload.password=password;
    await api('rulebook/activate',{method:'POST',body:payload});
    await refresh();selectConfig();paint();rbMessage('Версію активовано з '+eff+'. Раніше проведені записи не змінено.');
  }
  function showTodayPassword(eff){
    let dlg=document.getElementById('rb_today_dialog');
    if(!dlg){dlg=document.createElement('dialog');dlg.id='rb_today_dialog';dlg.className='rb-edit-dialog rb-auth-dialog';document.body.appendChild(dlg);}
    // Never retain a password between attempts or render it into the DOM as an attribute.
    const future=scheduledFor(state.scope,state.key);
    dlg.innerHTML=`<form method="dialog" onsubmit="rbConfirmToday(event)">
      <div class="rb-dialog-head"><h3>Активація сьогодні</h3><button type="button" class="btn" onclick="rbTodayClose()" aria-label="Закрити">×</button></div>
      <p class="rb-auth-info">Нова версія правила застосовуватиметься до наступних формувань з ${h(eff)}. Раніше збережені бухгалтерські записи не зміняться.</p>
      ${future?`<p class="rb-auth-warning">Увага: з ${h(future.effective_from)} уже заплановано іншу версію #${h(future.id)}. Вона замінить сьогоднішню.</p>`:''}
      <label for="rb_today_password">Пароль суперадміністратора</label>
      <input id="rb_today_password" type="password" autocomplete="current-password" maxlength="1024" required placeholder="Введіть ваш пароль">
      <div id="rb_today_error" role="alert" class="err" aria-live="polite"></div>
      <div class="rb-dialog-buttons"><button type="button" class="btn" onclick="rbTodayClose()">Скасувати</button>
        <button class="btn pri rb-activate-button" id="rb_today_submit" type="submit">Підтвердити активацію</button></div></form>`;
    dlg.dataset.effective=eff;
    if(typeof dlg.showModal==='function')dlg.showModal();else dlg.setAttribute('open','');
    dlg.querySelector('#rb_today_password')?.focus();
  }
  window.rbTodayClose=()=>{const dlg=document.getElementById('rb_today_dialog');if(!dlg)return;
    const field=dlg.querySelector('#rb_today_password');if(field)field.value='';
    if(typeof dlg.close==='function'&&dlg.open)dlg.close();else dlg.removeAttribute('open');};
  window.rbConfirmToday=async e=>{
    e?.preventDefault();const dlg=document.getElementById('rb_today_dialog');if(!dlg)return;
    const input=dlg.querySelector('#rb_today_password'),btn=dlg.querySelector('#rb_today_submit'),error=dlg.querySelector('#rb_today_error');
    const password=input?.value||'',eff=dlg.dataset.effective;
    if(input)input.value='';
    if(!password){error.textContent='Введіть пароль суперадміністратора.';return}
    btn.disabled=true;
    try{await publishRule(eff,password);rbTodayClose()}catch(ex){error.textContent=ex.message||'Не вдалося активувати правило.'}
    finally{btn.disabled=false}
  };
  window.rbActivate=async()=>{
    if(!state.draftId||!state.previewed)return;
    const eff=$('#rb_start')?.value;
    if(!eff || eff<TODAY()){rbMessage('Оберіть сьогодні або майбутню дату.',true);return}
    if(eff===TODAY()){showTodayPassword(eff);return}
    if(!confirm('Активувати правило #'+state.draftId+' з '+eff+' для всіх підприємств? Уже проведені записи не зміняться.'))return;
    try{await publishRule(eff)}catch(e){rbMessage(e.message,true)}
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
  const today0=()=>localDay();
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
    const block=b=>{
      const v=current(b.key),maps=v?.config?.mappings||[],by=new Map(maps.map(m=>[pairKey(m.from_debit,m.from_credit),m]));
      const upcoming=planned(b.key).sort((a,b)=>(a.effective_from||'').localeCompare(b.effective_from||'')||a.id-b.id)[0];
      const futureBy=new Map((upcoming?.config?.mappings||[]).map(m=>[pairKey(m.from_debit,m.from_credit),m]));
      const rows=b.rows.map(r=>{const m=by.get(pairKey(r.dt,r.kt));
        return `<tr><td>${acc(m?.to_debit||r.dt)}</td><td>${acc(m?.to_credit||r.kt)}</td><td class="rb-meaning">${h(m?.description||r.txt)}${scheduledHint(r,m,futureBy.get(pairKey(r.dt,r.kt)),upcoming?.effective_from)}</td><td><button class="btn" onclick="rbOpen('${b.key}','${r.dt}','${r.kt}')">✎ Змінити</button></td></tr>`}).join('');
      return `<div class="card sc rb-logic-block"><div class="rb-title"><h3>${h(b.title)}</h3></div>
        ${b.rows.length?`<div class="rb-tbl"><table><thead><tr><th>Дебет</th><th>Кредит</th><th>Суть операції</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`:'<p class="mut">Проводки не формуються.</p>'}</div>`;
    };
    $('#app').innerHTML=`<div class="rb-logic-list"><h2>Діючі проводки за операціями</h2>${cat.map(block).join('')}</div>`;
  };
  if(!MENU.some(([k])=>k==='Сервіс суперадміна'))MENU.push(['Сервіс суперадміна',[['postingLogic','Проводки поточного підприємства'],['rulebook','Глобальні правила та звіти'],['ruleDiagnostics','Діагностика обліку']]]);
  if(typeof NOCO!=='undefined')NOCO.push('postingLogic','rulebook');
  if(typeof EXP!=='undefined')EXP.push('postingLogic');
})();
