# StockPilot AI — Deployment Guide

## 1. Backend Deployment (Render / Docker + Neon PostgreSQL)

### Option A: Render Blueprint (`render.yaml`)
1. Push this repository to GitHub/GitLab.
2. In Render Dashboard, choose **New + -> Blueprint** and connect the repository (`render.yaml` at repo root).
3. Set the required secret environment variables in Render (never commit them):
   - `DATABASE_URL` — PostgreSQL connection string (Neon pooled URL)
   - `JWT_SECRET` — strong random 32+ character secret
   - `Gemini_Key` — Google Gemini API key
4. Render will run `npm ci && npm run prisma:generate && npm run build`, then `npm run prisma:migrate && npm run start` and verify `/api/v1/health`.
5. (Optional) Run the demo seed once from Render Shell:
   ```bash
   npm run seed
   ```

### Option B: Docker (`server/Dockerfile`)
```bash
cd server
docker build -t stockpilot-server .
docker run -p 4000:4000 --env-file .env stockpilot-server
```

## 2. Mobile App Build (Expo EAS — Android)

1. Install and log in to EAS CLI:
   ```bash
   npm install -g eas-cli
   eas login
   ```
2. Update `EXPO_PUBLIC_API_URL` in `mobile/eas.json` to your deployed backend URL (ending in `/api/v1`).
3. Build an installable Android APK for testing/demo (`preview` profile):
   ```bash
   cd mobile
   eas build --platform android --profile preview
   ```
4. Build a signed Android App Bundle (`.aab`) for Google Play (`production` profile):
   ```bash
   cd mobile
   eas build --platform android --profile production
   ```
   EAS manages or imports your Android upload keystore during the first production build.
