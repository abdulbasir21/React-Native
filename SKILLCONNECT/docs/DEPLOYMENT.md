# SkillConnect Deployment Checklist

This document prepares deployment configuration and verification checklists. Do not commit secrets or `.env` files.

## 1. Database (PostgreSQL + PostGIS)

1. Provision managed PostgreSQL 15+ with `postgis` extension enabled.
2. Run migrations using unpooled connection string:
   ```bash
   cd server
   npx prisma migrate deploy
   npx prisma db seed
   ```

## 2. Backend API (`server/`)

1. Build `shared` and `server`:
   ```bash
   npm --prefix shared run build
   npm --prefix server run build
   ```
2. Set required environment variables from `server/.env.example` in your hosting provider (`NODE_ENV=production`, `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `IMAGEKIT_*`, `CORS_ORIGINS`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`).
3. Start command: `node dist/index.js`.
4. Verify `GET /health` returns `{ "success": true, "data": { "status": "ok", "environment": "production" } }`.

## 3. Admin Web (`admin/`)

1. Set `VITE_API_BASE_URL` to the deployed backend origin.
2. Build static bundle:
   ```bash
   npm --prefix admin run build
   ```
3. Deploy `admin/dist/` to static hosting with SPA fallback to `index.html`.

## 4. Mobile App (`mobile/`)

1. Set `EXPO_PUBLIC_API_URL` to the deployed backend origin.
2. Build Android/iOS binaries via EAS (`eas build`).

## 5. Open Decisions Before Production Launch

- **P6**: Production hosting provider for API + PostgreSQL/PostGIS and Admin static hosting.
- **P12**: Production domain names and `CORS_ORIGINS` / cookie domain settings.
- **P13**: Mobile EAS project ID and Android/iOS signing credentials for push notifications.
- **P14**: Monitoring/alerting destination and log retention policy.
