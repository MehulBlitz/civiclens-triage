import Link from "next/link";

export const dynamic = "force-static";

/**
 * Mobile boot shell — exported statically into the Capacitor WebView.
 * The native shell shows this instantly (works offline), then hands off to
 * the deployed dashboard. Keep it dependency-light and static.
 */
export default function MobileBootPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-civic-950 px-6 text-center text-white">
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-amber-400 text-civic-950 shadow-xl">
        <svg viewBox="0 0 24 24" className="h-11 w-11" fill="currentColor">
          <path d="M12 2 3 7v6c0 5 3.8 8.4 9 9 5.2-.6 9-4 9-9V7l-9-5Zm0 4.2a3 3 0 1 1 0 6 3 3 0 0 1 0-6Zm0 12.2c-2 0-3.8-1-5-2.6.1-1.6 3.3-2.5 5-2.5s4.9.9 5 2.5c-1.2 1.6-3 2.6-5 2.6Z" />
        </svg>
      </div>
      <h1 className="mt-6 text-3xl font-black tracking-tight">CivicLens</h1>
      <p className="mt-2 text-sm font-semibold uppercase tracking-[0.2em] text-amber-300">
        Smarter Cities · Happier Citizens
      </p>
      <p className="mt-6 max-w-xs text-sm leading-relaxed text-civic-200">
        AI-powered civic complaint triage — classify, prioritize and route
        city incidents onto a live map.
      </p>
      <a
        href="/"
        className="btn-tactile btn-tactile-amber mt-10 rounded-xl px-8 py-3 text-base"
      >
        Open the dashboard
      </a>
      <p className="mt-6 text-[11px] text-civic-300">
        v1.0 · ML triage + neural risk engine + digital twin
      </p>
    </main>
  );
}
