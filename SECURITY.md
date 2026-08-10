# Security policy

WhatNow? handles documents that may contain personal, legal, financial, or
employment information. Please help us keep reports and test data private.

## Reporting a vulnerability

Do **not** open a public GitHub issue for a security problem. Use GitHub's
private vulnerability reporting or Security Advisories for this repository when
available. If that option is not enabled, contact the maintainer through a
private channel listed on the maintainer's GitHub profile and include the
repository name and a safe way to reproduce the issue.

Please do not send real user documents. Redact identifiers and provide the
smallest reproducible example possible.

## What to report privately

Examples include:

- exposed OpenAI, Stripe, Resend, Supabase, or Turnstile secrets;
- authentication or authorization bypasses;
- cross-account access to history, files, reminders, or support requests;
- quota or billing bypasses;
- unsafe file handling, injection, or data leakage;
- a production configuration that publishes private documents or logs them.

If a secret has been exposed, rotate or revoke it immediately and report the
commit, deployment, or log location without pasting the secret itself.

## Scope and expectations

This policy covers the source repository and the hosted WhatNow? application.
The maintainer will acknowledge a useful private report when practical, keep
the report private while a fix is prepared, and credit the reporter only with
their permission. Please allow reasonable time for investigation before public
disclosure.
