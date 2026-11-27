# Roomly — Andaman & Nicobar Property Rental Marketplace

Rent homes, rooms and commercial spaces across the Andaman & Nicobar Islands. Owners list properties with photos and GPS location. Tenants search, filter, map-browse, save and enquire. Admins moderate listings, users and reports and maintain a searchable archive of newspaper **TO LET** classifieds (Daily Telegrams).

**Stack:** React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui-style components (Radix), React Router, React Hook Form, Zod, Leaflet/OpenStreetMap, Supabase (Postgres, Auth, Storage, Realtime).

---

## ▶ Start here (3 steps)

**Step 1: set up the database (one time)**
1. Open your Supabase project, then **SQL Editor** → **New query**.
2. Open the file `supabase/SETUP_ALL_IN_ONE.sql` from this repo, copy everything, paste it in and press **Run**.
   It creates all tables, security rules and photo storage. It is safe to run again.

**Step 2: turn on login**
In Supabase, go to **Authentication → URL Configuration**:
- Set **Site URL** to your website address.
- Add `http://localhost:5173/**` and `https://<your-site>/**` under **Redirect URLs**.

Email sign-up and "Email code" login are free and work straight away.

Optional free extras:
- **6-digit code in the email:** in Supabase, go to **Authentication → Emails → Magic Link** and add `{{ .Token }}` to the template. Without it, users simply tap the link in the email.
- **"Continue with Google":** enable Google under **Authentication → Providers** (needs a free Google Cloud OAuth client). Then set the GitHub repository variable `VITE_ENABLE_GOOGLE_AUTH` = `true`.
- **SMS OTP:** hidden by default because every SMS provider is paid. Connect one (section 4), then set `VITE_ENABLE_PHONE_AUTH` = `true`.

**Step 3: run the app**

```bash
npm install
npm run dev
```

Open http://localhost:5173 and sign up. To make yourself admin, run the SQL in "Creating the first administrator" below with your email.

---

## 1. Quick start (local)

```bash
npm install
cp .env.example .env      # already points at the project; edit VITE_SITE_URL if needed
npm run dev               # http://localhost:5173
```

The app only works once the database migrations are applied (section 3).

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Project URL, `https://kbeondyuxwqiuxyjvzfr.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Publishable (anon) key. Safe for browsers because RLS protects the data |
| `VITE_SITE_URL` | Public origin used in auth e-mail redirects (`http://localhost:5173` locally, your domain in production) |

> **Never** put the `service_role` key in any `VITE_*` variable or in frontend code. Vite inlines every `VITE_*` value into the public JavaScript bundle.

## 2. Project layout

```
src/
  App.tsx                    routes (lazy loaded) + guards
  contexts/AuthContext.tsx   session, profile, roles, session-expiry handling
  components/layout/         header, mobile nav, RequireAuth/GuestOnly guards, notification bell (realtime)
  components/ui/             shadcn-style primitives (button, dialog, tabs, …)
  components/property/       PropertyCard, PropertyMap, LocationPicker (Leaflet)
  components/owner/          PropertyForm (add/edit), classifieds parser
  lib/                       supabase client, storage helpers (validation + compression), utils, constants
  pages/                     the 20 application pages (+ auth callback, 404)
supabase/
  migrations/                schema, RLS, storage buckets/policies, reference data
  tests/rls_test.sql         38 authorization tests (run inside a rolled-back transaction)
  config.toml                Auth/SMS settings reference (mirrors what to set in the dashboard)
```

### Pages

| # | Page | Route | Access |
|---|---|---|---|
| 1 | Homepage | `/` | public |
| 2 | Sign up (email or mobile OTP) | `/signup` | guests |
| 3 | Login (password or mobile OTP) | `/login` | guests |
| 4 | Email verification | `/verify-email` | public |
| 5 | Phone OTP verification | `/verify-phone` | public |
| 6 | Forgot password | `/forgot-password` | public |
| 7 | Reset password | `/reset-password` | recovery link |
| 8 | Property search | `/search` | public |
| 9 | Property details | `/property/:id` | public (contact details need sign-in) |
| 10 | Map search (GPS / "near me") | `/map` | public |
| 11 | Add property | `/properties/new` | owner roles |
| 12 | Edit property | `/properties/:id/edit` | listing owner / admin |
| 13 | Owner dashboard | `/dashboard/owner` | owner roles |
| 14 | Tenant dashboard | `/dashboard/tenant` | signed in |
| 15 | User profile | `/profile` | signed in |
| 16 | Saved properties | `/saved` | signed in |
| 17 | My enquiries | `/enquiries` | signed in |
| 18 | Newspaper TO LET archive | `/newspaper` | public; signed-in users can upload papers |
| 19 | Admin dashboard | `/admin` | admin |
| 20 | Contact & help | `/help` | public |

