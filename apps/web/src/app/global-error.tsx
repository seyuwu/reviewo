"use client";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ reset }: GlobalErrorProps) {
  return (
    <html lang="en">
      <body>
        <main style={{ fontFamily: "system-ui, sans-serif", margin: "2rem auto", maxWidth: "32rem", padding: "0 1rem" }}>
          <h1>Something went wrong</h1>
          <p>Try again or return to the homepage.</p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              background: "#171717",
              border: 0,
              borderRadius: "999px",
              color: "#fff",
              cursor: "pointer",
              marginTop: "1rem",
              padding: "0.65rem 1rem"
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
