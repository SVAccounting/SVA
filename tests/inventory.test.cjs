const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const code=fs.readFileSync(__dirname+'/../netlify/functions/api.js','utf8');
const start=code.indexOf('const r2 =');const end=code.indexOf('const lockCheck',start);
const build=code.slice(code.indexOf('async function buildDoc('),code.indexOf('export default async (req)'));
const inventory=new Map([
 [1,{id:1,name:'Крем',item_data:{uom_id:1,unit:'шт'},type_data:{stock_acc:'281',cost_acc:'902',revenue_acc:'702',stockable:'yes'}}],
 [2,{id:2,name:'Матеріали',item_data:{uom_id:1,unit:'шт'},type_data:{stock_acc:'201',cost_acc:'943',revenue_acc:'712',stockable:'yes'}}],
 [3,{id:3,name:'Роботи',type_data:{stock_acc:'',cost_acc:'903',revenue_acc:'703',stockable:'no'}}]
]);
const history=[{qty:10,amount:1000},{qty:20,amount:2400}];
function makeSql(){return async(strings,...values)=>{
 const t=strings.join(' ');
 if(t.includes('FROM refs i LEFT JOIN refs t'))return [...(Array.isArray(values.at(-1))?values.at(-1):values.find(Array.isArray)||[])].map(id=>inventory.get(id)).filter(Boolean);
 if(t.includes('SELECT name FROM refs'))return[{name:'Склад'}];
 if(t.includes('SELECT 1 FROM stock_moves'))return[];
 if(t.includes('COALESCE(SUM(qty)'))return[{qty:20}];
 if(t.includes('SELECT m.qty,m.amount FROM stock_moves m LEFT JOIN docs d'))return history;
 if(t.includes('SELECT qty,amount FROM stock_moves')){
   if(t.includes('lot_key='))return[{qty:20,amount:2400}];
   return[{qty:20,amount:2400}];
 }
 throw Error('Unmocked SQL '+t.slice(0,120));
}}
async function execute(method,scope,opts={}){
 const sandbox={sql:makeSql(),randomUUID:()=>'lot-fresh',console,validISODate:d=>/^\d{4}-\d{2}-\d{2}$/.test(d),bad:m=>new Error(m)};
 vm.createContext(sandbox);
 vm.runInContext(code.slice(start,code.indexOf('const lockCheck'))+build,sandbox);
 const c={id:1,settings:{inv:method,inv_scope:scope,vat:false}};
 return vm.runInContext('buildDoc',sandbox)(c,{type:'sale',date:'2026-11-21',partner:'Покупець',wh_id:2,lines:[{item_id:1,name:'Крем',qty:2,price:150,lot_key:opts.lot||''}]},null);
}
(async()=>{
 const sample=[['fifo','warehouse',240],['fifo','company',200],['avg','warehouse',240],['avg','company',226.67],['spec','warehouse',240]];
 for(const [m,s,expected] of sample){
 const r=await execute(m,s,m==='spec'?{lot:'batch-02'}:{});
 assert.equal(r.data.lines[0].cost,expected, m+' '+s);
 assert.equal(r.mv[0].a,-expected);
 assert.equal(r.ent.find(x=>x[0]==='902'&&x[1]==='281')[2],expected);
 console.log('PASS',m,s,expected);
 }
 console.log('5 cost scenarios PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
