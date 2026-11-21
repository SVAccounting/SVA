const assert=require('node:assert/strict'),fs=require('fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../netlify/functions/api.js','utf8');
const code=source.slice(source.indexOf('const r2 ='),source.indexOf('const lockCheck')) + source.slice(source.indexOf('async function buildDoc('),source.indexOf('export default async (req)'));
const i=new Map([[1,{id:1,name:'Товар',item_data:{uom_id:1,unit:'шт'},type_data:{stock_acc:'281',cost_acc:'902',revenue_acc:'702',stockable:'yes'}}],
[2,{id:2,name:'Матеріали',item_data:{uom_id:1,unit:'кг'},type_data:{stock_acc:'201',cost_acc:'943',revenue_acc:'712',stockable:'yes'}}],
[3,{id:3,name:'Послуга',item_data:{uom_id:1,unit:'год'},type_data:{stock_acc:'',cost_acc:'903',revenue_acc:'703',stockable:'no'}}]]);
function sql(strings,...values){const q=strings.join(' ');
 if(q.includes('FROM refs i LEFT JOIN refs t'))return Promise.resolve((values.find(Array.isArray)||[]).map(x=>i.get(x)).filter(Boolean));
 if(q.includes('SELECT name FROM refs'))return Promise.resolve([{name:'Склад'}]);
 if(q.includes('SELECT 1 FROM stock_moves'))return Promise.resolve([]);
 if(q.includes('COALESCE(SUM(qty)'))return Promise.resolve([{qty:999}]);
 if(q.includes('SELECT qty,amount FROM stock_moves')||q.includes('SELECT m.qty,m.amount FROM stock_moves'))return Promise.resolve([{qty:999,amount:9990}]);
 throw Error(q.slice(0,90))}
const context={sql,randomUUID:()=> 'fresh-lot',validISODate:d=>/^\d{4}-\d{2}-\d{2}$/.test(d),bad:m=>new Error(m)};
vm.createContext(context);vm.runInContext(code,context);
const build=vm.runInContext('buildDoc',context);
(async()=>{
 const co={id:42,settings:{vat:false,inv:'fifo',inv_scope:'warehouse'}};
 const receipt=await build(co,{type:'rcpt',date:'2026-11-21',partner:'Постачальник',wh_id:1,lines:[{item_id:1,name:'Товар',qty:10,price:20},{item_id:2,name:'Матеріали',qty:5,price:30}]},null);
 assert(receipt.ent.some(([d,k,a])=>d==='281'&&k==='631'&&a===200));
 assert(receipt.ent.some(([d,k,a])=>d==='201'&&k==='631'&&a===150));
 assert(receipt.mv.every(m=>m.lot_key==='fresh-lot'));
 const sale=await build(co,{type:'sale',date:'2026-11-21',partner:'Покупець',wh_id:1,lines:[{item_id:1,name:'Товар',qty:3,price:40},{item_id:2,name:'Матеріали',qty:2,price:60}]},null);
 for(const [d,k] of [['902','281'],['943','201'],['361','702'],['361','712']])assert(sale.ent.some(l=>l[0]===d&&l[1]===k),d+' '+k);
 const act=await build(co,{type:'act',date:'2026-11-21',partner:'Замовник',lines:[{item_id:3,name:'Послуга',qty:2,price:600}]},null);
 assert(act.ent.some(([d,k,a])=>d==='361'&&k==='703'&&a===1200));
 await assert.rejects(()=>build(co,{type:'sale',date:'2026-11-21',partner:'Замовник',wh_id:1,lines:[{item_id:3,name:'Послуга',qty:2,price:600}]},null),/не є складськими запасами/);
 console.log('PASS mixed receipt account selection, sale COGS/revenue, service act and stockable validation');
})().catch(e=>{console.error(e);process.exitCode=1});
