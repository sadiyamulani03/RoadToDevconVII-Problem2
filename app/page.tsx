"use client";

import { useState } from "react";
import type { FinalAnswer } from "../src/types/matching";

export default function Home() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<FinalAnswer | null>(null);
  const [loading, setLoading] = useState(false);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    if (query.trim().length === 0 || loading) return;
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      setResult((await response.json()) as FinalAnswer);
    } catch {
      setResult({
        status: "error",
        query,
        message: "The request failed. Is the server running?",
        matches: [],
        candidatesConsidered: [],
        rejectedNames: [],
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container">
      <h1>Who In Here Can Help Me?</h1>
      <p className="subtitle">
        ENS community people-finder on Sepolia. Every returned person is checked
        against candidates retrieved from live ENS text records — the model can
        explain a match, but it can never invent a member.
      </p>
      <form onSubmit={search}>
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Who can mentor me in Rust this month?"
        />
        <button type="submit" disabled={loading}>
          {loading ? "Searching…" : "Ask"}
        </button>
      </form>

      {result && (
        <section className="result">
          <p className={`status status-${result.status}`}>{result.message}</p>
          {result.rejectedNames.length > 0 && (
            <p className="rejected">
              Rejected hallucinated name(s): {result.rejectedNames.join(", ")}
            </p>
          )}
          {result.matches.map((match) => (
            <article key={match.ensName} className="match">
              <h2>{match.ensName}</h2>
              <p className="meta">
                {[match.role, ...match.skills].filter(Boolean).join(" | ")}
              </p>
              {match.availability && (
                <p className="meta">Availability: {match.availability}</p>
              )}
              <p>Why: {match.reason}</p>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
