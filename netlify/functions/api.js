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
    if (res === 'accounts') return json(await sql`SELECT code, name, kind FROM accounts ORDER BY code`);

    if (res === 'companies') {
      if (M === 'POST') {
        if (!String(body.name || '').trim()) return fail('Вкажіть назву');
        const r = await sql`INSERT INTO companies(name, owner_id) VALUES (${body.name.trim()}, ${me.id}) RETURNING id, name`;
        return json(r[0], 201);
      }
      return json(T
        ? await sql`SELECT c.id, c.name, u.name AS owner FROM companies c LEFT JOIN users u ON u.id=c.owner_id ORDER BY u.name NULLS LAST, c.id DESC`
        : await sql`SELECT id, name FROM companies WHERE owner_id=${me.id} ORDER BY id DESC`);
    }

    if (res === 'entries') {
      if (M === 'POST') {
        const c = await own(Number(body.company_id), true);
        if (!c) return fail('Немає доступу', 403);
        const lines = body.lines || [{ debit_acc: body.debit_acc, credit_acc: body.credit_acc, amount: body.amount }];
        if (!body.date || !validLines(lines)) return fail('Заповніть усі поля; Дт і Кт мають різнитися, сума > 0');
        // усі проводки операції — в одній транзакції: або всі, або жодної
        await sql.transaction(lines.map((l) => sql`INSERT INTO entries(company_id,date,doc,description,debit_acc,credit_acc,amount)
          VALUES (${c.id},${body.date},${body.doc || ''},${body.description || ''},${l.debit_acc},${l.credit_acc},${Number(l.amount)})`));
        return json({ ok: true }, 201);
      }
      const c = await own(Number(q.get('company_id')), M === 'DELETE');
      if (!c) return fail('Немає доступу', 403);
      if (M === 'DELETE') { await sql`DELETE FROM entries WHERE id=${Number(id)} AND company_id=${c.id}`; return json({ ok: true }); }
      return json(await sql`SELECT id, to_char(date,'YYYY-MM-DD') AS date, doc, description, debit_acc, credit_acc, amount
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
          WHERE code ~ '^[79]' AND code NOT LIKE '79%' GROUP BY code`;
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
      }).filter((r) => r.opening || r.debit || r.credit));
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
    return fail(e.message, 500);
  }
};
