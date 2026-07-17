import Link from "next/link";
import { LEGAL_CONTACT_EMAIL, TERMS_VERSION } from "../legal";

export const metadata = {
  title: "Terms of Service — WhatNow?",
  description: "The rules for using WhatNow? document explanations, calendar, storage, and reminders.",
};

export default function TermsOfService() {
  return (
    <main className="legal-page">
      <nav className="legal-nav" aria-label="Legal navigation">
        <Link className="legal-brand" href="/"><img src="/whatnow-logo.jpg" alt="" /><span>WhatNow?</span></Link>
        <div><Link href="/privacy">Privacy Policy</Link><Link href="/">Back to app</Link></div>
      </nav>
      <article className="legal-document">
        <header>
          <p className="legal-kicker">Simple rules for a useful service</p>
          <h1>Terms of Service</h1>
          <p><strong>Effective date:</strong> 17 July 2026 · <strong>Version:</strong> {TERMS_VERSION}</p>
          <p className="legal-summary">These Terms govern your use of WhatNow?. By creating an account, you agree to them.</p>
        </header>

        <section><h2>1. About WhatNow?</h2>
          <p>WhatNow? is an AI-assisted service that explains documents in plain language, identifies possible actions and dates, helps prepare draft replies, stores selected content, and supports calendar events and email reminders. The service is operated from Latvia. Contact: <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.</p>
        </section>

        <section><h2>2. Eligibility and acceptance</h2>
          <p>You must be at least 18 years old and legally able to enter into an agreement to create an account. When creating a new account, you must actively agree to these Terms and acknowledge the Privacy Policy. Existing users are not asked to repeat that step on every sign-in, although material future changes may require renewed confirmation.</p>
        </section>

        <section><h2>3. Your account</h2>
          <p>You must provide an email address or supported identity account that you control. You are responsible for protecting access to your email, Google account, device, and active WhatNow? session. Do not share an account or attempt to access another user&apos;s account. Tell us promptly if you believe your account has been compromised.</p>
        </section>

        <section><h2>4. AI output and important limitations</h2>
          <p>WhatNow? provides informational assistance, not legal, medical, financial, tax, immigration, or other professional advice. AI can misunderstand text, miss pages, confuse dates, make incorrect assumptions, or generate inaccurate statements. You remain responsible for checking the original document and deciding what to do.</p>
          <p>Do not rely on WhatNow? as the only source for urgent deadlines, emergencies, legal proceedings, medical decisions, financial transactions, or official submissions. Contact the sender or a qualified professional when the document is unclear or the consequences may be serious. WhatNow? does not determine whether a document is authentic, lawful, safe, or enforceable.</p>
        </section>

        <section><h2>5. Your content</h2>
          <p>You keep ownership of content you upload. You give WhatNow? a limited permission to host, copy, extract, transmit, and process that content only as reasonably necessary to provide, secure, and maintain the features you request.</p>
          <p>You must have the right to upload the content. Do not upload content unlawfully, disclose another person&apos;s confidential information without authority, or submit material that infringes intellectual-property, privacy, or other rights. Remove unnecessary personal and sensitive information whenever practical.</p>
        </section>

        <section><h2>6. Acceptable use</h2>
          <p>You may not use WhatNow? to:</p>
          <ul>
            <li>break the law, facilitate fraud, impersonate another person, or cause harm;</li>
            <li>upload malware, abusive content, stolen data, or content you have no right to process;</li>
            <li>bypass account, bot-protection, storage, analysis, reminder, or rate limits;</li>
            <li>probe, disrupt, reverse engineer, overload, or gain unauthorized access to the service or its providers;</li>
            <li>resell or automate access without written permission; or</li>
            <li>use generated text deceptively or present unverified AI output as an authoritative professional conclusion.</li>
          </ul>
        </section>

        <section><h2>7. Limits, storage, and reminders</h2>
          <p>The application displays the current limits for analyses, saved files, active reminders, and weekly reminder creation. Limits may be adjusted to protect reliability, prevent abuse, and control operating costs. Files, history, events, or reminders may be removed when you delete them, close the account, exceed applicable rules, or when retention is no longer reasonably necessary.</p>
          <p>Reminder delivery depends on the date, time, timezone, email provider, network availability, and third-party systems. Reminders are a convenience and are not guaranteed to arrive at an exact time. You must not rely on them as the only way to remember an important or legally binding deadline.</p>
        </section>

        <section><h2>8. Service availability and changes</h2>
          <p>We aim to keep WhatNow? available and accurate but do not promise uninterrupted or error-free operation. Features may be improved, limited, suspended, or removed for maintenance, security, legal, provider, or product reasons. We will try to avoid unnecessary loss of user content and provide reasonable notice of material changes where practical.</p>
        </section>

        <section><h2>9. Third-party services</h2>
          <p>WhatNow? relies on third-party infrastructure and services, including Supabase, OpenAI, Cloudflare, ChatGPT Sites, Resend, and, when selected, Google authentication. Their systems may affect availability and processing. Your direct use of a third-party account or website may also be governed by that provider&apos;s own terms.</p>
        </section>

        <section><h2>10. Intellectual property</h2>
          <p>The WhatNow? name, interface, software, design, and service content are protected by applicable intellectual-property laws. These Terms give you a limited, personal, non-exclusive, revocable right to use the service for its intended purpose. They do not transfer ownership of WhatNow? or third-party technology to you.</p>
        </section>

        <section><h2>11. Suspension and termination</h2>
          <p>We may restrict or suspend access where reasonably necessary to protect users or the service, investigate abuse, comply with law, or address a serious or repeated breach of these Terms. You may stop using WhatNow? at any time and request account deletion. Provisions that by their nature should continue after termination remain effective.</p>
        </section>

        <section><h2>12. Disclaimers and liability</h2>
          <p>To the extent permitted by law, WhatNow? is provided on an “as available” basis. We do not guarantee that AI output, extracted information, reminders, or suggested replies are complete, accurate, or suitable for a particular purpose.</p>
          <p>Nothing in these Terms excludes liability that cannot lawfully be excluded, including mandatory consumer rights. Subject to those rights, WhatNow? is not responsible for indirect or unforeseeable loss caused by reliance on unverified AI output, missed reminders, third-party outages, unauthorized account access outside our reasonable control, or unlawful content submitted by a user.</p>
        </section>

        <section><h2>13. Governing law and disputes</h2>
          <p>These Terms are governed by the laws of Latvia, without taking away any mandatory consumer protection available to you under the law of your country of residence. Please contact us first so we can try to resolve a concern informally. You may also use any court, consumer authority, or dispute-resolution procedure available under applicable law.</p>
        </section>

        <section><h2>14. Changes to these Terms</h2>
          <p>We may update these Terms when the service or legal requirements change. The current version and effective date will appear on this page. If a material change requires renewed agreement, we will ask for it before continued use of the affected service.</p>
        </section>

        <section><h2>15. Contact</h2>
          <p>Questions about these Terms: <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.</p>
        </section>
      </article>
    </main>
  );
}
