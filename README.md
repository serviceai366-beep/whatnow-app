# WhatNow?

WhatNow? explains official and difficult documents in plain Russian, Latvian,
or English and turns them into a cautious, evidence-linked action plan.

## MVP capabilities

- Photo: JPG, PNG, WEBP (up to 10 MiB)
- PDF (up to 10 MiB)
- Word DOCX and OpenDocument ODT (up to 5 MiB)
- RTF (up to 1 MiB)
- UTF-8 or BOM-marked UTF-16 TXT (up to 256 KiB and 50,000 characters)
- Pasted text (up to 50,000 characters)
- Google OAuth and passwordless email accounts through Supabase
- Optional per-user analysis history; original documents are never stored
- Rolling limits: 3 analyses per user per 24 hours and 10 per 7 days
- Additional service-wide request and weighted-cost guards
- Light and dark themes

Legacy `.doc` is intentionally not accepted. Reliably distinguishing old Word
files from other OLE Office documents requires a larger parser; save them as
`.docx` or PDF instead. Images embedded in DOCX, ODT, and RTF are not read by
the file parser, so image-heavy documents should be exported to PDF.

## Security model

- `OPENAI_API_KEY` exists only in the Sites runtime environment.
- Every analysis requires a Supabase bearer token. The server validates it with
  Supabase and uses only the verified user ID for quota accounting.
- Browser authentication uses the official Supabase client with OAuth PKCE.
- Google validates access to the Google account. Email sign-in requires the
  one-time inbox link; knowing an address alone is not enough.
- D1 records only a pseudonymous user ID, timestamp, and cost units for limits.
- The Responses request uses `store: false`; uploaded source data is not written
  to application storage or logs.
- History is protected by Supabase row-level security and contains only the
  structured result after an explicit Save action.
- Production fails closed before OpenAI whenever account or durable quota
  verification is unavailable.

## Local development

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
npm run lint
npm test
```

Copy `.env.example` to `.env.local` and provide local values. Never commit the
real OpenAI key. Supabase URL and publishable key are public client
configuration; the service-role key is not used by this app.

## Data and migrations

- `db/schema.ts` defines the D1 rolling-usage event table.
- `drizzle/` contains generated D1 migrations.
- `supabase/migrations/` defines the private analysis-history table and RLS.
- `.openai/hosting.json` identifies the existing Sites project and D1 binding.

Run `npm run db:generate` after changing the D1 schema. Runtime initialization
also uses `CREATE TABLE IF NOT EXISTS`, so a new Sites deployment can safely
create the quota table before its first paid request.

## Production

Build, test, commit, and push the exact source state before saving a Sites
version. Deploy only the saved version. Runtime values are managed through
Sites and are not stored in `.openai/hosting.json`.
