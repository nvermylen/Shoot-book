# ERP_DATA_MODEL
## Lens — The Source of Truth

> **Purpose**: The canonical entities Lens manages and the relationships between them. This is the *intent* layer — the mental model. Migrations are the *implementation* layer. When the implementation drifts from the intent, it's the implementation that's wrong.
>
> **When to update**: Before any migration that adds, removes, or fundamentally changes an entity. Before any agent gets new write access. Before any feature that introduces a new business concept.
>
> **Rule**: If a new business concept doesn't fit any of the entities below, the answer is not "stuff it into `metadata jsonb`." The answer is "discuss whether it deserves an entity, then update this file, then write the migration."

---

## Entity Map

```
┌──────────────┐       ┌──────────────┐
│ photographer │ 1───* │  client      │
│ (auth user)  │       │              │
└──────┬───────┘       └──────┬───────┘
       │                      │
       │ 1                    │ 1
       │                      │
       │ *                    │ *
┌──────▼───────┐       ┌──────▼───────┐       ┌──────────────┐
│   package    │ *───1 │   booking    │ 1───* │ booking_     │
│              │       │   (session)  │       │ location     │
└──────────────┘       └──────┬───────┘       └──────┬───────┘
                              │                      │
                              │ 1                    │ *
                              │                      │
                       ┌──────▼───────┐       ┌──────▼───────┐
                       │   contract   │       │   location   │
                       └──────────────┘       └──────────────┘
                              │
                              │ 1───*
                              │
                       ┌──────▼───────┐       ┌──────────────┐
                       │   invoice    │ 1───* │   payment    │
                       └──────────────┘       └──────────────┘

                       ┌──────────────┐       ┌──────────────┐
                       │  deliverable │       │   expense    │
                       └──────────────┘       └──────────────┘

                       ┌──────────────┐
                       │  comm_log    │  ← every comm event written here
                       └──────────────┘
```

---

## Entities

### `photographer`
The business owner. One per Supabase auth user. Owns everything.
- `id` (uuid PK, = `auth.users.id`)
- `business_name` (text)
- `display_name` (text)
- `timezone` (text — IANA tz)
- `default_email_signature` (text)
- `created_at`, `updated_at`

**RLS:** users can only see their own row.

---

