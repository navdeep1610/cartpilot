"use client";

import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="error-page">
      <p className="eyebrow">CartPilot paused safely</p>
      <h1>The store could not load.</h1>
      <p>No order or payment has been started. Please try loading the catalog again.</p>
      <button className="button button-dark" type="button" onClick={() => reset()}>
        Try again
      </button>
    </main>
  );
}
