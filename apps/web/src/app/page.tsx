const readinessItems = [
  "Next.js App Router",
  "Strict TypeScript",
  "TanStack Query providers",
  "Backend API client boundary"
];

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero-card" aria-labelledby="home-heading">
        <p className="eyebrow">Reviewo Web</p>
        <h1 id="home-heading">Frontend skeleton is ready.</h1>
        <p className="hero-copy">
          The web app now has the foundation for future Reviewo product flows while keeping business
          logic in the backend API.
        </p>
        <div className="readiness-list" aria-label="Configured frontend foundation">
          {readinessItems.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </section>
    </main>
  );
}
