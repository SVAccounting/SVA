// Declarative, non-executable accounting-rule interpreter.
// Posting overrides change correspondence only; amounts are calculated by the verified source module.
export const DOC_TYPES = ['pko','vko','bin','bout','rcpt','prod','ost','sale','wo','mv','inv','act'];
export const POSTING_KEYS = [...DOC_TYPES.map(x=>'doc:'+x),'payroll:accrual','payroll:payment:wage','payroll:payment:pit','payroll:payment:military','payroll:payment:esv','financial:close'];
export const REPORT_KEYS = ['F1A','F1P','F2'];
const account = x => typeof x === 'string' && /^\d{1,4}$/.test(x);
const allowedModes = new Set(['A','P','D','C','R','K','X','E']);
const problem = msg => { throw new Error(msg); };

export function validatePosting(config) {
  const rows = config?.mappings;
  if (!Array.isArray(rows) || rows.length>80) problem('Очікується не більше 80 правил заміни проводок');
  const seen = new Set();
  for (let i=0;i<rows.length;i++) {
    const r=rows[i];
    if(!r || Object.keys(r).some(k=>!['from_debit','from_credit','to_debit','to_credit'].includes(k)) ||
       ![r.from_debit,r.from_credit,r.to_debit,r.to_credit].every(account)) problem(`Неправильні рахунки у правилі ${i+1}`);
    if(r.to_debit===r.to_credit) problem(`У правилі ${i+1} дебет і кредит однакові`);
    const key=r.from_debit+'|'+r.from_credit;
    if(seen.has(key)) problem('Одна початкова кореспонденція вказана двічі: '+key);
    seen.add(key);
  }
  return {mappings:rows.map(x=>({...x}))};
}

export function applyPosting(config, lines) {
  const {mappings}=validatePosting(config);
  const byOriginal=new Map(mappings.map(m=>[m.from_debit+'|'+m.from_credit,m]));
  return lines.map(l=>{
    const arr=Array.isArray(l), debit=arr?l[0]:l.debit_acc, credit=arr?l[1]:l.credit_acc;
    const map=byOriginal.get(debit+'|'+credit);
    if(!map) return arr?[...l]:{...l};
    if(arr)return [map.to_debit,map.to_credit,...l.slice(2)];
    return {...l,debit_acc:map.to_debit,credit_acc:map.to_credit};
  });
}

export function validateReport(config, codes=[]) {
  if(!config || typeof config!=='object' || Array.isArray(config))problem('Невірний формат формул');
  const rows=config.rows;
  if(!rows || typeof rows!=='object' || Array.isArray(rows) || Object.keys(rows).length>180)problem('Невірні рядки звіту');
  const codeSet=new Set(codes);
  for (const [row,spec] of Object.entries(rows)) {
    if(!codeSet.has(row))problem('Рядок '+row+' відсутній у формі');
    if(typeof spec!=='string' || !spec.trim() || spec.length>300)problem('Порожня або занадто довга формула для '+row);
    const s=spec.replace(/\s/g,'');
    if(s==='Z')continue;
    if(/^[=<>]/.test(s)){
      if(!/^[=<>](?:[+-]?\d{4})+$/.test(s))problem('Невірна формула рядків '+row);
      const refs=[...s.slice(1).matchAll(/[+-]?(\d{4})/g)].map(x=>x[1]);
      if(refs.some(x=>!codeSet.has(x)||x===row))problem('Невірне посилання у рядку '+row);
      continue;
    }
    const seen=new Map();
    const terms=s.split(';');
    if(!terms.length || terms.length>30)problem('Забагато джерел у рядку '+row);
    for(const raw of terms){
      const m=raw.match(/^([+-]?)([APDCRKXE])(?::(\d{1,4}(?:,\d{1,4})*))?$/);
      if(!m || !allowedModes.has(m[2]) || (m[2]!=='R' && !m[3]) || (m[2]==='R' && m[3]))problem('Неправильне джерело у рядку '+row+': '+raw);
      if(m[3])for(const prefix of m[3].split(',')){
        const others=seen.get(m[2])||[];
        if(others.some(x=>prefix.startsWith(x)||x.startsWith(prefix)))problem(`Перекриття рахунків ${prefix} у рядку ${row}`);
        others.push(prefix);seen.set(m[2],others);
      }
    }
  }
  // Detect cycles in dependency graph across overridden row expressions.
  const visiting=new Set(),done=new Set();
  function walk(k){if(done.has(k))return;if(visiting.has(k))problem('Циклічне посилання у формулах: '+k);visiting.add(k);
    const s=rows[k];if(s && /^[=<>]/.test(s)) for(const m of s.matchAll(/\d{4}/g)) if(rows[m[0]]) walk(m[0]);
    visiting.delete(k);done.add(k);}
  for(const k of Object.keys(rows))walk(k);
  return {rows:Object.fromEntries(Object.entries(rows).map(([k,v])=>[k,v.replace(/\s/g,'')]))};
}

// Pure numerical evaluator used in server-side pre-activation diagnostics.
export function evaluateReport(defaults, overrides, balances=[], pnl=[]) {
  const specs={...defaults,...overrides}, values={},visiting=new Set();
  const pick=(r,prefixes)=>r.filter(x=>prefixes.some(p=>String(x.code).startsWith(p)));
  const sum=(r,fn)=>r.reduce((n,x)=>n+fn(x),0);
  const term=s=>{
    const sign=s.startsWith('-')?-1:1;
    const [mode,accounts]=s.replace(/^[+-]/,'').split(':');const pf=accounts?.split(',')||[];
    let val=0;
    if(mode==='A')val=sum(pick(balances,pf),x=>Number(x.closing));
    else if(mode==='P')val=-sum(pick(balances,pf),x=>Number(x.closing));
    else if(mode==='D')val=sum(pick(balances,pf),x=>Math.max(Number(x.closing),0));
    else if(mode==='C')val=sum(pick(balances,pf),x=>Math.max(-Number(x.closing),0));
    else if(mode==='R')val=-sum(balances.filter(x=>/^[789]/.test(String(x.code))&&!String(x.code).startsWith('79')),x=>Number(x.closing));
    else if(mode==='K')val=sum(pick(pnl,pf),x=>Number(x.c)-Number(x.d));
    else if(mode==='X')val=sum(pick(pnl,pf),x=>Number(x.d)-Number(x.c));
    else if(mode==='E')val=sum(pick(pnl,pf),x=>Number(x.d));
    return sign*val;
  };
  const read=(k)=>{
    if(Object.hasOwn(values,k))return values[k];
    if(visiting.has(k))problem('Циклічне посилання на звітний рядок '+k);
    visiting.add(k);
    const s=String(specs[k]||'Z');let n=0;
    if(/^[=<>]/.test(s)){
      n=[...s.slice(1).matchAll(/([+-]?)(\d{4})/g)].reduce((a,m)=>a+(m[1]==='-'?-1:1)*read(m[2]),0);
      if(s[0]==='>')n=Math.max(n,0);
      if(s[0]==='<')n=Math.max(-n,0);
    }else if(s!=='Z'&&s!=='h') n=s.split(';').reduce((a,x)=>a+term(x),0);
    if(!Number.isFinite(n))problem('Некоректний результат у рядку '+k);
    visiting.delete(k);values[k]=n;return n;
  };
  Object.keys(defaults).forEach(read);return values;
}
