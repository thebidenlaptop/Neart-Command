-- Neart Command: core data model (decorating lead flow, phase 1).
-- Principle: statuses, trade types, sources and custom fields are DATA, not code.

-- ---------------------------------------------------------------- fixed sets
-- Only sets the spec calls fixed are enums. Everything configurable is a table.
CREATE TYPE booking_type  AS ENUM ('estimate_visit', 'maintenance_visit', 'booked_job');
CREATE TYPE todo_priority AS ENUM ('urgent', 'not_urgent');
CREATE TYPE file_kind     AS ENUM ('before_photo', 'after_photo', 'document');
CREATE TYPE field_entity  AS ENUM ('lead', 'customer', 'project');
CREATE TYPE field_type    AS ENUM ('text', 'longtext', 'number', 'boolean', 'date', 'select', 'multiselect');
CREATE TYPE user_role     AS ENUM ('owner', 'admin', 'staff');

CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------- team
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  full_name     text NOT NULL,
  role          user_role NOT NULL DEFAULT 'staff',
  -- room for finer-grained permissions as staff are onboarded
  permissions   jsonb NOT NULL DEFAULT '{}',
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- configurable lists
CREATE TABLE trade_types (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text NOT NULL UNIQUE,
  name       text NOT NULL,
  position   integer NOT NULL DEFAULT 0,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE lead_sources (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text NOT NULL UNIQUE,   -- 'google_ads', 'facebook_lead_ads', 'phone', ...
  name       text NOT NULL,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One status list for every trade. A lead is in exactly one status (= one view).
CREATE TABLE statuses (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                  text NOT NULL UNIQUE,
  name                  text NOT NULL,
  position              integer NOT NULL DEFAULT 0,
  color                 text,
  is_default            boolean NOT NULL DEFAULT false,  -- where new leads land (Uncontacted)
  makes_contact         boolean NOT NULL DEFAULT false,  -- entering it promotes lead -> contact
  creates_customer      boolean NOT NULL DEFAULT false,  -- entering it creates the customer account (Booked)
  follow_up_eligible    boolean NOT NULL DEFAULT false,  -- automations may key off this
  active                boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX statuses_one_default ON statuses (is_default) WHERE is_default;

-- Admin-defined fields. Values live in jsonb `custom` columns on the entity.
-- trade_type_id NULL = applies to every trade.
CREATE TABLE field_definitions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity        field_entity NOT NULL,
  trade_type_id uuid REFERENCES trade_types(id) ON DELETE CASCADE,
  key           text NOT NULL,
  label         text NOT NULL,
  type          field_type NOT NULL,
  options       jsonb,                 -- choices for select / multiselect
  required      boolean NOT NULL DEFAULT false,
  position      integer NOT NULL DEFAULT 0,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (key ~ '^[a-z][a-z0-9_]*$')
);
CREATE UNIQUE INDEX field_definitions_unique_key
  ON field_definitions (entity, COALESCE(trade_type_id, '00000000-0000-0000-0000-000000000000'), key);

-- ---------------------------------------------------------------- customers (created at Booked)
CREATE TABLE customers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name         text NOT NULL,
  company_name      text,
  billing_address   text,
  email             text,
  phone             text,
  custom            jsonb NOT NULL DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customers_name_idx ON customers (lower(full_name));  -- @mention lookup
CREATE INDEX customers_phone_idx ON customers (phone);

-- ---------------------------------------------------------------- leads
CREATE TABLE leads (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id          uuid NOT NULL REFERENCES lead_sources(id),
  trade_type_id      uuid REFERENCES trade_types(id),
  status_id          uuid NOT NULL REFERENCES statuses(id),
  status_changed_at  timestamptz NOT NULL DEFAULT now(),

  -- intake fields common to every source (sparse: Facebook leads omit scope/message)
  full_name          text,
  phone              text,
  email              text,
  scope              text,              -- e.g. 'Interior'
  message            text,

  -- address (captured on the intake call; drives the map)
  address_line1      text,
  address_line2      text,
  city               text,
  postcode           text,
  latitude           double precision,
  longitude          double precision,

  -- trade-specific intake answers, validated against field_definitions
  custom             jsonb NOT NULL DEFAULT '{}',

  -- dedupe + audit of what the ad platform actually sent
  external_id        text,
  raw_payload        jsonb,

  -- Lead -> Contact at the intake call
  contact_at         timestamptz,
  -- Set when the lead reaches the status with creates_customer
  customer_id        uuid REFERENCES customers(id),

  assigned_to        uuid REFERENCES users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CHECK ((latitude IS NULL) = (longitude IS NULL))
);
CREATE INDEX leads_status_idx    ON leads (status_id, created_at DESC);  -- per-status list views
CREATE INDEX leads_map_idx       ON leads (latitude, longitude) WHERE latitude IS NOT NULL;
CREATE INDEX leads_source_idx    ON leads (source_id);
CREATE INDEX leads_trade_idx     ON leads (trade_type_id);
CREATE INDEX leads_customer_idx  ON leads (customer_id);
CREATE UNIQUE INDEX leads_external_unique ON leads (source_id, external_id) WHERE external_id IS NOT NULL;

-- Every status transition. Feeds the activity log and conversion reporting.
CREATE TABLE lead_status_history (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id        uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  from_status_id uuid REFERENCES statuses(id),
  to_status_id   uuid NOT NULL REFERENCES statuses(id),
  changed_by     uuid REFERENCES users(id),       -- NULL = system/automation
  changed_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lead_status_history_lead_idx ON lead_status_history (lead_id, changed_at);
CREATE INDEX lead_status_history_to_idx   ON lead_status_history (to_status_id, changed_at);

-- ---------------------------------------------------------------- projects & files
CREATE TABLE projects (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id    uuid NOT NULL REFERENCES customers(id),
  lead_id        uuid REFERENCES leads(id),
  trade_type_id  uuid REFERENCES trade_types(id),
  title          text NOT NULL,
  address_line1  text,
  address_line2  text,
  city           text,
  postcode       text,
  latitude       double precision,
  longitude      double precision,
  -- extensible per-project fields (future estimate generator inputs etc.)
  custom         jsonb NOT NULL DEFAULT '{}',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX projects_customer_idx ON projects (customer_id);

CREATE TABLE project_files (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind         file_kind NOT NULL,
  filename     text NOT NULL,
  mime_type    text,
  size_bytes   bigint,
  storage_key  text NOT NULL,            -- object-storage key, not a URL
  uploaded_by  uuid REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX project_files_project_idx ON project_files (project_id, kind);

-- ---------------------------------------------------------------- calendar
-- Firm bookings have starts_at/ends_at. Flexible bookings sit in the waiting
-- panel with only a window; dragging one onto a date sets starts_at/ends_at
-- (is_flexible stays true so we remember how it was booked).
CREATE TABLE bookings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type             booking_type NOT NULL,
  title            text,
  notes            text,
  assigned_to      uuid REFERENCES users(id),
  lead_id          uuid REFERENCES leads(id) ON DELETE SET NULL,
  customer_id      uuid REFERENCES customers(id) ON DELETE SET NULL,
  project_id       uuid REFERENCES projects(id) ON DELETE SET NULL,
  is_flexible      boolean NOT NULL DEFAULT false,
  starts_at        timestamptz,
  ends_at          timestamptz,
  flexible_from    date,                   -- "anytime in the next three months"
  flexible_until   date,
  created_by       uuid REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR starts_at IS NOT NULL),
  CHECK (ends_at IS NULL OR ends_at > starts_at),
  CHECK (is_flexible OR starts_at IS NOT NULL),                 -- firm => dated
  CHECK (lead_id IS NOT NULL OR customer_id IS NOT NULL OR project_id IS NOT NULL)
);
CREATE INDEX bookings_range_idx    ON bookings (starts_at) WHERE starts_at IS NOT NULL;
CREATE INDEX bookings_assignee_idx ON bookings (assigned_to, starts_at);
-- the waiting panel
CREATE INDEX bookings_unscheduled_idx ON bookings (flexible_from) WHERE starts_at IS NULL;

-- ---------------------------------------------------------------- to-dos & notes
CREATE TABLE todos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  body         text NOT NULL,              -- plain English; "@Dave Smith" kept in text
  priority     todo_priority NOT NULL DEFAULT 'not_urgent',
  assigned_to  uuid REFERENCES users(id),
  created_by   uuid REFERENCES users(id),
  done_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX todos_open_idx ON todos (assigned_to, priority) WHERE done_at IS NULL;

-- Resolved @mentions so each one is a real link to a customer profile.
CREATE TABLE todo_mentions (
  todo_id      uuid NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  customer_id  uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  PRIMARY KEY (todo_id, customer_id)
);
CREATE INDEX todo_mentions_customer_idx ON todo_mentions (customer_id);

CREATE TABLE notes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  uuid REFERENCES customers(id) ON DELETE CASCADE,
  lead_id      uuid REFERENCES leads(id) ON DELETE CASCADE,
  author_id    uuid REFERENCES users(id),
  body         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (customer_id IS NOT NULL OR lead_id IS NOT NULL)
);
CREATE INDEX notes_customer_idx ON notes (customer_id, created_at DESC);
CREATE INDEX notes_lead_idx     ON notes (lead_id, created_at DESC);

-- ---------------------------------------------------------------- automations
CREATE TABLE automations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  description       text,
  enabled           boolean NOT NULL DEFAULT false,
  -- trigger: lead sits in `trigger_status_id` for `delay_hours` with no status change
  trigger_status_id uuid NOT NULL REFERENCES statuses(id),
  delay_hours       integer NOT NULL CHECK (delay_hours >= 0),
  -- action: open-ended so new channels/actions need no schema change
  action_type       text NOT NULL,         -- e.g. 'whatsapp_message'
  action_config     jsonb NOT NULL DEFAULT '{}',   -- template, etc.
  created_by        uuid REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- One row per (automation, lead, status entry) so a follow-up fires at most once
-- per time the lead enters the status.
CREATE TABLE automation_runs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id  uuid NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  lead_id        uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  status_entered_at timestamptz NOT NULL,
  scheduled_for  timestamptz NOT NULL,
  executed_at    timestamptz,
  outcome        text NOT NULL DEFAULT 'pending'
                 CHECK (outcome IN ('pending', 'sent', 'skipped', 'failed')),
  detail         jsonb,
  UNIQUE (automation_id, lead_id, status_entered_at)
);
CREATE INDEX automation_runs_due_idx ON automation_runs (scheduled_for) WHERE outcome = 'pending';

-- ---------------------------------------------------------------- activity log
-- Generic audit trail: every status change and edit on a lead/customer/etc.
CREATE TABLE activity_log (
  id           bigserial PRIMARY KEY,
  entity_type  text NOT NULL,              -- 'lead', 'customer', 'project', 'booking', ...
  entity_id    uuid NOT NULL,
  action       text NOT NULL,              -- 'created', 'updated', 'status_changed', ...
  actor_id     uuid REFERENCES users(id),  -- NULL = system/automation
  changes      jsonb,                      -- { field: { from, to } }
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_log_entity_idx ON activity_log (entity_type, entity_id, created_at DESC);
CREATE INDEX activity_log_actor_idx  ON activity_log (actor_id, created_at DESC);

-- ---------------------------------------------------------------- updated_at triggers
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','statuses','customers','leads','projects','bookings','todos','notes','automations']
  LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t || '_updated_at', t);
  END LOOP;
END $$;
