"use client";

// "Skip to content" for keyboard users. Moves focus without adding #main to the address, since
// embedded tools read the page's #hash.
export default function SkipLink() {
  return (
    <a
      className="skip-link"
      href="#main"
      onClick={(e) => {
        const main = document.getElementById("main");
        if (!main) return;
        e.preventDefault();
        main.focus();
        main.scrollIntoView();
      }}
    >
      Skip to content
    </a>
  );
}
