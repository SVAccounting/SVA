import { POSTING_KEYS, REPORT_KEYS, validatePosting, validateReport, applyPosting, evaluateReport } from './rule-engine.js';
import { REPORT_CODES } from './report-codes.js';
import { REPORT_DEFAULTS } from './report-defaults.js';
import { neon } from '@neondatabase/serverless';
import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';

const sql = neon(process.env.DATABASE_URL);
const SECRET = process.env.AUTH_SECRET || '';
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json' } });
const fail = (m, s = 400) => json({ error: m }, s);
export const config = { path: '/api/*' };

const sign = (p) => createHmac('sha256', SECRET).update(p).digest('base64url');
const makeToken = (u) => {
  const p = Buffer.from(JSON.stringify({ id: u.id, role: u.role, name: u.name, exp: Date.now() + 7 * 864e5 })).toString('base64url');
  return p + '.' + sign(p);
};
function readToken(req) {
  const [p, s] = (req.headers.get('authorization') || '').replace('Bearer ', '').split('.');
  if (!p || !s) return null;
  const a = Buffer.from(s), b = Buffer.from(sign(p));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const u = JSON.parse(Buffer.from(p, 'base64url').toString());
  return u.exp > Date.now() ? u : null;
}
const hash = (pw, salt) => scryptSync(pw, salt, 32).toString('hex');
const norm = (ls) => ls.map((l) => `${l.debit_acc}|${l.credit_acc}|${Number(l.amount).toFixed(2)}`).sort();
const validLines = (ls) => Array.isArray(ls) && ls.length > 0 && ls.length <= 100 && ls.every((l) => {
  const amount = Number(l.amount);
  return typeof l.debit_acc === 'string' && typeof l.credit_acc === 'string'
    && l.debit_acc.trim() && l.credit_acc.trim() && l.debit_acc !== l.credit_acc
    && Number.isFinite(amount) && amount > 0 && Math.abs(Math.round(amount * 100) - amount * 100) < 1e-7
    && amount <= 9999999999999.99;
});
const validISODate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) && new Date(d + 'T00:00:00Z').toISOString().slice(0,10) === d;

const r2 = (n) => Math.round(n * 100) / 100;
const bad = (m) => Object.assign(new Error(m), { status: 400 });
const INITIAL_INVENTORY_REFS = [{"kind": "item_type", "name": "Товари", "data": {"code": "goods", "stock_acc": "281", "cost_acc": "902", "revenue_acc": "702", "stockable": "yes"}}, {"kind": "item_type", "name": "Готова продукція", "data": {"code": "finished", "stock_acc": "26", "cost_acc": "901", "revenue_acc": "701", "stockable": "yes"}}, {"kind": "item_type", "name": "Сировина та матеріали", "data": {"code": "material", "stock_acc": "201", "cost_acc": "943", "revenue_acc": "712", "stockable": "yes"}}, {"kind": "item_type", "name": "МШП", "data": {"code": "mhsp", "stock_acc": "22", "cost_acc": "943", "revenue_acc": "712", "stockable": "yes"}}, {"kind": "item_type", "name": "Тара та тарні матеріали", "data": {"code": "packing_material", "stock_acc": "204", "cost_acc": "943", "revenue_acc": "712", "stockable": "yes"}}, {"kind": "item_type", "name": "Тара під товарами", "data": {"code": "packing_goods", "stock_acc": "284", "cost_acc": "902", "revenue_acc": "702", "stockable": "yes"}}, {"kind": "item_type", "name": "Роботи", "data": {"code": "work", "stock_acc": "", "cost_acc": "903", "revenue_acc": "703", "stockable": "no"}}, {"kind": "item_type", "name": "Послуги", "data": {"code": "service", "stock_acc": "", "cost_acc": "903", "revenue_acc": "703", "stockable": "no"}}, {"kind": "item_type", "name": "Набір (готовий товар без комплектування)", "data": {"code": "kit", "stock_acc": "281", "cost_acc": "902", "revenue_acc": "702", "stockable": "yes"}}, {"kind": "uom", "name": "Штука", "data": {"code": "шт"}}, {"kind": "uom", "name": "Кілограм", "data": {"code": "кг"}}, {"kind": "uom", "name": "Грам", "data": {"code": "г"}}, {"kind": "uom", "name": "Літр", "data": {"code": "л"}}, {"kind": "uom", "name": "Метр", "data": {"code": "м"}}, {"kind": "uom", "name": "Квадратний метр", "data": {"code": "м²"}}, {"kind": "uom", "name": "Кубічний метр", "data": {"code": "м³"}}, {"kind": "uom", "name": "Упаковка", "data": {"code": "уп"}}, {"kind": "uom", "name": "Послуга", "data": {"code": "посл"}}, {"kind": "uom", "name": "Година", "data": {"code": "год"}}, {"kind": "price_type", "name": "Роздрібна", "data": {"code": "retail"}}, {"kind": "price_type", "name": "Оптова", "data": {"code": "wholesale"}}, {"kind": "price_type", "name": "Дилерська", "data": {"code": "dealer"}}];
const DTYPES = ['pko', 'vko', 'bin', 'bout', 'rcpt', 'prod', 'ost', 'sale', 'wo', 'mv', 'inv', 'act'];
// собівартість вибуття: ФІФО (шари надходжень) або середньозважена; null — недостатньо залишку
function outCost(moves, qty, method) {
  const have = moves.reduce((s, m) => s + m.qty, 0);
  if (qty > have + 1e-9) return null;
  if (method === 'avg') return r2((moves.reduce((s, m) => s + m.amount, 0) / have) * qty);
  const layers = [];
  for (const m of moves) {
    if (m.qty > 0) layers.push({ q: m.qty, u: m.amount / m.qty });
    else { let n = -m.qty; while (n > 1e-9 && layers.length) { const L = layers[0], t = Math.min(L.q, n); L.q -= t; n -= t; if (L.q < 1e-9) layers.shift(); } }
  }
  let need = qty, c = 0;
  for (const L of layers) { const t = Math.min(L.q, need); c += t * L.u; need -= t; if (need < 1e-9) break; }
  return r2(c);
}

// ПДВ нараховується від бази всього документа (а не окремо за кожним рядком). Щоб проводки збігалися із сумою
// документа до копійки, різницю округлення відносимо на рядок із найбільшою базою.
function splitVat(sums, rate) {
  const total = r2(sums.reduce((s, x) => s + x, 0) * rate);
  const parts = sums.map((x) => r2(x * rate));
  const diff = r2(total - parts.reduce((s, x) => s + x, 0));
  if (diff !== 0 && parts.length) {
    let k = 0; sums.forEach((x, i) => { if (x > sums[k]) k = i; });
    parts[k] = r2(parts[k] + diff);
  }
  return parts;
}
// ЄСВ роботодавця. Спершу ЄСВ на фактичний дохід (не вище граничної бази = capMw × мінімальна зарплата;
// 20 МЗП у загальному випадку, 15 МЗП для окремих категорій), далі — за ознакою основного місця роботи й повного
// місяця — ЄСВ на різницю між мінімальною зарплатою та доходом.
function calcEsv({ gross, minWage, rate, capMw, fullMain }) {
  const cap = r2(minWage * capMw);
  const actualBase = Math.min(gross, cap);
  const actual = r2(actualBase * rate / 100);
  const topUpBase = fullMain && gross < minWage ? r2(minWage - gross) : 0;
  const topUp = r2(topUpBase * rate / 100);
  return { esv: r2(actual + topUp), base: r2(actualBase + topUpBase), actual, topUp, topUpBase, cap };
}
// Типова операція: рядки проводок із множником від введеної суми.
// mode: 'one' — вся сума, 'vat' — ПДВ за ставкою підприємства, 'incl' — сума з ПДВ (1 + ставка), 'k' — власний коефіцієнт.
function cleanTypicalOp(b) {
  const category=String(b.category||'').trim(),name=String(b.name||'').trim();
  const family=['balanced','transfer','offbalance'].includes(b.family)?b.family:'balanced';
  const review_status=['approved','review','duplicate'].includes(b.review_status)?b.review_status:'approved';
  const is_active=b.is_active!==false;
  const note=String(b.note||'').trim().slice(0,2000);
  if(category.length<2||category.length>120)throw bad('Категорія: від 2 до 120 символів');
  if(name.length<3||name.length>250)throw bad('Назва: від 3 до 250 символів');
  const lines=Array.isArray(b.lines)?b.lines:[];
  if(lines.length<1||lines.length>20)throw bad('Вкажіть 1–20 рядків');
  if(family!=='balanced'&&lines.length!==1)throw bad('Для переміщення/позабалансової операції потрібен один рядок');
  const out=lines.map(l=>{
    const mode=['one','vat','incl','k'].includes(l.mode)?l.mode:'one',k=Number(l.k??1);
    const debit_acc=String(l.debit_acc||'').trim(),credit_acc=String(l.credit_acc||'').trim();
    if(family==='balanced'&&(!debit_acc||!credit_acc||debit_acc===credit_acc))throw bad('Для балансової операції вкажіть різні Дт і Кт');
    if(family==='offbalance'&&Boolean(debit_acc)===Boolean(credit_acc))throw bad('Позабалансовий запис повинен мати тільки один рахунок');
    if(family==='transfer'&&(!debit_acc||debit_acc!==credit_acc))throw bad('Для аналітичного переміщення рахунок Дт і Кт збігається');
    if(mode==='k'&&(!Number.isFinite(k)||k<=0||k>100))throw bad('Коефіцієнт повинен бути від 0 до 100');
    if(family!=='balanced'&&mode!=='one')throw bad('Для позабалансового обліку та переміщення потрібна фактична сума');
    return {debit_acc,credit_acc,mode,k:mode==='k'?k:1};
  });
  if(is_active&&review_status!=='approved'&&note.length<15)throw bad('Для активації спірного/дубльованого шаблону потрібне обґрунтування (від 15 символів)');
  return {category,name,lines,family,is_active,review_status,note,
    sort:Number.isSafeInteger(Number(b.sort))?Number(b.sort):0};
}
async function assertTypicalAccounts(lines,family='balanced') {
  const codes=[...new Set(lines.flatMap(l=>[l.debit_acc,l.credit_acc]).filter(Boolean))];
  const found=await sql`SELECT code,kind FROM accounts WHERE code=ANY(${codes}::text[])`;
  const kinds=new Map(found.map(x=>[x.code,x.kind]));
  const miss=codes.filter(x=>!kinds.has(x));
  if(miss.length)throw bad('Рахунків немає в плані: '+miss.join(', '));
  if(family==='offbalance'&&codes.some(x=>kinds.get(x)!=='O'||x==='000'))throw bad('Оберіть справжній позабалансовий рахунок');
  if(family!=='offbalance'&&codes.some(x=>kinds.get(x)==='O'))throw bad('Позабалансові рахунки не мають кореспонденції');
}
// Правильна проводка, яку вводять у тому ж вікні одразу після сторно (необов'язкова).
function cleanCorrect(rows) {
  const L = (Array.isArray(rows) ? rows : []).filter((l) => l && (String(l.debit_acc || '').trim() || String(l.credit_acc || '').trim() || Number(l.amount) > 0))
    .map((l) => ({ debit_acc: String(l.debit_acc || '').trim(), credit_acc: String(l.credit_acc || '').trim(), amount: r2(Number(l.amount)) }));
  if (!L.length) return [];
  if (!validLines(L)) throw bad('Правильна проводка: вкажіть різні Дт і Кт та суму більше нуля (до 2 знаків)');
  return L;
}
// Перед записом у журнал: рахунки мають існувати, пара Дт/Кт не може збігатися чи змішувати балансові та позабалансові рахунки.
async function assertPostable(lines) {
  const pairs = lines.map((l) => (Array.isArray(l) ? [l[0], l[1]] : [l.debit_acc, l.credit_acc]).map(String));
  if (pairs.some(([d, k]) => d === k)) throw bad('Дебет і кредит проводки збігаються — оберіть іншу кореспонденцію');
  const codes = [...new Set(pairs.flat())];
  const found = await sql`SELECT code,kind FROM accounts WHERE code=ANY(${codes}::text[])`;
  const kind = new Map(found.map((x) => [x.code, x.kind]));
  if (codes.some((x) => !kind.has(x))) throw bad('У проводці використано рахунок, відсутній у плані рахунків');
  if(pairs.some(([d,k])=>kind.get(d)==='O'||kind.get(k)==='O'))throw bad('Позабалансові записи ведуться в окремому журналі за простою системою');
}
const lockCheck = (c, date) => {
  if (c.closed_until && String(date) <= c.closed_until) throw bad(`Період до ${c.closed_until} закрито: редагування неможливе. Оформіть виправлення поточною датою (сторно або додатковий запис).`);
};
const effAmount = (e, linked) => r2(Number(e.amount) + linked.reduce((s, x) => s + Number(x.amount), 0));
// чиста функція перевірки й розрахунку коригування (сторно / додатковий запис)
function planCorr(method, e, linked, p) {
  if (!p.preview && String(p.reason || '').trim().length < 3) throw bad('Вкажіть причину виправлення');
  if (!validISODate(p.date)) throw bad('Вкажіть коректну дату коригування');
  if (!e.active || Number(e.amount) <= 0 || e.storno_of || e.add_of) throw bad('Коригувати можна лише початкову проводку');
  const eff = effAmount(e, linked);
  if (String(e.date).slice(0, 4) < String(p.date).slice(0, 4) && !['material', 'immaterial'].includes(p.nature))
    throw bad('Помилка минулого року: вкажіть її характер (суттєва / несуттєва) за НП(С)БО 6');
  if (method === 'storno') {
    const a = r2(Number(p.amount ?? eff));
    if (eff <= 0) throw bad('Операцію вже повністю сторновано');
    if (!(a > 0)) throw bad('Вкажіть суму сторнування');
    if (a > eff + 1e-9) throw bad(`Сума сторнування перевищує доступний залишок ${eff}`);
    return { eff, delta: -a, result: r2(eff - a) };
  }
  if (method === 'add') {
    const nt = p.newTotal !== undefined && p.newTotal !== '' && p.newTotal !== null ? Number(p.newTotal) : null;
    if (nt !== null && nt < eff) throw bad('Правильна сума менша за відображену — скористайтеся червоним сторно');
    const d = r2(p.increase !== undefined && p.increase !== '' && p.increase !== null ? Number(p.increase) : (nt ?? 0) - eff);
    if (!(d > 0)) throw bad('Додатковий запис має збільшувати суму');
    return { eff, delta: d, result: r2(eff + d) };
  }
  throw bad('Невідомий метод');
}
// Only the current active version as of the transaction date applies.
async function activeRule(scope, key, at) {
  const rows=await sql`SELECT id,config FROM accounting_rule_versions
    WHERE scope=${scope} AND rule_key=${key} AND status='active' AND effective_from <= ${at}::date
    ORDER BY effective_from DESC,id DESC LIMIT 1`;
  return rows[0] || null;
}
async function mapEntries(source, at, lines) {
  const rule=await activeRule('posting',source,at);
  const result=rule?applyPosting(rule.config,lines):lines;
  if(rule){
    // Protect the stock subledger even if an earlier version of the rule was published before this restriction.
    if(/^doc:(rcpt|prod|sale|wo|ost|mv)$/.test(source)&&rule.config.mappings.some(m=>
       [['from_debit','to_debit'],['from_credit','to_credit']].some(([f,t])=>m[f]!==m[t]&&[/^2\d{1,2}$/.test(m[f]),/^2\d{1,2}$/.test(m[t])].some(Boolean))))
       throw bad('Опубліковане правило змінює рахунок запасів та може порушити складський облік. Проведення заблоковане.');
    const codes=[...new Set(result.flatMap(l=>Array.isArray(l)?l.slice(0,2):[l.debit_acc,l.credit_acc]))];
    const present=await sql`SELECT code,kind FROM accounts WHERE code=ANY(${codes}::text[])`;
    const byCode=new Map(present.map(x=>[x.code,x.kind]));
    if(codes.some(x=>!byCode.has(x)))throw bad('Активне правило бухгалтерської логіки містить відсутній у плані рахунків рахунок');
    if(result.some(l=>{const [d,k]=Array.isArray(l)?l:[l.debit_acc,l.credit_acc];return d===k || (byCode.get(d)==='O') !== (byCode.get(k)==='O')}))
      throw bad('Активне правило створює некоректну пару рахунків (однакові або змішані балансові/позабалансові)');
  }
  return {lines:result,id:rule?.id||null};
}
const entIns = (c, B, date, partner, docId, cid) => B.ent.filter(([d, k, am]) => am > 0 && d !== k).map(([d, k, am]) =>
  sql`INSERT INTO entries(company_id,date,doc,description,partner,debit_acc,credit_acc,amount,doc_id,corr_id,posting_rule_version_id)
    VALUES (${c.id},${date},${B.number},${B.desc},${partner || ''},${d},${k},${am},${docId},${cid},${B.rule_version_id||null})`);
