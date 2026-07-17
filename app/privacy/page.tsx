import Link from "next/link";
import { LEGAL_CONTACT_EMAIL, PRIVACY_VERSION } from "../legal";

export const metadata = {
  title: "Privacy Policy — WhatNow?",
  description: "How WhatNow? collects, uses, protects, and deletes personal data.",
};

export default function PrivacyPolicy() {
  return (
    <main className="legal-page">
      <nav className="legal-nav" aria-label="Legal navigation">
        <Link className="legal-brand" href="/"><img src="/whatnow-logo.jpg" alt="" /><span>WhatNow?</span></Link>
        <div><Link href="/terms">Terms of Service</Link><Link href="/">Back to app</Link></div>
      </nav>
      <article className="legal-document">
        <header>
          <p className="legal-kicker">Your information, explained clearly</p>
          <h1>Privacy Policy</h1>
          <p><strong>Effective date:</strong> 17 July 2026 · <strong>Version:</strong> {PRIVACY_VERSION}</p>
          <p className="legal-summary">This Policy explains what information WhatNow? uses, why it is needed, who may process it, and the choices available to you.</p>
        </header>

        <section><h2>1. Who is responsible for your data</h2>
          <p>WhatNow? is the service responsible for the personal data described in this Policy. The service is operated from Latvia. Questions, privacy requests, and complaints may be sent to <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.</p>
        </section>

        <section><h2>2. Information we process</h2>
          <p>Depending on how you use WhatNow?, we may process:</p>
          <ul>
            <li><strong>Account information:</strong> your email address, account identifier, display name, profile image, authentication provider, account timestamps, language, theme, accessibility, and other preferences.</li>
            <li><strong>Documents and input:</strong> text you paste and files you upload, including images, PDFs, Word-compatible documents, and plain-text files. Documents may contain personal or sensitive information chosen by you.</li>
            <li><strong>Analysis information:</strong> generated explanations, extracted dates, action plans, evidence passages, uncertainties, and related result metadata.</li>
            <li><strong>Saved content:</strong> your latest analysis history, files you choose or configure the service to save, calendar events, reminder settings, timezone, and reminder delivery status.</li>
            <li><strong>Technical, usage, and security information:</strong> IP address, browser and device information, request timestamps, authentication and security events, rate-limit records, bot-protection results, AI token counts, model name, document category, estimated processing cost, and diagnostic information needed to keep the service reliable and price the service sustainably. Cost records use a hashed account identifier and do not contain document text.</li>
            <li><strong>Communications:</strong> messages you send to support and delivery information for service emails and reminders.</li>
          </ul>
        </section>

        <section><h2>3. How we use information and our legal bases</h2>
          <ul>
            <li><strong>To provide the service and perform our agreement with you:</strong> create and secure your account, analyze documents, display and synchronize results, store files you request, manage calendar events, and deliver requested reminders.</li>
            <li><strong>With your consent:</strong> send optional reminder emails where consent is requested. You may withdraw that consent in reminder settings without affecting earlier lawful processing.</li>
            <li><strong>For legitimate interests:</strong> prevent fraud and abuse, enforce fair usage limits, protect accounts and systems, investigate failures, and improve service reliability. We use only information reasonably necessary for these purposes.</li>
            <li><strong>To meet legal obligations:</strong> respond to valid legal requests, protect legal rights, and keep records where applicable law requires it.</li>
          </ul>
          <p>Providing account information and document content is optional, but we cannot create an account or perform an analysis without the information required for that function.</p>
        </section>

        <section><h2>4. AI document analysis</h2>
          <p>When you request an analysis, the relevant text or file content is sent to OpenAI&apos;s API to generate a plain-language explanation. WhatNow? does not use the result to make decisions that produce legal or similarly significant effects about you. AI output can be incomplete or wrong, so important dates, obligations, amounts, and contact details must be checked against the original document.</p>
          <p>Please remove information that is not needed before uploading a document. Only upload personal data about another person when you have a lawful reason and permission to do so.</p>
        </section>

        <section><h2>5. Service providers and recipients</h2>
          <p>We disclose information only as needed to operate WhatNow?. The main categories of recipients are:</p>
          <ul>
            <li><strong>Supabase</strong> for authentication, account data, database records, and private file storage.</li>
            <li><strong>OpenAI</strong> for document and text analysis through the API.</li>
            <li><strong>Cloudflare and ChatGPT Sites</strong> for website delivery, security, infrastructure, and Turnstile bot protection.</li>
            <li><strong>Resend</strong> for transactional email and reminder delivery.</li>
            <li><strong>Google</strong> if you choose Google sign-in. Google provides verified identity information needed for authentication; your uploaded documents are not sent to Google for this purpose.</li>
            <li>Professional advisers, authorities, or other parties where disclosure is required by law or reasonably necessary to protect users, the service, or legal rights.</li>
          </ul>
          <p>Some providers may process information outside Latvia or the European Economic Area. Where required, transfers are supported by an adequacy decision, standard contractual clauses, or another lawful safeguard.</p>
        </section>

        <section><h2>6. How long information is kept</h2>
          <ul>
            <li>Your account and profile are kept until you delete the account or ask us to close it, subject to limited legal and security retention.</li>
            <li>The service keeps no more than the latest 10 analyses in account history. Older history entries are removed automatically.</li>
            <li>Saved files are kept until you delete them or close the account, subject to the storage limits shown in the application.</li>
            <li>Calendar events and reminders are kept until you delete them, they are no longer needed for delivery, or the account is closed. Limited delivery and security records may be kept for troubleshooting and abuse prevention.</li>
            <li>Usage-limit records are kept only as long as needed to enforce the applicable daily and weekly windows and investigate abuse. Per-analysis cost records contain no document text and are automatically removed after 90 days.</li>
            <li>OpenAI may retain API inputs and outputs for a limited period for abuse monitoring unless different data controls apply. Provider retention may also be required by law.</li>
            <li>Records of accepting these Terms and this Policy may be kept for as long as reasonably necessary to demonstrate that acceptance.</li>
          </ul>
        </section>

        <section><h2>7. Security</h2>
          <p>We use measures designed to protect information, including encrypted connections, verified account sessions, access controls, private per-user storage, server-side API credentials, bot protection, request limits, and restricted database policies. No internet service can guarantee absolute security. Keep access to your email and Google account secure and contact us promptly if you suspect unauthorized access.</p>
        </section>

        <section><h2>8. Cookies and similar technology</h2>
          <p>WhatNow? uses essential browser storage and similar technology to maintain authentication, remember device preferences, complete secure sign-in, and operate bot protection. We do not currently use advertising cookies or sell personal data for targeted advertising. If non-essential analytics or advertising technology is introduced, this Policy and any required consent controls will be updated first.</p>
        </section>

        <section><h2>9. Your rights</h2>
          <p>Subject to applicable data-protection law, you may request access to your personal data, correction, deletion, restriction, portability, or object to processing based on legitimate interests. Where processing relies on consent, you may withdraw it at any time. We may need to verify your identity before completing a request and normally respond within one month.</p>
          <p>You may also complain to the Latvian Data State Inspectorate at <a href="https://www.dvi.gov.lv/en" target="_blank" rel="noreferrer">dvi.gov.lv</a>, or to the data-protection authority in the country where you live or work.</p>
        </section>

        <section><h2>10. Account deletion</h2>
          <p>You may delete individual saved files, history entries, calendar events, and reminders using the application where those controls are available. To request complete account deletion, email <a href={`mailto:${LEGAL_CONTACT_EMAIL}?subject=WhatNow%20account%20deletion`}>{LEGAL_CONTACT_EMAIL}</a> from the address linked to your account.</p>
        </section>

        <section><h2>11. Age requirement</h2>
          <p>WhatNow? is intended for people aged 18 or older. Do not create an account if you are under 18.</p>
        </section>

        <section><h2>12. Changes to this Policy</h2>
          <p>We may update this Policy when the service, providers, or legal requirements change. The current version and effective date will be displayed on this page. If a change materially affects how personal data is used, we will provide an appropriate notice and request new confirmation where required.</p>
        </section>

        <section><h2>13. Contact</h2>
          <p>Privacy questions and requests: <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.</p>
        </section>
      </article>
    </main>
  );
}
