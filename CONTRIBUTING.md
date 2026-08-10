# Contributing to WhatNow?

Thank you for helping improve WhatNow?. The project is a public early-stage
MVP, so clarity, privacy, and small reviewable changes matter more than large
feature drops.

## Before you start

1. Check existing issues and pull requests so work is not duplicated.
2. For a new feature, open an issue first and describe the user problem,
   proposed behavior, and how it can be tested.
3. Never include real documents, personal information, production credentials,
   payment details, or private support conversations in a commit, issue, or PR.
4. Security vulnerabilities must follow [SECURITY.md](SECURITY.md), not a
   public issue.

## Local setup

- Use Node.js 22.13 or newer.
- Run `npm install`.
- Copy `.env.example` to `.env.local` and use development-only credentials.
- Run `npm run dev` to start the local app.

## Validation

Run these before opening a pull request:

```bash
npm run lint
npm test
```

`npm test` includes the production build. If you change the D1 schema, run
`npm run db:generate`, inspect the migration, and include the migration in the
same change. Do not commit generated build output, local archives, or secrets.

## Pull requests

- Keep one logical change per PR and explain the user impact.
- Include reproduction steps for bug fixes and a short test plan.
- Keep API keys and environment values out of screenshots and logs.
- Preserve server-side secret handling, authentication checks, quotas, and
  row-level security.
- Update user-facing documentation when behavior or limits change.
- Do not deploy production or change hosted secrets from a pull request.

The primary maintainer reviews changes for correctness, privacy, accessibility,
and compatibility with the hosted Sites deployment.
