# Relay — coordinator workspace

A local full-stack first version based on the six supplied mockups. React + Vite frontend, Express API, SQLite persistence. Demo records are fictional and clearly labeled.

## Run

Node 22.12+ is required. `npm install`, then `npm run dev`. Open http://localhost:4180. `npm test` validates routing, evidence, financial guards, and CRM mapping; `npm run build` builds the client. `npm start` serves the production client and API locally after a build.

## Connect GoHighLevel

Copy `.env.example` to `.env`, add `GHL_API_KEY` (a location/sub-account private integration token), `GHL_LOCATION_ID`, and `OPENAI_API_KEY`; restart the server. Never put credentials in a `VITE_` environment variable. The settings page shows configuration status, not secrets. Select **Sync CRM** to import. Demo data is replaced only after a successful complete import; API failures preserve existing records.

The private integration needs read access to contacts, conversations, conversation messages, opportunities, invoices, and payment transactions. The adapter uses LeadConnector's documented v3 APIs (the contact notes endpoint is currently marked deprecated by HighLevel and needs validation during onboarding), paginates contacts and messages, retrieves notes and opportunities per contact, and reads live invoices/transactions for the location. It retries rate limits and limits simultaneous contact retrieval to two. A first import can take time at thousands of contacts.

Set `GHL_FIELD_MAP` to the actual custom field IDs in your location for `procedure`, `consultDate`, `followUpAt`, `surgeryDate`, and optionally `status`. Dates must be parseable dates. Recognized status values include `new_lead`, `consult_completed`, `surgery_booked`, `do_not_contact`, `clinical_question`, `not_candidate`, `outside_service`, `unsupported_procedure`, and `spam`. Without a mapped status, Relay derives only from explicit consult/surgery dates and the CRM lead type. Pipeline IDs and stage IDs are supplied as evidence; Relay does not guess their business meaning. Staff names are resolved from CRM user IDs when the integration has access. Unresolved identities are flagged for review.

Current limitations: calling controls are hidden until phone integration is implemented; texting and payment-sending controls are also hidden. No messages or payment requests are sent by the server. Call message metadata is retrieved, but fetching/transcribing audio recordings is not yet implemented. No automatic timer or webhook sync is installed: use Sync. Schedule and webhooks, staff authentication/roles, deployment, encrypted managed storage, and account-specific validation are next production steps. This initial server binds to localhost and is intended for local evaluation, not public or multi-user deployment. Before importing real patient data, complete the organization's security/privacy review and appropriate agreements for the chosen CRM, AI API, hosting, and storage.

## AI classification and costs

Default: `gpt-6-luna`; uncertain decisions escalate to `gpt-6.1-sol`. Output is constrained to JSON and checked against permitted queues and exact quotes from supplied records. Model output with unsupported evidence fails into **Needs review**, not a sales queue. DND and known clinical restrictions take precedence. Collection requires a positive, due, open USD invoice. Financial totals are computed from invoices, never invented by the model. Other currencies need explicit display/accounting support before use.

Cache keys include source records, queue definitions, model settings, and the UTC day. Three analyses run at a time. This avoids re-billing unchanged contacts within a day and catches deadline changes. It is not yet a delta-only long-term summarization pipeline, and the complete fetched history is sent on a cache miss. Coordinator overrides persist until explicitly reset.

As checked November 16, 2026, standard short-context token pricing is $0.10 input / $0.50 output per million for GPT-6 Luna and $2 input / $10 output for GPT-6.1 Sol. Example: 1,000 classifications of 5,000 input and 300 output tokens cost about $0.65 on Luna; escalating 10% to Sol adds about $1.30, for about $1.95 total. These are estimates excluding reasoning overhead, retries, longer histories and repeated analyses. Benchmark accuracy against coordinator-labeled examples before choosing a production threshold. Sources: https://developers.openai.com/api/docs/pricing and https://developers.openai.com/api/docs/models .

## Queue editor

Create queues with natural language rules, preview matches, accept/reject contacts, then save. Without an AI key, preview is explicitly labeled a simple sample keyword demonstration; it does not execute arbitrary natural language exclusions. Confirmed initial memberships are coordinator overrides. Initial accepted matches are stored as local Relay overrides. Existing coordinator ownership is preserved.

## Generic adapter

Optional `CRM_BASE_URL` and `CRM_API_KEY` support a normalized REST service. `GET {base}/contacts?limit=100&cursor=…` must return `{contacts: [...], nextCursor: null|string}`. The exact validated contact contract lives in `server/crm.mjs`. GoHighLevel configuration takes priority.

## Files

- `src/App.jsx`, `src/Forms.jsx`, `src/styles.css`: dashboard and workflows.
- `server/index.mjs`: API, background sync, and local serving.
- `server/highlevel.mjs`: native LeadConnector adapter.
- `server/classifier.mjs`: classification, safety invariants, and caching.
- `server/store.mjs`: SQLite storage and audit records.
- `.env.example`: configuration template.
- `tests/classifier.test.mjs`: behavioral tests using fixtures, no paid calls.

The template's static Sites worker is preserved, but it does not host the Express backend. A full-stack deployment is required for a shared working dashboard; publishing the static client alone is insufficient.

## Primary coordinator

The detector uses the assigned CRM owner first. Without an owner, it considers identifiable, manual outbound staff messages and authored CRM notes over the last 90 days. Recent manual messages carry more weight; automation, unknown senders, patient mentions, duplicates, and old activity are excluded. A clear result needs sufficient activity and separation from the next candidate. Ties and ownership conflicts are flagged. These are transparent heuristics, not calibrated AI probabilities. Confirmations in Relay are stored independently of queue corrections and survive CRM synchronization. They do not change ownership in GoHighLevel.

The native adapter preserves message `userId` and `source`, note `userId` and dates, and resolves staff names with `GET /users/{userId}`. Add `users.readonly` to the integration scopes for name resolution. Without that access, assigned IDs remain visible and require review; no staff identity is invented. Existing sample data demonstrates CRM assignments; activity detection is covered by fixtures until live source metadata is connected.

UI scope: no calling, texting, payment-sending, booking-link, office-switching, account-switching, intent score, or activity-feed controls are displayed. Invoice data, manual queue placement, coordinator confirmation, search, queue creation, and connection settings remain.
