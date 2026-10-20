# Bespoke CRM — Decorating Lead Flow Spec

Oct 18, 2026 · @Greg

This is a living document covering the first buildable phase of the bespoke CRM: the painting and decorating lead flow, from initial enquiry through to booked job.

## Overview

Phase 1 builds the lead management core for painting and decorating, the trade the business uses as its entry point into bigger construction work. The goal is to replace the current Telegram-and-spreadsheet process with a single system that takes a lead from first enquiry through to a booked, deposited job, while laying a data structure that can later support other trades (renovation, fit-outs) without a rebuild.

## Lead intake

Leads arrive from two channels so far, both carrying any trade type (decorating now, other trades later):

1. Google Ads enquiries
2. Facebook lead ads

Currently both land in a Telegram bot. The target design connects directly to the Google Ads and Facebook Lead Ads APIs so leads post straight into the system, skipping Telegram entirely.

Observed lead formats differ between sources. A Google lead has included: name, phone, email, project scope (e.g. "Interior"), and a free-text message describing the job. A Facebook lead seen so far has included only: type, name, email, phone — no scope or message detail.

All new leads land in a single **Uncontacted** queue regardless of source or trade type.

**Open item:** the full phone-call intake form (built in a third-party form tool) will define the complete field set, including address, timeline, budget, and trade-specific detail. That form is still being finished and will be reviewed separately.

## Statuses and pipeline

Status is a configurable list, not a fixed set in the code. Greg can add, rename, or reorder statuses without a development change. Each status has its own list view, and a lead sits in exactly one status (one view) at a time.

When a lead's status changes, it automatically moves out of its current view and into the view matching the new status — for example, moving from **Uncontacted** to **Waiting for images** removes it from the Uncontacted list and adds it to the Waiting for images list.

Known statuses so far (more will be added as the flow is refined):

1. Uncontacted — new lead, not yet called
2. Waiting for images — called, form filled out, moved to WhatsApp, photos not yet received
3. Quoted — photos received, price sent
4. Booked — deposit taken, job scheduled

This same status engine is intended to serve every trade type, not just decorating — only the form fields captured differ by trade (see Scalability, below).

**Uncontacted vs. Contact:** a lead becomes a Contact at the point of the intake call — once real details (name confirmed by phone, address, job specifics) have been captured — rather than only once they agree to go ahead with the work. This happens at the same point the status moves toward Waiting for images, so most of the pipeline deals with proper contacts, not anonymous ad clicks.

## Map view

The map is a second view onto the same lead data as the list — not a separate feature. Every lead with an address is plotted by location.

The map can be filtered by:

- **Status** — e.g. show only leads in Waiting for images
- **Trade/job type** — e.g. Painting and decorating, Exterior restoration, All
- **Source** — e.g. Google, Facebook

**Purpose:** leads in Waiting for images who never send photos still need pricing eventually, often by an in-person estimate. Rather than sending someone out for a single unresponsive lead, the map lets Greg see where unresponsive leads are clustering geographically, and wait until enough have built up in one area to justify a single estimating trip — saving fuel and time.

Address is captured on the initial phone call as one of the first fields on the intake form.

## Automated follow-up

Problem being solved: many leads can't send photos right away when called (often because they're working), and currently nothing follows up with them automatically.

**Trigger:** when a lead's status changes to Waiting for images (or another status flagged as follow-up-eligible), a timer starts.

**Action:** once a set number of hours has elapsed with no status change, an automated WhatsApp message is sent asking for the photos.

**To confirm separately:** whether WhatsApp can be integrated via the official WhatsApp Business Platform API (the standard, compliant route for sending automated messages), versus embedding WhatsApp's own interface directly in the app, which isn't how WhatsApp's integrations work. This needs its own discussion before build.

## Quoting and close

Once photos arrive on WhatsApp, Greg prices the job and sends the quote, also via WhatsApp, aiming to close the deal in that conversation. On acceptance, a deposit is taken and the job is booked in.

**Customer accounts:** a customer account is created at the point a lead becomes Booked (deposit taken, job scheduled) — not earlier. Before that, they're tracked as a lead/contact only. This avoids half-formed accounts for people who never convert, and sets up cleanly for repeat work from the same customer down the line.

## Customer profile and projects

A customer account holds core client details once, and can have multiple projects (jobs) attached over time — so a repeat customer never re-enters their details, they just get a new project added to their existing account.

**Customer-level fields:**

- Full name
- Company name (if applicable)
- Billing address
- Email address
- Contact telephone number

**Per-project fields and content** (each project is its own record, linked to the parent customer account):

- Before photos (separate from after photos)
- After photos
- General documents/attachments (e.g. signed service agreements — not every project has one)

**Future automation note:** an estimate generator is planned, which will read specific project fields to auto-produce a quote. This has already been prototyped and validated in N8N using Airtable, and will be ported into this system later. Not being scoped in detail yet — flagged here as a known future dependency that will shape which project fields are required at that point.

