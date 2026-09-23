import type { Metadata } from "next";
import "leaflet/dist/leaflet.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "CivicLens · AI Complaint Triage",
  description:
    "AI-powered civic complaint triage — classify, prioritize and route complaints from raw text and images onto a live city map. Smarter Cities, Happier Citizens."
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
