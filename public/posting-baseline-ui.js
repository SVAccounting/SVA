// ProOblik v8: one versioned editor directly in the main posting table.
// LOCAL ONLY. No global changes, no destructive baseline edits, no changes to posted entries.
(function(){
 const E=x=>esc(String(x??''));
 const pair=(d,k)=>String(d)+'|'+String(k);
 const ukToday=()=>{const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const g=k=>p.find(x=>x.type===k)?.value||'';return `${g('year')}-${g('month')}-${g('day')}`};
 const tomorrow=()=>{const d=new Date(ukToday()+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10)};
 let baseline=[],globalRules=[],localVersions=[],catalog=[];
 let loadedCompany=null;
 const latest=(arr,day)=>arr.filter(v=>v.effective_from<=day).sort((a,b)=>b.effective_from.localeCompare(a.effective_from)||b.id-a.id)[0]||null;
 const future=(arr,day)=>arr.filter(v=>v.effective_from>day).sort((a,b)=>a.effective_from.localeCompare(b.effective_from)||b.id-a.id)[0]||null;
 const forOriginal=(key,d,k)=>{
   const local=localVersions.filter(v=>v.source===key&&v.from_debit===d&&v.from_credit===k);
   const global=globalRules.filter(v=>v.status==='active'&&v.rule_key===key);
   const base=baseline.find(v=>v.source===key&&v.from_debit===d&&v.from_credit===k);
   const resolve=(date)=>{
     const loc=latest(local,date);
     if(loc)return {to_debit:loc.to_debit,to_credit:loc.to_credit,description:loc.description,local:loc};
     const ver=latest(global,date),map=ver?.config?.mappings?.find(x=>x.from_debit===d&&x.from_credit===k);
     return map||base||null;
   };
   const nextLocal=future(local,ukToday());
   const nextGlobal=future(global,ukToday());
   const globalMap=nextGlobal?.config?.mappings?.find(x=>x.from_debit===d&&x.from_credit===k);
   const upcoming=nextLocal||(!latest(local,nextGlobal?.effective_from||ukToday())&&globalMap?{...globalMap,effective_from:nextGlobal.effective_from}:null);
   return {current:resolve(ukToday()),upcoming,history:local};
 };
 const modal=()=>{let dlg=document.getElementById('pb_dialog');if(!dlg){dlg=document.createElement('dialog');dlg.id='pb_dialog';dlg.className='rb-edit-dialog pb-v8-modal';document.body.appendChild(dlg)}return dlg};
 window.pbClose=()=>{const dlg=document.getElementById('pb_dialog');if(dlg?.open)dlg.close()};
 const original=(source,d,k)=>catalog.find(x=>x.key===source)?.rows.find(x=>x.dt===d&&x.kt===k);
 window.pbOpenEdit=(source,d,k)=>{
   if(!company||company.id!==loadedCompany){alert('Спочатку оберіть підприємство.');return;}
   const r=original(source,d,k);if(!r){alert('Початкову проводку не знайдено.');return}
   const effect=forOriginal(source,d,k),active=effect.upcoming||effect.current||{};
   const dlg=modal();dlg.dataset.source=source;dlg.dataset.d=d;dlg.dataset.k=k;dlg.dataset.cid=String(company.id);
   dlg.innerHTML=`<div class="rb-dialog-head"><h3>Змінити типову проводку</h3><button class="btn" type="button" onclick="pbClose()" aria-label="Закрити">×</button></div>
     <div class="pb-scope"><b>Лише підприємство: ${E(company.name)}</b><small>Інші підприємства не зміняться</small></div>
     <div class="pb-original">Початкова кореспонденція: <b>Дт ${E(d)} — Кт ${E(k)}</b></div>
     <div class="rb-dialog-grid"><div class="rb-dialog-field"><label for="pb_dt">Новий дебет</label><input id="pb_dt" maxlength="4" value="${E(active.to_debit||d)}" inputmode="numeric"></div>
     <div class="rb-dialog-field"><label for="pb_kt">Новий кредит</label><input id="pb_kt" maxlength="4" value="${E(active.to_credit||k)}" inputmode="numeric"></div></div>
     <label for="pb_desc">Суть господарської операції</label><textarea id="pb_desc" rows="3" maxlength="500">${E(active.description||r.txt||'')}</textarea>
     <div class="rb-dialog-grid"><div class="rb-dialog-field"><label for="pb_date">Початок дії</label><input id="pb_date" type="date" value="${tomorrow()}" readonly></div>
     <div class="rb-dialog-field"><label>Область застосування</label><div class="pb-readonly">${E(company.name)}</div></div></div>
     <label for="pb_reason">Причина зміни</label><textarea id="pb_reason" rows="2" maxlength="500">Уточнення кореспонденції рахунків</textarea>
     <div id="pb_err" class="err" role="alert" aria-live="polite"></div>
     <div class="rb-dialog-buttons"><button class="btn" type="button" onclick="pbClose()">Скасувати</button>
       <button class="btn pri pb-primary-action" type="button" id="pb_submit" onclick="pbSave()">Зберегти й активувати з ${tomorrow()}</button></div>`;
   dlg.showModal?.();
 };
 window.pbSave=async()=>{
   const dlg=modal(),btn=dlg.querySelector('#pb_submit'),error=dlg.querySelector('#pb_err');
   if(!dlg.open)return;
   if(!company||String(company.id)!==dlg.dataset.cid){error.textContent='Підприємство змінилося. Відкрийте редактор заново.';return}
   btn.disabled=true;error.textContent='';
   try{
     const b={company_id:company.id,source:dlg.dataset.source,from_debit:dlg.dataset.d,from_credit:dlg.dataset.k,
       to_debit:dlg.querySelector('#pb_dt').value.trim(),to_credit:dlg.querySelector('#pb_kt').value.trim(),
       description:dlg.querySelector('#pb_desc').value.trim(),reason:dlg.querySelector('#pb_reason').value.trim(),effective_from:dlg.querySelector('#pb_date').value};
     await api('company-posting-versions',{method:'POST',body:b});pbClose();await views.postingLogic();
     const notice=document.getElementById('pb_notice');if(notice)notice.textContent='Редакцію збережено лише для «'+company.name+'». Набуде чинності '+b.effective_from+'.';
   }catch(e){error.textContent=e.message||'Не вдалося зберегти зміну.'}finally{btn.disabled=false}
 };
 window.pbShowHistory=(source,d,k)=>{
   const r=original(source,d,k),records=localVersions.filter(v=>v.source===source&&v.from_debit===d&&v.from_credit===k).sort((a,b)=>b.effective_from.localeCompare(a.effective_from)||b.id-a.id);
   let dlg=document.getElementById('pb_history_dialog');if(!dlg){dlg=document.createElement('dialog');dlg.id='pb_history_dialog';dlg.className='rb-edit-dialog pb-v8-modal';document.body.appendChild(dlg)}
   dlg.innerHTML=`<div class="rb-dialog-head"><h3>Історія версій</h3><button class="btn" type="button" onclick="pbCloseHistory()" aria-label="Закрити">×</button></div>
     <div class="pb-scope"><b>${E(company.name)}</b><small>${E(r?.txt||'')} · початкова Дт ${E(d)} — Кт ${E(k)}</small></div>
     ${records.length?`<div class="sc"><table class="pb-history-table"><thead><tr><th>Діє з</th><th>Дт / Кт</th><th>Автор і причина</th></tr></thead><tbody>${records.map(v=>`<tr><td>${E(v.effective_from)}</td><td><b>${E(v.to_debit)} / ${E(v.to_credit)}</b><small>${E(v.description)}</small></td><td>${E(v.author)}<small>${E(v.reason)}</small></td></tr>`).join('')}</tbody></table></div>`:'<p class="mut">Локальних версій ще немає — використовується початкова або глобальна проводка.</p>'}
     <div class="rb-dialog-buttons"><button class="btn" type="button" onclick="pbCloseHistory()">Закрити</button></div>`;
   dlg.showModal?.();
 };
 window.pbCloseHistory=()=>{const dlg=document.getElementById('pb_history_dialog');if(dlg?.open)dlg.close()};
 views.postingLogic=async()=>{
   if(me?.role!=='superadmin'){$('#app').innerHTML='<div class="card err">Доступ лише для суперадміністратора</div>';return;}
   if(!company){$('#app').innerHTML='<div class="card">Оберіть підприємство.</div>';return;}
   const selected=company.id;
   const [base,rules,local]=await Promise.all([
     api('posting-baseline?company_id='+encodeURIComponent(selected)),
     api('rulebook?scope=posting'),
     api('company-posting-versions?company_id='+encodeURIComponent(selected))
   ]);
   if(!company||company.id!==selected)return;
   loadedCompany=selected;baseline=base.rows||[];globalRules=rules||[];localVersions=local||[];catalog=window.POSTING_CATALOG||[];
   const makeBlock=c=>`<div class="card rb-logic-block"><h3>${E(c.title)}</h3>${c.rows.length?`<div class="sc"><table class="pb-main-table"><thead><tr><th>Дебет</th><th>Кредит</th><th>Суть операції</th><th>Керування</th></tr></thead><tbody>
     ${c.rows.map(r=>{const {current,upcoming,history}=forOriginal(c.key,r.dt,r.kt),dt=current?.to_debit||r.dt,kt=current?.to_credit||r.kt;
       const plan=upcoming?`<div class="pb-future">З ${E(upcoming.effective_from)}: <b>Дт ${E(upcoming.to_debit)} · Кт ${E(upcoming.to_credit)}</b>${upcoming.description?` — ${E(upcoming.description)}`:''}</div>`:'';
       return `<tr><td><b>${E(dt)}</b><small>${E(nameOf(dt))}</small></td><td><b>${E(kt)}</b><small>${E(nameOf(kt))}</small></td><td>${E(current?.description||r.txt)}${plan}</td>
         <td><div class="pb-row-actions"><button class="btn pri" type="button" onclick="pbOpenEdit('${c.key}','${r.dt}','${r.kt}')">Змінити</button>
         <button class="btn" type="button" onclick="pbShowHistory('${c.key}','${r.dt}','${r.kt}')">Історія${history.length?' · '+history.length:''}</button></div></td></tr>`}).join('')}
     </tbody></table></div>`:'<p class="mut">Бухгалтерські проводки для цього документа не формуються.</p>'}</div>`;
   $('#app').innerHTML=`<div class="card pb-v8-head"><div><h2>Типові проводки за документами</h2><p>Підприємство: <b>${E(company.name)}</b></p></div><div class="pb-v8-tag">Локальні версії · активація завтра</div></div>
     <p class="pb-feedback" id="pb_notice" role="status" aria-live="polite"></p>
     <div class="rb-logic-list">${catalog.map(makeBlock).join('')}</div>`;
 };
})();
