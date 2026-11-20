# ProOblik — roles upgrade

1. Back up your Neon database before changing the schema.
2. Run `permissions_migration.sql` in Neon SQL Editor **once**, before deployment. It preserves existing accounting data. Existing `teacher` accounts become `superadmin`; existing company owners become `admin`; other `student` accounts become `user`.
3. Upload all project files to GitHub and deploy to Netlify. Keep `DATABASE_URL` and `AUTH_SECRET` configured.
4. Log out and log back in. Old tokens will be accepted temporarily but server checks the database company owner and memberships. To revoke all sessions rotate `AUTH_SECRET`.
5. Superadmin can choose any company, assign an admin using an existing login, and manage members. Admin can manage only owned companies and their users. New users can register but have no company access until added.
6. In «Користувачі та права», add login, name and a password (10+ characters) for a new user. For an existing user only login and permissions are required. Each user gets separate read/create/update/delete permissions for each module.

Important: Existing frontend modules were originally written for two roles. Backend permissions are enforced, but some legacy views may still show an edit button that results in HTTP 403, and some modules group several operations under one permission. Review and test in a staging environment before production use. Do not deploy to a production accounting system without regression testing.