**Extensibility requirement:** the per-project field set above is a starting point, not fixed. Greg needs to be able to add new project fields over time (e.g. new requirements feeding the future estimate generator) without a full redevelopment each time — this should be treated the same as the configurable statuses and trade fields noted under Scalability.

## Calendar

One unified, shared calendar across the business rather than separate calendars per team member or visit type.

**Booking types** (a fixed set, not open-ended):

- Estimate visit
- Maintenance visit
- Booked job

**Team assignment:** bookings can be assigned to a specific team member. The calendar can be filtered to show all bookings, or only those assigned to a chosen team member — relevant as the business brings on staff with their own app access and permission levels alongside Greg's own account.

**Link to the map:** the map helps Greg spot clusters of unresponsive leads. Turning leads into Estimate visits is always a manual action, never automatic — but Greg can select multiple nearby leads on the map at once and convert them all into calendar entries together, rather than one at a time, making it easy to book an efficient run of visits in one area.**Firm vs. flexible bookings:** customers fall into two groups — those needing a firm date (a deadline, limited availability) and those who are flexible on timing (e.g. "anytime in the next three months"). These are handled differently rather than both going straight onto the calendar:

- **Firm bookings** go directly onto the calendar as solid, dated entries.
- **Flexible bookings** sit in a separate waiting panel alongside the calendar, not yet assigned a date. When a gap opens up in the schedule, Greg drags a flexible job from the panel onto the open date, at which point it becomes a firm calendar entry. This avoids showing a flexible job as if it already occupies a slot.

## To-do list

A shared to-do list where items can be written in plain English and assigned to a specific team member.

**Customer linking:** typing an @ symbol followed by a customer's name (e.g. "pick up paint for @Dave Smith") turns that mention into a clickable link straight to that customer's profile in the system, so a to-do item can reference a customer or job without leaving free text disconnected from the records.

**Priority:** each to-do item is classified as either Urgent or Not urgent.

**Future idea — AI assistant via WhatsApp:** longer-term, Greg would like to interact with the whole system through natural-language chat with an AI assistant over WhatsApp (e.g. updating a lead's status or checking the day's schedule by text). Not being scoped now — flagged as a future direction.

**Front end flexibility requirement:** the front end (visual design/UI) must be kept cleanly separated from the back end business logic and data, using a component-based structure with a consistent design system. This ensures Greg can redesign the look and feel of the app later without needing to rebuild or risk the underlying workflows (lead pipeline, statuses, calendar, etc.).

**Suggested tech stack:** JavaScript-based throughout — React/Next.js front end, Node back end, PostgreSQL database. Chosen for strong AI coding tool support, a large developer pool for future hand-off, and easy extension to WhatsApp integration and a future mobile app.

**Activity log:** every status change and edit on a lead or customer record is automatically timestamped and logged, building an audit trail of who changed what and when. Built into the data model from the start rather than added later.

**Reporting:** basic reporting (e.g. lead source performance, conversion rate by status) reads from the same underlying data as the activity log, so this becomes mostly a front-end dashboard once the data model is in place.

**Future idea — WhatsApp conversation summarization:** building on the WhatsApp AI assistant idea above, an AI layer could read through a customer's WhatsApp conversation thread and automatically summarize key points (agreements, prices mentioned, next steps), logging that summary onto the lead or customer record without Greg needing to scroll back through the chat. Not scoped in detail yet — flagged as a future direction.

**Manual notes:** in addition to the automatic activity log, users can leave free-text manual notes against a customer account.

## Automation panel

A dedicated UI panel for managing automations (e.g. the Waiting-for-images WhatsApp follow-up), rather than them being hardcoded and invisible. Greg can see which automations are currently live, create new ones, and edit or switch off existing ones, all visually rather than through a developer change.

## Scalability notes

The business plans to add renovation and fit-out trades on top of this same system later, without a rebuild. Design principles to support that:

- **Statuses, trade types, and form fields are data, not code.** Configurable lists that Greg can extend, not hardcoded values.
- **One pipeline shape, many trades.** Current thinking is that every trade (decorating, renovation, fit-out) follows the same underlying pipeline engine — intake, statuses, map, close — and the only thing that differs by trade is which fields are captured on the intake form. The detailed renovation/fit-out flow itself is not yet defined and is intentionally deferred.
- **Build order.** Ship the decorating lead flow as a fully working, daily-use tool first (this document's scope). Add renovation/fit-out as a module reusing the same engine once decorating is live and proven.
- **Approach to building with AI.** Rather than micromanaging every line, the plan is a hybrid: a detailed spec per feature (like this document), then have the AI build that whole feature in one pass, then review and adjust.

## Open questions

- [ ] Full intake form fields and logic (being built separately in a third-party form tool; to be reviewed and replicated)
- [ ] WhatsApp integration method — official Business Platform API vs. other options
- [ ] Full list of statuses beyond the four drafted so far, and which ones trigger automated follow-up
- [ ] Whether the map needs additional functionality beyond list/filter/cluster-spotting
- [ ] Renovation/fit-out pipeline and form fields — fully undefined, deferred
- [ ] What triggers an estimate visit once a cluster has formed (manual decision, or a threshold?)
