"use client";

import { useT } from "./I18n";

const EMAIL = "admin@deeparam.com";

/** The footer's "Found a bug?" box: one email link. */
export default function FeedbackBox() {
  const t = useT();
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
      </div>
    </section>
  );
}
