# TBC – Trillion Business Community
## Complete Local Setup Guide for macOS

---

## Prerequisites

Before starting, ensure you have these installed:

| Tool         | Version  | Install Command |
|-------------|----------|-----------------|
| Node.js     | 18+      | `brew install node` |
| PostgreSQL  | 14+      | `brew install postgresql@16` |
| npm         | 9+       | Included with Node |
| Git         | any      | `brew install git` |

To install Homebrew (macOS package manager):
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

---

## Step 1 — Start PostgreSQL

```bash
# Start PostgreSQL service
brew services start postgresql@16

# Verify it's running
brew services list

# Add PostgreSQL to your PATH (add to ~/.zshrc or ~/.bash_profile)
echo 'export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

---

## Step 2 — Create the Database

```bash
# Open PostgreSQL shell
psql postgres

# Inside psql, run these commands:
CREATE DATABASE tbc_db;
CREATE USER postgres WITH PASSWORD 'password';
GRANT ALL PRIVILEGES ON DATABASE tbc_db TO postgres;
\q
```

---

## Step 3 — Set Up the Backend

```bash
# Navigate to backend folder
cd tbc-project/backend

# Install dependencies
npm install

# Copy and edit environment file
cp .env.example .env
```

Now open `.env` and confirm these settings:
```
DATABASE_URL="postgresql://postgres:password@localhost:5432/tbc_db"
JWT_SECRET="change-this-to-a-long-random-secret-key"
PORT=4000
FRONTEND_URL="http://localhost:3000"
```

> 💡 Change JWT_SECRET to something random like: `openssl rand -base64 32`

```bash
# Generate Prisma client
npx prisma generate

# Run database migrations (creates all tables)
npx prisma migrate dev --name init

# Seed the database with sample data
node src/utils/seed.js
```

You should see:
```
✅ Admin created:  admin@trillionbc.com
✅ Member created: antonino@trillionbc.com
✅ Transactions seeded
🎉 Seed complete!
   Admin:  admin@trillionbc.com  /  Admin@123
   Member: antonino@trillionbc.com  /  Member@123
```

```bash
# Create uploads directory
mkdir -p uploads

# Start the backend server
npm run dev
```

You should see: `🚀 TBC API running on http://localhost:4000`

**Test the API:**
```bash
curl http://localhost:4000/api/health
# Expected: {"status":"ok","timestamp":"..."}
```

---

## Step 4 — Set Up the Frontend

Open a **new terminal tab/window**:

```bash
# Navigate to frontend folder
cd tbc-project/frontend

# Install dependencies
npm install

# Verify .env.local exists (should already be there)
cat .env.local
# Should show: NEXT_PUBLIC_API_URL=http://localhost:4000/api

# Start the frontend development server
npm run dev
```

You should see: `✓ Ready on http://localhost:3000`

---

## Step 5 — Open the App

1. Open your browser and go to: **http://localhost:3000**
2. You'll be redirected to the login page

### Login Credentials

| Role   | Email                       | Password    |
|--------|-----------------------------|-------------|
| Member | antonino@trillionbc.com     | Member@123  |
| Admin  | admin@trillionbc.com        | Admin@123   |

---

## Project Structure

