// ProOblik 2026: довідник у Neon. Вбудовані 468 перевірених записів — лише резерв до міграції.
(function(){
  const E=v=>esc(String(v??'')),FALLBACK=TPL.map((t,i)=>({category:t[0],name:t[1],lines:t[2].map(l=>({debit_acc:l[0],credit_acc:l[1],mode:'one',k:1})),...TPL_META[i],is_active:true}));
  const MODES={one:'Введена сума',vat:'ПДВ за ставкою підприємства',incl:'Сума + ПДВ',k:'Власний коефіцієнт'};
  const statusText={approved:'Підтверджений',review:'Потребує обґрунтування',duplicate:'Дублікат'};
  const familyText={balanced:'Подвійний запис',offbalance:'Позабалансовий запис',transfer:'Аналітичне переміщення'};
  const isSuper=()=>me&&(me.role==='superadmin'||me.role==='teacher');
  let ROWS=[],ONLY_ACTIVE=false;
  window.TPL_DB=[];
  const tokens=l=>l.mode==='vat'?'vat':l.mode==='incl'?'vatincl':l.mode==='k'?l.k:1;
  const lookupMeta=r=>({id:r.id,source_uid:r.source_uid,family:r.family||'balanced',review_status:r.review_status||'approved',note:r.note||'',source_page:r.source_page||'',source_status:r.source_status||''});
  window.loadTypicalOps=async()=>{
    const rows=await api('typical-ops');
    window.TPL_DB=rows;
    TPL.length=0;TPL_META.length=0;
    if(!rows.length){FALLBACK.forEach(r=>{TPL.push([r.category,r.name,r.lines.map(l=>[l.debit_acc,l.credit_acc,1])]);TPL_META.push(lookupMeta(r))});return}
    rows.forEach(r=>{TPL.push([r.category,r.name,r.lines.map(l=>[l.debit_acc,l.credit_acc,tokens(l)])]);TPL_META.push(lookupMeta(r))});
  };
  const accountsFor=()=>accounts.map(a=>`<option value="${E(a.code)}">${E(a.code)} — ${E(a.name)}</option>`).join('');
  const lineRow=l=>`<div class="ted-line"><select class="td-d"><option value="">Дт або прихід…</option>${accountsFor()}</select><select class="td-k"><option value="">Кт або списання…</option>${accountsFor()}</select><select class="td-m">${Object.entries(MODES).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select><input class="td-c" type="number" step="0.001" min="0.001" value="1" style="display:none;width:100px"><button class="btn" type="button" onclick="this.parentNode.remove();tedPreview()" title="Прибрати рядок">×</button></div>`;
  function readForm(){
    return {id:Number($('#ted_id').value)||null,category:$('#ted_cat').value.trim(),name:$('#ted_name').value.trim(),
      family:$('#ted_family').value,review_status:$('#ted_status').value,is_active:$('#ted_active').checked,note:$('#ted_note').value.trim(),
      lines:[...document.querySelectorAll('#ted_lines .ted-line')].map(el=>({debit_acc:el.querySelector('.td-d').value,credit_acc:el.querySelector('.td-k').value,mode:el.querySelector('.td-m').value,k:Number(el.querySelector('.td-c').value)||1})).filter(l=>l.debit_acc||l.credit_acc)};
  }
  window.tedAddLine=(l={})=>{
    const container=$('#ted_lines');container.insertAdjacentHTML('beforeend',lineRow(l));
    const el=container.lastElementChild;
    el.querySelector('.td-d').value=l.debit_acc||'';el.querySelector('.td-k').value=l.credit_acc||'';
    el.querySelector('.td-m').value=l.mode||'one';el.querySelector('.td-c').value=l.k||1;
    el.querySelectorAll('select,input').forEach(input=>input.addEventListener(input.tagName==='INPUT'?'input':'change',()=>{el.querySelector('.td-c').style.display=el.querySelector('.td-m').value==='k'?'':'none';tedPreview()}));
    el.querySelector('.td-c').style.display=l.mode==='k'?'':'none';tedPreview();
  };
  window.tedPreview=()=>{
    const box=$('#ted_pv');if(!box)return;
    const f=readForm(),rate=S().vat?Number(S().rate)/100:0;
    box.innerHTML=f.lines.map(l=>{
      const m=l.mode==='vat'?rate:l.mode==='incl'?1+rate:l.mode==='k'?l.k:1;
      return `<div>${E(f.family==='offbalance'?(l.debit_acc?'Прихід ':'Списання '):'Дт ')}${E(l.debit_acc||l.credit_acc)}${f.family!=='offbalance'?' — Кт '+E(l.credit_acc):''}: <b>${fmt(1000*m)}</b></div>`;
    }).join('')||'<span class="mut">Додайте рядки операції</span>';
    const tip=$('#ted_family_note');if(tip)tip.textContent=f.family==='transfer'?'Аналітичні переміщення оформлюйте документом переміщення між складами; звичайна проводка Дт=Кт не створюється.':f.family==='offbalance'?'Тільки один рахунок: Дт — прихід, Кт — списання. Облік ведеться в окремому позабалансовому журналі.':'';
  };
  window.tedEdit=(id,copy=false)=>{
    const o=ROWS.find(x=>x.id===id)||{category:'',name:'',family:'balanced',review_status:'approved',is_active:true,note:'',lines:[{}]};
    $('#ted_form').style.display='';$('#ted_title').textContent=id&&!copy?'Редагування операції':'Нова типова операція';
    $('#ted_id').value=id&&!copy?id:'';$('#ted_cat').value=o.category;$('#ted_name').value=copy?o.name+' (варіант)':o.name;
    $('#ted_family').value=o.family||'balanced';$('#ted_status').value=copy?'approved':(o.review_status||'approved');$('#ted_active').checked=copy?true:o.is_active!==false;$('#ted_note').value=o.note||'';
    $('#ted_source').textContent=o.source_uid?`Джерело: ${o.source_uid} · сторінки Інструкції: ${o.source_page||'—'} · ${o.source_status||''}`:'Створено у ProOblik';
    $('#ted_lines').innerHTML='';(o.lines?.length?o.lines:[{}]).forEach(tedAddLine);$('#ted_msg').textContent='';
    $('#ted_form').scrollIntoView({behavior:'smooth',block:'start'});
  };
  window.tedSave=async()=>{try{await api('typical-ops',{method:'POST',body:readForm()});await loadTypicalOps();await go('typeditor')}catch(e){$('#ted_msg').textContent=e.message}};
  window.tedDel=async id=>{const o=ROWS.find(x=>x.id===id);if(!o||!confirm(`Архівувати шаблон «${o.name}»? Проведені записи залишаться без змін.`))return;
    try{await api('typical-ops/'+id,{method:'DELETE'});await loadTypicalOps();await go('typeditor')}catch(e){alert(e.message)}};
  window.tedFind=()=>paintList();window.tedShowAll=()=>{ONLY_ACTIVE=!$('#ted_all').checked;paintList()};
  function paintList(){
    const dest=$('#ted_list');if(!dest)return;const q=($('#ted_find')?.value||'').trim().toLowerCase();
    const rows=ROWS.filter(r=>(!ONLY_ACTIVE||r.is_active)&&(r.name+' '+r.category+' '+(r.source_uid||'')+' '+r.lines.map(l=>l.debit_acc+' '+l.credit_acc).join(' ')).toLowerCase().includes(q));
    const groups=[...new Set(rows.map(x=>x.category))];
    dest.innerHTML=groups.map(c=>`<div class="card ted-cat"><h3>${E(c)} <span class="mut">(${rows.filter(r=>r.category===c).length})</span></h3>${rows.filter(r=>r.category===c).map(r=>`<div class="ted-op"><div><b>${E(r.name)}</b><div class="mut">${E(r.source_uid||'Авторський шаблон')} · ${E(familyText[r.family]||'Подвійний запис')} · ${r.lines.map(l=>E(l.debit_acc||'—')+' / '+E(l.credit_acc||'—')).join('; ')}</div>${r.is_active?'':`<div class="mut">Вимкнено · ${E(statusText[r.review_status]||'Архів')}</div>`}</div><div class="ted-act"><button class="btn" onclick="tedEdit(${r.id})">✎ Редагувати</button><button class="btn" onclick="tedEdit(${r.id},true)">⧉ Копія</button>${r.is_active?`<button class="btn" onclick="tedDel(${r.id})">Архівувати</button>`:''}</div></div>`).join('')}</div>`).join('')||'<div class="card mut">Операцій за фільтром немає</div>';
    $('#ted_counter').textContent=`Показано ${rows.length} із ${ROWS.length}`;
  }
  window.tedOpenByName=async name=>{await go('typeditor');const o=ROWS.find(x=>x.name===name&&x.is_active);if(o)tedEdit(o.id)};
  views.typeditor=async()=>{
    if(!isSuper()){$('#app').innerHTML='<div class="card err">Доступ лише для суперадміністратора</div>';return}
    ROWS=await api('typical-ops?all=1');ONLY_ACTIVE=false;
    $('#app').innerHTML=`<div class="card"><div class="rb-title"><h2>Довідник типових операцій · Neon</h2><span class="rb-tag">Суперадміністратор</span></div><p class="mut">472 вихідні записи, серед них 30 позабалансових і 4 аналітичні переміщення. Вимкнені дублікати та спірні кореспонденції збережені для перегляду. Історичні записи журналу не змінюються.</p><div class="row"><button class="btn pri" onclick="tedEdit()">+ Нова операція</button><input id="ted_find" placeholder="Пошук за назвою, Дт/Кт, ID" oninput="tedFind()"><label><input type="checkbox" id="ted_all" checked onchange="tedShowAll()" style="width:auto"> Показати архівні</label></div><p id="ted_counter" class="mut"></p></div>
    <div class="card" id="ted_form" style="display:none"><h3 id="ted_title"></h3><input type="hidden" id="ted_id"><p class="mut" id="ted_source"></p>
    <div class="row"><div><label>Категорія</label><input id="ted_cat"></div><div><label>Назва операції</label><input id="ted_name"></div><div><label>Тип запису</label><select id="ted_family" onchange="tedPreview()"><option value="balanced">Подвійний запис Дт/Кт</option><option value="offbalance">Позабалансовий прихід/списання</option><option value="transfer">Аналітичне переміщення</option></select></div></div>
    <div class="row"><div><label>Перевірка</label><select id="ted_status"><option value="approved">Підтверджений</option><option value="review">Потрібне обґрунтування</option><option value="duplicate">Дублікат</option></select></div><div><label>Активний шаблон</label><label><input type="checkbox" id="ted_active" style="width:auto"> Відображати в операціях</label></div></div><label>Пояснення, обмеження, обґрунтування</label><textarea id="ted_note" rows="2" style="width:100%"></textarea>
    <p class="mut" id="ted_family_note"></p><div id="ted_lines"></div><p><button class="btn" onclick="tedAddLine()">+ Рядок</button></p><h4>Попередній перегляд для суми 1000 грн</h4><div id="ted_pv"></div><p class="err" id="ted_msg"></p><button class="btn pri" onclick="tedSave()">Зберегти</button> <button class="btn" onclick="$('#ted_form').style.display='none'">Скасувати</button></div><div id="ted_list"></div>`;
    paintList();
  };
  views.offbalance=async()=>{
    const rows=await api('offbalance-entries?company_id='+company.id);
    $('#app').innerHTML=`<div class="card"><h2>Позабалансовий журнал</h2><p class="mut">Простий запис приходу/списання, не входить в оборотно-сальдову відомість за подвійним записом.</p><button class="btn" onclick="go('tpl')">До типових операцій</button></div><div class="card sc"><table><thead><tr><th>Дата</th><th>Документ</th><th>Операція</th><th>Рахунок</th><th>Тип</th><th>Сума</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${E(String(r.date).slice(0,10))}</td><td>${E(r.doc)}</td><td>${E(r.description)}</td><td>${E(r.account_code)}</td><td>${r.direction==='in'?'Прихід':'Списання'}</td><td>${fmt(r.amount)}</td></tr>`).join('')||'<tr><td colspan="6" class="mut">Записів немає</td></tr>'}</tbody></table></div>`;
  };
  views.correspondences291=async()=>{
    if(!isSuper())throw Error('Лише для суперадміністратора');
    const rows=await api('correspondences-291');
    $('#app').innerHTML=`<div class="card"><h2>Кореспонденції рахунків · Інструкція № 291</h2><p class="mut">${rows.length} унікальних пар синтетичних рахунків. Це довідкові кореспонденції, а не готові господарські операції на рівні субрахунків. Їх наявність не підтверджує правильності будь-якої довільної операції.</p><input id="corr_find" placeholder="Пошук за Дт, Кт або джерелом" oninput="corr291Find(this.value)"></div><div class="card sc"><table><thead><tr><th>ID</th><th>Дт</th><th>Кт</th><th>Сторінки</th><th>Джерело</th></tr></thead><tbody>${rows.map(r=>`<tr class="corr-row" data-t="${E((r.source_uid+' '+r.debit_acc+' '+r.credit_acc+' '+r.source_entry).toLowerCase())}"><td>${E(r.source_uid)}</td><td>${E(r.debit_acc)}</td><td>${E(r.credit_acc)}</td><td>${E(r.source_pages)}</td><td>${E(r.source_entry)}</td></tr>`).join('')}</tbody></table></div>`;
  };
  window.corr291Find=q=>{const s=String(q||'').toLowerCase().trim();document.querySelectorAll('.corr-row').forEach(el=>el.style.display=el.dataset.t.includes(s)?'':'none')};
  const g=MENU.find(m=>m[0]==='Сервіс суперадміна');
  if(g&&!g[1].some(([k])=>k==='typeditor')){const i=g[1].findIndex(([k])=>k==='rulebook');g[1].splice(i<0?g[1].length:i+1,0,['typeditor','Редактор типових операцій'])}
  if(typeof TAB_MODULE!=='undefined')TAB_MODULE.offbalance='entries';
  const other=MENU.find(m=>m[0]==='Операції')||MENU.find(m=>m[1].some(([k])=>k==='tpl'));
  if(other&&!other[1].some(([k])=>k==='offbalance'))other[1].push(['offbalance','Позабалансовий журнал']);
  if(g&&!g[1].some(([k])=>k==='correspondences291'))g[1].push(['correspondences291','Кореспонденції № 291']);
  if(typeof NOCO!=='undefined')NOCO.push('typeditor','correspondences291');
})();
