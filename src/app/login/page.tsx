import Link from "next/link";

export const dynamic = "force-dynamic";

export default function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-civic-950 px-4 py-12 text-white">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white p-8 text-ink-900 shadow-2xl">
        <Link href="/" className="text-xs font-bold uppercase tracking-[0.18em] text-civic-700">CivicLens</Link>
        <h1 className="mt-8 text-3xl font-black tracking-tight">Sign in to CivicLens</h1>
        <p className="mt-3 text-sm leading-6 text-ink-500">
          Citizens can report and track issues. Approved administrators can manage neutral ward coverage and the full triage lifecycle.
        </p>
        {searchParams.error && (
          <p className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">Sign-in failed: {searchParams.error}</p>
        )}
        {process.env.LOCAL_ADMIN_MODE === "true" ? (
          <Link href="/admin" className="mt-8 flex min-h-touch items-center justify-center rounded-xl bg-civic-950 px-4 py-3 text-sm font-bold text-white transition hover:bg-civic-800">
            Continue as local administrator
          </Link>
        ) : <a href="/api/auth/google" className="mt-8 flex min-h-touch items-center justify-center gap-3 rounded-xl bg-civic-950 px-4 py-3 text-sm font-bold text-white transition hover:bg-civic-800">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-white text-sm font-black text-civic-950">G</span>
          Continue with Google
        </a>}
        <Link href="/" className="mt-6 block text-center text-xs font-semibold text-civic-700 hover:underline">Return to dashboard</Link>
      </section>
    </main>
  );
}