```
tbc-project/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma          # Database schema
│   ├── src/
│   │   ├── index.js               # Express server entry
│   │   ├── middleware/
│   │   │   └── auth.js            # JWT authentication
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── dashboard.js
│   │   │   ├── transactions.js
│   │   │   ├── admin.js
│   │   │   └── profile.js
│   │   ├── controllers/
│   │   │   ├── authController.js
│   │   │   ├── dashboardController.js
│   │   │   ├── transactionController.js
│   │   │   └── adminController.js
│   │   └── utils/
│   │       └── seed.js            # Database seeder
│   ├── uploads/                   # Profile photos (auto-created)
│   ├── .env                       # Your environment config
│   └── package.json
│
└── frontend/
    ├── src/
    │   ├── app/
    │   │   ├── globals.css        # All styles
    │   │   ├── layout.tsx         # Root layout
    │   │   ├── page.tsx           # Root → redirects to /dashboard
    │   │   ├── login/
    │   │   ├── dashboard/
    │   │   ├── transactions/
    │   │   ├── cards/
    │   │   ├── portfolio/
    │   │   ├── settings/
    │   │   └── admin/
    │   ├── components/
    │   │   ├── layout/
    │   │   │   ├── Sidebar.tsx
    │   │   │   ├── Topbar.tsx
    │   │   │   └── ProtectedLayout.tsx
    │   │   ├── charts/
    │   │   │   └── BalanceChart.tsx
    │   │   └── cards/
    │   │       └── DebitCard.tsx
    │   └── lib/
    │       ├── api.ts             # All API calls
    │       └── auth.tsx           # Auth context
    ├── .env.local
    └── package.json
```

---

## API Endpoints Reference

### Auth
| Method | Endpoint          | Description              |
|--------|-------------------|--------------------------|
| POST   | /api/auth/login   | Login (returns JWT)      |
| POST   | /api/auth/logout  | Logout                   |
| GET    | /api/auth/me      | Get current user         |

### Dashboard
| Method | Endpoint               | Description                  |
|--------|------------------------|------------------------------|
| GET    | /api/dashboard/summary | Balance, wallet, recent txns |
| GET    | /api/dashboard/chart   | Chart data (period param)    |

### Transactions
| Method | Endpoint                    | Description      |
|--------|-----------------------------|------------------|
| GET    | /api/transactions           | List with filters|
| GET    | /api/transactions/export    | PDF statement    |
| GET    | /api/transactions/csv       | CSV export       |

### Admin (admin only)
| Method | Endpoint                          | Description          |
|--------|-----------------------------------|----------------------|
| GET    | /api/admin/stats                  | AUM / members stats  |
| GET    | /api/admin/members                | All members          |
| POST   | /api/admin/members                | Create member        |
| PUT    | /api/admin/members/:id            | Update member        |
| DELETE | /api/admin/members/:id            | Delete member        |
| PUT    | /api/admin/members/:id/freeze     | Freeze/unfreeze      |
| PUT    | /api/admin/members/:id/wallet     | Update wallet        |
| POST   | /api/admin/transactions           | Add transaction      |
| GET    | /api/admin/export                 | Export CSV           |

---

## Database Management

```bash
# View database in browser UI
cd backend && npx prisma studio
# Opens at http://localhost:5555

# Reset database (wipe + re-migrate)
npx prisma migrate reset

# Re-seed
node src/utils/seed.js
```

---

## Common Issues & Fixes

### PostgreSQL not connecting
```bash
# Check PostgreSQL is running
brew services list | grep postgresql

# Restart if needed
brew services restart postgresql@16

# Check connection manually
psql -U postgres -d tbc_db -h localhost
```

### Port already in use
```bash
# Kill process on port 4000
lsof -ti:4000 | xargs kill -9

# Kill process on port 3000
lsof -ti:3000 | xargs kill -9
```

### Prisma errors
```bash
cd backend
npx prisma generate        # Regenerate client
npx prisma migrate reset   # Full reset if needed
```

### Node version issues
```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Install and use Node 18
nvm install 18
nvm use 18
```

---

## Running Both Servers (Quick Start)

Open **two terminal tabs**:

**Terminal 1 (Backend):**
```bash
cd tbc-project/backend && npm run dev
```

**Terminal 2 (Frontend):**
```bash
cd tbc-project/frontend && npm run dev
```

Then visit: http://localhost:3000

---

## Production Build (when ready)

```bash
# Frontend
cd frontend && npm run build && npm start

# Backend
cd backend && NODE_ENV=production node src/index.js
```

---

## Default Credentials Summary

| Role   | Email                       | Password   |
|--------|-----------------------------|------------|
| Admin  | admin@trillionbc.com        | Admin@123  |
| Member | antonino@trillionbc.com     | Member@123 |

> Change these immediately after first login for production use!
