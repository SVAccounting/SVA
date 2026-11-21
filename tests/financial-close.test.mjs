import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFinancialClose} from '../netlify/functions/closing-logic.js';
function verify(balance, expectedProfit, expectedLines){
 const result=buildFinancialClose(Object.entries(balance).map(([code,opening])=>({code,balance:opening})));
 assert.equal(result.profit,expectedProfit);
 assert.equal(result.lines.length,expectedLines);
 const led={...balance};
 for(const l of result.lines){assert.ok(l.amount>0);led[l.debit_acc]=(led[l.debit_acc]||0)+l.amount;led[l.credit_acc]=(led[l.credit_acc]||0)-l.amount}
 for(const [code,sum] of Object.entries(led))if(/^(7|9)/.test(code)&&!/^8/.test(code))assert.ok(Math.abs(sum)<.005,`${code} balance ${sum}`);
 assert.equal((-Number((led['44']||0).toFixed(2))||0),expectedProfit);
}
test('only income',()=>verify({'702':-10000},10000,2));
test('income and expense',()=>verify({'702':-10000,'902':6000},4000,3));
test('net loss',()=>verify({'702':-5000,'902':7000},-2000,3));
test('preclosed 79',()=>verify({'791':-10000},10000,1));
test('contra-revenue 704',()=>verify({'702':-10000,'704':1000},9000,3));
test('already closed',()=>verify({'702':0,'791':0},0,0));
test('class 8 requires special handling',()=>{const p=buildFinancialClose([{code:'702',balance:-10000},{code:'81',balance:2000}]);assert.equal(p.unclosed8.length,1);});
test('no double-counting of 79 into 44 before posting',()=>{const p=buildFinancialClose([{code:'791',balance:-10000},{code:'702',balance:0}]);assert.equal(p.profit,10000);assert.deepEqual(p.lines.map(x=>[x.debit_acc,x.credit_acc]),[['791','44']]);});
test('legacy 79 close',()=>verify({'79':-9000},9000,1));
