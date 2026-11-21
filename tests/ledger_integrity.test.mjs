// Наскрізна перевірка проводок: ПДВ документа = ПДВ у проводках, Дт≠Кт, закриття фінрезультатів, баланс Ф1 (1300 = 1900).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { evaluateReport } from '../netlify/functions/rule-engine.js';
import { REPORT_DEFAULTS } from '../netlify/functions/report-defaults.js';

const root = new URL('..', import.meta.url).pathname;
const source = fs.readFileSync(root + 'netlify/functions/api.js', 'utf8');
const code = source.slice(source.indexOf('const r2 ='), source.indexOf('const lockCheck')) + source.slice(source.indexOf('async function buildDoc('), source.indexOf('export default async (req)'));

const items = new Map([
  [1, { id: 1, name: 'Товар', item_data: { uom_id: 1, unit: 'шт' }, type_data: { stock_acc: '281', cost_acc: '902', revenue_acc: '702', stockable: 'yes' } }],
  [3, { id: 3, name: 'Послуга', item_data: { uom_id: 1, unit: 'год' }, type_data: { stock_acc: '', cost_acc: '903', revenue_acc: '703', stockable: 'no' } }],
]);
function sql(strings, ...values) {
  const q = strings.join(' ');
  if (q.includes('FROM refs i LEFT JOIN refs t')) return Promise.resolve((values.find(Array.isArray) || []).map((x) => items.get(x)).filter(Boolean));
  if (q.includes('SELECT name FROM refs')) return Promise.resolve([{ name: 'Склад' }]);
  if (q.includes('SELECT 1 FROM stock_moves')) return Promise.resolve([]);
  if (q.includes('COALESCE(SUM(qty)')) return Promise.resolve([{ qty: 999 }]);
  if (q.includes('SELECT qty,amount FROM stock_moves') || q.includes('SELECT m.qty,m.amount FROM stock_moves')) return Promise.resolve([{ qty: 100, amount: 1000 }]); // 10 грн за одиницю
  throw Error(q.slice(0, 90));
}
const ctx = { sql, randomUUID: () => 'lot', validISODate: (d) => /^\d{4}-\d{2}-\d{2}$/.test(d), bad: (m) => new Error(m) };
vm.createContext(ctx); vm.runInContext(code, ctx);
const build = vm.runInContext('buildDoc', ctx), splitVat = vm.runInContext('splitVat', ctx);
const r2 = (n) => Math.round(n * 100) / 100;
const co = { id: 1, settings: { vat: true, rate: 20, inv: 'fifo', inv_scope: 'warehouse' } };

// 1. розподіл ПДВ: сума частин завжди дорівнює ПДВ від бази всього документа
for (const sums of [[1.03, 1.03, 1.03], [0.01, 0.01, 0.01], [10.05, 3.33, 7.77, 0.49], [100]]) {
  const parts = splitVat(sums, 0.2), want = r2(sums.reduce((a, b) => a + b, 0) * 0.2);
  assert.equal(r2(parts.reduce((a, b) => a + b, 0)), want, 'ПДВ ' + sums);
}

// 2. видаткова накладна та акт: сума проводок 361 збігається із сумою документа
const sale = await build(co, { type: 'sale', date: '2026-11-21', partner: 'Покупець', wh_id: 1,
  lines: [1, 2, 3].map(() => ({ item_id: 1, name: 'Товар', qty: 1, price: 1.03 })) }, null);
const sum361 = (b) => r2(b.ent.filter(([d]) => d === '361').reduce((s, [, , a]) => s + a, 0));
const vatOut = (b) => r2(b.ent.filter(([, k]) => k === '641').reduce((s, [, , a]) => s + a, 0));
assert.equal(sale.data.total, 3.71); assert.equal(sum361(sale), sale.data.total, 'Дт 361 = сума документа');
assert.equal(vatOut(sale), sale.data.vat, 'Кт 641 = ПДВ документа');
const act = await build(co, { type: 'act', date: '2026-11-21', partner: 'Замовник', lines: [1, 2, 3].map(() => ({ item_id: 3, name: 'Послуга', qty: 1, price: 1.03 })) }, null);
assert.equal(sum361(act), act.data.total); assert.equal(vatOut(act), act.data.vat);

// 3. Дт = Кт у касовому документі більше не губиться мовчки
await assert.rejects(() => build(co, { type: 'pko', date: '2026-11-21', sum: 100, corr: '301' }, null), /збігаються/);
const pko = await build(co, { type: 'pko', date: '2026-11-21', sum: 100, corr: '361' }, null);
assert.equal(JSON.stringify(pko.ent), JSON.stringify([['301', '361', 100]]));

// 4. ланцюжок операцій → закриття → баланс Форми №1
const ledger = [['311', '40', 100000]];
const add = (b) => ledger.push(...b.ent.filter(([d, k, a]) => a > 0 && d !== k));
const rcpt = await build(co, { type: 'rcpt', date: '2026-11-21', partner: 'Постачальник', wh_id: 1, lines: [{ item_id: 1, name: 'Товар', qty: 10, price: 20 }] }, null);
add(rcpt);
assert.equal(rcpt.data.total, 240);
add(await build(co, { type: 'bout', date: '2026-11-21', sum: 240, corr: '631' }, null));
add(sale); add(act);
add(await build(co, { type: 'bin', date: '2026-11-21', sum: sale.data.total + act.data.total, corr: '361' }, null));
// зарплата (як у payroll-post): 92/661, 661/641, 661/642, 92/651
ledger.push(['92', '661', 10000], ['661', '641', 1800], ['661', '642', 500], ['92', '651', 2200]);

