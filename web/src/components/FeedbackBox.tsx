"use client";

import { useState } from "react";

const EMAIL = "admin@deeparam.com";

/** The footer's "Found a bug?" box: an email link, plus a copy button for when no mail app opens. */
export default function FeedbackBox() {
  const [copied, setCopied] = useState(false);
  const copy = () =>
    navigator.clipboard
      ?.writeText(EMAIL)
      .then(() => (setCopied(true), setTimeout(() => setCopied(false), 2000)))
      .catch(() => {});
  return (
    <section className="feedback-box" aria-label="Feedback">
      <div>
        <b>Found a bug? Want a feature added?</b>
        <span>Send it our way. Ideas from players shape what we build next.</span>
      </div>
      <div className="feedback-actions">
        <a className="feedback-mail" href={`mailto:${EMAIL}?subject=${encodeURIComponent("DeepARAM feedback")}`}>
          Contact us
        </a>
        <button type="button" className="feedback-copy" onClick={copy} title="Copy the email address">
          {copied ? "Copied!" : EMAIL}
        </button>
      </div>
    </section>
  );
}
