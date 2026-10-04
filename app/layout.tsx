import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Who In Here Can Help Me?",
  description:
    "ENS community people-finder for RoadToDevcon VII Problem 2. Live Sepolia ENS text records, bounded retrieval, schema-validated LLM answers with a candidate membership guard.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
