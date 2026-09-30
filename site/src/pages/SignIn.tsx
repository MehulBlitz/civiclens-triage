import { Link } from "react-router-dom";

const SERVER_URL = import.meta.env.VITE_APP_URL ?? "";

export default function SignIn() {
  return <div className="mx-auto max-w-xl px-4 py-20"><section className="well p-8"><p className="label">Secure access</p><h1 className="font-display mt-3 text-3xl font-semibold text-tide-950">Sign in to CivicLens</h1><p className="mt-3 text-sm leading-6 text-tide-600">Citizen reporting remains open without an account. Secure OAuth access is available when the server-backed operations URL is configured for this deployment.</p>{SERVER_URL ? <a href={`${SERVER_URL}/login`} className="mt-7 inline-flex min-h-touch items-center rounded-xl bg-tide-950 px-5 py-3 text-sm font-semibold text-white">Continue to secure sign-in</a> : <p className="mt-7 rounded-xl border border-saffron-200 bg-saffron-50 px-4 py-3 text-sm text-saffron-800">Secure sign-in is not configured for this static deployment. Use the public citizen tools or configure VITE_APP_URL with the operations server.</p>}<Link to="/" className="mt-5 block text-sm font-semibold text-saffron-700 hover:underline">Return to citizen home</Link></section></div>;
}