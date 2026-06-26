import Link from "next/link";

interface EntityPlaceholderPageProps {
  params: Promise<{
    entityId: string;
  }>;
}

export default async function EntityPlaceholderPage({ params }: EntityPlaceholderPageProps) {
  const { entityId } = await params;

  return (
    <main className="shell">
      <section
        className="creation-card entity-placeholder-card"
        aria-labelledby="entity-placeholder-heading"
      >
        <p className="eyebrow">Entity created</p>
        <h1 id="entity-placeholder-heading">The entity page is next.</h1>
        <p className="hero-copy">
          Entity {entityId} was created or opened successfully. The full entity page with rating,
          trust, and reviews is planned for the next dedicated stage.
        </p>
        <Link className="primary-link" href="/">
          Back to search
        </Link>
      </section>
    </main>
  );
}
