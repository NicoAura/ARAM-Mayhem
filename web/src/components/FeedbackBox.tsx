"use client";

import { useState } from "react";
import { useT } from "./I18n";

const EMAIL = "admin@deeparam.com";

/** The footer's "Found a bug?" box: an email link, plus a copy button for when no mail app opens. */
export default function FeedbackBox() {
  const [copied, setCopied] = useState(false);
  const t = useT();
  const copy = () =>
    navigator.clipboard
      ?.writeText(EMAIL)
      .then(() => (setCopied(true), setTimeout(() => setCopied(false), 2000)))
      .catch(() => {});
  return (
    <section className="feedback-box" aria-label={t("Feedback")}>
      <div>
        <b>{t("Found a bug? Want a feature added?")}</b>
        <span>{t("Send it our way. Ideas from players shape what we build next.")}</span>
      </div>
      <div className="feedback-actions">
        <a className="feedback-mail" href={`mailto:${EMAIL}?subject=${encodeURIComponent("DeepARAM feedback")}`}>
          {t("Contact us")}
        </a>
        <button type="button" className="feedback-copy" onClick={copy} title={t("Copy the email address")}>
          {copied ? t("Copied!") : EMAIL}
        </button>
      </div>
    </section>
  );
}
