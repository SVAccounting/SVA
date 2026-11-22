// Посадові особи з довідника «Персонал»: формат підпису «посада — місце для підпису — Ім’я ПРІЗВИЩЕ».
(function(root){
  // ПІБ у довіднику вводиться як «Прізвище Ім’я По батькові» → «Ім’я ПРІЗВИЩЕ»
  const fio=n=>{const p=String(n||'').trim().split(/\s+/).filter(Boolean);if(!p.length)return '';return p.length===1?p[0].toUpperCase():p[1]+' '+p[0].toUpperCase()};
  const E=v=>(typeof esc==='function'?esc(v):String(v));
  root.fio=fio;
  root.STAFF=root.STAFF||[];
  // свіжий список персоналу (щоб підпис відображав актуальні ПІБ і посади з довідника, а не застарілу копію з налаштувань)
  root.loadStaff=async()=>{try{if(typeof company!=='undefined'&&company&&company.id)root.STAFF=await api(`refs?company_id=${company.id}&kind=staff`)}catch(e){}return root.STAFF};
  // key: head | chief_accountant | finance_director | hr_head — як у налаштуваннях підприємства
  root.officer=(st,key,label)=>{
    st=st||{};const p=(root.STAFF||[]).find(x=>String(x.id)===String(st[key+'_staff']));
    return {pos:(p&&p.data&&p.data.pos)||st[key+'_pos']||label,name:fio((p&&p.name)||st[key+'_name']||'')};
  };
  const BLANK='______________';
  const ROLE_KEY={'Керівник':'head','Директор':'head','Головний бухгалтер':'chief_accountant'};
  // блок підпису для форм звітності: посада, місце для підпису, ініціали
  root.sigLine=(st,key,label)=>{const o=root.officer(st,key,label);
    return `<div class="sigrow"><span class="sigpos">${E(o.pos)}</span><span class="sigl">${BLANK}</span><span class="signame">${E(o.name||'____________________')}</span></div><div class="sigcap"><span>(посада)</span><span>(підпис)</span><span>(Ім’я ПРІЗВИЩЕ)</span></div>`};
  // комірки підписів для первинних документів
  root.sigCells=(st,roles)=>roles.map(r=>{const k=ROLE_KEY[r];
    if(!k)return `<td>${E(r)}: ${BLANK}</td>`;const o=root.officer(st,k,r);
    return `<td><b>${E(o.pos)}</b> ${BLANK} ${E(o.name||'____________________')}</td>`}).join('');
})(window);
