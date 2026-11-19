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

export default async (req) => {
  if (!SECRET) return fail('На сервері не задано AUTH_SECRET', 500);
  const url = new URL(req.url), q = url.searchParams, M = req.method;
  const [res, id, sub] = url.pathname.replace(/^\/api\//, '').split('/').filter(Boolean);
  try {
    const body = M === 'POST' ? await req.json().catch(() => ({})) : {};

    if (res === 'register' && M === 'POST') {
      const login = String(body.login || '').trim().toLowerCase(), name = String(body.name || '').trim(), pw = String(body.password || '');
      if (!login || !name || pw.length < 6) return fail('Вкажіть логін, ім’я та пароль (від 6 символів)');
      let role = 'student';
      if (body.teacher_code) {
        if (!process.env.TEACHER_CODE || body.teacher_code !== process.env.TEACHER_CODE) return fail('Невірний код викладача', 403);
        role = 'teacher';
      }
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
    const T = me.role === 'teacher';
    // доступ до підприємства: власник — читання й запис; викладач — лише читання
    const own = async (cid, write) => {
      const c = (await sql`SELECT * FROM companies WHERE id=${cid}`)[0];
      if (!c) return null;
      return c.owner_id === me.id || (!write && T) ? c : null;
    };

    if (res === 'me') return json({ id: me.id, name: me.name, role: me.role });
    if (res === 'accounts') {
      if (M === 'POST') {
        if (!T) return fail('Лише для викладача', 403);
        const code = String(body.code || '').trim();
        if (!/^\d{1,4}$/.test(code) || !String(body.name || '').trim() || !['A', 'P', 'AP', 'O'].includes(body.kind)) return fail('Невірні дані рахунку');
        await sql`INSERT INTO accounts(code,name,kind) VALUES (${code},${body.name.trim()},${body.kind})
          ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, kind=EXCLUDED.kind`;
        return json({ ok: true });
      }
      if (M === 'DELETE') {
        if (!T) return fail('Лише для викладача', 403);
        if ((await sql`SELECT 1 FROM entries WHERE debit_acc=${id} OR credit_acc=${id} LIMIT 1`).length) return fail('Рахунок використовується в проводках — видалити не можна', 409);
        await sql`DELETE FROM accounts WHERE code=${id}`;
        return json({ ok: true });
      }
      return json(await sql`SELECT code, name, kind FROM accounts ORDER BY code`);
    }

    if (res === 'companies') {
      if (M === 'POST') {
        const name = String(body.name || '').trim(), st = JSON.stringify(body.settings || {});
        if (!name) return fail('Вкажіть назву');
        if (id) {
          const c = await own(Number(id), true);
          if (!c) return fail('Немає доступу', 403);
          return json((await sql`UPDATE companies SET name=${name}, settings=${st}::jsonb WHERE id=${c.id} RETURNING id, name, settings`)[0]);
        }
        return json((await sql`INSERT INTO companies(name, owner_id, settings) VALUES (${name}, ${me.id}, ${st}::jsonb) RETURNING id, name, settings`)[0], 201);
      }
      return json(T
        ? await sql`SELECT c.id, c.name, c.settings, u.name AS owner FROM companies c LEFT JOIN users u ON u.id=c.owner_id ORDER BY u.name NULLS LAST, c.id DESC`
        : await sql`SELECT id, name, settings FROM companies WHERE owner_id=${me.id} ORDER BY id DESC`);
    }

    if (res === 'refs') {
      if (M === 'POST') {
        const c = await own(Number(body.company_id), true);
        if (!c) return fail('Немає доступу', 403);
        const name = String(body.name || '').trim(), data = JSON.stringify(body.data || {});
        if (!name || !body.kind) return fail('Вкажіть назву');
        if (body.id) await sql`UPDATE refs SET name=${name}, data=${data}::jsonb WHERE id=${Number(body.id)} AND company_id=${c.id}`;
        else await sql`INSERT INTO refs(company_id,kind,name,data) VALUES (${c.id},${body.kind},${name},${data}::jsonb)`;
        return json({ ok: true });
      }
      const c = await own(Number(q.get('company_id')), M === 'DELETE');
      if (!c) return fail('Немає доступу', 403);
      if (M === 'DELETE') { await sql`DELETE FROM refs WHERE id=${Number(id)} AND company_id=${c.id}`; return json({ ok: true }); }
      return json(await sql`SELECT id, kind, name, data FROM refs WHERE company_id=${c.id} AND kind=${q.get('kind')} ORDER BY name`);
    }

    if (res === 'entries') {
      if (id && sub === 'storno' && M === 'POST') { // червоне сторно: та сама кореспонденція з від’ємною сумою
        const c = await own(Number(body.company_id), true);
        if (!c) return fail('Немає доступу', 403);
        if (!body.date) return fail('Вкажіть дату сторно');
        if ((await sql`SELECT 1 FROM entries WHERE storno_of=${Number(id)}`).length) return fail('Цю проводку вже сторновано', 409);
        const r = await sql`INSERT INTO entries(company_id,date,doc,description,partner,debit_acc,credit_acc,amount,storno_of)
          SELECT company_id, ${body.date}::date, 'Сторно ' || COALESCE(doc,''), 'Сторно: ' || COALESCE(description,''), partner, debit_acc, credit_acc, -amount, id
          FROM entries WHERE id=${Number(id)} AND company_id=${c.id} AND storno_of IS NULL RETURNING id`;
        return r.length ? json({ ok: true }, 201) : fail('Проводку не знайдено або вона сама є сторно', 404);
      }
      if (M === 'POST') {
        const c = await own(Number(body.company_id), true);
        if (!c) return fail('Немає доступу', 403);
        const lines = body.lines || [{ debit_acc: body.debit_acc, credit_acc: body.credit_acc, amount: body.amount }];
        if (!body.date || !validLines(lines)) return fail('Заповніть усі поля; Дт і Кт мають різнитися, сума > 0');
        // усі проводки операції — в одній транзакції: або всі, або жодної
        await sql.transaction(lines.map((l) => sql`INSERT INTO entries(company_id,date,doc,description,partner,debit_acc,credit_acc,amount)
          VALUES (${c.id},${body.date},${body.doc || ''},${body.description || ''},${body.partner || ''},${l.debit_acc},${l.credit_acc},${Number(l.amount)})`));
        return json({ ok: true }, 201);
      }
      const c = await own(Number(q.get('company_id')), M === 'DELETE');
      if (!c) return fail('Немає доступу', 403);
      if (M === 'DELETE') { await sql`DELETE FROM entries WHERE id=${Number(id)} AND company_id=${c.id} AND doc_id IS NULL`; return json({ ok: true }); }
      return json(await sql`SELECT id, to_char(date,'YYYY-MM-DD') AS date, doc, description, partner, storno_of, doc_id, debit_acc, credit_acc, amount
        FROM entries WHERE company_id=${c.id} ORDER BY date DESC, id DESC`);
    }

    if (res === 'osv' || res === 'pnl') {
      const c = await own(Number(q.get('company_id')));
      if (!c) return fail('Немає доступу', 403);
      const from = q.get('from') || '1900-01-01', to = q.get('to') || '2999-12-31';
      if (res === 'pnl') { // обороти доходів і витрат без закриття на рахунок 79
        const r = await sql`SELECT code, SUM(d) AS d, SUM(c) AS c FROM (
            SELECT debit_acc AS code, amount AS d, 0::numeric AS c FROM entries
              WHERE company_id=${c.id} AND date BETWEEN ${from}::date AND ${to}::date AND credit_acc NOT LIKE '79%'
            UNION ALL
            SELECT credit_acc, 0::numeric, amount FROM entries
              WHERE company_id=${c.id} AND date BETWEEN ${from}::date AND ${to}::date AND debit_acc NOT LIKE '79%') x
          WHERE code ~ '^[789]' AND code NOT LIKE '79%' GROUP BY code`;
        return json(r.map((x) => ({ code: x.code, d: Number(x.d), c: Number(x.c) })));
      }
      const rows = await sql`
        WITH mv AS (
          SELECT debit_acc AS acc, amount AS d, 0::numeric AS c, date FROM entries WHERE company_id=${c.id}
          UNION ALL
          SELECT credit_acc, 0::numeric, amount, date FROM entries WHERE company_id=${c.id})
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
      const c = await own(Number(q.get('company_id')));
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
      if (id && sub === 'storno' && M === 'POST') {
        const d = (await sql`SELECT id, company_id, storno FROM docs WHERE id=${Number(id)}`)[0];
        const c = d && (await own(d.company_id, true));
        if (!c) return fail('Немає доступу', 403);
        if (d.storno) return fail('Документ уже сторновано', 409);
        if (!body.date) return fail('Вкажіть дату сторно');
        await sql.transaction([
          sql`INSERT INTO entries(company_id,date,doc,description,partner,debit_acc,credit_acc,amount,storno_of,doc_id)
            SELECT company_id, ${body.date}::date, 'Сторно ' || COALESCE(doc,''), 'Сторно: ' || COALESCE(description,''), partner, debit_acc, credit_acc, -amount, id, doc_id
            FROM entries WHERE doc_id=${d.id} AND storno_of IS NULL`,
          sql`INSERT INTO stock_moves(company_id,doc_id,date,wh_id,item_id,qty,amount)
            SELECT company_id, doc_id, ${body.date}::date, wh_id, item_id, -qty, -amount FROM stock_moves WHERE doc_id=${d.id}`,
          sql`UPDATE docs SET storno=true WHERE id=${d.id}`]);
        return json({ ok: true });
      }
      if (id && M === 'GET') {
        const d = (await sql`SELECT id, company_id, type, number, to_char(date,'YYYY-MM-DD') AS date, partner, data, storno FROM docs WHERE id=${Number(id)}`)[0];
        if (!d || !(await own(d.company_id))) return fail('Не знайдено', 404);
        return json(d);
      }
      if (M === 'POST') {
        const c = await own(Number(body.company_id), true);
        if (!c) return fail('Немає доступу', 403);
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
          hist[key] ??= (await sql`SELECT qty, amount FROM stock_moves WHERE company_id=${c.id} AND wh_id=${w} AND item_id=${l.item_id} ORDER BY date, id`)
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
        const docId = Number((await sql`SELECT nextval(pg_get_serial_sequence('docs','id')) AS id`)[0].id);
        const data = { lines, sum: S, vat: V, rate: r * 100, total, wh, wh2, corr, basis: body.basis || '' };
        await sql.transaction([
          sql`INSERT INTO docs(id,company_id,type,number,date,partner,data) VALUES (${docId},${c.id},${type},${number},${body.date},${body.partner || ''},${JSON.stringify(data)}::jsonb)`,
          ...ent.filter(([d, k, am]) => am > 0 && d !== k).map(([d, k, am]) => sql`INSERT INTO entries(company_id,date,doc,description,partner,debit_acc,credit_acc,amount,doc_id)
            VALUES (${c.id},${body.date},${number},${desc},${body.partner || ''},${d},${k},${am},${docId})`),
          ...mv.map((m) => sql`INSERT INTO stock_moves(company_id,doc_id,date,wh_id,item_id,qty,amount) VALUES (${c.id},${docId},${body.date},${m.w},${m.i},${m.q},${m.a})`)]);
        return json({ id: docId }, 201);
      }
      const c = await own(Number(q.get('company_id')));
      if (!c) return fail('Немає доступу', 403);
      return json(await sql`SELECT id, type, number, to_char(date,'YYYY-MM-DD') AS date, partner, storno, (data->>'total')::numeric AS total
        FROM docs WHERE company_id=${c.id} ORDER BY date DESC, id DESC`);
    }

    if (res === 'tasks') {
      if (!id && M === 'GET') {
        return json(T
          ? await sql`SELECT t.id, t.title, t.description, (SELECT count(*)::int FROM submissions s WHERE s.task_id=t.id) AS n FROM tasks t ORDER BY t.id DESC`
          : await sql`SELECT t.id, t.title, t.description,
              (SELECT count(*)::int FROM submissions s WHERE s.task_id=t.id AND s.user_id=${me.id}) AS tries,
              EXISTS(SELECT 1 FROM submissions s WHERE s.task_id=t.id AND s.user_id=${me.id} AND s.correct) AS done
              FROM tasks t ORDER BY t.id DESC`);
      }
      if (!id && M === 'POST') {
        if (!T) return fail('Лише для викладача', 403);
        if (!String(body.title || '').trim() || !validLines(body.lines)) return fail('Вкажіть назву та правильні проводки');
        const lines = body.lines.map((l) => ({ debit_acc: l.debit_acc, credit_acc: l.credit_acc, amount: Number(l.amount) }));
        await sql`INSERT INTO tasks(title, description, lines) VALUES (${body.title.trim()}, ${body.description || ''}, ${JSON.stringify(lines)}::jsonb)`;
        return json({ ok: true }, 201);
      }
      if (id && M === 'DELETE') {
        if (!T) return fail('Лише для викладача', 403);
        await sql`DELETE FROM tasks WHERE id=${Number(id)}`;
        return json({ ok: true });
      }
      if (id && sub === 'answer' && M === 'POST') {
        const t = (await sql`SELECT lines FROM tasks WHERE id=${Number(id)}`)[0];
        if (!t) return fail('Завдання не знайдено', 404);
        const lines = Array.isArray(body.lines) ? body.lines : [];
        const exp = norm(t.lines), got = norm(lines);
        const correct = exp.length === got.length && exp.every((x, i) => x === got[i]);
        await sql`INSERT INTO submissions(task_id,user_id,answer,correct) VALUES (${Number(id)},${me.id},${JSON.stringify(lines)}::jsonb,${correct})`;
        return json({ correct, matched: exp.filter((x) => got.includes(x)).length, total: exp.length, expected: correct ? t.lines : undefined });
      }
    }
    if (res === 'submissions' && T) {
      return json(await sql`SELECT s.id, u.name, s.correct, s.answer, s.created_at FROM submissions s JOIN users u ON u.id=s.user_id
        WHERE s.task_id=${Number(q.get('task_id'))} ORDER BY s.id DESC`);
    }
    return fail('Не знайдено', 404);
  } catch (e) {
    return fail(e.message, e.status || 500);
  }
};
