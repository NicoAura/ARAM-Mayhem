import Link from "next/link";

export default function NotFound() {
  return (
    <>
      <section className="intro">
        <p className="eyebrow">404</p>
        <h1>This page doesn&apos;t exist.</h1>
      </section>
      <Link href="/" className="back-link">
        ← Back to home
      </Link>
    </>
  );
}
