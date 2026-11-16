# Prototype Instructions

User-requested queues include Pre-consult: Needs vetting, Clearances, and exactly "Cups". Their automatic routing remains disabled until criteria are supplied; do not infer what Cups means. Phone integration work is deferred at the user's request. Hide all calling controls and shortcuts until calling is implemented; retain phone numbers as contact information.

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

Keep a visible Search names field above each contact list, including compact/mobile layouts.

Primary coordinator detection uses CRM owner, then identified manual staff activity; ignore automated messages and patient name mentions. Show evidence and ambiguity, and preserve manual coordinator confirmations across syncs.

Keep the interface focused: no placeholder account/office selectors, duplicate search, intent scores, promotional copy, or unfinished call/text/payment/booking actions. Preserve invoice information and defined queue/coordinator workflows.

Do not display profile pictures or avatar placeholders for patients, leads, or coordinators. Use names only.

Use the Higgsfield GPT Image 2.6 home reference in `design/home-gpt-image-2.6.png`: white/cool gray, deep navy text, indigo accents. Home is the default, with square live task-count cards for every queue; clicking a card opens the queue. Retain the minimal interface and name search.

Home must stay compact: Needs attention at the top, prioritizing review flags, overdue payments, and due follow-ups, followed by small queue-count cards. All six queues should fit in the first desktop screen; do not return to large square cards.

The Home Needs attention list includes a concise, source-backed issue overview (amount, procedure, invoice/payment issue or follow-up concern), not just a status label.