const closeSrc = fs.readFileSync(root + 'public/closefin.js', 'utf8');
const cctx = { window: {}, views: {}, MENU: [['Операції', []]], fmt: (x) => String(x), TAB_MODULE: {} };
vm.createContext(cctx); vm.runInContext(closeSrc, cctx);
const closing = cctx.window.buildClosingEntries;
const balances = (lines) => { const m = new Map(); for (const [d, k, a] of lines) { m.set(d, (m.get(d) || 0) + a); m.set(k, (m.get(k) || 0) - a); } return [...m].map(([c, v]) => ({ code: c, name: c, closing: r2(v) })); };
const f1 = (rows) => evaluateReport({ ...REPORT_DEFAULTS.F1A, ...REPORT_DEFAULTS.F1P }, {}, rows, []);

// 98 «Податок на прибуток» має закриватися на 793, решта — за призначенням
ledger.push(['981', '641', 100]);
const closeLines = closing(balances(ledger)).lines;
assert(closeLines.some((l) => l.debit_acc === '793' && l.credit_acc === '981'), 'Дт 793 Кт 981');
assert(!closeLines.some((l) => l.credit_acc === '981' && l.debit_acc === '791'));
const afterRows = balances([...ledger, ...closeLines.map((l) => [l.debit_acc, l.credit_acc, l.amount])]);
for (const code of ['701', '702', '703', '902', '92', '981', '791', '792', '793']) assert(!afterRows.some((x) => x.code === code && Math.abs(x.closing) > 0.005), 'закрито ' + code);
const F = f1(afterRows);
assert(Math.abs(F['1300'] - F['1900']) < 0.005, `Баланс: актив ${F['1300']} ≠ пасив ${F['1900']}`);
assert(F['1300'] > 0);
console.log('PASS ledger integrity: VAT split, Дт≠Кт guard, closing 98→793, balance 1300 = 1900 (' + F['1300'].toFixed(2) + ')');

// 5. ЄСВ: фактичний дохід + окремо різниця до мінімальної зарплати; гранична база 20 / 15 МЗП
const calcEsv = vm.runInContext('calcEsv', ctx), MW = 8647;
let e = calcEsv({ gross: 5000, minWage: MW, rate: 22, capMw: 20, fullMain: true });
assert.equal(e.actual, 1100); assert.equal(e.topUpBase, 3647); assert.equal(e.topUp, 802.34); assert.equal(e.esv, 1902.34); assert.equal(e.base, MW);
e = calcEsv({ gross: 5000, minWage: MW, rate: 22, capMw: 20, fullMain: false });
assert.equal(e.esv, 1100); assert.equal(e.topUp, 0);
e = calcEsv({ gross: 300000, minWage: MW, rate: 22, capMw: 20, fullMain: true });
assert.equal(e.base, 172940); assert.equal(e.esv, 38046.8);
e = calcEsv({ gross: 300000, minWage: MW, rate: 22, capMw: 15, fullMain: true });
assert.equal(e.base, 129705); assert.equal(e.esv, 28535.1);
e = calcEsv({ gross: MW, minWage: MW, rate: 22, capMw: 20, fullMain: true });
assert.equal(e.topUp, 0); assert.equal(e.esv, 1902.34);

// 6. Списання ТМЦ: компенсуючі податкові зобов'язання (п. 198.5 ПКУ) від собівартості, один рядок на документ
const woLines = [{ item_id: 1, name: 'Товар', qty: 3, price: 0 }, { item_id: 1, name: 'Товар', qty: 2, price: 0 }];
const wo = await build(co, { type: 'wo', date: '2026-11-21', wh_id: 1, corr: '947', vat_comp: true, lines: woLines }, null);
const pairsOf = (b) => b.ent.filter(([, , a]) => a > 0).map(([d, k]) => d + '|' + k);
assert.equal(wo.data.total, 50); assert.equal(wo.data.vat_comp, 10);
assert.equal(wo.ent.filter(([d, k]) => d === '947' && k === '641').length, 1);
assert.equal(wo.ent.find(([d, k]) => d === '947' && k === '641')[2], 10);
const woPlain = await build(co, { type: 'wo', date: '2026-11-21', wh_id: 1, corr: '947', lines: woLines }, null);
assert(!pairsOf(woPlain).includes('947|641')); assert.equal(woPlain.data.vat_comp, 0);
const woNoVat = await build({ ...co, settings: { ...co.settings, vat: false } }, { type: 'wo', date: '2026-11-21', wh_id: 1, corr: '947', vat_comp: true, lines: woLines }, null);
assert(!pairsOf(woNoVat).includes('947|641'));

// 7. Каталог «діючих проводок» збігається з тим, що реально формує програма
const cat = (() => { const c = { window: {} }; vm.createContext(c); vm.runInContext(fs.readFileSync(root + 'public/posting-catalog.js', 'utf8'), c); return c.window.POSTING_CATALOG; })();
const { POSTING_KEYS } = await import('../netlify/functions/rule-engine.js');
for (const k of POSTING_KEYS) assert(cat.some((b) => b.key === k), 'немає у каталозі: ' + k);
const known = (key) => new Set(cat.find((b) => b.key === key).rows.map((r) => r.dt + '|' + r.kt));
const covered = (key, b) => { const set = known(key); for (const p of pairsOf(b)) assert(set.has(p), `${key}: пари ${p} немає в каталозі`); };
covered('doc:rcpt', rcpt); covered('doc:sale', sale); covered('doc:act', act); covered('doc:wo', wo);
covered('doc:pko', await build(co, { type: 'pko', date: '2026-11-21', sum: 1, corr: '311' }, null));
covered('doc:bout', await build(co, { type: 'bout', date: '2026-11-21', sum: 1, corr: '631' }, null));
console.log('PASS ESV (actual + minimum top-up, 20/15 MW cap), write-off VAT compensation, posting catalog coverage');
