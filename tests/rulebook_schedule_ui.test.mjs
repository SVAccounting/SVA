import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const today = new Date();
const tomorrow = new Date(today);
tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
const effective = tomorrow.toISOString().slice(0,10);
const versions = [
  { id: 1, scope:'posting', rule_key:'doc:bin', status:'active', effective_from:'2020-01-01', config:{ mappings:[] } },
  { id: 2, scope:'posting', rule_key:'doc:bin', status:'active', effective_from:effective,
    config:{ mappings:[{from_debit:'311',from_credit:'40',to_debit:'311',to_credit:'401',description:'Надійшов внесок до статутного капіталу'}] } },
];
const app = { innerHTML:'' };
const context = {
  console, Date, setTimeout,
  me:{role:'superadmin'},
  POSTING_CATALOG:[{key:'doc:bin',title:'Банківська виписка: надходження', rows:[{dt:'311',kt:'40',txt:'Надійшов внесок'}]}],
  TPL:[],MENU:[],NOCO:[],EXP:[],views:{},
  document:{querySelector:()=>null,querySelectorAll:()=>[]},
  $:selector=>selector==='#app'?app:null,
  api:async () => versions,
  esc:value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;'),
  nameOf:c=>c==='40'?'Зареєстрований капітал':c==='401'?'Статутний капітал':'Поточні рахунки',
  F1A:[],F1P:[],F2:[],
};
context.window=context;
vm.createContext(context);
vm.runInContext(readFileSync(new URL('../public/rulebook.js',import.meta.url),'utf8'),context);
await context.views.rulebook();
assert.match(app.innerHTML,/Зареєстрований капітал/,'Current table should keep the effective old correspondence');
assert.match(app.innerHTML,/Запланована версія/,'Editor should identify future publication');
assert.ok(app.innerHTML.includes(`З ${effective}: Дт 311 · Кт 401`),'Upcoming posting should be visible in the current table');
await context.views.postingLogic();
assert.ok(app.innerHTML.includes(`З ${effective}: Дт 311 · Кт 401`),'Read-only listing should also display future correspondence');
console.log('PASS: scheduled 311/401 is clearly visible while 311/40 remains effective today.');