### `client`
The end customer of the photographer. May have a `parent_*` set when the booking subject is a minor (see Morgan's persona — senior shoots: teen books, parent pays).
- `id` (uuid PK)
- `photographer_id` (uuid FK → photographer)
- `display_name` (text)
- `email` (text)
- `phone` (text, nullable)
- `parent_email` (text, nullable) — billing recipient when subject is a minor
- `parent_name` (text, nullable)
- `parent_phone` (text, nullable)
- `notes` (text)
- `source` (text — 'web_form' | 'gmail' | 'manual' | 'imported')
- `created_at`, `updated_at`, `deleted_at` (soft delete)

**RLS:** photographer-scoped.

---

### `lead`
A potential client — pre-conversion. A `lead` becomes a `client` when qualified and the photographer (or LeadAgent) converts.
- `id` (uuid PK)
- `photographer_id` (uuid FK → photographer)
- `display_name` (text)
- `email` (text)
- `phone` (text, nullable)
- `source` (text — 'web_form' | 'gmail_inbound' | 'referral' | 'social' | 'other')
- `intent_summary` (text — what they asked for, in plain language)
- `qualification_status` (text — 'new' | 'qualified' | 'disqualified' | 'converted')
- `qualification_notes` (text)
- `converted_client_id` (uuid FK → client, nullable)
- `received_at` (timestamptz)
- `created_at`, `updated_at`, `deleted_at`

**RLS:** photographer-scoped.

---

### `package`
Configurable product the photographer sells. Defines pricing, deliverables, and constraints.
- `id` (uuid PK)
- `photographer_id` (uuid FK)
- `name` (text — e.g., "Senior Portrait — Premium")
- `description` (text)
- `price_cents` (int)
- `deposit_cents` (int)
- `session_type` (text — 'senior' | 'family' | 'couples' | 'newborn' | 'event' | 'custom')
- `included_locations_count` (int)
- `included_outfits_count` (int, nullable)
- `delivery_count` (int — number of edited images delivered)
- `is_active` (bool)
- `created_at`, `updated_at`, `deleted_at`

**RLS:** photographer-scoped.

---

### `location`
A physical shoot location, organized by category. Used to constrain `booking_location` selection.
- `id` (uuid PK)
- `photographer_id` (uuid FK)
- `name` (text)
- `category` (text — 'nature_rustic' | 'downtown' | 'studio' | 'beach' | 'custom')
- `description` (text)
- `representative_image_url` (text)
- `is_active` (bool)
- `created_at`, `updated_at`, `deleted_at`

**RLS:** photographer-scoped.

**Constraint:** `booking_location` selections must all share the same `category` per booking (Morgan's pain point — clients pick incompatible categories without it being enforced).

---

### `booking`
A scheduled session. The hub entity — most other entities point at it.
- `id` (uuid PK)
- `photographer_id` (uuid FK)
- `client_id` (uuid FK)
- `package_id` (uuid FK)
- `session_date` (timestamptz — start)
- `duration_minutes` (int)
- `status` (text — 'tentative' | 'confirmed' | 'completed' | 'cancelled')
- `contract_id` (uuid FK → contract, nullable until signed)
- `deposit_invoice_id` (uuid FK → invoice, nullable until created)
- `final_invoice_id` (uuid FK → invoice, nullable until created)
- `external_calendar_event_id` (text — Google Calendar ID)
- `notes` (text)
- `created_at`, `updated_at`, `deleted_at`

**RLS:** photographer-scoped.

---

### `booking_location`
Join table — which locations were selected for which booking. Order matters (shoot sequence).
- `id` (uuid PK)
- `booking_id` (uuid FK)
- `location_id` (uuid FK)
- `sequence` (int)
- `created_at`

**Constraint:** all `booking_location.location_id`s for a booking must reference locations sharing the same `category`.

---

### `contract`
Signed service agreement.
- `id` (uuid PK)
- `booking_id` (uuid FK)
- `client_id` (uuid FK)
- `template_id` (uuid FK → contract_template, nullable)
- `content` (text — final rendered)
- `signed_at` (timestamptz, nullable)
- `signature_image_url` (text, nullable)
- `signed_ip` (inet, nullable)
- `created_at`, `updated_at`

**RLS:** photographer-scoped via booking.

---

### `invoice`
A request for payment. Two per booking is typical: deposit + final.
- `id` (uuid PK)
- `photographer_id` (uuid FK)
- `booking_id` (uuid FK)
- `client_id` (uuid FK)
- `amount_cents` (int)
- `kind` (text — 'deposit' | 'final' | 'addon' | 'refund')
- `status` (text — 'draft' | 'sent' | 'paid' | 'partial' | 'overdue' | 'cancelled')
- `due_date` (date)
- `recipient_email` (text — defaults to client.parent_email if set, else client.email)
- `stripe_payment_link_url` (text, nullable)
- `stripe_payment_intent_id` (text, nullable)
- `quickbooks_invoice_id` (text, nullable — set on sync)
- `sent_at` (timestamptz, nullable)
- `paid_at` (timestamptz, nullable)
- `created_at`, `updated_at`, `deleted_at`

**RLS:** photographer-scoped.

**Note on `recipient_email`:** Morgan's #1 pain. Senior shoots — teen books, parent pays. Recipient must default to parent if `client.parent_email` is set.

---

### `payment`
A received payment. May correspond to one invoice or partially fulfill it.
- `id` (uuid PK)
- `photographer_id` (uuid FK)
- `invoice_id` (uuid FK)
- `amount_cents` (int)
- `method` (text — 'stripe' | 'cash' | 'check' | 'other')
- `stripe_charge_id` (text, nullable)
- `received_at` (timestamptz)
- `reconciled_at` (timestamptz, nullable — set when matched in QuickBooks)
- `created_at`, `updated_at`

**RLS:** photographer-scoped.

---

### `deliverable`
A gallery, file, or download package delivered to the client.
- `id` (uuid PK)
- `photographer_id` (uuid FK)
- `booking_id` (uuid FK)
- `kind` (text — 'gallery' | 'print_ready' | 'sneak_peek' | 'raw')
- `storage_path` (text — path in cloud storage)
- `external_url` (text — sharable URL)
- `passcode` (text, nullable)
- `expires_at` (timestamptz, nullable)
- `delivered_at` (timestamptz)
- `last_downloaded_at` (timestamptz, nullable)
- `created_at`, `updated_at`, `deleted_at`

**RLS:** photographer-scoped.

---

### `expense`
A business expense. Captured from receipts in email or manual entry.
- `id` (uuid PK)
- `photographer_id` (uuid FK)
- `amount_cents` (int)
- `vendor` (text)
- `category` (text — 'gear' | 'software' | 'travel' | 'props' | 'education' | 'other')
- `description` (text)
- `incurred_at` (date)
- `receipt_url` (text, nullable)
- `source` (text — 'gmail_receipt' | 'manual' | 'imported')
- `quickbooks_expense_id` (text, nullable — set on sync)
- `created_at`, `updated_at`, `deleted_at`

**RLS:** photographer-scoped.

---

### `comm_log`
Every communication — sent or received, automated or manual. The append-only ledger of "what did we say to this client and when."
- `id` (uuid PK)
- `photographer_id` (uuid FK)
- `client_id` (uuid FK, nullable — null for unmatched inbound)
- `lead_id` (uuid FK, nullable)
- `booking_id` (uuid FK, nullable)
- `direction` (text — 'inbound' | 'outbound')
- `channel` (text — 'email' | 'sms' | 'in_app')
- `agent_id` (text, nullable — 'comms' | 'lead' | 'billing' | 'manual')
- `subject` (text)
- `body` (text)
- `external_message_id` (text — Gmail thread ID, etc.)
- `sequence_id` (uuid FK → comm_sequence, nullable)
- `sent_at` (timestamptz)
- `created_at`

**RLS:** photographer-scoped.

**Append-only:** no UPDATE on this table. Corrections happen by writing a new row.

---

### `comm_sequence` and `comm_sequence_state`
A series of templated messages tied to a trigger (booking created, session approaching, etc.). Sequences are templates; state tracks per-client progression.

`comm_sequence`:
- `id, photographer_id, name, trigger_event, steps (jsonb), is_active`

`comm_sequence_state`:
- `id, sequence_id, client_id, booking_id, current_step, last_sent_at, status ('active' | 'paused' | 'completed' | 'cancelled')`

**RLS:** photographer-scoped.

---

### `integration_credentials`
Encrypted OAuth tokens per integration per photographer.
- `id, photographer_id, service ('gmail' | 'quickbooks' | 'stripe' | 'calendar' | 'storage'), access_token (encrypted), refresh_token (encrypted), expires_at, scope (text[]), created_at, updated_at`

**RLS:** photographer-scoped, never returned to client.

**See `SECURITY.md`** for encryption strategy.

---

### `agent_tool_call_log`
Append-only log of every tool call by every agent.
- `id, photographer_id, agent_id, tool_name, input_hash, output_hash, status, latency_ms, prompt_version, called_at`

**RLS:** photographer-scoped.

---

## Naming Conventions

- Tables: `snake_case`, singular (`booking`, not `bookings`).
- Columns: `snake_case`.
- FK columns: `[entity]_id`.
- Timestamps: `_at` suffix (`created_at`, `signed_at`, `paid_at`).
- Booleans: `is_*` prefix (`is_active`, `is_paid`).
- Soft delete: `deleted_at timestamptz nullable`.

See `DOMAIN_GLOSSARY.md` for the term-to-column mapping.

---

## Cross-References

| Concern | Lives in |
|---------|----------|
| RLS policies, encryption | `SECURITY.md` |
| Schema migration files | `migrations/migration_[NNN]_*.sql` |
| How agents read/write these entities | `AGENT_ARCHITECTURE.md` |
| External system mapping (e.g., `invoice.quickbooks_invoice_id`) | `INTEGRATION_REGISTRY.md` |
| Database conventions (indexes, RLS, soft-delete patterns) | `docs/personas/PERSONA_ARCH.md` |

---

*Lens | ERP Data Model | Last updated: [DATE]*
