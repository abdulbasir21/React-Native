# SkillConnect

Mobile-first local services marketplace connecting customers and skilled service providers.

## Workspaces

- `shared/` — Shared TypeScript types and Zod validation schemas (`@skillconnect/shared`)
- `server/` — Express, Prisma, PostgreSQL + PostGIS, Socket.IO API server (`@skillconnect/server`)
- `admin/` — Vite + React + TypeScript + Tailwind CSS admin web panel (`@skillconnect/admin`)
- `mobile/` — Expo + React Native + Expo Router + NativeWind mobile app (`mobile`)

## Prerequisites

- Node.js 20+
- PostgreSQL 15+ with PostGIS extension enabled

## Local Setup

1. Install dependencies from the repository root:
   ```bash
   npm install
   ```
2. Copy `server/.env.example` to `server/.env` and fill in your environment values.
3. Build the shared package:
   ```bash
   npm --prefix shared run build
   ```
4. Run database migrations and seed data:
   ```bash
   cd server
   npx prisma migrate deploy
   npx prisma db seed
   ```
5. Start development servers:
   - API server: `npm --prefix server run dev`
   - Admin panel: `npm --prefix admin run dev`
   - Mobile app: `npm --prefix mobile run start`

## Verification Commands

- Type-check all workspaces: `npm run typecheck`
- Lint all workspaces: `npm run lint`
- Build admin web: `npm --prefix admin run build`
- Run server tests: `cd server && npx vitest run`
