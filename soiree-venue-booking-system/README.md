# Soirée — Venue Booking System

A full-stack venue discovery and booking application built with Node.js, Express, PostgreSQL and vanilla JavaScript.

## Features

- Responsive venue discovery with category, city/keyword, capacity, price and sort filters.
- Account registration, sign-in and sign-out using bcrypt password hashes and an HTTP-only JWT cookie.
- Venue detail, amenities, partner vendors, discrete slot pricing and date availability.
- Booking requests, customer booking history and cancellation.
- Admin dashboard, booking status management and venue activation endpoint.
- PostgreSQL transaction around booking creation.
- Database uniqueness guarantee on `(venue_id, booking_date, slot_name)` and HTTP `409 Conflict` on PostgreSQL error `23505`.
- Cancelled/rejected bookings are archived transactionally when that slot is requested again.
- Parameterized SQL, request validation, rate limiting, security headers, bounded request body and centralized errors.

## Requirements

- Node.js 20+
- PostgreSQL 14+
- npm

## Setup

1. Create a database:

   ```bash
   createdb venue_booking
   ```

2. Copy the environment template and edit it:

   ```bash
   cp .env.example .env
   ```

   Set `DATABASE_URL` and a random `JWT_SECRET` with at least 32 characters. For example, generate a secret with:

   ```bash
   openssl rand -base64 48
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

4. Create the schema and demo data:

   ```bash
   npm run db:schema
   npm run db:seed
   ```

   **Warning:** `database/schema.sql` intentionally drops and recreates the application's tables. Run it only against a new or disposable database. Back up any existing data first.

5. Start the server:

   ```bash
   npm start
   ```

6. Open [http://localhost:3000](http://localhost:3000).

## Demo accounts

| Role | Email | Password |
|---|---|---|
| Admin | `admin@soiree.test` | `Admin@123` |
| Customer | `aarav@example.com` | `User@123` |
| Customer | `meera@example.com` | `User@123` |

Change or remove demo credentials before deploying publicly.

## Booking concurrency design

Bookings use one of the seeded discrete slots: `Morning`, `Afternoon`, or `Evening`.

The database enforces:

```sql
CONSTRAINT unique_venue_slot UNIQUE (venue_id, booking_date, slot_name)
```

The booking route performs `BEGIN`, validates venue/slot/vendor and capacity, archives and removes a prior cancelled/rejected row when applicable, inserts the new booking, then commits. Any failure rolls back. PostgreSQL's unique index serializes competing inserts for the same key: one request can commit; the other receives error code `23505`, which the API translates to HTTP `409`.

Availability is advisory UI feedback only. The unique database constraint is the final authority, so simultaneous requests remain safe even if both clients saw a slot as available.

## API overview

All API responses are JSON. Authenticated routes use the HTTP-only `soiree_token` cookie.

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET | `/api/health` | Public | Database health |
| POST | `/api/auth/register` | Public | Create account |
| POST | `/api/auth/login` | Public | Sign in |
| POST | `/api/auth/logout` | Public | Sign out |
| GET | `/api/auth/me` | Signed in | Current user |
| GET | `/api/venues/categories` | Public | Categories |
| GET | `/api/venues` | Public | Filtered venue list |
| GET | `/api/venues/:id` | Public | Venue, slots and vendors |
| GET | `/api/venues/:id/availability?date=YYYY-MM-DD` | Public | Slot availability |
| GET | `/api/vendors` | Public | Vendor directory |
| GET | `/api/vendors/:id/menu` | Public | Vendor menu |
| POST | `/api/bookings` | Signed in | Create booking |
| GET | `/api/bookings/mine` | Signed in | Customer booking history |
| PATCH | `/api/bookings/:id/cancel` | Owner | Cancel own booking |
| GET | `/api/bookings/admin/all` | Admin | All current bookings |
| PATCH | `/api/bookings/admin/:id/status` | Admin | Update booking status |
| GET | `/api/admin/dashboard` | Admin | Dashboard metrics |
| POST | `/api/admin/venues` | Admin | Create venue |
| PATCH | `/api/admin/venues/:id/active` | Admin | Activate/deactivate venue |

## Production notes

- Serve behind HTTPS and set `NODE_ENV=production`.
- Configure a strong secret, database least-privilege credentials, backups and monitoring.
- Set `TRUST_PROXY=1` only when running behind a trusted reverse proxy.
- The app uses same-site HTTP-only cookies. If you deploy frontend and API on different sites, configure an explicit origin policy, secure cross-site cookies and CSRF protection before exposing it.
- Use migrations rather than the destructive bootstrap schema for subsequent production schema changes.
- Configure PostgreSQL TLS to match your hosting provider. Adjust the pool SSL policy in `backend/db/pool.js` if your provider requires a custom CA.
- Configure image hosting/CDN and replace demo image URLs with licensed assets.
- This is a complete runnable application scaffold, but production launch still requires deployment-specific secrets, TLS, database provisioning, backup policy and operational testing.

## Concurrency verification

With two authenticated sessions, submit `POST /api/bookings` concurrently using the same `venueId`, `bookingDate` and `slotName`. Expected result: one `201 Created`, one `409 Conflict`; the database contains one active booking for that unique key.

Example payload:

```json
{
  "venueId": 1,
  "bookingDate": "2027-01-15",
  "slotName": "Evening",
  "eventType": "Wedding reception",
  "guestCount": 250,
  "vendorId": null,
  "notes": "Please share the event package."
}
```