## 3. Database setup (migrations)

The migrations are plain SQL and idempotent. Easiest: run `supabase/SETUP_ALL_IN_ONE.sql` once in the SQL editor (it contains all the files below). Or apply the individual files in filename order using **one** of the methods below.

**A. Supabase CLI (recommended)**

```bash
npx supabase login
npx supabase link --project-ref kbeondyuxwqiuxyjvzfr     # asks for the database password
npx supabase db push                                     # applies supabase/migrations/*
```

**B. Dashboard SQL editor.** Open SQL Editor and paste and run each file in order:

1. `supabase/migrations/20261127000001_schema.sql`: enums, 16 tables, indexes, constraints, triggers, RPCs, views
2. `supabase/migrations/20261127000002_rls.sql`: RLS enabled on every table, plus policies and grants
3. `supabase/migrations/20261127000003_storage.sql`: 5 buckets with size/MIME limits and storage policies
4. `supabase/migrations/20261127000004_reference_data.sql`: property categories and amenities
5. `supabase/migrations/20261128000005_newspaper_auto_and_user_uploads.sql`: newspaper uploads by any signed-in user

**C. psql** with the connection string from Project Settings → Database:

```bash
for f in supabase/migrations/*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; done
```

### Tables

`profiles`, `user_roles`, `properties`, `property_categories`, `property_images`, `property_locations`, `amenities`, `property_amenities`, `property_enquiries`, `saved_properties`, `property_reviews`, `newspaper_publications`, `newspaper_advertisements`, `notifications`, `user_reports`, `rental_transactions`.

Every table uses UUID primary keys, foreign keys with sensible `on delete` rules, `created_at`/`updated_at` timestamps, `check` constraints (phone E.164, A&N lat/lng bounds, A&N PIN codes `7441xx`, prices ≥ 0, ratings 1–5) and indexes for the hot query paths (status, rent, configuration, trigram search on titles and areas, geo, GIN on advert phones).

Views:
- `property_listings`: one flat row per property with location, category, cover image and rating. It uses `security_invoker` so the RLS of the underlying tables applies.
- `public_profiles`: name, avatar and verified flag only. It never exposes email or phone.

### Server-side rules (triggers and `SECURITY DEFINER` RPCs)

- **New user → profile + roles.** `handle_new_user` creates the profile from sign-up metadata and grants `tenant` plus the chosen account type. `admin` can never come from sign-up metadata.
- **Auth ↔ profile sync.** When a user's email or phone changes and is verified in Supabase Auth, the profile follows.
- **Owners can't self-verify, feature or fake views.** Editing a listing's core fields removes its verified badge.
- **Duplicate protection:**
  - one live listing per owner per title
  - one open enquiry per tenant per property
  - unique phone per profile
  - unique advert per edition and phone set
  - sign-up detects existing emails
- **Enquiries.** `owner_id` is derived from the property, so it can't be spoofed. Owners can only respond. Tenants can only edit their message or close the enquiry.
- **Reviews.** Only users who enquired about or rented a property can review it. A review is marked *verified tenant* when a rental transaction exists.
- **RPCs.** `mark_property_rented`, `relist_property`, `increment_property_view` (skips the owner), `set_self_role` (never admin), `admin_set_role` / `admin_stats` (admin only), `identity_exists`.
- **Notifications.** Created automatically for: new enquiry (to owner), owner reply (to tenant), saved property rented, listing verified, rental confirmed. Each user's notification preferences are respected. The header bell updates in realtime.

### Creating the first administrator

