# WhatNow?

[![CI](https://github.com/serviceai366-beep/whatnow-app/actions/workflows/ci.yml/badge.svg)](https://github.com/serviceai366-beep/whatnow-app/actions/workflows/ci.yml)

WhatNow? helps people understand official, technical, and otherwise confusing
documents. It turns a document or pasted text into a cautious plain-language
explanation, evidence-linked next steps, and (when appropriate) a draft reply.
The hosted product is aimed first at people in Latvia and supports English,
Russian, and Latvian workflows.

## Project status

This is a public, early-stage MVP under active development. The product is
usable, but hosted features depend on configured Supabase, Sites, OpenAI,
Turnstile, Resend, and Stripe services. Do not treat generated explanations or
documents as legal, medical, financial, or governmental advice.

## What is included

- **Understand** — analyze pasted text, photos, PDFs, DOCX, ODT, RTF, and UTF-8
  or BOM-marked UTF-16 TXT files within the documented size limits.
- **Translate** — translate text, files, and images; compare literal,
  conversational, official, and bold variants; inspect pronunciation and
  per-variant back-translations.
- **Create & edit** — guided and quick document workflows with country or
  jurisdiction context, document review, missing-information warnings, and
  interactive editing.
- **History and workspace** — account-scoped analysis and translation history,
  saved files, profile preferences, quotas, themes, and model preferences where
  the plan allows them.
- **Calendar and reminders** — confirmed dates can become account-scoped
  events with email reminders.
- **Support** — users see their own support requests; authorized maintainers can
  triage and reply to all requests.

The app enforces file, request, and plan limits server-side. Limits can change
as the MVP evolves; the UI is not a security boundary.

## Authentication and privacy

- The current hosted sign-in flow uses **Google OAuth through Supabase**.
  Passwordless email sign-in is intentionally not exposed in the current UI.
- The OpenAI, Stripe, Resend, Turnstile secret, and Supabase service credentials
  are server-side runtime values. They must never be placed in client code,
  committed to Git, or pasted into an issue or pull request.
- `.env.local` is ignored by Git. `.env.example` contains placeholders only.
- Supabase row-level security protects account-scoped history, files, reminders,
  and support data. D1 stores pseudonymous usage events for quota enforcement.
- Analysis requests use `store: false`; uploaded source data is not intended to
  be written to application logs. History is saved only through an explicit
  account action.

See [SECURITY.md](SECURITY.md) before reporting a vulnerability and
[SUPPORT.md](SUPPORT.md) for ordinary product support.

## Architecture

| Area | Location | Purpose |
| --- | --- | --- |
| UI and routes | `app/` | Next/Vinext React application, API routes, and client panels |
| Quotas | `db/`, `drizzle/` | D1 schema and migrations for rolling usage controls |
| Account data | `supabase/migrations/` | Supabase tables and row-level security policies |
| Hosting | `.openai/hosting.json`, `build/` | Sites project bindings and Cloudflare-compatible build integration |
| Tests | `tests/` | Validation and behavior tests run by `npm test` |

## Local development

Requirements: Node.js **22.13 or newer**.

```bash
npm install
```

Create a local environment file from the placeholders and fill it with
development-only values. On Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

On macOS/Linux:

```bash
cp .env.example .env.local
```

Start the development server:

```bash
npm run dev
```

Before opening a pull request, run the same checks as CI:

```bash
npm run lint
npm test
```

`npm test` performs a production build and then runs the Node test suite. If
you change `db/schema.ts`, regenerate migrations with `npm run db:generate` and
review the generated SQL before committing it.

## Hosted deployment

`.openai/hosting.json` points to the existing WhatNow? Sites project and its
D1/R2 bindings. Production environment values are managed by the hosting
platform; they are deliberately not stored in this repository. Deploy only a
reviewed commit whose build and tests pass.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Small,
focused changes are preferred. Please do not attach real documents, personal
data, API keys, payment data, or private support conversations to public issues.

## License and brand

The source code is available under the [Apache License 2.0](LICENSE). Apache
2.0 preserves copyright notices and permits reuse under its terms, including
commercial reuse. The WhatNow? name, logo, and related brand assets are covered
separately by [TRADEMARKS.md](TRADEMARKS.md) and are not granted as a brand
license by the source-code license.

Copyright © 2026 WhatNow? contributors.
