// Isolated policy for exceptional same-day system-rule publication.
// Password verification is exclusively server-side; never export this file to /public.
import { scryptSync, timingSafeEqual } from 'node:crypto';

export function kyivToday(instant = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(instant);
  const data = Object.fromEntries(parts.filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  return `${data.year}-${data.month}-${data.day}`;
}

export function activationScheduleError(eff, today, lastDate, alreadyOnDate) {
  if (eff < today) return 'Неможливо активувати правило заднім числом';
  if (alreadyOnDate) return 'На цю дату правило вже активоване. Оберіть іншу дату активації.';
  if (eff !== today && lastDate && eff <= lastDate) return 'Запланована версія вже має пізнішу або однакову дату: ' + lastDate;
  return null;
}

export function verifySuperadminPassword(password, user) {
  if (typeof password !== 'string' || !password || password.length > 1024 || !user?.salt || !user?.hash) return false;
  const given = Buffer.from(scryptSync(password, user.salt, 32).toString('hex'), 'hex');
  const expected = Buffer.from(user.hash, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