const inventoryClaim=(c)=>sql`WITH claimed AS (UPDATE companies SET inventory_revision=inventory_revision+1
  WHERE id=${c.id} AND inventory_revision=${Number(c.inventory_revision)||0} RETURNING id)
  SELECT 1/(SELECT count(*)::int FROM claimed) AS ok`;
const mvIns = (c, B, date, docId) => B.mv.map((m) => sql`INSERT INTO stock_moves(company_id,doc_id,date,wh_id,item_id,qty,amount,lot_key) VALUES (${c.id},${docId},${date},${m.w},${m.i},${m.q},${m.a},${m.lot_key||null})`);

async function buildDoc(c, body, excl) {
  const type=String(body.type||''),date=String(body.date||'');
  if(!DTYPES.includes(type)||!validISODate(date))throw bad('Вкажіть вид документа та коректну дату');
  const st=c.settings||{},r=st.vat===false?0:Number(st.rate??20)/100;
  const method=st.inv==='spec'?'spec':st.inv==='avg'?'avg':'fifo';
  const scope=st.inv_scope==='company'?'company':'wh';
  const cash=['pko','vko','bin','bout'].includes(type),stk=['rcpt','prod','ost','sale','wo','mv'].includes(type);
  const lines=(body.lines||[]).filter(l=>Number(l.qty)>0).map(l=>({
    item_id:Number(l.item_id)||null,name:String(l.name||'').trim(),unit:String(l.unit||''),
    qty:Number(l.qty),price:Number(l.price)||0,lot_key:String(l.lot_key||'')
  }));
  if(!cash&&!lines.length)throw bad('Додайте хоча б один рядок');
  if(['sale','inv','act','rcpt'].includes(type)&&!body.partner)throw bad('Оберіть контрагента');
  if(lines.some(l=>!Number.isFinite(l.qty)||l.qty<=0||!Number.isFinite(l.price)||l.price<0))throw bad('Некоректна кількість або ціна');
  lines.forEach(l=>{l.sum=r2(l.qty*l.price)});
  const nm=async(rid,kind)=>rid?(await sql`SELECT name FROM refs WHERE id=${rid} AND company_id=${c.id} AND kind=${kind}`)[0]?.name:null;
  let wh=null,wh2=null,profiles=new Map();
  if(stk) {
    const ids=[...new Set(lines.map(l=>l.item_id))];
    if(ids.includes(null))throw bad('Оберіть номенклатуру з довідника');
    const rows=await sql`SELECT i.id,i.name,i.data AS item_data,t.data AS type_data,t.name AS type_name
      FROM refs i LEFT JOIN refs t ON t.id=(i.data->>'item_type_id')::int AND t.company_id=i.company_id AND t.kind='item_type'
      WHERE i.company_id=${c.id} AND i.kind='item' AND i.id=ANY(${ids}::int[])`;
    if(rows.length!==ids.length)throw bad('Номенклатуру не знайдено');
    rows.forEach(x=>profiles.set(Number(x.id),x));
    for(const l of lines){
      const p=profiles.get(l.item_id);if(!p.type_data||!p.item_data?.uom_id)throw bad('Для «'+p.name+'» оберіть вид номенклатури та одиницю виміру');
      if(p.type_data.stockable!=='yes')throw bad('Роботи та послуги не є складськими запасами: оформіть акт без руху ТМЦ');
      l.unit=p.item_data.unit||l.unit;
    }
    // Backdated stock moves affect already posted FIFO and average COGS. Do not silently revalue history.
    const future=await sql`SELECT 1 FROM stock_moves WHERE company_id=${c.id} AND item_id=ANY(${ids}::int[]) AND date>${date}::date
      AND (${excl}::int IS NULL OR doc_id IS DISTINCT FROM ${excl}::int) LIMIT 1`;
    if(future.length)throw bad('Є пізніші складські рухи цього товару. Проведення заднім числом потребує перерахунку собівартості; оформіть коригування поточною датою.');
    wh=await nm(Number(body.wh_id),'wh');if(!wh)throw bad('Оберіть склад');
    if(type==='mv'){wh2=await nm(Number(body.wh2_id),'wh');if(!wh2||Number(body.wh2_id)===Number(body.wh_id))throw bad('Оберіть інший склад-одержувач');}
  }
  if(type==='act') {
    const ids=[...new Set(lines.map(l=>l.item_id))];
    if(ids.includes(null))throw bad('Для акта оберіть роботу або послугу з номенклатури');
    const serviceRows=await sql`SELECT i.id,i.name,t.data AS type_data FROM refs i LEFT JOIN refs t ON t.id=(i.data->>'item_type_id')::int AND t.kind='item_type' AND t.company_id=i.company_id
      WHERE i.company_id=${c.id} AND i.kind='item' AND i.id=ANY(${ids}::int[])`;
    if(serviceRows.length!==ids.length||serviceRows.some(x=>x.type_data?.stockable!=='no'))
      throw bad('Акт виконаних робіт призначено для видів «Роботи» і «Послуги». Товари оформлюйте видатковою накладною.');
    serviceRows.forEach(x=>profiles.set(Number(x.id),x));
  }
  const S=r2(lines.reduce((s,l)=>s+l.sum,0)),V=r2(S*(['prod','ost','wo','mv'].includes(type)?0:r)),corr=String(body.corr||'');
  const hist={},physical={},lotHist={};
  const qtyAvailable=async(l,w)=>{
    const key=w+'-'+l.item_id;
    if(!(key in physical))physical[key]=Number((await sql`SELECT COALESCE(SUM(qty),0) AS qty FROM stock_moves
      WHERE company_id=${c.id} AND item_id=${l.item_id} AND wh_id=${w} AND date<=${date}::date AND (${excl}::int IS NULL OR doc_id IS DISTINCT FROM ${excl}::int)`)[0].qty);
    if(l.qty>physical[key]+1e-9)throw bad('Недостатньо фізичного залишку на складі: '+l.name);
    physical[key]-=l.qty;
  };
  const out=async(l,w)=>{
    await qtyAvailable(l,w);
    if(method==='spec'){
      if(!l.lot_key)throw bad('Оберіть конкретну партію для «'+l.name+'» (ідентифікована собівартість)');
      const key=w+'|'+l.item_id+'|'+l.lot_key;
      if(!(key in lotHist)){
        const legacy=(await sql`SELECT 1 FROM stock_moves WHERE company_id=${c.id} AND wh_id=${w} AND item_id=${l.item_id}
          AND qty<0 AND lot_key IS NULL AND date<=${date}::date AND (${excl}::int IS NULL OR doc_id IS DISTINCT FROM ${excl}::int) LIMIT 1`).length;
        if(legacy)throw bad('Для «'+l.name+'» є старі списання без партій. Ідентифікована оцінка потребує звірки й перенесення початкових партій.');
        const rows=await sql`SELECT qty,amount FROM stock_moves WHERE company_id=${c.id} AND wh_id=${w} AND item_id=${l.item_id}
          AND lot_key=${l.lot_key} AND date<=${date}::date AND (${excl}::int IS NULL OR doc_id IS DISTINCT FROM ${excl}::int) ORDER BY date,id`;
        lotHist[key]={q:rows.reduce((s,x)=>s+Number(x.qty),0),a:rows.reduce((s,x)=>s+Number(x.amount),0)};
      }
      const h=lotHist[key];if(h.q<l.qty-1e-9||h.q<=0)throw bad('Недостатньо товару у вибраній партії: '+l.name);
      const cost=r2(h.a*l.qty/h.q);h.q-=l.qty;h.a=r2(h.a-cost);l.cost=cost;return cost;
    }
    const key=(scope==='company'?'co':'wh'+w)+'-'+l.item_id;
    if(!hist[key]){
      let rows;
      if(scope==='company')rows=await sql`SELECT m.qty,m.amount FROM stock_moves m LEFT JOIN docs d ON d.id=m.doc_id
         WHERE m.company_id=${c.id} AND m.item_id=${l.item_id} AND m.date<=${date}::date AND (${excl}::int IS NULL OR m.doc_id IS DISTINCT FROM ${excl}::int)
          AND (d.type IS DISTINCT FROM 'mv') ORDER BY m.date,m.id`;
      else rows=await sql`SELECT qty,amount FROM stock_moves WHERE company_id=${c.id} AND wh_id=${w} AND item_id=${l.item_id}
         AND date<=${date}::date AND (${excl}::int IS NULL OR doc_id IS DISTINCT FROM ${excl}::int) ORDER BY date,id`;
      hist[key]=rows.map(x=>({qty:Number(x.qty),amount:Number(x.amount)}));
    }
    const cost=outCost(hist[key],l.qty,method);
    if(cost===null||!Number.isFinite(cost))throw bad('Помилка визначення собівартості: '+l.name);
    hist[key].push({qty:-l.qty,amount:-cost});l.cost=cost;return cost;
  };
  const ent=[],mv=[],W=Number(body.wh_id),W2=Number(body.wh2_id);
  let total=r2(S+V),C=0,vatComp=0;
  const lineVat=splitVat(lines.map(l=>l.sum),['prod','ost','wo','mv'].includes(type)?0:r);
  if(type==='rcpt'&&lines.some(l=>profiles.get(l.item_id)?.type_data?.code==='finished'))throw bad('Готову продукцію власного виробництва оприбутковуйте документом «Випуск готової продукції» (Дт 26 Кт 23). Придбані для продажу вироби обліковуйте як товари.');
  if(type==='prod'&&lines.some(l=>profiles.get(l.item_id)?.type_data?.code!=='finished'))throw bad('У документі випуску можна використовувати лише номенклатуру виду «Готова продукція»');
  if(cash){
    total=r2(Number(body.sum));if(!(total>0)||!corr)throw bad('Вкажіть суму та кореспондуючий рахунок');
    const p={pko:['301',corr],vko:[corr,'301'],bin:['311',corr],bout:[corr,'311']}[type];ent.push([...p,total]);
  }else if(type==='rcpt'){
    for(const l of lines){const x=profiles.get(l.item_id).type_data;
      ent.push([x.stock_acc,'631',l.sum]);l.lot_key=randomUUID();mv.push({w:W,i:l.item_id,q:l.qty,a:l.sum,lot_key:l.lot_key});}
    if(V)ent.push(['644','631',V]);
  }else if(type==='prod'){
    total=S;for(const l of lines){l.lot_key=randomUUID();ent.push(['26','23',l.sum]);mv.push({w:W,i:l.item_id,q:l.qty,a:l.sum,lot_key:l.lot_key});}
  }else if(type==='ost'){
    total=S;for(const l of lines){l.lot_key=randomUUID();mv.push({w:W,i:l.item_id,q:l.qty,a:l.sum,lot_key:l.lot_key});}
  }else if(type==='sale'){
    for(const [n,l] of lines.entries()){const x=profiles.get(l.item_id).type_data;
      C+=await out(l,W);mv.push({w:W,i:l.item_id,q:-l.qty,a:-l.cost,lot_key:method==='spec'?l.lot_key:null});
      const vat=lineVat[n];ent.push(['361',x.revenue_acc,r2(l.sum+vat)]);
      if(vat)ent.push([x.revenue_acc,'641',vat]);ent.push([x.cost_acc,x.stock_acc,l.cost]);}
  }else if(type==='wo'){
    for(const l of lines){const x=profiles.get(l.item_id).type_data;
      C+=await out(l,W);mv.push({w:W,i:l.item_id,q:-l.qty,a:-l.cost,lot_key:method==='spec'?l.lot_key:null});ent.push([corr||'947',x.stock_acc,l.cost]);}
    total=r2(C);
    // П. 198.5 ПКУ: якщо ПДВ при придбанні ТМЦ потрапив до податкового кредиту, при списанні нараховуються компенсуючі
    // податкові зобов'язання за основною ставкою від вартості придбання (собівартості). Одна зведена податкова накладна на документ.
    if(body.vat_comp===true&&r>0){vatComp=r2(C*r);if(vatComp>0)ent.push([corr||'947','641',vatComp]);}
  }else if(type==='mv'){
    for(const l of lines){const k=await out(l,W);C+=k;
      const key=method==='spec'?l.lot_key:null;
      mv.push({w:W,i:l.item_id,q:-l.qty,a:-k,lot_key:key},{w:W2,i:l.item_id,q:l.qty,a:k,lot_key:key});
      const destinationKey=W2+'-'+l.item_id;
      if(destinationKey in physical)physical[destinationKey]+=l.qty;
      if(scope==='wh'&&method!=='spec'){const hKey='wh'+W2+'-'+l.item_id;if(hist[hKey])hist[hKey].push({qty:l.qty,amount:k});}
    }
    total=r2(C);
  }else if(type==='act'){
    for(const [n,l] of lines.entries()){const x=profiles.get(l.item_id)?.type_data;const rate=lineVat[n];ent.push(['361',x.revenue_acc,r2(l.sum+rate)]);if(rate)ent.push([x.revenue_acc,'641',rate]);}
  }
  if(ent.some(([d,k])=>d===k))throw bad('Дебет і кредит проводки збігаються — оберіть іншу кореспонденцію');
  const number=String(body.number||'').trim()||type.toUpperCase()+'-'+Date.now();
  const desc=`${number}${body.partner?' · '+body.partner:''}${body.basis?' · '+body.basis:''}`;
  const data={lines,sum:S,vat:V,vat_comp:vatComp,rate:r*100,total,wh,wh2,corr,basis:body.basis||'',wh_id:W||null,wh2_id:W2||null,stock:body.stock||null,
    inventory_method:method,inventory_scope:scope};
  return {type,number,desc,data,ent,mv};
}

