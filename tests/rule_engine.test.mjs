import assert from 'node:assert/strict';
import {validatePosting,applyPosting,validateReport,evaluateReport} from '../netlify/functions/rule-engine.js';
import {REPORT_DEFAULTS} from '../netlify/functions/report-defaults.js';
import {REPORT_CODES} from '../netlify/functions/report-codes.js';
const p=validatePosting({mappings:[{from_debit:'361',from_credit:'702',to_debit:'361',to_credit:'701'}]});
const original=[{debit_acc:'361',credit_acc:'702',amount:150,description:'Дохід'},{debit_acc:'902',credit_acc:'281',amount:92}];
const changed=applyPosting(p,original);
assert.equal(changed[0].credit_acc,'701');assert.equal(changed[0].amount,150);
assert.equal(changed[1].credit_acc,'281');assert.equal(original[0].credit_acc,'702');
const arrayChanged=applyPosting(p,[['361','702',150]]);assert.deepEqual(arrayChanged,[['361','701',150]]);
assert.throws(()=>validatePosting({mappings:[p.mappings[0],p.mappings[0]]}),/двічі/);
assert.throws(()=>validatePosting({mappings:[{from_debit:'361',from_credit:'702',to_debit:'702',to_credit:'702'}]}),/однакові/);
const rep=validateReport({rows:{'1165':'A:301,311;-P:285','1300':'=1095+1195+1200'}},REPORT_CODES.F1A);
assert.equal(rep.rows['1165'],'A:301,311;-P:285');
assert.throws(()=>validateReport({rows:{'1165':'A:30,301'}},REPORT_CODES.F1A),/Перекриття/);
assert.throws(()=>validateReport({rows:{'1165':'=1195','1195':'=1165'}},REPORT_CODES.F1A),/Циклічне/);
// Account existence is checked in the API against the database's plan of accounts.
const balances=[{code:'301',closing:100},{code:'311',closing:200},{code:'285',closing:-25},{code:'44',closing:-100},{code:'791',closing:-50},{code:'702',closing:-500},{code:'902',closing:250}];
const start=evaluateReport(REPORT_DEFAULTS.F1A,{},balances,[]);
const next=evaluateReport(REPORT_DEFAULTS.F1A,{'1165':'A:301,311;-P:285'},balances,[]);
assert.equal(start['1165'],300);assert.equal(next['1165'],275);
const equity=evaluateReport(REPORT_DEFAULTS.F1P,{},balances,[]);
assert.equal(equity['1420'],100); // neither 79 nor unclosed classes 7–9 are added automatically
assert.ok(Object.keys(REPORT_DEFAULTS.F1A).length>40);
console.log('PASS: mapping, immutable source, report signs, multiple accounts, cycles, known default formulas');
