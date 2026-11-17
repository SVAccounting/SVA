# SV Бухгалтерія 

1. Neon: створіть проєкт, у SQL Editor виконайте `schema.sql` (можна повторно), скопіюйте connection string.
2. Завантажте папку в GitHub і підключіть репозиторій до Netlify (або `npx netlify deploy --prod`).
3. Netlify → Site settings → Environment variables:
   - `DATABASE_URL` — connection string з Neon;
   - `AUTH_SECRET` — довільний довгий рядок (напр. `openssl rand -hex 32`);
   - `TEACHER_CODE` — секретний код, за яким викладачі реєструються як викладачі.
4. Задеплойте. Студенти реєструються самі; викладач вводить `TEACHER_CODE` при реєстрації.
Локально: `npm i && npx netlify dev`.
