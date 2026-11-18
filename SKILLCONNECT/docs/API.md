# SkillConnect API Reference

All responses follow the envelope:
- Success: `{ "success": true, "data": ..., "meta"?: ... }`
- Error: `{ "success": false, "error": { "code": "...", "message": "...", "details"?: [...] } }`

Base prefix: `/api/v1` (except `GET /health`).

## Auth
- `POST /auth/register` — Register customer account (`GUEST`)
- `POST /auth/login` — Email/password login (`GUEST`)
- `POST /auth/refresh` — Rotate refresh token
- `POST /auth/logout` — Revoke refresh token / clear cookie
- `GET /auth/me` — Current authenticated user

## Catalog & Localities
- `GET /categories` — Active service categories (public)
- `GET /localities` — Serviceable localities (public)
- `GET /localities/check?lat=&lng=` — Serviceability check (20 km radius)

## Providers & Discovery
- `GET /providers/search?lat=&lng=&categoryId=&q=&availableNow=&sort=&limit=&offset=` — PostGIS `ST_DWithin` search (public)
- `GET /providers/:id` — Public provider profile (omits exact center coordinates)
- `GET /providers/:id/reviews` — Provider reviews & calculated average rating
- `POST /provider/me/onboarding` — Start provider onboarding
- `GET /provider/me/profile`, `PUT /provider/me/profile`
- `PUT /provider/me/services`, `PUT /provider/me/service-area`, `PUT /provider/me/availability`
- `POST /provider/me/portfolio`, `DELETE /provider/me/portfolio/:mediaId`
- `POST /provider/me/submit` — Submit profile for admin review
- `GET /provider/me/dashboard` — Provider booking & rating summary

## Uploads
- `POST /uploads/image` — Multipart image upload (ImageKit, magic-byte validated, rate-limited)

## Chat & Offers
- `POST /conversations` — Customer creates/opens conversation with APPROVED+ACTIVE provider
- `GET /conversations` — Participant conversations
- `GET /conversations/:id/messages`, `POST /conversations/:id/messages` (idempotent via `clientMessageId`)
- `POST /conversations/:id/read`
- `POST /conversations/:id/offers` — Provider sends offer (1 `PENDING` per conversation)
- `POST /offers/:id/withdraw` — Provider withdraws pending offer
- `POST /offers/:id/decline` — Customer declines pending offer
- `POST /offers/:id/accept` — Customer accepts offer (transactional row lock -> `Booking`)

## Bookings & Reviews
- `GET /bookings`, `GET /bookings/:id`
- `POST /bookings/:id/complete` — Provider marks complete (at or after `scheduledStart`)
- `POST /bookings/:id/confirm` — Customer confirms completion
- `POST /bookings/:id/cancel` — Customer or provider cancels
- `POST /bookings/:id/no-show`, `POST /bookings/:id/no-show/respond`
- `POST /bookings/:id/issue` — Customer reports issue -> `DISPUTED`
- `POST /bookings/:id/review` — Customer submits immutable 1–5 star review on `COMPLETED` booking

## Notifications
- `GET /notifications`
- `POST /notifications/:id/read`, `POST /notifications/read-all`
- `POST /notifications/push-token`, `DELETE /notifications/push-token`

## Admin (`/admin/*`, `ADMIN` role required)
- `GET /admin/me`
- `GET /admin/dashboard`
- `GET /admin/users`, `POST /admin/users/:id/suspend`, `POST /admin/users/:id/reinstate`
- `GET /admin/providers`, `GET /admin/providers/:id`, `POST /admin/providers/:id/decision`
- `GET /admin/disputes`, `GET /admin/disputes/:id`, `GET /admin/disputes/:id/conversation`, `POST /admin/disputes/:id/resolve`
- `GET /admin/categories`, `POST /admin/categories`, `PATCH /admin/categories/:id`
- `GET /admin/localities`, `POST /admin/localities`, `POST /admin/localities/bulk`, `PATCH /admin/localities/:id`
