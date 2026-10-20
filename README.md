# Neart Command

Bespoke CRM, phase 1: the painting and decorating lead flow (enquiry -> booked job). See the spec for the full picture.

## Layout

| Path | Purpose |
|---|---|
| `packages/db` | PostgreSQL schema (SQL migrations), seeds, migrate/seed/check scripts. **Built first.** |
| `apps/api` | Node back end. All business logic (pipeline, calendar, automations, integrations). *Not yet built.* |
| `apps/web` | Next.js front end. Presentation only. *Not yet built.* |
| `packages/ui` | Design system / components, so the look can change without touching workflows. *Not yet built.* |
| `docs/` | Specs and decisions. |

## Data model (`packages/db/migrations/0001_init.sql`)

- **Configurable as data:** `statuses`, `trade_types`, `lead_sources`, `field_definitions` (custom fields for leads/customers/projects, optionally per trade; values stored in `custom` jsonb columns).
- **Pipeline:** `leads` (one status at a time, `contact_at` = lead became a contact, `customer_id` set on Booked), `lead_status_history`.
- **Customers & projects:** `customers` (created at Booked), `projects` (many per customer), `project_files` (before/after photos, documents).
- **Calendar:** `bookings` (estimate / maintenance / booked job, assignable; firm = dated, flexible = waiting panel with a date window).
- **Work management:** `todos` (+ `todo_mentions` for `@customer` links), `notes`.
- **Automation:** `automations` (status + delay -> action), `automation_runs` (fires once per status entry).
- **Audit:** `activity_log` (generic who/what/when for every entity).
- `statuses` flags drive behaviour without code changes: `is_default`, `makes_contact`, `creates_customer`, `follow_up_eligible`.

## Database

```sh
cp .env.example .env     # point DATABASE_URL at a Postgres 13+ database
npm install
npm run db:migrate
npm run db:seed
npm run db:check         # no server needed: runs everything in in-memory Postgres (PGlite)
```

## Open spec items affecting the model

Intake form fields (will become `field_definitions` rows), WhatsApp integration method, extra statuses, renovation/fit-out fields.
