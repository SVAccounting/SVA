// Analytics on both sides of a posting and analytical turnover by account and slot.
(function(){
 const safe=x=>esc(String(x??''));
 let slots=new Map(),refs={};
 const getSlots=async()=>{
   if(!company)return;
   const r=await api('account-subconto?company_id='+company.id);
   slots=new Map(r.map(x=>[x.account_code,x.slots]));
 };
 const suggested=async()=>{
  const kinds=['customer','supplier','wh','item','staff','bank'];
  const results=await Promise.all(kinds.map(k=>api(`refs?company_id=${company.id}&kind=${k}`).catch(()=>[])));
  refs=Object.fromEntries(kinds.map((k,i)=>[k,results[i]]));
 };
 const hints={counterparty:['customer','supplier'],warehouse:['wh'],item:['item'],staff:['staff'],bank:['bank']};
 window.subcontoFields=(side)=>{
  const el=document.getElementById(side==='d'?'dt':'kt');if(!el)return;
  const code=el.value,list=slots.get(code)||[],dest=document.getElementById('subconto_'+side);if(!dest)return;
  dest.innerHTML=list.length?`<fieldset class="subconto-fieldset"><legend>${side==='d'?'Дебет':'Кредит'} · ${safe(code)}</legend><div class="subconto-slots">${list.map((sl,i)=>{
    const values=(hints[sl.kind]||[]).flatMap(k=>refs[k]||[]).map(o=>o.name);
    return `<label>${safe(sl.label)}<input id="sx_${side}_${i}" list="sh_${side}_${i}" placeholder="${safe(sl.label)}" maxlength="180"><datalist id="sh_${side}_${i}">${[...new Set(values)].map(v=>`<option value="${safe(v)}"></option>`).join('')}</datalist></label>`;
  }).join('')}</div></fieldset>`:'<p class="mut">Для цього рахунку субконто не налаштовані.</p>';
 };
 const prevAdd=views.add;
 views.add=async()=>{
   await prevAdd();if(!company)return;
   await Promise.all([getSlots(),suggested()]);
   const row=document.getElementById('kt')?.closest('.row');if(!row)return;
   row.insertAdjacentHTML('afterend',`<div class="row"><div id="subconto_d"></div><div id="subconto_k"></div></div>`);
   for(const [side,id] of [['d','dt'],['k','kt']])document.getElementById(id).addEventListener('change',()=>subcontoFields(side));
   subcontoFields('d');subcontoFields('k');
 };
 window.readSubcontoInputs=side=>(slots.get(document.getElementById(side==='d'?'dt':'kt')?.value)||[])
   .map((_,i)=>document.getElementById(`sx_${side}_${i}`)?.value.trim()||'');
 const f=new Intl.DateTimeFormat('en-CA',{year:'numeric',timeZone:'Europe/Kyiv'});
 views.subconto=async()=>{
   if(!company){$('#app').innerHTML='<div class="card">Спочатку оберіть підприємство.</div>';return}
   await getSlots();const accountsWith=[...slots.entries()].filter(([,v])=>v.length);
   $('#app').innerHTML=`<div class="card"><h2>Обороти за субконто</h2>
     ${!accountsWith.length?'<p class="mut">Для вибраного підприємства ще не налаштовано субконто. Перейдіть до плану рахунків.</p>':''}
     <div class="row"><label>Рахунок<select id="sc_acc" onchange="subcontoSlotOptions()">${accountsWith.map(([code])=>`<option value="${safe(code)}">${safe(code)} — ${safe(nameOf(code))}</option>`).join('')}</select></label>
     <label>Аналітичний розріз<select id="sc_slot"></select></label>
     <label>З<input id="sc_from" type="date" value="${new Date().getFullYear()}-01-01"></label>
     <label>По<input id="sc_to" type="date" value="${new Date().toISOString().slice(0,10)}"></label></div>
     <p><button class="btn pri" onclick="subcontoTurnover()" ${accountsWith.length?'':'disabled'}>Сформувати</button></p>
     <div class="mut" id="sc_message"></div></div><div id="sc_result"></div>`;
   subcontoSlotOptions();if(accountsWith.length)subcontoTurnover();
 };
 window.subcontoSlotOptions=()=>{const code=$('#sc_acc')?.value;if(!code)return;
   $('#sc_slot').innerHTML=(slots.get(code)||[]).map((x,i)=>`<option value="${i+1}">${safe(x.label)}</option>`).join('')};
 window.subcontoTurnover=async()=>{
  const res=$('#sc_result'),msg=$('#sc_message');if(!$('#sc_acc')?.value)return;
  msg.textContent='';try{
   const qs=new URLSearchParams({company_id:company.id,account:$('#sc_acc').value,slot:$('#sc_slot').value,from:$('#sc_from').value,to:$('#sc_to').value});
   const values=await api('subconto-turnovers?'+qs.toString());
   const t=(n)=>fmt(Number(n)||0);
   res.innerHTML=`<div class="card sc"><table><thead><tr><th>Значення субконто</th><th class="n">Початкове сальдо</th><th class="n">Оборот Дт</th><th class="n">Оборот Кт</th><th class="n">Кінцеве сальдо</th></tr></thead><tbody>
      ${values.map(r=>`<tr><td>${safe(r.value)}</td><td class="n">${t(r.opening)}</td><td class="n">${t(r.debit)}</td><td class="n">${t(r.credit)}</td><td class="n">${t(r.closing)}</td></tr>`).join('')||'<tr><td colspan="5">Оборотів немає</td></tr>'}
      </tbody><tfoot><tr><td>Разом</td>${['opening','debit','credit','closing'].map(k=>`<td class="n">${t(values.reduce((n,x)=>n+Number(x[k]||0),0))}</td>`).join('')}</tr></tfoot></table></div>`;
  }catch(e){msg.textContent=e.message}
 };
 const menu=MENU.find(([name])=>name==='Звіти');if(menu&&!menu[1].some(([key])=>key==='subconto'))menu[1].push(['subconto','Обороти за субконто']);
 if(typeof TAB_MODULE!=='undefined')TAB_MODULE.subconto='reports';
})();
