// Per-company 1..3 independent analytic dimensions for debit and credit.
export const SUBCONTO_KINDS={
 counterparty:'Контрагент',contract:'Договір',warehouse:'Склад',item:'Номенклатура',
 lot:'Партія',bank:'Банківський рахунок',staff:'Працівник',cost_center:'Центр витрат',
 project:'Проєкт',document:'Документ',free:'Інше значення'
};
export function cleanSlots(slots){
 if(!Array.isArray(slots)||slots.length>3)throw Error('Для рахунку дозволено не більше 3 субконто');
 const keys=new Set();
 return slots.map((s,i)=>{
  if(!s||typeof s!=='object'||!Object.hasOwn(SUBCONTO_KINDS,s.kind))throw Error('Невідомий тип субконто №'+(i+1));
  const label=String(s.label||SUBCONTO_KINDS[s.kind]).trim();
  if(!label||label.length>80||keys.has(s.kind))throw Error('Некоректне або повторене субконто №'+(i+1));
  keys.add(s.kind);return {kind:s.kind,label};
 });
}
export function valuesForSlots(slots,values=[],ctx={}){
 if(!Array.isArray(values)||values.length>3)throw Error('Не більше трьох значень субконто');
 const actual=[];
 for(let i=0;i<slots.length;i++){
  const template=values[i];
  if(template!==undefined && template!==null && typeof template!=='string')throw Error('Субконто повинне містити текстове значення');
  const auto=ctx[slots[i].kind];
  let value=String(template??'').trim();
  const placeholder=value.match(/^\{(counterparty|contract|warehouse|item|lot|bank|staff|cost_center|project|document)\}$/);
  if(placeholder)value=String(ctx[placeholder[1]]||'').trim();
  if(!value&&auto!==undefined)value=String(auto||'').trim();
  if(value.length>180)throw Error('Значення субконто занадто довге');
  actual.push(value);
 }
 if(values.slice(slots.length).some(v=>String(v||'').trim()))throw Error('Для рахунку не налаштовано це субконто');
 return actual;
}
