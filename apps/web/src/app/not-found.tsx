import Link from "next/link";

export default function NotFound() {
  return (
    <main className="shell ui-fade-in">
      <section className="panel-card">
        <h1>404</h1>
        <p className="muted-copy">Page not found.</p>
        <Link className="primary-link" href="/">
          Back to home
        </Link>
      </section>
    </main>
  );
}
