import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../public/app2.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../public/theme.css',import.meta.url),'utf8');

function setup(){
  const account={code:'281',name:'Товари на складі',kind:'A',analytic_enabled:true,analytic_dimensions:'за ТМЦ',quantity_enabled:true,quantity_policy:'так'};
  const calls=[];
  const elements={app:{innerHTML:''},plan_dialog_host:{innerHTML:'',querySelector:()=>({showModal(){},close(){}})},plan_result_count:{textContent:''}};
  let slots=[{account_code:'281',slots:[{kind:'item',label:'Номенклатура'},{kind:'warehouse',label:'Склад'}]}];
  const context={console,Date,URL,Math,JSON,Set,Map,Number,Object,String,Array,
    views:{}, me:{role:'superadmin'},company:{id:17,name:'Тестове підприємство'},currentRights:{manager:true},
    accounts:[{...account}], document:{querySelector:s=>elements[s],getElementById:id=>elements[id],querySelectorAll:()=>[]},
    $:s=>elements[s.replace(/^#/,'')],
    esc:v=>String(v??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),
    OPT:(options,value)=>options.map(([v,l])=>`<option value="${v}"${v===value?' selected':''}>${l}</option>`).join(''),
    api:async (url,opt)=>{calls.push([url,opt]);if(url.startsWith('account-subconto?'))return slots;if(url==='accounts'&&opt?.method==='POST'){Object.assign(context.accounts[0],opt.body);return{ok:true}}
      if(url==='account-subconto'&&opt?.method==='POST'){slots=[{account_code:opt.body.account_code,slots:opt.body.slots}];return{ok:true}}
      if(url==='accounts')return context.accounts;throw new Error('Unexpected API '+url)},
    confirm:()=>true,toast:()=>{},scrollTo:()=>{},localStorage:{},window:{},
  };
  vm.createContext(context);vm.runInContext(source,context);
  return {context,elements,calls,account};
}

test('Таблиця прокручується окремо; форма додавання згорнута, пошук вгорі',async()=>{
  const {context,elements}=setup();await vm.runInContext('views.plan()',context);
  const html=elements.app.innerHTML;
  assert.match(html,/<details class="card plan-new-details" id="plan_new_details">/);
  assert.doesNotMatch(html,/<details class="card plan-new-details" id="plan_new_details" open/);
  assert.match(html,/<div class="plan-scroll"[^>]+aria-label="План рахунків з горизонтальним прокручуванням"/);
  assert.match(html,/id="plan_find"/);
  assert.match(html,/role="button" tabindex="0"/);
  assert.match(css,/#app \.plan-scroll\{overflow-x:auto!important/);
});

test('Картка рахунку містить всі його реквізити і локальні субконто',async()=>{
  const {context,elements}=setup();await vm.runInContext('views.plan()',context);
  vm.runInContext('openPlanAccount("281")',context);
  const html=elements.plan_dialog_host.innerHTML;
  assert.match(html,/281 · Товари на складі/);
  assert.match(html,/id="plan_edit_code" value="281" readonly/);
  assert.match(html,/id="plan_edit_kind"/);
  assert.match(html,/id="plan_edit_dimensions"/);
  assert.match(html,/id="plan_edit_policy"/);
  assert.match(html,/Тестове підприємство/);
  assert.match(html,/id="plan_modal_type_2"/);
});

test('Збереження лише субконто не змінює глобальні дані рахунку',async()=>{
  const {context,elements,calls}=setup();await vm.runInContext('views.plan()',context);
  Object.assign(elements,{
    plan_edit_code:{value:'281'},plan_edit_name:{value:'Товари на складі'},plan_edit_kind:{value:'A'},plan_edit_analytic:{value:'1'},plan_edit_quantity:{value:'1'},plan_edit_dimensions:{value:'за ТМЦ'},plan_edit_policy:{value:'так'},
    plan_modal_type_0:{value:'item'},plan_modal_label_0:{value:'Номенклатура'},
    plan_modal_type_1:{value:'warehouse'},plan_modal_label_1:{value:'Місце зберігання'},
    plan_modal_type_2:{value:''},plan_modal_label_2:{value:''},
    plan_modal_error:{textContent:''},plan_modal_save:{disabled:false}
  });
  await vm.runInContext('savePlanAccount()',context);
  assert.equal(calls.filter(([path,opts])=>path==='accounts'&&opts?.method==='POST').length,0);
  const locals=calls.filter(([path,opts])=>path==='account-subconto'&&opts?.method==='POST');
  assert.equal(locals.length,1);assert.equal(locals[0][1].body.company_id,17);
  assert.equal(locals[0][1].body.slots[1].label,'Місце зберігання');
});

test('Пошук відсіює рахунки та показує підрахунок',async()=>{
  const {context,elements}=setup();await vm.runInContext('views.plan()',context);
  const rows=[{dataset:{search:'281 товари на складі'},hidden:false},{dataset:{search:'311 поточні рахунки'},hidden:false}];
  context.document.querySelectorAll=()=>rows;
  vm.runInContext('planSearch("311")',context);
  assert.equal(rows[0].hidden,true);assert.equal(rows[1].hidden,false);
  assert.match(elements.plan_result_count.textContent,/1 із 1/);
});