Administrators are never chosen in the UI. After the person has signed up, run this in the SQL editor (it runs as `postgres`, which is the trusted backend):

```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users where email = 'admin@example.com'
on conflict do nothing;
```

After that, admins can grant or revoke roles for other users from the Admin dashboard. That goes through `admin_set_role`, which checks admin rights in the database.

## 4. Authentication configuration (Supabase Dashboard)

**Authentication → URL Configuration**
- Site URL: your production origin, e.g. `https://roomly.example.com`
- Redirect URLs: add `http://localhost:5173/**` and `https://roomly.example.com/**`, or list `/auth/callback` and `/reset-password` explicitly for each origin.

**Authentication → Providers → Email**
- Enable Email provider ✔, Confirm email ✔, Secure email change ✔, Secure password change ✔
- Minimum password length 8, require letters + digits (the UI enforces the same)
- Production: configure **custom SMTP** (Project Settings → Auth → SMTP), for example Amazon SES, Resend, Brevo or Zoho. Supabase's built-in mailer is limited to a few messages per hour and is not meant for real users.

**Authentication → Providers → Phone (real SMS OTP)**
1. Enable Phone provider ✔ and Enable phone confirmations ✔.
2. Choose an SMS provider (Twilio, Twilio Verify, MessageBird, Vonage or Textlocal) and enter its credentials **in the dashboard**. They are stored server-side and never reach the frontend.
3. **India-specific:** Indian carriers require **TRAI DLT registration**.
   - Register your entity (Principal Entity ID), sender ID/header and the OTP message template on a DLT portal (Jio, Airtel, Vi or BSNL).
   - Give those IDs to your SMS provider. With Twilio, use a Messaging Service with the DLT-registered sender. Textlocal is India-native.
   - Without DLT, OTP messages to +91 numbers are silently dropped.
4. SMS template: `Your Roomly verification code is {{ .Code }}. It expires in 10 minutes. Do not share it.` It must match your DLT template exactly.
5. Set OTP expiry to 600 s and keep the default rate limits (Authentication → Rate Limits).

**Sessions** (Authentication → Sessions, paid plans): time-box 30 days and inactivity timeout 7 days, matching `supabase/config.toml`. The app refreshes tokens automatically and re-checks the session on tab focus. If a refresh fails, it signs the user out with a "session expired" message. Protected routes redirect to `/login?next=…`.

**Email templates** (optional branding): the defaults already use `{{ .ConfirmationURL }}`, which works with the PKCE flow the app uses (`/auth/callback`, `/reset-password`).

## 5. Storage

Created by migration 0003:

| Bucket | Public | Limit | Who can write |
|---|---|---|---|
| `property-images` | yes | 5 MB, jpg/png/webp | owner, only under `{uid}/{their property id}/` |
| `profile-images` | yes | 2 MB, jpg/png/webp | user, only under `{uid}/` |
| `property-documents` | **no** | 10 MB, pdf/jpg/png | user, only under `{uid}/`; readable only by them and admins |
| `newspaper-pdfs` | yes | 50 MB, pdf/txt | signed-in users (`uploads/{uid}/`), admins |
| `newspaper-extracted-pages` | yes | 10 MB | admins |

Before upload, images are validated (type and size) and downscaled in the browser to at most 1920 px. That keeps uploads fast on island mobile networks.

## 6. Deployment

**GitHub Pages (already set up):** `.github/workflows/deploy-pages.yml` builds the app and publishes it to `https://sumit3850.github.io/Roomly/` every time `main` changes.

One-time setup: in GitHub, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**. Also add `https://sumit3850.github.io/Roomly/**` to the Supabase Redirect URLs.


The app is a static SPA. It can be hosted on Vercel, Netlify, Cloudflare Pages or any static host.

```bash
npm run build      # outputs dist/
```

- **Vercel:** import the repo and set the three `VITE_*` env vars. `vercel.json` handles SPA rewrites and security headers.
- **Netlify / Cloudflare Pages:** build command `npm run build`, publish directory `dist`. `public/_redirects` handles SPA routing.
- After deploying, set the Site URL and Redirect URLs in Supabase (section 4) to the production domain, and set `VITE_SITE_URL` to the same value.

