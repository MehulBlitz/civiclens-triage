import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const SERVER_URL = import.meta.env.VITE_APP_URL ?? "";

export default function SignIn() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    setSignedIn(Boolean(localStorage.getItem("civiclens_citizen_session_v1")));
  }, []);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || !email.includes("@")) return;
    localStorage.setItem("civiclens_citizen_session_v1", JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase() }));
    setSignedIn(true);
  }

  return <div className="mx-auto max-w-xl px-4 py-20"><section className="well p-8"><p className="label">Citizen access</p><h1 className="font-display mt-3 text-3xl font-semibold text-tide-950">Sign in to CivicLens</h1><p className="mt-3 text-sm leading-6 text-tide-600">Use a lightweight citizen profile to keep your reports and karma connected on this device. OAuth administrator access remains available through the server deployment.</p>{signedIn ? <div className="mt-7 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800"><strong>You are signed in on this device.</strong><button type="button" onClick={() => { localStorage.removeItem("civiclens_citizen_session_v1"); setSignedIn(false); }} className="mt-3 block font-semibold underline">Sign out</button></div> : <form onSubmit={submit} className="mt-7 space-y-3"><label className="label">Name<input required value={name} onChange={(event) => setName(event.target.value)} className="mt-1 min-h-touch w-full rounded-lg border border-tide-300 bg-white px-3 text-sm font-normal normal-case tracking-normal text-tide-950" /></label><label className="label">Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 min-h-touch w-full rounded-lg border border-tide-300 bg-white px-3 text-sm font-normal normal-case tracking-normal text-tide-950" /></label><button className="min-h-touch w-full rounded-xl bg-tide-950 px-5 py-3 text-sm font-semibold text-white">Continue as citizen</button></form>}{SERVER_URL && <a href={`${SERVER_URL}/login`} className="mt-5 inline-flex text-sm font-semibold text-saffron-700 hover:underline">Administrator sign-in →</a>}<Link to="/" className="mt-5 block text-sm font-semibold text-saffron-700 hover:underline">Return to citizen home</Link></section></div>;
}