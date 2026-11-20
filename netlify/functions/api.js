import { neon } from '@neondatabase/serverless';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

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
const validLines = (ls) => Array.isArray(ls) && ls.length > 0 && ls.every((l) => l.debit_acc && l.credit_acc && Number(l.amount) > 0 && l.debit_acc !== l.credit_acc);

const r2 = (n) => Math.round(n * 100) / 100;
const bad = (m) => Object.assign(new Error(m), { status: 400 });
const DTYPES = ['pko', 'vko', 'bin', 'bout', 'rcpt', 'ost', 'sale', 'wo', 'mv', 'inv', 'act'];
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

const lockCheck = (c, date) => {
  if (c.closed_until && String(date) <= c.closed_until) throw bad(`Період до ${c.closed_until} закрито: редагування неможливе. Оформіть виправлення поточною датою (сторно або додатковий запис).`);
};
const effAmount = (e, linked) => r2(Number(e.amount) + linked.reduce((s, x) => s + Number(x.amount), 0));
// чиста функція перевірки й розрахунку коригування (сторно / додатковий запис)
function planCorr(method, e, linked, p) {
  if (!p.preview && String(p.reason || '').trim().length < 3) throw bad('Вкажіть причину виправлення');
  if (!p.date) throw bad('Вкажіть дату коригування');
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
const entIns = (c, B, date, partner, docId, cid) => B.ent.filter(([d, k, am]) => am > 0 && d !== k).map(([d, k, am]) =>
  sql`INSERT INTO entries(company_id,date,doc,description,partner,debit_acc,credit_acc,amount,doc_id,corr_id)
    VALUES (${c.id},${date},${B.number},${B.desc},${partner || ''},${d},${k},${am},${docId},${cid})`);
const mvIns = (c, B, date, docId) => B.mv.map((m) => sql`INSERT INTO stock_moves(company_id,doc_id,date,wh_id,item_id,qty,amount) VALUES (${c.id},${docId},${date},${m.w},${m.i},${m.q},${m.a})`);

async function buildDoc(c, body, excl) {
        const type = body.type;
        if (!DTYPES.includes(type) || !body.date) throw bad('Вкажіть вид документа та дату');
        const st = c.settings || {}, r = st.vat === false ? 0 : Number(st.rate ?? 20) / 100, method = st.inv === 'avg' ? 'avg' : 'fifo';
        const cash = ['pko', 'vko', 'bin', 'bout'].includes(type), stk = ['rcpt', 'ost', 'sale', 'wo', 'mv'].includes(type);
        const lines = (body.lines || []).filter((l) => Number(l.qty) > 0).map((l) => ({
          item_id: Number(l.item_id) || null, name: String(l.name || '').trim(), unit: String(l.unit || ''), qty: Number(l.qty), price: Number(l.price) || 0 }));
        lines.forEach((l) => { l.sum = r2(l.qty * l.price); });
        if (!cash && !lines.length) throw bad('Додайте хоча б один рядок');
        if (['sale', 'inv', 'act', 'rcpt'].includes(type) && !body.partner) throw bad('Оберіть контрагента');
        const nm = async (rid, kind) => rid ? (await sql`SELECT name FROM refs WHERE id=${rid} AND company_id=${c.id} AND kind=${kind}`)[0]?.name : null;
        let wh = null, wh2 = null;
        if (stk) {
          const ids = [...new Set(lines.map((l) => l.item_id))];
          if (ids.includes(null) || (await sql`SELECT id FROM refs WHERE company_id=${c.id} AND kind='item' AND id = ANY(${ids}::int[])`).length !== ids.length)
            throw bad('Оберіть номенклатуру зі довідника «Номенклатура»');
          wh = await nm(Number(body.wh_id), 'wh');
          if (!wh) throw bad('Оберіть склад');
          if (type === 'mv') { wh2 = await nm(Number(body.wh2_id), 'wh'); if (!wh2 || body.wh2_id === body.wh_id) throw bad('Оберіть інший склад-одержувач'); }
        }
        const S = r2(lines.reduce((s, l) => s + l.sum, 0)), V = r2(S * r), corr = String(body.corr || '');
        const hist = {};
        const out = async (l, w) => {
          const key = w + '-' + l.item_id;
          hist[key] ??= (await sql`SELECT qty, amount FROM stock_moves WHERE company_id=${c.id} AND wh_id=${w} AND item_id=${l.item_id} AND doc_id IS DISTINCT FROM ${excl}::int ORDER BY date, id`)
            .map((m) => ({ qty: Number(m.qty), amount: Number(m.amount) }));
          const cost = outCost(hist[key], l.qty, method);
          if (cost === null) throw bad('Недостатньо залишку на складі: ' + l.name);
          hist[key].push({ qty: -l.qty, amount: -cost });
          l.cost = cost; return cost;
        };
        const ent = [], mv = [], W = Number(body.wh_id), W2 = Number(body.wh2_id);
        let total = r2(S + V), C = 0;
        if (cash) {
          total = r2(Number(body.sum));
          if (!(total > 0) || !corr) throw bad('Вкажіть суму та кореспондуючий рахунок');
          ent.push(...[{ pko: ['301', corr], vko: [corr, '301'], bin: ['311', corr], bout: [corr, '311'] }[type]].map((p) => [...p, total]));
        } else if (type === 'rcpt') {
          ent.push([corr || '281', '631', S], ['644', '631', V]);
          lines.forEach((l) => mv.push({ w: W, i: l.item_id, q: l.qty, a: l.sum }));
        } else if (type === 'ost') {
          total = S; lines.forEach((l) => mv.push({ w: W, i: l.item_id, q: l.qty, a: l.sum }));
        } else if (type === 'sale') {
          const rev = corr || '702';
          for (const l of lines) { C += await out(l, W); mv.push({ w: W, i: l.item_id, q: -l.qty, a: -l.cost }); }
          ent.push(['361', rev, r2(S + V)], [rev, '641', V], [rev === '701' ? '901' : '902', rev === '701' ? '26' : '281', r2(C)]);
        } else if (type === 'wo') {
          for (const l of lines) { C += await out(l, W); mv.push({ w: W, i: l.item_id, q: -l.qty, a: -l.cost }); }
          total = r2(C); ent.push([corr || '947', String(body.stock || '281'), total]);
        } else if (type === 'mv') {
          for (const l of lines) { const k = await out(l, W); C += k; mv.push({ w: W, i: l.item_id, q: -l.qty, a: -k }, { w: W2, i: l.item_id, q: l.qty, a: k }); }
          total = r2(C);
        } else if (type === 'act') {
          ent.push(['361', '703', r2(S + V)], ['703', '641', V]);
        }
        const number = String(body.number || '').trim() || type.toUpperCase() + '-' + Date.now();
        const desc = `${number}${body.partner ? ' · ' + body.partner : ''}${body.basis ? ' · ' + body.basis : ''}`;
  const data = { lines, sum: S, vat: V, rate: r * 100, total, wh, wh2, corr, basis: body.basis || '', wh_id: W || null, wh2_id: W2 || null, stock: body.stock || null };
  return { type, number, desc, data, ent, mv };
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
    // Existing teacher accounts become superadmins after the migration.
    const T = me.role === 'superadmin' || me.role === 'teacher';
    const MODULES = ['refs','entries','docs','reports','stock','corrections','settings','audit'];
    const resourceModule = {refs:'refs',entries:'entries',docs:'docs',osv:'reports',pnl:'reports',stock:'stock',periods:'settings',audit:'audit',history:'audit',corrections:'corrections'};
    const own = async (cid, write = false, module = 'reports', action = null) => {
      if (!Number.isSafeInteger(Number(cid)) || Number(cid) <= 0) return null;
      const c = (await sql`SELECT * FROM companies WHERE id=${Number(cid)}`)[0];
      if (!c) return null;
      if (T || c.owner_id === me.id) return c;
      const member = (await sql`SELECT permissions FROM company_members WHERE company_id=${c.id} AND user_id=${me.id}`)[0];
      if (!member) return null;
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
    if (res === 'company-admin' && M === 'POST') {
      if (!T) return fail('Лише для суперадміністратора',403);
      const cid=Number(body.company_id),login=String(body.login||'').trim().toLowerCase();
      const u=(await sql`SELECT id,role FROM users WHERE login=${login}`)[0];
      if (!u || u.role==='superadmin') return fail('Користувача не знайдено або роль несумісна',400);
      const updated=await sql`UPDATE companies SET owner_id=${u.id} WHERE id=${cid} RETURNING id`;
      if (!updated.length) return fail('Підприємство не знайдено',404);
      await sql`UPDATE users SET role='admin' WHERE id=${u.id}`;
      return json({ok:true});
    }
    if (res === 'members') {
      const cid = Number(q.get('company_id') || body.company_id);
      const c = await own(cid);
      if (!c) return fail('Немає доступу', 403);
      const manager = T || c.owner_id === me.id;
      if (M === 'GET') {
        if (!manager) return fail('Недостатньо прав', 403);
        return json(await sql`SELECT u.id,u.login,u.name,m.permissions,m.can_create_company FROM company_members m JOIN users u ON u.id=m.user_id WHERE m.company_id=${cid} ORDER BY u.name`);
      }
      if (!manager) return fail('Тільки адміністратор підприємства', 403);
      if (M === 'POST') {
        const login = String(body.login || '').trim().toLowerCase();
        const name = String(body.name || '').trim();
        const pw = String(body.password || '');
        const permissions = body.permissions || {};
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
        if (user.role !== 'user' && user.role !== 'student') return fail('Не можна змінювати доступ адміністратора',403);
        await sql`INSERT INTO company_members(company_id,user_id,permissions,can_create_company) VALUES (${cid},${user.id},${JSON.stringify(permissions)}::jsonb,${body.can_create_company}) ON CONFLICT(company_id,user_id) DO UPDATE SET permissions=EXCLUDED.permissions,can_create_company=EXCLUDED.can_create_company`;
        return json({ok:true});
      }
      if (M === 'DELETE') {
        await sql`DELETE FROM company_members WHERE company_id=${cid} AND user_id=${Number(id)}`;
        return json({ok:true});
      }
      return fail('Метод не підтримується',405);
    }
    if (res === 'permissions') {
      const cid = Number(q.get('company_id'));
      const c = await own(cid);
      if (!c) return fail('Немає доступу',403);
      if (T || c.owner_id === me.id) return json({manager:true,permissions:Object.fromEntries(MODULES.map(k=>[k,{read:true,create:true,update:true,delete:true}]))});
      const m = (await sql`SELECT permissions FROM company_members WHERE company_id=${cid} AND user_id=${me.id}`)[0];
      return json({manager:false,permissions:m?.permissions||{}});
    }
    if (res === 'accounts') {
      if (M === 'POST') {
        if (!T) return fail('Лише для суперадміністратора', 403);
        const code = String(body.code || '').trim();
        if (!/^\d{1,4}$/.test(code) || !String(body.name || '').trim() || !['A', 'P', 'AP', 'O'].includes(body.kind)) return fail('Невірні дані рахунку');
        await sql`INSERT INTO accounts(code,name,kind) VALUES (${code},${body.name.trim()},${body.kind})
          ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, kind=EXCLUDED.kind`;
        return json({ ok: true });
      }
      if (M === 'DELETE') {
        if (!T) return fail('Лише для суперадміністратора', 403);
        if ((await sql`SELECT 1 FROM entries_a WHERE debit_acc=${id} OR credit_acc=${id} LIMIT 1`).length) return fail('Рахунок використовується в проводках — видалити не можна', 409);
        await sql`DELETE FROM accounts WHERE code=${id}`;
        return json({ ok: true });
      }
      return json(await sql`SELECT code, name, kind FROM accounts ORDER BY code`);
    }

    if (res === 'company-create-permission' && M === 'GET') {
      if (T || me.role === 'admin') return json({allowed:true});
      const allowed=(await sql`SELECT 1 FROM company_members WHERE user_id=${me.id} AND can_create_company=true LIMIT 1`).length>0;
      return json({allowed});
    }
    if (res === 'companies') {
      if (M === 'DELETE') {
        const cid = Number(id);
        if (!Number.isSafeInteger(cid) || cid <= 0) return fail('Невірне підприємство');
        const c = (await sql`SELECT id,name,owner_id FROM companies WHERE id=${cid}`)[0];
        if (!c) return fail('Підприємство не знайдено',404);
        if (!T && c.owner_id !== me.id) return fail('Видаляти підприємство може лише його адміністратор або суперадміністратор',403);
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
          return json((await sql`UPDATE companies SET name=${name}, settings=${st}::jsonb WHERE id=${c.id} RETURNING id, name, settings`)[0]);
        }
        if (!T) {
          const owned = (await sql`SELECT 1 FROM companies WHERE owner_id=${me.id} LIMIT 1`).length > 0;
          const granted = (await sql`SELECT 1 FROM company_members WHERE user_id=${me.id} AND can_create_company=true LIMIT 1`).length > 0;
          if (!owned && !granted && me.role !== 'admin') return fail('Створення підприємств заборонено адміністратором',403);
        }
        return json((await sql`INSERT INTO companies(name, owner_id, settings) VALUES (${name}, ${me.id}, ${st}::jsonb) RETURNING id, name, settings`)[0], 201);
      }
      return json(T
        ? await sql`SELECT c.id, c.name, c.settings, c.closed_until, c.owner_id, u.name AS owner FROM companies c LEFT JOIN users u ON u.id=c.owner_id ORDER BY u.name NULLS LAST, c.id DESC`
        : await sql`SELECT DISTINCT c.id, c.name, c.settings, c.closed_until, c.owner_id FROM companies c LEFT JOIN company_members m ON m.company_id=c.id AND m.user_id=${me.id} WHERE c.owner_id=${me.id} OR m.user_id=${me.id} ORDER BY c.id DESC`);
    }

    if (res === 'refs') {
      if (M === 'POST') {
        const c = await access(Number(body.company_id), body.id ? 'update' : 'create');
        if (!c) return fail('Немає доступу', 403);
        const name = String(body.name || '').trim(), data = JSON.stringify(body.data || {});
        if (!name || !body.kind) return fail('Вкажіть назву');
        if (body.id) await sql`UPDATE refs SET name=${name}, data=${data}::jsonb WHERE id=${Number(body.id)} AND company_id=${c.id} AND kind=${body.kind}`;
        else await sql`INSERT INTO refs(company_id,kind,name,data) VALUES (${c.id},${body.kind},${name},${data}::jsonb)`;
        return json({ ok: true });
      }
      const c = await access(Number(q.get('company_id')), M === 'DELETE' ? 'delete' : 'read');
      if (!c) return fail('Немає доступу', 403);
      if (M === 'DELETE') { await sql`DELETE FROM refs WHERE id=${Number(id)} AND company_id=${c.id}`; return json({ ok: true }); }
      return json(await sql`SELECT id, kind, name, data FROM refs WHERE company_id=${c.id} AND kind=${q.get('kind')} ORDER BY name`);
    }

    if (res === 'entries') {
      if (M === 'POST') {
        const c = await access(Number(body.company_id), body.id ? 'update' : 'create');
        if (!c) return fail('Немає доступу', 403);
        lockCheck(c, body.date);
        const lines = body.lines || [{ debit_acc: body.debit_acc, credit_acc: body.credit_acc, amount: body.amount }];
        if (!body.date || !validLines(lines)) return fail('Заповніть усі поля; Дт і Кт мають різнитися, сума > 0');
        // усі проводки операції — в одній транзакції: або всі, або жодної
        await sql.transaction(lines.map((l) => sql`INSERT INTO entries(company_id,date,doc,description,partner,debit_acc,credit_acc,amount)
          VALUES (${c.id},${body.date},${body.doc || ''},${body.description || ''},${body.partner || ''},${l.debit_acc},${l.credit_acc},${Number(l.amount)})`));
        return json({ ok: true }, 201);
      }
      const c = await access(Number(q.get('company_id')), M === 'DELETE' ? 'delete' : 'read');
      if (!c) return fail('Немає доступу', 403);
      if (M === 'DELETE') return fail('Фізичне видалення проводок заборонено: використайте сторно або виправлення', 405);
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
        const docId = Number((await sql`SELECT nextval(pg_get_serial_sequence('docs','id')) AS id`)[0].id);
        await sql.transaction([
          sql`INSERT INTO docs(id,company_id,type,number,date,partner,data) VALUES (${docId},${c.id},${B.type},${B.number},${body.date},${body.partner || ''},${JSON.stringify(B.data)}::jsonb)`,
          ...entIns(c, B, body.date, body.partner, docId, null),
          ...mvIns(c, B, body.date, docId)]);
        return json({ id: docId }, 201);
      }
      const c = await access(Number(q.get('company_id')), 'read');
      if (!c) return fail('Немає доступу', 403);
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
        const d = (await docSel(docId))[0];
        if (!d) return fail('Документ не знайдено', 404);
        if (d.storno) throw bad('Документ уже сторновано');
        if (reason.length < 3) throw bad('Вкажіть причину виправлення');
        yearOk(d.date);
        if ((await sql`SELECT 1 FROM entries_a WHERE add_of IN (SELECT id FROM entries_a WHERE doc_id=${d.id}) LIMIT 1`).length) throw bad('Спершу сторнуйте додаткові записи до цього документа');
        const tot = Number(d.data.total || 0);
        await sql.transaction([
          sql`SELECT 1 / count(*) FROM (SELECT id FROM docs WHERE id=${d.id} AND NOT storno AND version=${d.version} FOR UPDATE) g`,
          ins('storno', d.id, null, tot, -tot, 0),
          sql`INSERT INTO entries(company_id,date,doc,description,partner,debit_acc,credit_acc,amount,storno_of,doc_id,corr_id)
            SELECT company_id, ${body.date}::date, ${number}, 'Сторно: ' || COALESCE(description,''), partner, debit_acc, credit_acc, -amount, id, doc_id, ${cid}
            FROM entries_a WHERE doc_id=${d.id} AND storno_of IS NULL AND amount > 0`,
          sql`INSERT INTO stock_moves(company_id,doc_id,date,wh_id,item_id,qty,amount)
            SELECT company_id, doc_id, ${body.date}::date, wh_id, item_id, -qty, -amount FROM stock_moves WHERE doc_id=${d.id}`,
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
        const base = { date: d.date, partner: d.partner, lines: X.lines, wh_id: await whId(X.wh, X.wh_id), wh2_id: await whId(X.wh2, X.wh2_id), corr: X.corr, stock: X.stock, basis: X.basis, sum: X.total };
        const ch = Object.fromEntries(Object.entries(body.changes || {}).filter(([k, v]) => ['date', 'partner', 'corr', 'basis', 'sum', 'lines'].includes(k) && v !== '' && v != null));
        const merged = { ...base, ...ch, company_id: c.id, type: d.type, number: d.number };
        lockCheck(c, d.date); lockCheck(c, merged.date);
        const B = await buildDoc(c, merged, d.id);
        const oldE = await sql`SELECT debit_acc, credit_acc, amount FROM entries_a WHERE doc_id=${d.id} AND storno_of IS NULL ORDER BY id`;
        const newE = B.ent.filter(([a1, k1, am]) => am > 0 && a1 !== k1).map(([a1, k1, am]) => ({ debit_acc: a1, credit_acc: k1, amount: am }));
        if (body.preview) return json({ old: oldE, new: newE });
        if (reason.length < 3) throw bad('Вкажіть причину виправлення');
        yearOk(d.date);
        const oldMoves = await sql`SELECT wh_id, item_id, qty, amount FROM stock_moves WHERE doc_id=${d.id}`;
        const oldT = Number(X.total || 0), newT = Number(B.data.total || 0);
        await sql.transaction([
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
      await sql.transaction([
        sql`SELECT 1 / count(*) FROM (SELECT x.id FROM entries x WHERE x.id=${ent.id} AND x.active AND x.amount + COALESCE((SELECT SUM(s.amount) FROM entries s WHERE (s.storno_of=x.id OR s.add_of=x.id) AND s.active),0) = ${P.eff}::numeric FOR UPDATE) g`,
        ins(kind, null, ent.id, P.eff, P.delta, P.result),
        sql`INSERT INTO entries(company_id,date,doc,description,partner,debit_acc,credit_acc,amount,storno_of,add_of,corr_id)
          VALUES (${c.id},${body.date},${number},${(kind === 'storno' ? 'Сторно: ' : 'Додатковий запис: ') + (ent.description || '')},${ent.partner || ''},${ent.debit_acc},${ent.credit_acc},${P.delta},${kind === 'storno' ? ent.id : null},${kind === 'add' ? ent.id : null},${cid})`,
        aud(c, kind, 'entry', ent.id, { amount: P.eff }, { amount: P.result, delta: P.delta, correction: number }, reason)]);
      return json({ id: cid, number }, 201);
    }
    return fail('Не знайдено', 404);
  } catch (e) {
    const dz = /division by zero/i.test(e.message), dup = /duplicate key/i.test(e.message);
    return fail(dz ? 'Дані змінено іншим користувачем або операція вже неможлива — оновіть сторінку й повторіть' : dup ? 'Це коригування вже виконано' : e.message, dz || dup ? 409 : e.status || 500);
  }
};