## 7. Testing

### Automated: database authorization (38 tests)

Run against a **staging** database. Everything happens inside a transaction that is rolled back.

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_test.sql
```

The tests cover:
- profile auto-creation for email and phone sign-ups
- role assignment, including that admin can't be self-assigned
- owners can't edit or delete other owners' listings
- tenant-only accounts can't publish
- duplicate listing blocked
- enquiry owner can't be spoofed
- private saved properties and enquiries
- review verification
- anonymous access limits
- admin-only RPCs
- storage folder isolation

### Automated: frontend

```bash
npm run typecheck && npm run build
```

### Manual end-to-end checklist (use real accounts)

**Registration & login**
- [ ] Email sign-up → confirmation e-mail arrives → link opens `/auth/callback` → lands on dashboard
- [ ] Profile row exists (`select * from profiles order by created_at desc limit 1`) with name, email and account type; `user_roles` has `tenant` plus the chosen type
- [ ] Signing up again with the same e-mail shows "account already exists"
- [ ] "Resend verification e-mail" works (60 s cooldown)
- [ ] Mobile sign-up with a real +91 number → SMS OTP received → verify → signed in → profile has the phone number
- [ ] Mobile login with OTP for an existing number; an unknown number is rejected
- [ ] Wrong OTP shows an error; resend OTP works after cooldown
- [ ] Email/password login; a wrong password shows an error; an unconfirmed e-mail offers resend
- [ ] Forgot password → e-mail → `/reset-password` → new password works; old one fails
- [ ] Session persists across reloads; Sign out clears it; "Sign out of all devices" works
- [ ] Visiting `/dashboard/owner`, `/profile`, `/saved` or `/admin` while signed out redirects to `/login?next=…` and returns after login

**Profile**
- [ ] Edit name, preferred location and bio; upload a photo (appears in header)
- [ ] Change e-mail (confirmation required) and phone (OTP required)
- [ ] Toggle owner / commercial owner roles; change password; notification switches persist

**Owner**
- [ ] Add a property with 3+ photos, GPS via "Use my location" or by tapping the map, amenities and deposit → appears on `/search` and `/map`
- [ ] Creating a second live listing with the same title is refused
- [ ] Edit the listing; remove a photo; change the cover
- [ ] Deactivate (hidden from search), reactivate, mark as rented (tenants who saved it are notified), relist, delete
- [ ] Enquiry from a tenant appears in the owner dashboard with a notification; reply → tenant notified
- [ ] View counter increases when other users open the listing (not for the owner)

**Tenant**
- [ ] Search by area text, budget range, BHK and residential/commercial; sort; load more
- [ ] Map search: pan/zoom refreshes results; "Near me" asks for GPS permission
- [ ] Save/unsave from cards and details; Saved page lists them
- [ ] Send an enquiry; a duplicate open enquiry is refused; track it in My enquiries; close it
- [ ] Recommendations reflect preferred location and saved configurations
- [ ] Review: allowed after enquiring; shows "Verified tenant" after the owner marks it rented to you

**Security**
- [ ] As user B, editing user A's listing via `/properties/<A's id>/edit` shows access denied; direct API update affects 0 rows
- [ ] Non-admin opening `/admin` sees "no access"; `admin_stats` RPC errors for non-admins
- [ ] Uploading a 10 MB image or a `.gif` is rejected

**Admin**
- [ ] Verify/feature/deactivate listings; manage roles; verify/suspend users; resolve reports and support messages
- [ ] Upload a newspaper PDF as a normal signed-in user → text extracted → preview → adverts saved → visible on `/newspaper`; another user can't delete it; CSV export works
- [ ] Latest 5 uploaded editions appear at the top of `/newspaper` with their dates

## 8. Security notes

- RLS is enabled on **all 16 tables**. The frontend only holds the publishable key.
- Privileged operations run through RLS-checked queries or `SECURITY DEFINER` functions with explicit `is_admin()` / ownership checks and a fixed `search_path`. Examples: verifying listings, role changes, stats, marking rented.
- Contact phone numbers on listings are shown only to signed-in users.
- All forms are validated client-side with Zod and again server-side by `check` constraints and triggers.
