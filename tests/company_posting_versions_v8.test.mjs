import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const apiCode=fs.readFileSync(new URL('../netlify/functions/api.js',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../MIGRATE_V8_LOCAL_POSTING_VERSIONS.sql',import.meta.url),'utf8');
const uiCode=fs.readFileSync(new URL('../public/posting-baseline-ui.js',import.meta.url),'utf8');
const today=()=>{const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const g=k=>p.find(x=>x.type===k).value;return `${g('year')}-${g('month')}-${g('day')}`};
const tomorrow=()=>{const d=new Date(today()+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10)};
const old='2026-01-01';
const instances=[
 {id:1,company_id:21,source:'doc:bin',from_debit:'311',from_credit:'40',to_debit:'311',to_credit:'401',description:'Внесок до статутного капіталу',effective_from:old,reason:'Уточнення кореспонденції рахунків',author:'Суперадміністратор'},
 {id:2,company_id:21,source:'doc:bin',from_debit:'311',from_credit:'40',to_debit:'311',to_credit:'402',description:'Стара запланована редакція',effective_from:tomorrow(),reason:'Нова редакція локальної проводки',author:'Суперадміністратор'},
 {id:3,company_id:21,source:'doc:bin',from_debit:'311',from_credit:'40',to_debit:'311',to_credit:'46',description:'Внесок до неоплаченого капіталу',effective_from:tomorrow(),reason:'Нова редакція локальної проводки',author:'Суперадміністратор'}
];
function makeUI(){
  const app={innerHTML:''};const dialogs={};
  const doc={getElementById:id=>id==='app'?app:(dialogs[id]||null),createElement:tag=>({tagName:tag,dataset:{},open:false,showModal(){this.open=true},close(){this.open=false},innerHTML:''}),body:{appendChild(el){const id=el.id;dialogs[id]=el}}};
  const ctx={document:doc,me:{role:'superadmin'},company:{id:21,name:'Підприємство А'},
    POSTING_CATALOG:undefined,views:{},window:null,api:async()=>[],
    esc:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),
    nameOf:c=>'Рахунок '+c,alert:()=>{},console,Date,Intl,encodeURIComponent};
  ctx.window=ctx;ctx.POSTING_CATALOG=[{key:'doc:bin',title:'Надходження на рахунок',rows:[{dt:'311',kt:'40',txt:'Внесок'}]}];
  ctx.api=async path=>{
   if(path.startsWith('posting-baseline'))return {locked:true,rows:[]};
   if(path.startsWith('rulebook'))return [];
   if(path.startsWith('company-posting-versions'))return ctx.company.id===21?instances:[];
   throw Error('Unexpected '+path)
  };
  ctx.$=s=>s==='#app'?app:null;
  vm.runInNewContext(uiCode,ctx,{filename:'posting-baseline-ui.js'});
  return {ctx,app,dialogs};
}
test('Два підприємства: лише вибране бачить локальну зміну; завтра окремо',async()=>{
 const {ctx,app}=makeUI();
 await ctx.views.postingLogic();
 assert.match(app.innerHTML,/Підприємство А/);
 assert.match(app.innerHTML,/>401<\/b>/);
 assert.match(app.innerHTML,new RegExp(`З ${tomorrow()}:`));
 assert.match(app.innerHTML,/>Дт 311 · Кт 46<\/b>/);
 ctx.company={id:22,name:'Підприємство Б'};
 await ctx.views.postingLogic();
 assert.match(app.innerHTML,/Підприємство Б/);
 assert.doesNotMatch(app.innerHTML,/З \d{4}-\d{2}-\d{2}: <b>Дт 311/);
 assert.match(app.innerHTML,/>40<\/b>/);
});
test('Редактор: фіксована область поточного підприємства, завтра, причина, історія',async()=>{
 const {ctx,dialogs}=makeUI();await ctx.views.postingLogic();
 ctx.pbOpenEdit('doc:bin','311','40');
 const d=dialogs.pb_dialog;
 assert.equal(d.open,true);
 assert.match(d.innerHTML,/Лише підприємство: Підприємство А/);
 assert.match(d.innerHTML,/Уточнення кореспонденції рахунків/);
 assert.match(d.innerHTML,new RegExp(tomorrow()));
 assert.match(d.innerHTML,/value="46"/);
 ctx.pbClose();
 ctx.pbShowHistory('doc:bin','311','40');
 assert.match(dialogs.pb_history_dialog.innerHTML,/Внесок до неоплаченого капіталу/);
 assert.match(dialogs.pb_history_dialog.innerHTML,/Внесок до статутного капіталу/);
});
test('Серверна локальність, незмінність версій, посилання в журналі, захист ПДВ/FIFO',()=>{
 assert.match(apiCode,/WHERE company_id=\$\{cid\} AND source=\$\{source\} AND effective_from<=\$\{at\}::date/);
 assert.match(apiCode,/localBy\.get\(key\)\|\|globalBy\.get\(key\)\|\|baseBy\.get\(key\)/);
 assert.match(apiCode,/start!==tomorrow/);
 assert.match(apiCode,/dbRole!=='superadmin'/);
 assert.match(apiCode,/Переназначення рахунків ПДВ/);
 assert.match(apiCode,/Зміна рахунку запасів/);
 assert.match(apiCode,/company_posting_version_id/);
 assert.match(migration,/BEFORE UPDATE OR DELETE ON company_posting_versions/);
 assert.match(migration,/REFERENCES companies\(id\)/);
});