export default async (req) => {
  if (!SECRET) return fail('На сервері не задано AUTH_SECRET', 500);
  const url = new URL(req.url), q = url.searchParams, M = req.method;
  const [res, id, sub] = url.pathname.replace(/^\/api\//, '').split('/').filter(Boolean);
  try {
    const body = M === 'POST' ? await req.json().catch(() => ({})) : {};

    if (res === 'register' && M === 'POST') {
      const login = String(body.login || '').trim().toLowerCase(), name = String(body.name || '').trim(), pw = String(body.password || '');
      if (!login || !name || pw.length < 6) return fail('Вкажіть логін, ім’я та пароль (від 6 символів)');
      // Public registration never grants administrative privileges.
      const role = 'user';
      const salt = randomBytes(16).toString('hex');
      try {
        const r = await sql`INSERT INTO users(login,name,role,salt,hash) VALUES (${login},${name},${role},${salt},${hash(pw, salt)}) RETURNING id,name,role`;
        return json({ token: makeToken(r[0]) }, 201);
      } catch { return fail('Такий логін уже існує', 409); }
    }
    if (res === 'login' && M === 'POST') {
      const u = (await sql`SELECT * FROM users WHERE login=${String(body.login || '').trim().toLowerCase()}`)[0];
      if (!u || !timingSafeEqual(Buffer.from(hash(String(body.password || ''), u.salt)), Buffer.from(u.hash)))
        return fail('Невірний логін або пароль', 401);
      return json({ token: makeToken(u) });
    }

    const me = readToken(req);
    if (!me) return fail('Потрібен вхід', 401);
    // Роль беремо з бази: токен живе 7 днів і не має зберігати права користувача, якого понижено або видалено.
    const stored = (await sql`SELECT role FROM users WHERE id=${me.id}`)[0];
    if (!stored) return fail('Потрібен вхід', 401);
    me.role = stored.role;
    // Existing teacher accounts become superadmins after the migration.
    const T = me.role === 'superadmin' || me.role === 'teacher';
    const MODULES = ['refs','entries','docs','reports','stock','corrections','settings','audit'];
    const resourceModule = {refs:'refs',entries:'entries',docs:'docs',osv:'reports',pnl:'reports',stock:'stock',periods:'settings',audit:'audit',history:'audit',corrections:'corrections'};
    const own = async (cid, write = false, module = 'reports', action = null) => {
      if (!Number.isSafeInteger(Number(cid)) || Number(cid) <= 0) return null;
      const c = (await sql`SELECT * FROM companies WHERE id=${Number(cid)}`)[0];
      if (!c) return null;
      if (T) return c;
      // Legacy owners retain management only until membership migration is complete.
      if (c.owner_id === me.id) return c;
      const member = (await sql`SELECT permissions,company_role FROM company_members WHERE company_id=${c.id} AND user_id=${me.id}`)[0];
      if (!member) return null;
      if (member.company_role === 'admin') return c;
      const permission = member.permissions?.[module] || {};
      const required = action || (write ? 'create' : 'read');
      return permission[required] === true ? c : null;
    };
    const mod = resourceModule[res] || 'reports';
    const access = (cid, action) => own(cid, action !== 'read', mod, action);
    // Ensure every request for a company is authorized on the server.
    const companyAction = M === 'DELETE' ? 'delete' : M === 'POST' ? 'create' : 'read';

    const aud = (c, action, type, oid, oldd, newd, reason) => sql`INSERT INTO audit_log(company_id,user_id,user_name,action,object_type,object_id,old_data,new_data,reason)
      VALUES (${c.id},${me.id},${me.name},${action},${type},${String(oid)},${JSON.stringify(oldd ?? null)}::jsonb,${JSON.stringify(newd ?? null)}::jsonb,${reason || null})`;
    if (res === 'me') return json({ id: me.id, name: me.name, role: T ? 'superadmin' : me.role });
    if(res==='correspondences-291'){
      if(M!=='GET')return fail('Тільки читання',405);
      if(!T)return fail('Лише для суперадміністратора',403);
      return json(await sql`SELECT source_uid,debit_acc,credit_acc,source_pages,source_entry FROM account_correspondences_291 ORDER BY source_uid`);
    }
    if (res === 'typical-ops') {
      const superRole=T;
      if(M==='GET') {
        if(q.get('all')==='1'&&!superRole)return fail('Лише суперадміністратор може бачити архівні шаблони',403);
        if(q.get('all')==='1')return json(await sql`SELECT * FROM typical_operations ORDER BY category,sort,id`);
        return json(await sql`SELECT * FROM typical_operations WHERE is_active=TRUE ORDER BY category,sort,id`);
      }
      if(!superRole)return fail('Це може робити лише суперадміністратор',403);
      const none={id:null};
      if(M==='POST'&&id==='seed') {
        if((await sql`SELECT 1 FROM typical_operations LIMIT 1`).length)throw bad('Набір уже імпортовано. Для оновлення використайте SQL-міграцію.');
        const items=(Array.isArray(body.items)?body.items:[]).slice(0,500).map(cleanTypicalOp);
        if(!items.length)throw bad('Немає шаблонів для імпорту');
        for(const it of items)await assertTypicalAccounts(it.lines,it.family);
        await sql.transaction([...items.map((it,n)=>sql`INSERT INTO typical_operations(category,name,lines,sort,family,is_active,review_status,note,updated_by)
          VALUES (${it.category},${it.name},${JSON.stringify(it.lines)}::jsonb,${n},${it.family},${it.is_active},${it.review_status},${it.note},${me.name})`),
          aud(none,'seed','typical_operations','all',null,{count:items.length},'Початковий імпорт')]);
        return json({count:items.length},201);
      }
      if(M==='POST') {
        const it=cleanTypicalOp(body);await assertTypicalAccounts(it.lines,it.family);
        const oid=Number(body.id)||null;
        if(oid){
          const old=(await sql`SELECT * FROM typical_operations WHERE id=${oid}`)[0];
          if(!old)return fail('Операцію не знайдено',404);
          await sql.transaction([sql`UPDATE typical_operations SET category=${it.category},name=${it.name},lines=${JSON.stringify(it.lines)}::jsonb,
            sort=${it.sort},family=${it.family},is_active=${it.is_active},review_status=${it.review_status},note=${it.note},updated_by=${me.name},updated_at=now() WHERE id=${oid}`,
            aud(none,'update','typical_operation',oid,old,it,null)]);
          return json({id:oid});
        }
        const duplicate=await sql`SELECT id FROM typical_operations WHERE is_active=TRUE AND lower(name)=lower(${it.name}) AND lines=${JSON.stringify(it.lines)}::jsonb LIMIT 1`;
        if(duplicate.length&&it.is_active)return fail('Точний дублікат уже є в довіднику',409);
        const r=(await sql`INSERT INTO typical_operations(category,name,lines,sort,family,is_active,review_status,note,updated_by)
          VALUES (${it.category},${it.name},${JSON.stringify(it.lines)}::jsonb,${it.sort},${it.family},${it.is_active},${it.review_status},${it.note},${me.name}) RETURNING id`)[0];
        await aud(none,'create','typical_operation',r.id,null,it,null);
        return json({id:r.id},201);
      }
      if(M==='DELETE'){
        const oid=Number(id);if(!Number.isSafeInteger(oid)||oid<=0)return fail('Неправильний ID');
        const old=(await sql`SELECT * FROM typical_operations WHERE id=${oid}`)[0];
        if(!old)return fail('Операцію не знайдено',404);
        await sql.transaction([sql`UPDATE typical_operations SET is_active=FALSE,updated_by=${me.name},updated_at=now() WHERE id=${oid}`,
          aud(none,'archive','typical_operation',oid,old,{is_active:false},'Архівування шаблону')]);
        return json({ok:true});
      }
      return fail('Не знайдено',404);
    }
    if(res==='offbalance-entries') {
      const cid=Number(q.get('company_id')||body.company_id);
      const c=await own(cid,M!=='GET','entries',M==='GET'?'read':'create');
      if(!c)return fail('Немає доступу до підприємства',403);
      if(M==='GET')return json(await sql`SELECT id,date,doc,description,account_code,direction,amount,source_uid
        FROM offbalance_entries WHERE company_id=${cid} ORDER BY date DESC,id DESC LIMIT 1000`);
      if(M==='POST'){
        const date=String(body.date||''),code=String(body.account_code||''),direction=String(body.direction||''),amount=Number(body.amount);
        if(!validISODate(date))return fail('Некоректна дата');
        lockCheck(c,date);
        if(!['in','out'].includes(direction)||!Number.isFinite(amount)||amount<=0||amount>9999999999999.99||r2(amount)!==amount)return fail('Некоректна сума/тип позабалансової операції');
        if(code==='000'||!(await sql`SELECT 1 FROM accounts WHERE code=${code} AND kind='O' LIMIT 1`).length)return fail('Це не позабалансовий рахунок');
        const source=String(body.source_uid||'').trim()||null;
        const desc=String(body.description||'').trim().slice(0,500),doc=String(body.doc||'').trim().slice(0,150);
        const row=(await sql`INSERT INTO offbalance_entries(company_id,date,doc,description,account_code,direction,amount,source_uid,created_by)
          VALUES(${cid},${date},${doc},${desc},${code},${direction},${amount},${source},${me.id}) RETURNING id`)[0];
        await aud(c,'create','offbalance_entry',row.id,null,{date,doc,description:desc,account_code:code,direction,amount,source_uid:source},null);
        return json({id:row.id},201);
      }
      return fail('Метод не підтримується',405);
    }
    // Service catalog: ONLY the actual persisted superadmin role can manage system rules.
    if (res === 'rulebook') {
      if (id === 'active' && M === 'GET') {
        const at=q.get('at') || new Date().toISOString().slice(0,10);
        if(!validISODate(at))return fail('Невірна дата звітності');
        const rows=await sql`SELECT DISTINCT ON (scope,rule_key) scope,rule_key,config,id,effective_from
          FROM accounting_rule_versions WHERE scope='report' AND status='active' AND effective_from<=${at}::date
          ORDER BY scope,rule_key,effective_from DESC,id DESC`;
        return json(Object.fromEntries(rows.map(x=>[x.rule_key,{rows:x.config.rows,version_id:x.id,effective_from:x.effective_from}])));
      }
      const stored=(await sql`SELECT role FROM users WHERE id=${me.id}`)[0];
      if(stored?.role!=='superadmin')return fail('Це може робити лише суперадміністратор',403);
      if(M==='GET' && !id){
        const scope=String(q.get('scope')||'');
        if(scope && !['report','posting'].includes(scope))return fail('Невідомий тип правил');
        return json(await sql`SELECT r.id,r.scope,r.rule_key,r.status,to_char(r.effective_from,'YYYY-MM-DD') AS effective_from,r.config,r.note,
          r.created_at,r.validated_at,r.activated_at,u.name AS author
          FROM accounting_rule_versions r JOIN users u ON u.id=r.created_by
          WHERE (${scope}='' OR r.scope=${scope}) ORDER BY r.id DESC LIMIT 250`);
      }
      if(M==='POST' && ['save','preview','activate'].includes(id)){
        if(id==='save'){
          const scope=String(body.scope||''),key=String(body.rule_key||'');
          if((scope==='posting'&&!POSTING_KEYS.includes(key))||(scope==='report'&&!REPORT_KEYS.includes(key)))return fail('Непідтримуваний тип господарської операції або звітної форми');
          if(!['posting','report'].includes(scope))return fail('Невідомий розділ');
          let cfg;
          try{cfg=scope==='posting'?validatePosting(body.config):validateReport(body.config,REPORT_CODES[key]);}
          catch(e){return fail(e.message)}
          if(scope==='posting'&&cfg.mappings.length){
            if(/^doc:(rcpt|prod|sale|wo|ost|mv)$/.test(key) && cfg.mappings.some(m=>
              [ ['from_debit','to_debit'],['from_credit','to_credit'] ].some(([f,t])=>m[f]!==m[t]&&[/^2\d{1,2}$/.test(m[f]),/^2\d{1,2}$/.test(m[t])].some(Boolean))))
              return fail('Не дозволено змінювати складський рахунок класу 2 через конструктор — це порушить звірку з партіями. Оберіть коректний вид номенклатури або виправте складський алгоритм.',409);
            const codes=[...new Set(cfg.mappings.flatMap(x=>[x.from_debit,x.from_credit,x.to_debit,x.to_credit]))];
            const acc=await sql`SELECT code FROM accounts WHERE code=ANY(${codes}::text[])`;
            if(acc.length!==codes.length)return fail('Деякі рахунки у правилах відсутні в плані рахунків');
          }
          if(scope==='report'){
            const used=[...new Set(Object.values(cfg.rows).flatMap(s=>[...s.matchAll(/[APDCKXE]:([0-9,]+)/g)].flatMap(m=>m[1].split(','))))];
            if(used.length){const acc=await sql`SELECT code FROM accounts`;
              if(used.some(prefix=>!acc.some(a=>a.code.startsWith(prefix))))return fail('У формулі вказано невідомий рахунок або префікс');}
          }
          const note=String(body.note||'').trim();
          if(note.length<8||note.length>500)return fail('Опиши причину зміни (від 8 до 500 символів)');
          const row=(await sql`INSERT INTO accounting_rule_versions(scope,rule_key,config,note,created_by)
            VALUES (${scope},${key},${JSON.stringify(cfg)}::jsonb,${note},${me.id}) RETURNING id`)[0];
          await aud({id:null},'rule-draft',scope,row.id,null,{key,config:cfg},note);
          return json({id:row.id,status:'draft'},201);
        }
        const rid=Number(body.id);if(!Number.isSafeInteger(rid)||rid<=0)return fail('Вкажи ID версії');
        const rule=(await sql`SELECT * FROM accounting_rule_versions WHERE id=${rid}`)[0];
        if(!rule)return fail('Версію не знайдено',404);
        if(id==='preview'){
          if(rule.status!=='draft')return fail('Опубліковані версії не редагуються',409);
          let result;
          if(rule.scope==='posting'){
            const sample=Array.isArray(body.sample)&&body.sample.length ? body.sample : rule.config.mappings.map(m=>({debit_acc:m.from_debit,credit_acc:m.from_credit,amount:100}));
            if(sample.length>100||sample.some(l=>!/^\d{1,4}$/.test(l.debit_acc)||!/^\d{1,4}$/.test(l.credit_acc)||!Number.isFinite(Number(l.amount))||Number(l.amount)<=0))return fail('Невірний контрольний набір проводок');
            result={before:sample,after:applyPosting(rule.config,sample)};
          }else{
            validateReport(rule.config,REPORT_CODES[rule.rule_key]);
            const cid=Number(body.company_id),date=String(body.date||'');
            if(!Number.isSafeInteger(cid)||cid<=0||!validISODate(date))return fail('Для контрольного розрахунку оберіть підприємство і дату');
            if(!(await sql`SELECT id FROM companies WHERE id=${cid}`).length)return fail('Підприємство для перевірки не знайдено',404);
            const yearStart=date.slice(0,4)+'-01-01';
            const balances=rule.rule_key==='F2'?[]:await sql`WITH mv AS (
               SELECT debit_acc AS acc,amount AS d,0::numeric AS c,date FROM entries_a WHERE company_id=${cid}
               UNION ALL SELECT credit_acc,0::numeric,amount,date FROM entries_a WHERE company_id=${cid})
              SELECT a.code,COALESCE(SUM(CASE WHEN mv.date <= ${date}::date THEN mv.d-mv.c END),0)::numeric AS closing
              FROM accounts a LEFT JOIN mv ON mv.acc=a.code GROUP BY a.code`;
            const pnl=rule.rule_key!=='F2'?[]:await sql`SELECT code,SUM(d) AS d,SUM(c) AS c FROM (
              SELECT debit_acc AS code,amount AS d,0::numeric AS c FROM entries_a WHERE company_id=${cid} AND date BETWEEN ${yearStart}::date AND ${date}::date AND credit_acc NOT LIKE '79%'
              UNION ALL SELECT credit_acc,0::numeric,amount FROM entries_a WHERE company_id=${cid} AND date BETWEEN ${yearStart}::date AND ${date}::date AND debit_acc NOT LIKE '79%') t
              WHERE code ~ '^[789]' AND code NOT LIKE '79%' GROUP BY code`;
            const old=await activeRule('report',rule.rule_key,date);
            const dflt=REPORT_DEFAULTS[rule.rule_key];
            const before=evaluateReport(dflt,old?.config.rows||{},balances,pnl),after=evaluateReport(dflt,rule.config.rows,balances,pnl);
            const differences=Object.keys(dflt).filter(k=>Math.abs(before[k]-after[k])>0.005).map(k=>({code:k,before:Math.round(before[k]*100)/100,after:Math.round(after[k]*100)/100}));
            result={validated:true,company_id:cid,date,differences,compared_to_version:old?.id||null};
          }
          await sql`UPDATE accounting_rule_versions SET validated_at=now() WHERE id=${rid} AND status='draft'`;
          return json(result);
        }
        if(rule.status!=='draft'||!rule.validated_at)return fail('Спочатку протестуй чернетку перед активацією',409);
        const eff=String(body.effective_from||'');if(!validISODate(eff))return fail('Вкажи дату початку дії');
        const latest=(await sql`SELECT to_char(max(effective_from),'YYYY-MM-DD') AS last_day FROM accounting_rule_versions WHERE scope=${rule.scope} AND rule_key=${rule.rule_key} AND status='active'`)[0]?.last_day;
        if(latest&&eff<=latest)return fail('Нова версія має діяти пізніше за попередню: '+latest,409);
        const updated=(await sql`UPDATE accounting_rule_versions SET status='active',effective_from=${eff}::date,activated_by=${me.id},activated_at=now()
          WHERE id=${rid} AND status='draft' AND validated_at IS NOT NULL AND ${eff}::date > CURRENT_DATE RETURNING id`)[0];
        if(!updated)return fail('Опублікувати можна лише з наступного календарного дня. Перевір статус чернетки.',409);
        await aud({id:null},'rule-activated',rule.scope,rid,null,{key:rule.rule_key,effective_from:eff},rule.note);
        return json({ok:true,id:rid,effective_from:eff});
      }
      return fail('Невідомий маршрут конструктора',405);
    }
    if (res === 'company-admin' && M === 'POST') {
      if (!T) return fail('Лише для суперадміністратора',403);
      const cid=Number(body.company_id),login=String(body.login||'').trim().toLowerCase();
      const u=(await sql`SELECT id,role FROM users WHERE login=${login}`)[0];
      if (!u || u.role==='superadmin') return fail('Користувача не знайдено або роль несумісна',400);
      const updated=await sql`UPDATE companies SET owner_id=${u.id} WHERE id=${cid} RETURNING id`;
      if (!updated.length) return fail('Підприємство не знайдено',404);
      await sql`INSERT INTO company_members(company_id,user_id,company_role) VALUES (${cid},${u.id},'admin') ON CONFLICT(company_id,user_id) DO UPDATE SET company_role='admin'`;
      return json({ok:true});
    }
    if (res === 'members') {
      const cid = Number(q.get('company_id') || body.company_id);
      const c = await own(cid);
      if (!c) return fail('Немає доступу', 403);
      const manager = T || c.owner_id === me.id || (await sql`SELECT 1 FROM company_members WHERE company_id=${cid} AND user_id=${me.id} AND company_role='admin' LIMIT 1`).length > 0;
      if (M === 'GET') {
        if (!manager) return fail('Недостатньо прав', 403);
        return json(await sql`SELECT u.id,u.public_id,u.login,u.name,m.permissions,m.can_create_company,m.company_role FROM company_members m JOIN users u ON u.id=m.user_id WHERE m.company_id=${cid} ORDER BY u.name`);
      }
      if (!manager) return fail('Тільки адміністратор підприємства', 403);
      if (M === 'POST') {
        const login = String(body.login || '').trim().toLowerCase();
        const name = String(body.name || '').trim();
        const pw = String(body.password || '');
        const permissions = body.permissions || {};
        const companyRole = body.company_role || 'user';
        if (!['admin','user'].includes(companyRole)) return fail('Невірна роль підприємства');
        if (typeof body.can_create_company !== 'boolean') return fail('Вкажіть дозвіл створення підприємства');
        if (!(login.length <= 254 && (/^[a-z0-9._-]{3,64}$/.test(login) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(login)))) return fail('Вкажіть коректний логін або email');
        if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions) || Object.keys(permissions).some(k => !MODULES.includes(k))) return fail('Невірні дозволи');
        for (const item of Object.values(permissions)) if (!item || typeof item !== 'object' || Object.keys(item).some(k=>!['read','create','update','delete'].includes(k)) || Object.values(item).some(v=>typeof v!=='boolean')) return fail('Невірні дозволи');
        let user = (await sql`SELECT id,role FROM users WHERE login=${login}`)[0];
        if (!user) {
          if (!name || pw.length < 10) return fail('Вкажіть ім’я та пароль від 10 символів');
          const salt = randomBytes(16).toString('hex');
          user = (await sql`INSERT INTO users(login,name,role,salt,hash) VALUES (${login},${name},'user',${salt},${hash(pw,salt)}) RETURNING id,role`)[0];
        }
        if (user.role === 'superadmin' || user.role === 'teacher') return fail('Права суперадміністратора не змінюються тут',403);
        await sql`INSERT INTO company_members(company_id,user_id,permissions,can_create_company,company_role) VALUES (${cid},${user.id},${JSON.stringify(permissions)}::jsonb,${body.can_create_company},${companyRole}) ON CONFLICT(company_id,user_id) DO UPDATE SET permissions=EXCLUDED.permissions,can_create_company=EXCLUDED.can_create_company,company_role=EXCLUDED.company_role`;
        return json({ok:true});
      }
      if (M === 'DELETE') {
        if (c.owner_id === Number(id)) return fail('Не можна відкликати доступ власника. Спочатку призначте іншого власника.',409);
        await sql`DELETE FROM company_members WHERE company_id=${cid} AND user_id=${Number(id)}`;
        return json({ok:true});
      }
      return fail('Метод не підтримується',405);
    }
    if (res === 'permissions') {
      const cid = Number(q.get('company_id'));
      const c = await own(cid);
      if (!c) return fail('Немає доступу',403);
      if (T || c.owner_id === me.id || (await sql`SELECT 1 FROM company_members WHERE company_id=${cid} AND user_id=${me.id} AND company_role='admin' LIMIT 1`).length > 0) return json({manager:true,permissions:Object.fromEntries(MODULES.map(k=>[k,{read:true,create:true,update:true,delete:true}]))});
      const m = (await sql`SELECT permissions FROM company_members WHERE company_id=${cid} AND user_id=${me.id}`)[0];
      return json({manager:false,permissions:m?.permissions||{}});
    }
    if (res === 'accounts') {
      if (M === 'POST') {
        if (!T) return fail('Лише для суперадміністратора', 403);
        const code = String(body.code || '').trim();
        if (!/^\d{1,4}$/.test(code) || !String(body.name || '').trim() || !['A', 'P', 'AP', 'O'].includes(body.kind)) return fail('Невірні дані рахунку');
        const tri=v=>v===true||v==='1'?true:v===false||v==='0'?false:null;
        const analytic=tri(body.analytic_enabled),quantity=tri(body.quantity_enabled);
        const dimensions=String(body.analytic_dimensions||'').trim()||null;
        const quantityPolicy=String(body.quantity_policy||'').trim()||null;
        await sql`INSERT INTO accounts(code,name,kind,analytic_enabled,analytic_dimensions,quantity_enabled,quantity_policy)
          VALUES (${code},${body.name.trim()},${body.kind},${analytic},${dimensions},${quantity},${quantityPolicy})
          ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name,kind=EXCLUDED.kind,
          analytic_enabled=EXCLUDED.analytic_enabled,analytic_dimensions=EXCLUDED.analytic_dimensions,
          quantity_enabled=EXCLUDED.quantity_enabled,quantity_policy=EXCLUDED.quantity_policy`;
        return json({ ok: true });
      }
      if (M === 'DELETE') {
        if (!T) return fail('Лише для суперадміністратора', 403);
        if ((await sql`SELECT 1 FROM entries_a WHERE debit_acc=${id} OR credit_acc=${id} LIMIT 1`).length) return fail('Рахунок використовується в проводках — видалити не можна', 409);
        await sql`DELETE FROM accounts WHERE code=${id}`;
        return json({ ok: true });
      }
      return json(await sql`SELECT code,name,kind,analytic_enabled,analytic_dimensions,quantity_enabled,quantity_policy FROM accounts ORDER BY code`);
    }

    if (res === 'company-create-permission' && M === 'GET') {
      if (T) return json({allowed:true});
      const allowed=(await sql`SELECT 1 FROM company_members WHERE user_id=${me.id} AND can_create_company=true LIMIT 1`).length>0;
      return json({allowed});
    }
    if (res === 'companies') {
      if (M === 'DELETE') {
        const cid = Number(id);
        if (!Number.isSafeInteger(cid) || cid <= 0) return fail('Невірне підприємство');
        const c = (await sql`SELECT id,name,owner_id FROM companies WHERE id=${cid}`)[0];
        if (!c) return fail('Підприємство не знайдено',404);
        if (!T && c.owner_id !== me.id && !(await sql`SELECT 1 FROM company_members WHERE company_id=${cid} AND user_id=${me.id} AND company_role='admin' LIMIT 1`).length) return fail('Видаляти підприємство може лише його адміністратор або суперадміністратор',403);
        // Keep immutable audit_log entries as an audit trail. Company-dependent records
        // with foreign keys are removed by ON DELETE CASCADE.
        await sql`DELETE FROM companies WHERE id=${cid}`;
        return json({ok:true});
      }
      if (M === 'POST') {
        const name = String(body.name || '').trim(), st = JSON.stringify(body.settings || {});
        if (!name) return fail('Вкажіть назву');
        if (id) {
          const c = await own(Number(id), true, 'settings', 'update');
          if (!c) return fail('Немає доступу', 403);
          const oldPolicy=c.settings||{},nextPolicy=body.settings||{};
          const oldMethod=oldPolicy.inv||'fifo',nextMethod=nextPolicy.inv||'fifo';
          const oldScope=oldPolicy.inv_scope||'warehouse',nextScope=nextPolicy.inv_scope||'warehouse';
          if((oldMethod!==nextMethod||oldScope!==nextScope)&&(await sql`SELECT 1 FROM stock_moves WHERE company_id=${c.id} LIMIT 1`).length)
            return fail('Після складських проведень метод і рівень оцінки запасів не можна змінити без окремої процедури переходу й перерахунку.',409);
          if(!['fifo','avg','spec'].includes(nextMethod)||!['warehouse','company'].includes(nextScope))return fail('Некоректні налаштування оцінки запасів');
          return json((await sql`UPDATE companies SET name=${name}, settings=${st}::jsonb WHERE id=${c.id} RETURNING id, name, settings`)[0]);
        }
        if (!T) {
          const owned = false; // Company administration does not imply global company-creation rights.
          const granted = (await sql`SELECT 1 FROM company_members WHERE user_id=${me.id} AND can_create_company=true LIMIT 1`).length > 0;
          if (!owned && !granted) return fail('Створення підприємств заборонено адміністратором',403);
        }
        const created=(await sql`INSERT INTO companies(name, owner_id, settings) VALUES (${name}, ${me.id}, ${st}::jsonb) RETURNING id, name, settings`)[0];
        await sql`INSERT INTO company_members(company_id,user_id,company_role) VALUES (${created.id},${me.id},'admin') ON CONFLICT(company_id,user_id) DO UPDATE SET company_role='admin'`;
        await sql.transaction(INITIAL_INVENTORY_REFS.map(r=>sql`INSERT INTO refs(company_id,kind,name,data) VALUES (${created.id},${r.kind},${r.name},${JSON.stringify(r.data)}::jsonb)`));
        return json(created,201);
      }
      return json(T
        ? await sql`SELECT c.id, c.name, c.settings, c.closed_until, c.owner_id, u.name AS owner FROM companies c LEFT JOIN users u ON u.id=c.owner_id ORDER BY u.name NULLS LAST, c.id DESC`
        : await sql`SELECT DISTINCT c.id, c.name, c.settings, c.closed_until, c.owner_id FROM companies c LEFT JOIN company_members m ON m.company_id=c.id AND m.user_id=${me.id} WHERE c.owner_id=${me.id} OR m.user_id=${me.id} ORDER BY c.id DESC`);
    }

    // Payroll state machine: one-time accrual and two-phase bank/cash instructions.
    if(res==='payroll-post' && M==='POST'){
      const cid=Number(body.company_id),pid=Number(body.id),date=String(body.date||'');
      const c=await own(cid,true,'entries','create');if(!c)return fail('Немає права проводити зарплату',403);
      if(!validISODate(date))return fail('Некоректна дата проведення');lockCheck(c,date);
      const row=(await sql`SELECT * FROM payroll_calculations WHERE id=${pid} AND company_id=${cid}`)[0];
      if(!row)return fail('Розрахунок не знайдено',404);
      if(row.posted_at)return fail('Зарплату вже проведено',409);
      const d=row.details || {},debit=String(d.payroll_debit||'92');
      const lines=[{debit_acc:debit,credit_acc:'661',amount:Number(d.gross),description:'Нарахування зарплати'},
        {debit_acc:'661',credit_acc:'641',amount:Number(d.pit),description:'Утримано ПДФО'},
        {debit_acc:'661',credit_acc:'642',amount:Number(d.military),description:'Утримано військовий збір'},
        {debit_acc:debit,credit_acc:'651',amount:Number(d.esv),description:'Нараховано ЄСВ роботодавця'},
        ...(d.extras||[]).map(x=>({debit_acc:'661',credit_acc:'685',amount:Number(x.amount),description:'Інше утримання: '+String(x.name||'')}))].filter(x=>x.amount>0);
      const mapped=await mapEntries('payroll:accrual',date,lines);
      lines.splice(0,lines.length,...mapped.lines);
      if(!validLines(lines))return fail('Проводки не пройшли перевірку');
      const known=await sql`SELECT code FROM accounts WHERE code=ANY(${[...new Set(lines.flatMap(x=>[x.debit_acc,x.credit_acc]))]}::text[])`;
      if(known.length!==new Set(lines.flatMap(x=>[x.debit_acc,x.credit_acc])).size)return fail('У плані рахунків відсутні необхідні рахунки');
      const result=(await sql`WITH claim AS (UPDATE payroll_calculations SET posted_at=now() WHERE id=${pid} AND company_id=${cid} AND posted_at IS NULL RETURNING id),
        inserted AS (INSERT INTO entries(company_id,date,doc,description,partner,debit_acc,credit_acc,amount,posting_rule_version_id)
        SELECT ${cid},${date}::date,${'ЗП-'+row.year+'-'+String(row.month).padStart(2,'0')+'-'+pid},l.description,${String(d.staff_name||'')},l.debit_acc,l.credit_acc,l.amount,${mapped.id}
        FROM claim CROSS JOIN jsonb_to_recordset(${JSON.stringify(lines)}::jsonb) AS l(debit_acc text,credit_acc text,amount numeric,description text) RETURNING id)
        SELECT (SELECT count(*) FROM claim)::int AS updated,(SELECT count(*) FROM inserted)::int AS entries`)[0];
      if(!result?.updated)return fail('Розрахунок уже проведено. Повторна проводка заблокована',409);
      await aud(c,'payroll-post','payroll',pid,null,{date,lines},'Проведення зарплати');return json({ok:true,...result});
    }
    if(res==='payroll-payment' && M==='POST'){
      const cid=Number(body.company_id),pid=Number(body.id),kind=String(body.kind||''),date=String(body.date||'');
      if(!['wage','pit','military','esv'].includes(kind))return fail('Невідомий вид платежу');
      const c=await own(cid,true,'entries','create');if(!c)return fail('Немає права оформляти платежі',403);
      if(!validISODate(date))return fail('Некоректна дата платежу');lockCheck(c,date);
      const row=(await sql`SELECT * FROM payroll_calculations WHERE company_id=${cid} AND id=${pid}`)[0];
      if(!row||!row.posted_at)return fail('Спочатку проведіть нарахування зарплати',409);
      const d=row.details||{},paymentLines={
        wage:[{debit_acc:'661',credit_acc:'311',amount:Number(d.net),description:'Виплата зарплати'}],
        pit:[{debit_acc:'641',credit_acc:'311',amount:Number(d.pit),description:'Сплата ПДФО'}],
        military:[{debit_acc:'642',credit_acc:'311',amount:Number(d.military),description:'Сплата військового збору'}],
        esv:[{debit_acc:'651',credit_acc:'311',amount:Number(d.esv),description:'Сплата ЄСВ'}]
      },lines=paymentLines[kind];
      const positive=lines.filter(x=>x.amount>0),total=r2(positive.reduce((a,x)=>a+x.amount,0));
      if(!positive.every(x=>Number.isFinite(x.amount)&&x.amount<=1e9))return fail('Некоректна сума платежу');
      const act=String(body.action||'prepare');
      if(!total)return fail('Нульова сума платежу — інструкція не потрібна');
      if(act==='prepare'){
        const paymentMapped=await mapEntries('payroll:payment:'+kind,date,positive);
        const saved=(await sql`INSERT INTO payroll_payment_instructions(company_id,payroll_id,kind,date,amount,lines,created_by,posting_rule_version_id)
          VALUES (${cid},${pid},${kind},${date},${total},${JSON.stringify(paymentMapped.lines)}::jsonb,${me.id},${paymentMapped.id})
          ON CONFLICT(payroll_id,kind) DO UPDATE SET date=EXCLUDED.date,amount=EXCLUDED.amount,lines=EXCLUDED.lines,posting_rule_version_id=EXCLUDED.posting_rule_version_id
          WHERE payroll_payment_instructions.status='prepared' RETURNING id,status`)[0];
        if(!saved)return fail('Платіж уже підтверджено; повторне створення заборонено',409);
        return json({ok:true,document_id:saved.id,status:'prepared',total});
      }
      if(act!=='confirm'||body.bank_confirmed!==true)return fail('Потрібно підтвердити факт виконання платежу за випискою банку');
      const payment=(await sql`SELECT * FROM payroll_payment_instructions WHERE company_id=${cid} AND payroll_id=${pid} AND kind=${kind}`)[0];
      if(!payment)return fail('Спочатку сформуйте платіжну інструкцію',409);
      if(payment.status==='confirmed')return fail('Цей платіж уже відображено в обліку',409);
      const posted=(await sql`WITH claim AS (UPDATE payroll_payment_instructions SET status='confirmed',confirmed_at=now(),date=${date}::date WHERE id=${payment.id} AND status='prepared' RETURNING id,lines,posting_rule_version_id),
        inserted AS (INSERT INTO entries(company_id,date,doc,description,partner,debit_acc,credit_acc,amount,posting_rule_version_id)
          SELECT ${cid},${date}::date,${'ПІ-'+payment.id},l.description,${String(d.staff_name||'')},l.debit_acc,l.credit_acc,l.amount,claim.posting_rule_version_id
          FROM claim CROSS JOIN LATERAL jsonb_to_recordset(claim.lines) AS l(debit_acc text,credit_acc text,amount numeric,description text) RETURNING id)
          SELECT (SELECT count(*) FROM claim)::int AS confirmed,(SELECT count(*) FROM inserted)::int AS entries`)[0];
      if(!posted?.confirmed)return fail('Платіж уже проведено',409);
      await aud(c,'payroll-payment','payroll',pid,null,{kind,date,payment_id:payment.id},'Підтверджено виконання за банківською випискою');
      return json({ok:true,...posted});
    }
    if(res==='payroll-instructions' && M==='GET'){
      const cid=Number(q.get('company_id'));const c=await own(cid,false,'entries','read');if(!c)return fail('Немає прав',403);
      return json(await sql`SELECT p.id,p.payroll_id,p.kind,to_char(p.date,'YYYY-MM-DD') AS date,p.amount,p.lines,p.status,p.confirmed_at,r.name AS staff_name
      FROM payroll_payment_instructions p JOIN payroll_calculations c ON c.id=p.payroll_id
      LEFT JOIN refs r ON r.id=c.staff_id WHERE p.company_id=${cid} ORDER BY p.id DESC`);
    }
    // Monthly payroll calculations. No accounting postings are generated implicitly.
    if (res === 'payroll') {
      const cid=Number(M==='POST'?body.company_id:q.get('company_id'));
      const c=await own(cid,M==='POST','entries',M==='POST'?'create':'read');
      if(!c)return fail('Немає прав на розрахунок зарплати',403);
      if(M==='GET') return json(await sql`SELECT p.*, r.name AS staff_name FROM payroll_calculations p LEFT JOIN refs r ON r.id=p.staff_id AND r.company_id=p.company_id WHERE p.company_id=${cid} ORDER BY p.year DESC,p.month DESC,p.id DESC`);
      if(M!=='POST')return fail('Метод не дозволено',405);
      const staffId=Number(body.staff_id),year=Number(body.year),month=Number(body.month),gross=Number(body.gross);
      if(!Number.isSafeInteger(staffId)||!Number.isSafeInteger(year)||year<2020||year>2100||!Number.isSafeInteger(month)||month<1||month>12||!Number.isFinite(gross)||gross<0||gross>1e9)return fail('Перевірте працівника, період та нараховану суму');
      const employee=(await sql`SELECT id,name,data FROM refs WHERE id=${staffId} AND company_id=${cid} AND kind='staff'`)[0];
      if(!employee)return fail('Працівника не знайдено',404);
      const norm=(await sql`SELECT data FROM refs WHERE company_id=${cid} AND kind='taxnorm' AND data->>'year'=${String(year)} ORDER BY id DESC LIMIT 1`)[0]?.data;
      if(!norm)return fail('Спочатку створіть нормативи для цього року в довіднику «Податкові нормативи»');
      const living=Number(norm.living),minWage=Number(norm.minimum_wage);
      if(!(living>0&&minWage>0))return fail('У нормативі потрібно задати прожитковий мінімум і мінімальну зарплату');
      const pct=Number(employee.data?.psp_pct||100);
      const entitled=employee.data?.psp_eligible==='yes';
      if(![100,150,200].includes(pct))return fail('Вкажіть правильний відсоток ПСП (100, 150 або 200) у довіднику персоналу');
      const threshold=Math.round(living*1.4/10)*10;
      const psp=entitled&&gross<=threshold?r2(living*0.5*pct/100):0;
      const pitRate=Number(norm.pit_rate ?? 18), militaryRate=Number(norm.military_rate ?? 5), defaultEsvRate=Number(norm.esv_rate ?? 22);
      if(![pitRate,militaryRate,defaultEsvRate].every(v=>Number.isFinite(v)&&v>=0&&v<=50))return fail('Некоректні ставки ПДФО, ВЗ або ЄСВ у нормативах');
      const pit=r2(Math.max(0,gross-psp)*pitRate/100);
      const military=r2(gross*militaryRate/100);
      const extra=Array.isArray(body.deductions)?body.deductions:[];
      if(extra.length>25||extra.some(d=>!d||String(d.name||'').length>100||!String(d.name||'').trim()||!Number.isFinite(Number(d.amount))||Number(d.amount)<0||Number(d.amount)>gross))return fail('Некоректні додаткові утримання');
      const extras=extra.map(d=>({name:String(d.name).trim(),amount:r2(Number(d.amount))}));
      const extraTotal=r2(extras.reduce((a,d)=>a+d.amount,0));
      const net=r2(gross-pit-military-extraTotal);
      if(net<0)return fail('Утримання перевищують суму до виплати');
      const esvRate=Number(employee.data?.esv_rate || defaultEsvRate);
      if(!(esvRate>=0&&esvRate<=50))return fail('Некоректна ставка ЄСВ');
      // Minimum ESV basis only when user explicitly confirms full month/main employment.
      const fullMain=body.full_main_job===true;
      const capMw=Number(employee.data?.esv_cap_mw||20);
      if(!(capMw>0&&capMw<=40))return fail('Некоректна гранична база ЄСВ у картці працівника (кількість МЗП від 1 до 40)');
      const E=calcEsv({gross,minWage,rate:esvRate,capMw,fullMain}),esv=E.esv;
      const firstHalf=Number(body.first_half || 0);
      if(!Number.isFinite(firstHalf)||firstHalf<0||firstHalf>gross)return fail('Перша половина не може перевищувати місячне нарахування');
      const debit=String(employee.data?.payroll_debit||'92');
      if(!/^(23|91|92|93|94|15|20|26)$/.test(debit))return fail('Непідтримуваний рахунок витрат на оплату праці у персоналі');
      const details={gross:r2(gross),first_half:r2(firstHalf),second_half:r2(gross-firstHalf),pit,military,pit_rate:pitRate,military_rate:militaryRate,psp,threshold,net,esv,esv_base:E.base,esv_actual:E.actual,esv_topup:E.topUp,esv_topup_base:E.topUpBase,esv_cap_mw:capMw,esv_rate:esvRate,payroll_debit:debit,extras,year,month,full_main_job:fullMain,staff_name:employee.name,psp_applied:psp>0};
      const row=(await sql`INSERT INTO payroll_calculations(company_id,staff_id,year,month,gross,details,created_by) VALUES (${cid},${staffId},${year},${month},${gross},${JSON.stringify(details)}::jsonb,${me.id}) ON CONFLICT(company_id,staff_id,year,month) DO UPDATE SET gross=EXCLUDED.gross,details=EXCLUDED.details,created_by=EXCLUDED.created_by,updated_at=now() WHERE payroll_calculations.posted_at IS NULL RETURNING id,details`)[0];
      if(!row)return fail('Проведений розрахунок не можна змінювати. Використайте механізм бухгалтерських коригувань.',409);
      await aud(c,'payroll-calculate','payroll',row.id,null,details,'Розрахунок без бухгалтерського проведення');
      return json(row);
    }

    if (res === 'prices') {
      const cid=Number(M==='POST'?body.company_id:q.get('company_id'));
      const c=await own(cid,M==='POST','refs',M==='POST'?'create':'read');
      if(!c)return fail('Немає доступу до цін',403);
      if(M==='GET') {
        const at=q.get('date')||'2999-12-31';if(!validISODate(at))return fail('Некоректна дата ціни');
        const history=q.get('history')==='1';
        if(history)return json(await sql`SELECT p.id,p.item_id,p.price_type_id,to_char(p.effective_from,'YYYY-MM-DD') AS effective_from,p.price,i.name AS item_name,t.name AS type_name
          FROM item_prices p JOIN refs i ON i.id=p.item_id AND i.company_id=${cid} AND i.kind='item' JOIN refs t ON t.id=p.price_type_id AND t.company_id=${cid} AND t.kind='price_type'
          WHERE p.company_id=${cid} ORDER BY p.effective_from DESC,p.id DESC`);
        return json(await sql`SELECT DISTINCT ON (p.item_id,p.price_type_id) p.id,p.item_id,p.price_type_id,to_char(p.effective_from,'YYYY-MM-DD') AS effective_from,p.price,i.name AS item_name,t.name AS type_name
          FROM item_prices p JOIN refs i ON i.id=p.item_id AND i.company_id=${cid} AND i.kind='item' JOIN refs t ON t.id=p.price_type_id AND t.company_id=${cid} AND t.kind='price_type'
          WHERE p.company_id=${cid} AND p.effective_from<=${at}::date ORDER BY p.item_id,p.price_type_id,p.effective_from DESC,p.id DESC`);
      }
      if(M!=='POST')return fail('Метод не дозволено',405);
      const itemId=Number(body.item_id),priceTypeId=Number(body.price_type_id),price=Number(body.price),date=body.effective_from;
      if(!Number.isSafeInteger(itemId)||!Number.isSafeInteger(priceTypeId)||!validISODate(date)||!Number.isFinite(price)||price<0||price>9999999999999||Math.abs(price*100-Math.round(price*100))>1e-7)return fail('Перевірте товар, тип ціни, дату та суму');
      const check=await sql`SELECT kind,id FROM refs WHERE company_id=${cid} AND id=ANY(${[itemId,priceTypeId]}::int[])`;
      if(check.length!==2||!check.some(r=>r.id===itemId&&r.kind==='item')||!check.some(r=>r.id===priceTypeId&&r.kind==='price_type'))return fail('Товар або тип ціни не належить підприємству');
      await sql.transaction([
        sql`INSERT INTO item_prices(company_id,item_id,price_type_id,effective_from,price) VALUES (${cid},${itemId},${priceTypeId},${date},${price}) ON CONFLICT(company_id,item_id,price_type_id,effective_from) DO UPDATE SET price=EXCLUDED.price`,
        aud(c,'price-set','price',itemId,null,{price_type_id:priceTypeId,effective_from:date,price},'Встановлення ціни')]);
      return json({ok:true});
    }
    if (res === 'lots' && M === 'GET') {
      const cid=Number(q.get('company_id')),wid=Number(q.get('wh_id')),itemId=Number(q.get('item_id'));
      const c=await own(cid,false,'stock','read');if(!c)return fail('Немає доступу',403);
      const at=q.get('date')||'2999-12-31';if(!validISODate(at))return fail('Некоректна дата');
      return json(await sql`SELECT m.lot_key, SUM(m.qty)::numeric AS qty, SUM(m.amount)::numeric AS amount,
        MIN(to_char(m.date,'YYYY-MM-DD')) AS first_date,MAX(d.number) FILTER (WHERE m.qty>0) AS document
        FROM stock_moves m LEFT JOIN docs d ON d.id=m.doc_id
        WHERE m.company_id=${cid} AND m.wh_id=${wid} AND m.item_id=${itemId} AND m.date<=${at}::date AND m.lot_key IS NOT NULL
        GROUP BY m.lot_key HAVING SUM(m.qty)>0 ORDER BY MIN(m.date),m.lot_key`);
    }
    if (res === 'refs') {
      if (M === 'POST') {
        const c = await access(Number(body.company_id), body.id ? 'update' : 'create');
        if (!c) return fail('Немає доступу', 403);
        const name = String(body.name || '').trim(), data = JSON.stringify(body.data || {});
        if (!name || !body.kind) return fail('Вкажіть назву');
        if(body.kind==='item') {
          const typeId=Number(body.data?.item_type_id),uomId=Number(body.data?.uom_id);
          const ty=(await sql`SELECT id,data FROM refs WHERE id=${typeId} AND company_id=${c.id} AND kind='item_type'`)[0];
          const un=(await sql`SELECT id,data FROM refs WHERE id=${uomId} AND company_id=${c.id} AND kind='uom'`)[0];
          if(!ty||!un)return fail('Оберіть вид номенклатури й одиницю виміру з довідників');
          if(body.id) {
            const old=(await sql`SELECT data FROM refs WHERE company_id=${c.id} AND id=${Number(body.id)} AND kind='item'`)[0];
            if(old&&(String(old.data?.item_type_id||'')!==String(typeId)||String(old.data?.uom_id||'')!==String(uomId)) &&
                (await sql`SELECT 1 FROM stock_moves WHERE company_id=${c.id} AND item_id=${Number(body.id)} LIMIT 1`).length){
              const wasClassified=Boolean(old.data?.item_type_id&&old.data?.uom_id);
              if(wasClassified) return fail('Вид та базову одиницю номенклатури зі складською історією змінювати не можна.',409);
              if(body.legacy_classify!==true)return fail('Це стара позиція з рухами без виду номенклатури. Перед першою класифікацією звірте історичні рахунки й підтвердьте дію в картці. Історичні проводки автоматично не змінюються.',409);
            }
          }
        }
        if(body.kind==='item_type') {
          const x=body.data||{},stockable=x.stockable==='yes';
          if(!/^[a-z0-9_]{2,32}$/.test(String(x.code||''))||!['yes','no'].includes(x.stockable))return fail('Вкажіть код виду й ознаку складського обліку');
          const ac=[x.revenue_acc,x.cost_acc,...(stockable?[x.stock_acc]:[])].map(String);
          const known=await sql`SELECT code,kind FROM accounts WHERE code=ANY(${ac}::text[])`;
          if(ac.some(code=>!known.some(k=>k.code===code&&k.kind!=='O')))return fail('Вкажіть наявні балансові рахунки для виду номенклатури');
          if(stockable&&!/^2\d{1,2}$/.test(String(x.stock_acc||'')))return fail('Рахунок складського обліку має належати класу 2 (запаси)');
          if(!/^9\d{1,2}$/.test(String(x.cost_acc||''))||!/^7\d{1,2}$/.test(String(x.revenue_acc||'')))return fail('Рахунок собівартості — клас 9, доходу — клас 7');
          if(body.id) {
            const old=(await sql`SELECT data FROM refs WHERE id=${Number(body.id)} AND company_id=${c.id} AND kind='item_type'`)[0]?.data;
            if(old&&['stock_acc','revenue_acc','cost_acc','stockable'].some(k=>old[k]!==x[k])&&
              (await sql`SELECT 1 FROM stock_moves m JOIN refs i ON i.id=m.item_id WHERE m.company_id=${c.id} AND i.data->>'item_type_id'=${String(body.id)} LIMIT 1`).length)
              return fail('Вид використовується в складському обліку. Зміна рахунків змінить логіку нових документів — створіть новий вид.',409);
          }
        }
        if(body.kind==='uom'&&!String(body.data?.code||'').trim())return fail('Вкажіть скорочення одиниці виміру');
        if (body.id) {
          await sql`UPDATE refs SET name=${name}, data=${data}::jsonb WHERE id=${Number(body.id)} AND company_id=${c.id} AND kind=${body.kind}`;
          if(body.kind==='item'&&body.legacy_classify===true)await aud(c,'legacy-item-classification','item',Number(body.id),null,{type_id:body.data?.item_type_id,uom_id:body.data?.uom_id},'Класифікація старої номенклатури без зміни попередніх проводок');
        }
        else await sql`INSERT INTO refs(company_id,kind,name,data) VALUES (${c.id},${body.kind},${name},${data}::jsonb)`;
        return json({ ok: true });
      }
      const c = await access(Number(q.get('company_id')), M === 'DELETE' ? 'delete' : 'read');
      if (!c) return fail('Немає доступу', 403);
      if (M === 'DELETE') {
        const r=(await sql`SELECT kind FROM refs WHERE id=${Number(id)} AND company_id=${c.id}`)[0];
        if(r?.kind==='item_type'&&(await sql`SELECT 1 FROM refs WHERE company_id=${c.id} AND kind='item' AND data->>'item_type_id'=${String(id)} LIMIT 1`).length)
          return fail('Вид номенклатури використовується в картках товарів',409);
        if(r?.kind==='uom'&&(await sql`SELECT 1 FROM refs WHERE company_id=${c.id} AND kind='item' AND data->>'uom_id'=${String(id)} LIMIT 1`).length)
          return fail('Одиниця виміру використовується в картках товарів',409);
        await sql`DELETE FROM refs WHERE id=${Number(id)} AND company_id=${c.id}`;return json({ok:true}); }
      return json(await sql`SELECT id, kind, name, data FROM refs WHERE company_id=${c.id} AND kind=${q.get('kind')} ORDER BY name`);
    }

    if (res === 'entries') {
      if (M === 'POST') {
        const c = await access(Number(body.company_id), body.id ? 'update' : 'create');
        if (!c) return fail('Немає доступу', 403);
        lockCheck(c, body.date);
        let lines = body.lines || [{ debit_acc: body.debit_acc, credit_acc: body.credit_acc, amount: body.amount }];
        const financialClose=body.doc==='Закриття фінансових результатів';
        if(financialClose&&!validISODate(body.date))return fail('Некоректна дата закриття');
        const closingRule=financialClose?await mapEntries('financial:close',body.date,lines):{lines,id:null};
        lines=closingRule.lines;
        if (!validISODate(body.date) || !validLines(lines)) return fail('Перевірте дату (РРРР-ММ-ДД), Дт/Кт та суми: додатні числа з точністю до 2 знаків');
        const codes=[...new Set(lines.flatMap(l=>[l.debit_acc,l.credit_acc]))];
        const known=await sql`SELECT code,kind FROM accounts WHERE code = ANY(${codes}::text[])`;
        if(known.length !== codes.length) return fail('У проводці використано рахунок, відсутній у плані рахунків');
        const kindByCode=new Map(known.map(a=>[a.code,a.kind]));
        if(lines.some(l=> (kindByCode.get(l.debit_acc)==='O') !== (kindByCode.get(l.credit_acc)==='O') && l.debit_acc!=='000' && l.credit_acc!=='000'))
          return fail('Не можна змішувати позабалансовий і балансовий рахунки в одній проводці');
        // усі проводки операції — в одній транзакції: або всі, або жодної
        await sql.transaction(lines.map((l) => sql`INSERT INTO entries(company_id,date,doc,description,partner,debit_acc,credit_acc,amount,posting_rule_version_id)
          VALUES (${c.id},${body.date},${body.doc || ''},${body.description || ''},${body.partner || ''},${l.debit_acc},${l.credit_acc},${Number(l.amount)},${closingRule.id})`));
        return json({ ok: true }, 201);
      }
      const c = await access(Number(q.get('company_id')), M === 'DELETE' ? 'delete' : 'read');
      if (!c) return fail('Немає доступу', 403);
      if (M === 'DELETE') return fail('Фізичне видалення проводок заборонено: використайте сторно або виправлення', 405);
      // Explicit page/limit is opt-in. Legacy reports continue to receive all rows.
      const pageSize = Math.min(1000,Math.max(1,Number(q.get('limit'))||1000));
      const offset = Math.max(0,Number(q.get('offset'))||0);
      if (q.has('limit') || q.has('offset')) return json(await sql`SELECT id, to_char(date,'YYYY-MM-DD') AS date, doc, description, partner, storno_of, add_of, corr_id, doc_id, debit_acc, credit_acc, amount
        FROM entries_a WHERE company_id=${c.id} ORDER BY date DESC, id DESC LIMIT ${pageSize} OFFSET ${offset}`);
      return json(await sql`SELECT id, to_char(date,'YYYY-MM-DD') AS date, doc, description, partner, storno_of, add_of, corr_id, doc_id, debit_acc, credit_acc, amount
        FROM entries_a WHERE company_id=${c.id} ORDER BY date DESC, id DESC`);
    }

    if (res === 'osv' || res === 'pnl') {
      const c = await access(Number(q.get('company_id')), 'read');
      if (!c) return fail('Немає доступу', 403);
      const from = q.get('from') || '1900-01-01', to = q.get('to') || '2999-12-31';
      if (res === 'pnl') { // обороти доходів і витрат без закриття на рахунок 79
        const r = await sql`SELECT code, SUM(d) AS d, SUM(c) AS c FROM (
            SELECT debit_acc AS code, amount AS d, 0::numeric AS c FROM entries_a
              WHERE company_id=${c.id} AND date BETWEEN ${from}::date AND ${to}::date AND credit_acc NOT LIKE '79%'
            UNION ALL
            SELECT credit_acc, 0::numeric, amount FROM entries_a
              WHERE company_id=${c.id} AND date BETWEEN ${from}::date AND ${to}::date AND debit_acc NOT LIKE '79%') x
          WHERE code ~ '^[789]' AND code NOT LIKE '79%' GROUP BY code`;
        return json(r.map((x) => ({ code: x.code, d: Number(x.d), c: Number(x.c) })));
      }
      const rows = await sql`
        WITH mv AS (
          SELECT debit_acc AS acc, amount AS d, 0::numeric AS c, date FROM entries_a WHERE company_id=${c.id}
          UNION ALL
          SELECT credit_acc, 0::numeric, amount, date FROM entries_a WHERE company_id=${c.id})
        SELECT a.code, a.name,
          COALESCE(SUM(CASE WHEN mv.date < ${from}::date THEN mv.d - mv.c END),0) AS opening,
          COALESCE(SUM(CASE WHEN mv.date BETWEEN ${from}::date AND ${to}::date THEN mv.d END),0) AS debit,
          COALESCE(SUM(CASE WHEN mv.date BETWEEN ${from}::date AND ${to}::date THEN mv.c END),0) AS credit
        FROM accounts a LEFT JOIN mv ON mv.acc = a.code GROUP BY a.code, a.name ORDER BY a.code`;
      return json(rows.map((r) => {
        const o = Number(r.opening), d = Number(r.debit), cr = Number(r.credit);
        return { code: r.code, name: r.name, opening: o, debit: d, credit: cr, closing: o + d - cr };
      }).filter((r) => r.code !== '000' && (r.opening || r.debit || r.credit)));
    }

    if (res === 'stock') {
      const c = await access(Number(q.get('company_id')), 'read');
      if (!c) return fail('Немає доступу', 403);
      if (q.get('item_id')) return json(await sql`SELECT m.id, to_char(m.date,'YYYY-MM-DD') AS date, m.qty, m.amount, w.name AS wh, d.number, d.type
        FROM stock_moves m JOIN refs w ON w.id=m.wh_id LEFT JOIN docs d ON d.id=m.doc_id
        WHERE m.company_id=${c.id} AND m.item_id=${Number(q.get('item_id'))} ORDER BY m.date, m.id`);
      return json(await sql`SELECT w.name AS wh, i.name AS item, i.data->>'unit' AS unit, SUM(m.qty) AS qty, SUM(m.amount) AS amount
        FROM stock_moves m JOIN refs w ON w.id=m.wh_id JOIN refs i ON i.id=m.item_id
        WHERE m.company_id=${c.id} AND m.date <= ${q.get('to') || '2999-12-31'}::date
        GROUP BY m.wh_id, m.item_id, w.name, i.name, i.data->>'unit' HAVING SUM(m.qty) <> 0 OR SUM(m.amount) <> 0 ORDER BY w.name, i.name`);
    }

    if (res === 'docs') {
      if (id && M === 'GET') {
        const d = (await sql`SELECT id, company_id, type, number, to_char(date,'YYYY-MM-DD') AS date, partner, data, storno, version FROM docs WHERE id=${Number(id)}`)[0];
        if (!d || !(await own(d.company_id, false, 'docs', 'read'))) return fail('Не знайдено', 404);
        return json(d);
      }
      if (M === 'POST') {
        const c = await access(Number(body.company_id), body.id ? 'update' : 'create');
        if (!c) return fail('Немає доступу', 403);
        lockCheck(c, body.date);
        const B = await buildDoc(c, body, null);
        const mapped=await mapEntries('doc:'+B.type,body.date,B.ent);
        B.ent=mapped.lines;B.rule_version_id=mapped.id;
        await assertPostable(B.ent.filter(([,,am])=>am>0));
        const docId = Number((await sql`SELECT nextval(pg_get_serial_sequence('docs','id')) AS id`)[0].id);
        await sql.transaction([
          ...(['rcpt','prod','ost','sale','wo','mv'].includes(B.type)?[inventoryClaim(c)]:[]),
          sql`INSERT INTO docs(id,company_id,type,number,date,partner,data) VALUES (${docId},${c.id},${B.type},${B.number},${body.date},${body.partner || ''},${JSON.stringify(B.data)}::jsonb)`,
          ...entIns(c, B, body.date, body.partner, docId, null),
          ...mvIns(c, B, body.date, docId)]);
        return json({ id: docId }, 201);
      }
      const c = await access(Number(q.get('company_id')), 'read');
      if (!c) return fail('Немає доступу', 403);
      const pageSize = Math.min(1000,Math.max(1,Number(q.get('limit'))||1000));
      const offset = Math.max(0,Number(q.get('offset'))||0);
      if (q.has('limit') || q.has('offset')) return json(await sql`SELECT id, type, number, to_char(date,'YYYY-MM-DD') AS date, partner, storno, (data->>'total')::numeric AS total
        FROM docs WHERE company_id=${c.id} ORDER BY date DESC, id DESC LIMIT ${pageSize} OFFSET ${offset}`);
      return json(await sql`SELECT id, type, number, to_char(date,'YYYY-MM-DD') AS date, partner, storno, (data->>'total')::numeric AS total
        FROM docs WHERE company_id=${c.id} ORDER BY date DESC, id DESC`);
    }

    if (res === 'periods' && M === 'POST') {
      const c = await own(Number(body.company_id), true, 'settings', 'update');
      if (!c) return fail('Немає доступу', 403);
      const v = body.closed_until ? String(body.closed_until) : null;
      if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw bad('Невірна дата');
      await sql.transaction([sql`UPDATE companies SET closed_until=${v} WHERE id=${c.id}`, aud(c, 'period', 'company', c.id, { closed_until: c.closed_until }, { closed_until: v }, null)]);
      return json({ ok: true });
    }
    if (res === 'audit') {
      const c = await access(Number(q.get('company_id')), 'read');
      if (!c) return fail('Немає доступу', 403);
      return json(await sql`SELECT id, to_char(at,'YYYY-MM-DD HH24:MI:SS') AS at, user_name, action, object_type, object_id, old_data, new_data, reason
        FROM audit_log WHERE company_id=${c.id} ORDER BY id DESC LIMIT 300`);
    }
    if (res === 'history') {
      const c = await access(Number(q.get('company_id')), 'read');
      if (!c) return fail('Немає доступу', 403);
      const doc = Number(q.get('doc_id')) || 0, ent = Number(q.get('entry_id')) || 0;
      return json({
        corr: await sql`SELECT number, method, to_char(cdate,'YYYY-MM-DD') AS cdate, orig_amount, delta, result_amount, reason, user_name FROM corrections
          WHERE company_id=${c.id} AND ((${doc} > 0 AND source_doc_id=${doc}) OR (${ent} > 0 AND source_entry_id=${ent})) ORDER BY id`,
        vers: doc ? await sql`SELECT version, snapshot, user_name, reason, to_char(created_at,'YYYY-MM-DD HH24:MI') AS at FROM doc_versions WHERE doc_id=${doc} ORDER BY version` : [],
        audit: await sql`SELECT to_char(at,'YYYY-MM-DD HH24:MI') AS at, user_name, action, reason FROM audit_log
          WHERE company_id=${c.id} AND ((object_type='doc' AND object_id=${String(doc)}) OR (object_type='entry' AND object_id=${String(ent)})) ORDER BY id`,
      });
    }
    if (res === 'corrections') {
      if (M === 'GET' && sub === 'memo') {
        const c = await access(Number(q.get('company_id')), 'read');
        if (!c) return fail('Немає доступу', 403);
        const corrId=Number(id);
        if (!Number.isSafeInteger(corrId) || corrId<=0) return fail('Некоректний номер виправлення');
        const k=(await sql`SELECT id,number,method,to_char(cdate,'YYYY-MM-DD') AS cdate,orig_amount,delta,result_amount,reason,user_name,source_doc_id,source_entry_id FROM corrections WHERE id=${corrId} AND company_id=${c.id}`)[0];
        if(!k) return fail('Виправлення не знайдено',404);
        const entries=await sql`SELECT id,debit_acc,credit_acc,amount,description,storno_of,add_of FROM entries WHERE corr_id=${corrId} AND company_id=${c.id} ORDER BY id`;
        // Помилкові записи (що саме виправлено) та посилання на первинний документ / регістр обліку
        const wrong=await sql`SELECT id,to_char(date,'YYYY-MM-DD') AS date,doc,description,debit_acc,credit_acc,amount FROM entries
          WHERE company_id=${c.id} AND (id IN (SELECT storno_of FROM entries WHERE corr_id=${corrId} AND storno_of IS NOT NULL) OR superseded_by=${corrId}) ORDER BY id`;
        const sdoc=k.source_doc_id?(await sql`SELECT id,type,number,to_char(date,'YYYY-MM-DD') AS date,partner FROM docs WHERE id=${k.source_doc_id} AND company_id=${c.id}`)[0]:null;
        const sent=k.source_entry_id?(await sql`SELECT id,to_char(date,'YYYY-MM-DD') AS date,doc,description FROM entries WHERE id=${k.source_entry_id} AND company_id=${c.id}`)[0]:null;
        return json({correction:k,entries,wrong,source_doc:sdoc,source_entry:sent,company_name:c.name,company_settings:c.settings||{}});
      }
      if (M !== 'POST') {
        const c = await access(Number(q.get('company_id')), 'read');
        if (!c) return fail('Немає доступу', 403);
        const g = (k) => q.get(k) || '';
        return json(await sql`SELECT k.id, k.number, to_char(k.cdate,'YYYY-MM-DD') AS cdate, k.method, k.orig_amount, k.delta, k.result_amount, k.reason, k.user_name, k.status,
            k.source_doc_id, k.source_entry_id, COALESCE(d.number, e.doc, '') AS source
          FROM corrections k LEFT JOIN docs d ON d.id=k.source_doc_id LEFT JOIN entries e ON e.id=k.source_entry_id
          WHERE k.company_id=${c.id} AND (${g('method')}='' OR k.method=${g('method')})
            AND (${g('user')}='' OR k.user_name ILIKE '%' || ${g('user')} || '%')
            AND k.cdate >= ${g('from') || '1900-01-01'}::date AND k.cdate <= ${g('to') || '2999-12-31'}::date
            AND (${g('q')}='' OR (COALESCE(d.number, e.doc, '') || ' ' || k.number || ' ' || k.reason) ILIKE '%' || ${g('q')} || '%')
          ORDER BY k.id DESC LIMIT 500`);
      }
      const c = await access(Number(body.company_id), body.id ? 'update' : 'create');
      if (!c) return fail('Немає доступу', 403);
      const kind = id, key = String(body.request_key || '');
      if (!['storno', 'add', 'fix'].includes(kind)) return fail('Невідомий метод', 404);
      if (!body.preview) {
        if (!key) throw bad('Відсутній ключ запиту');
        const dup = (await sql`SELECT id, number FROM corrections WHERE company_id=${c.id} AND request_key=${key}`)[0];
        if (dup) return json({ id: dup.id, number: dup.number, duplicate: true });
      }
      const reason = String(body.reason || '').trim();
      const cid = Number((await sql`SELECT nextval(pg_get_serial_sequence('corrections','id')) AS id`)[0].id), number = 'КОР-' + cid;
      const ins = (m, sd, se, o, dl, rs) => sql`INSERT INTO corrections(id,company_id,number,method,source_doc_id,source_entry_id,cdate,orig_amount,delta,result_amount,reason,nature,user_id,user_name,request_key)
        VALUES (${cid},${c.id},${number},${m},${sd},${se},${body.date},${o},${dl},${rs},${reason},${body.nature || null},${me.id},${me.name},${key})`;
      const docSel = (did) => sql`SELECT id, number, to_char(date,'YYYY-MM-DD') AS date, partner, data, storno, version FROM docs WHERE id=${did} AND company_id=${c.id}`;
      let ent = null, docId = Number(body.doc_id) || null;
      if (body.entry_id) {
        ent = (await sql`SELECT id, to_char(date,'YYYY-MM-DD') AS date, doc, description, partner, debit_acc, credit_acc, amount, storno_of, add_of, active, doc_id FROM entries WHERE id=${Number(body.entry_id)} AND company_id=${c.id}`)[0];
        if (!ent) return fail('Проводку не знайдено', 404);
        if (kind === 'storno' && ent.doc_id) docId = ent.doc_id;
      }
      const yearOk = (src) => { if (String(src).slice(0, 4) < String(body.date).slice(0, 4) && !['material', 'immaterial'].includes(body.nature)) throw bad('Помилка минулого року: вкажіть її характер (суттєва / несуттєва) за НП(С)БО 6'); };
      if (kind === 'storno' && docId) { // повне сторно документа з усіма проводками та складськими рухами
        lockCheck(c, body.date);
        if (!validISODate(body.date)) throw bad('Вкажіть коректну дату сторно');
        const d = (await docSel(docId))[0];
        if (!d) return fail('Документ не знайдено', 404);
        if (d.storno) throw bad('Документ уже сторновано');
        if (reason.length < 3) throw bad('Вкажіть причину виправлення');
        yearOk(d.date);
        const CL = cleanCorrect(body.correct);
        if (CL.length) await assertPostable(CL);
        if ((await sql`SELECT 1 FROM entries_a WHERE add_of IN (SELECT id FROM entries_a WHERE doc_id=${d.id}) LIMIT 1`).length) throw bad('Спершу сторнуйте додаткові записи до цього документа');
        const tot = Number(d.data.total || 0);
        // Сторно надходження / випуску / переміщення забирає ТМЦ зі складу: товар уже міг бути проданий або списаний.
        const added = await sql`SELECT m.wh_id, m.item_id, r.qty AS doc_qty, COALESCE(SUM(m.qty),0) AS total,
            COALESCE(SUM(m.qty) FILTER (WHERE m.date <= ${body.date}::date),0) AS upto
          FROM stock_moves m JOIN (SELECT wh_id,item_id,SUM(qty) AS qty FROM stock_moves WHERE doc_id=${d.id} GROUP BY wh_id,item_id HAVING SUM(qty) > 0) r
            ON r.wh_id=m.wh_id AND r.item_id=m.item_id
          WHERE m.company_id=${c.id} GROUP BY m.wh_id, m.item_id, r.qty`;
        if (added.some((x) => Number(x.total) - Number(x.doc_qty) < -1e-9 || Number(x.upto) - Number(x.doc_qty) < -1e-9))
          throw bad('Сторно неможливе: ТМЦ із цього документа вже продано, списано або переміщено. Спершу сторнуйте пізніші документи.');
        await sql.transaction([
          ...(['rcpt','prod','ost','sale','wo','mv'].includes(d.type)?[inventoryClaim(c)]:[]),
          sql`SELECT 1 / count(*) FROM (SELECT id FROM docs WHERE id=${d.id} AND NOT storno AND version=${d.version} FOR UPDATE) g`,
          ins('storno', d.id, null, tot, -tot, 0),
          sql`INSERT INTO entries(company_id,date,doc,description,partner,debit_acc,credit_acc,amount,storno_of,doc_id,corr_id)
            SELECT company_id, ${body.date}::date, ${number}, 'Сторно: ' || COALESCE(description,''), partner, debit_acc, credit_acc, -amount, id, doc_id, ${cid}
            FROM entries_a WHERE doc_id=${d.id} AND storno_of IS NULL AND amount > 0`,
          ...CL.map((l) => sql`INSERT INTO entries(company_id,date,doc,description,partner,debit_acc,credit_acc,amount,corr_id)
            VALUES (${c.id},${body.date},${number},${'Правильний запис після сторно документа ' + d.number},${d.partner || ''},${l.debit_acc},${l.credit_acc},${l.amount},${cid})`),
          sql`INSERT INTO stock_moves(company_id,doc_id,date,wh_id,item_id,qty,amount,lot_key)
            SELECT company_id, doc_id, ${body.date}::date, wh_id, item_id, -qty, -amount, lot_key FROM stock_moves WHERE doc_id=${d.id}`,
          sql`UPDATE docs SET storno=true, version=version+1 WHERE id=${d.id}`,
          aud(c, 'storno', 'doc', d.id, { total: tot, storno: false }, { total: 0, storno: true, correction: number }, reason)]);
        return json({ id: cid, number }, 201);
      }
      if (kind === 'fix') { // коректурне виправлення документа з перепроведенням
        const d = (await docSel(docId))[0];
        if (!d) return fail('Документ не знайдено', 404);
        if (d.storno) throw bad('Документ сторновано — виправляти його не можна');
        if (Number(body.expected_version) !== d.version) return fail('Документ змінено іншим користувачем — оновіть сторінку', 409);
        const X = d.data, whId = async (name, id0) => id0 || (name ? (await sql`SELECT id FROM refs WHERE company_id=${c.id} AND kind='wh' AND name=${name}`)[0]?.id : null);
        const base = { date: d.date, partner: d.partner, lines: X.lines, wh_id: await whId(X.wh, X.wh_id), wh2_id: await whId(X.wh2, X.wh2_id), corr: X.corr, stock: X.stock, basis: X.basis, sum: X.total, vat_comp: Number(X.vat_comp || 0) > 0 };
        const ch = Object.fromEntries(Object.entries(body.changes || {}).filter(([k, v]) => ['date', 'partner', 'corr', 'basis', 'sum', 'lines'].includes(k) && v !== '' && v != null));
        const merged = { ...base, ...ch, company_id: c.id, type: d.type, number: d.number };
        lockCheck(c, d.date); lockCheck(c, merged.date);
        const B = await buildDoc(c, merged, d.id);
        const mapped=await mapEntries('doc:'+B.type,merged.date,B.ent);
        B.ent=mapped.lines;B.rule_version_id=mapped.id;
        await assertPostable(B.ent.filter(([,,am])=>am>0));
        const oldE = await sql`SELECT debit_acc, credit_acc, amount FROM entries_a WHERE doc_id=${d.id} AND storno_of IS NULL ORDER BY id`;
        const newE = B.ent.filter(([a1, k1, am]) => am > 0 && a1 !== k1).map(([a1, k1, am]) => ({ debit_acc: a1, credit_acc: k1, amount: am }));
        if (body.preview) return json({ old: oldE, new: newE });
        if (reason.length < 3) throw bad('Вкажіть причину виправлення');
        yearOk(d.date);
        const oldMoves = await sql`SELECT wh_id, item_id, qty, amount,lot_key FROM stock_moves WHERE doc_id=${d.id}`;
        const oldT = Number(X.total || 0), newT = Number(B.data.total || 0);
        await sql.transaction([
          ...(['rcpt','prod','ost','sale','wo','mv'].includes(d.type)?[inventoryClaim(c)]:[]),
          sql`SELECT 1 / count(*) FROM (SELECT id FROM docs WHERE id=${d.id} AND NOT storno AND version=${d.version} FOR UPDATE) g`,
          sql`INSERT INTO doc_versions(doc_id,version,snapshot,user_name,reason) VALUES (${d.id},${d.version},${JSON.stringify({ doc: { date: d.date, partner: d.partner, data: X }, entries: oldE, moves: oldMoves })}::jsonb,${me.name},${reason})`,
          ins('fix', d.id, null, oldT, r2(newT - oldT), newT),
          sql`UPDATE entries SET active=false, superseded_by=${cid} WHERE doc_id=${d.id} AND active`,
          sql`DELETE FROM stock_moves WHERE doc_id=${d.id}`,
          sql`UPDATE docs SET date=${merged.date}, partner=${merged.partner || ''}, data=${JSON.stringify(B.data)}::jsonb, version=version+1 WHERE id=${d.id}`,
          ...entIns(c, B, merged.date, merged.partner, d.id, cid), ...mvIns(c, B, merged.date, d.id),
          aud(c, 'fix', 'doc', d.id, { date: d.date, partner: d.partner, total: oldT, entries: oldE }, { date: merged.date, partner: merged.partner, total: newT, entries: newE }, reason)]);
        return json({ id: cid, number }, 201);
      }
      // сторно або додатковий запис до окремої проводки
      if (!ent) throw bad('Оберіть проводку');
      lockCheck(c, body.date);
      const linked = await sql`SELECT amount FROM entries_a WHERE storno_of=${ent.id} OR add_of=${ent.id}`;
      const P = planCorr(kind, ent, linked, body);
      if (body.preview) return json(P);
      const CL = kind === 'storno' ? cleanCorrect(body.correct) : [];
      if (CL.length) await assertPostable(CL);
      await sql.transaction([
        sql`SELECT 1 / count(*) FROM (SELECT x.id FROM entries x WHERE x.id=${ent.id} AND x.active AND x.amount + COALESCE((SELECT SUM(s.amount) FROM entries s WHERE (s.storno_of=x.id OR s.add_of=x.id) AND s.active),0) = ${P.eff}::numeric FOR UPDATE) g`,
        ins(kind, null, ent.id, P.eff, P.delta, P.result),
        sql`INSERT INTO entries(company_id,date,doc,description,partner,debit_acc,credit_acc,amount,storno_of,add_of,corr_id)
          VALUES (${c.id},${body.date},${number},${(kind === 'storno' ? 'Сторно: ' : 'Додатковий запис: ') + (ent.description || '')},${ent.partner || ''},${ent.debit_acc},${ent.credit_acc},${P.delta},${kind === 'storno' ? ent.id : null},${kind === 'add' ? ent.id : null},${cid})`,
        ...CL.map((l) => sql`INSERT INTO entries(company_id,date,doc,description,partner,debit_acc,credit_acc,amount,corr_id)
          VALUES (${c.id},${body.date},${number},${'Правильний запис після сторно: ' + (ent.description || '')},${ent.partner || ''},${l.debit_acc},${l.credit_acc},${l.amount},${cid})`),
        aud(c, kind, 'entry', ent.id, { amount: P.eff }, { amount: P.result, delta: P.delta, correction: number, correct: CL }, reason)]);
      return json({ id: cid, number }, 201);
    }
    return fail('Не знайдено', 404);
  } catch (e) {
    const dz = /division by zero/i.test(e.message), dup = /duplicate key/i.test(e.message);
    return fail(dz ? 'Дані змінено іншим користувачем або операція вже неможлива — оновіть сторінку й повторіть' : dup ? 'Це коригування вже виконано' : e.message, dz || dup ? 409 : e.status || 500);
  }
};
