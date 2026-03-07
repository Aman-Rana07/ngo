# NGO Portal - Local Backend & Admin Approval

This workspace adds a simple Node.js + Express backend and admin pages to manage volunteer registrations.

Quick start:

1. Install dependencies

```bash
cd /Users/karan/Desktop/NGO_PORTAL_WORK
npm install
```

2. Start server

```bash
npm start
```

3. Open pages in your browser:
- Volunteer registration: [homepage.html](homepage.html)
- Admin login: [admin_login.html](admin_login.html)
- Admin dashboard: [admin_dashboard.html](admin_dashboard.html)

Default admin credentials:
- username: `admin`
- password: `admin123`

API summary (localhost:5000):
- `POST /api/register` — register volunteer (goes to pending)
- `POST /api/admin/login` — admin login, returns token
- `GET /api/admin/pending` — list pending (requires `x-admin-token` header)
- `POST /api/admin/approve` — approve id (requires token)
- `POST /api/admin/deny` — deny id (requires token)

Database: `volunteers.db` (SQLite) created in workspace root.
