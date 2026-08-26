import { useState } from "react";
import { ArrowRight, Check, Cpu, Lock, Mail, Sparkles, Users, Zap } from "lucide-react";
import { cn } from "@/utils/cn";
import { login, register, saveAuth, verifyEmail, type AuthUser } from "@/lib/auth";

const tiers = [
  { name: "Free", price: "$0", detail: "Start building", bullets: ["5 agent instances", "5 requests/hour", "100 requests/week", "1,000 requests/month"] },
  { name: "Pro", price: "$19", detail: "Serious projects", bullets: ["20 agent instances", "120 requests/hour", "2,500 requests/week", "25,000 requests/month"] },
  { name: "Team", price: "$49", detail: "Small teams", bullets: ["60 agent instances", "500 requests/hour", "10,000 requests/week", "100,000 requests/month"] },
];

export default function LandingAuth({ onAuthed }: { onAuthed: (user: AuthUser) => void }) {
  const [mode, setMode] = useState<"landing" | "login" | "register" | "verify">("landing");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const submit = async () => {
    setBusy(true);
    setMsg("");
    try {
      if (mode === "login") {
        const { user } = await login(email, password);
        saveAuth(user);
        onAuthed(user);
      } else if (mode === "register") {
        const res = await register(email, password);
        setMsg(res.message);
        setMode("verify");
      } else if (mode === "verify") {
        const { user } = await verifyEmail(email, code);
        saveAuth(user);
        onAuthed(user);
      }
    } catch (e: any) {
      setMsg(e.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-full overflow-y-auto bg-[#08090d] text-white">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-[-20rem] h-[44rem] w-[44rem] -translate-x-1/2 rounded-full bg-indigo-600/25 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[32rem] w-[32rem] rounded-full bg-emerald-500/10 blur-3xl" />
      </div>
      <div className="relative mx-auto flex min-h-full max-w-7xl flex-col px-6 py-6">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-black font-black">S</div><span className="text-lg font-semibold">Seeker Code</span></div>
          <div className="flex items-center gap-2">
            <button onClick={() => setMode("login")} className="rounded-full px-4 py-2 text-sm text-slate-300 hover:bg-white/10">Log in</button>
            <button onClick={() => setMode("register")} className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-slate-100">Start free</button>
          </div>
        </header>

        {mode === "landing" ? (
          <main className="grid flex-1 items-center gap-10 py-16 lg:grid-cols-[1.05fr_.95fr]">
            <section>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-indigo-200"><Sparkles size={15} /> Nemotron-powered local-first AI IDE</div>
              <h1 className="max-w-4xl text-5xl font-black tracking-[-0.06em] text-white md:text-7xl">Ship with a synced swarm of precise coding agents.</h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">Seeker Code gives every verified user a managed API key, a free tier, local workspace memory through <code className="rounded bg-white/10 px-1.5 py-0.5">.seekconfig</code>, and up to 60 synchronized agents on paid plans.</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <button onClick={() => setMode("register")} className="group flex items-center gap-2 rounded-full bg-indigo-500 px-6 py-3 font-semibold text-white shadow-2xl shadow-indigo-500/30 hover:bg-indigo-400">Create account <ArrowRight size={17} className="transition group-hover:translate-x-0.5" /></button>
                <button onClick={() => setMode("login")} className="rounded-full border border-white/10 bg-white/5 px-6 py-3 font-semibold text-slate-200 hover:bg-white/10">I already have access</button>
              </div>
              <div className="mt-10 grid gap-3 sm:grid-cols-3">
                {[{ icon: Cpu, label: "Nemotron models" }, { icon: Users, label: "Parallel agents" }, { icon: Lock, label: "Managed limits" }].map((f) => <div key={f.label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><f.icon className="mb-3 text-indigo-300" size={22} /><div className="font-semibold">{f.label}</div></div>)}
              </div>
            </section>
            <section className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 shadow-2xl backdrop-blur-xl">
              <div className="rounded-[1.5rem] bg-[#0d0e12] p-5">
                <div className="mb-5 flex items-center justify-between"><span className="text-sm text-slate-400">Live team plan</span><span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs text-emerald-200">synced</span></div>
                {['Pro maps the task and avoids conflicts','Perplex implements exact feature slices','Flash patches edge cases and polish'].map((x, i) => <div key={x} className="mb-3 flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/20 text-sm font-bold">{i + 1}</div><span className="text-sm text-slate-200">{x}</span></div>)}
                <div className="mt-5 rounded-2xl border border-indigo-500/20 bg-indigo-500/10 p-4 font-mono text-xs leading-6 text-indigo-100">{`free.instances = 5\npro.instances = 20\nteam.instances = 60\nlimits = hourly + weekly + monthly`}</div>
              </div>
            </section>
            <section className="lg:col-span-2 grid gap-4 md:grid-cols-3">
              {tiers.map((t, i) => <div key={t.name} className={cn("rounded-3xl border p-6", i === 1 ? "border-indigo-400 bg-indigo-500/10" : "border-white/10 bg-white/[0.04]")}><div className="text-sm text-slate-400">{t.detail}</div><div className="mt-2 flex items-end gap-1"><span className="text-4xl font-black">{t.price}</span><span className="mb-1 text-slate-400">/mo</span></div><div className="mt-2 text-xl font-bold">{t.name}</div><div className="mt-5 space-y-2">{t.bullets.map((b) => <div key={b} className="flex gap-2 text-sm text-slate-300"><Check size={16} className="text-emerald-300" />{b}</div>)}</div></div>)}
            </section>
          </main>
        ) : (
          <main className="mx-auto flex w-full max-w-md flex-1 items-center py-14">
            <div className="w-full rounded-[2rem] border border-white/10 bg-white/[0.06] p-6 shadow-2xl backdrop-blur-xl">
              <div className="mb-6 flex items-center gap-3"><div className="rounded-2xl bg-indigo-500/20 p-3 text-indigo-200">{mode === "verify" ? <Mail /> : mode === "login" ? <Lock /> : <Zap />}</div><div><h2 className="text-2xl font-bold">{mode === "login" ? "Welcome back" : mode === "verify" ? "Verify your email" : "Create your account"}</h2><p className="text-sm text-slate-400">{mode === "verify" ? "Enter the SES code sent to your inbox." : "Your API key is managed automatically."}</p></div></div>
              <div className="space-y-3">
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="w-full rounded-2xl border border-white/10 bg-[#0d0e12] px-4 py-3 text-sm outline-none focus:border-indigo-400" />
                {mode !== "verify" && <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className="w-full rounded-2xl border border-white/10 bg-[#0d0e12] px-4 py-3 text-sm outline-none focus:border-indigo-400" />}
                {mode === "verify" && <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="6-digit code" className="w-full rounded-2xl border border-white/10 bg-[#0d0e12] px-4 py-3 text-sm outline-none focus:border-indigo-400" />}
                {msg && <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">{msg}</div>}
                <button disabled={busy || !email || (mode !== "verify" && !password) || (mode === "verify" && !code)} onClick={submit} className="w-full rounded-2xl bg-white px-4 py-3 font-semibold text-black disabled:opacity-40">{busy ? "Working…" : mode === "login" ? "Log in" : mode === "verify" ? "Verify and enter" : "Register free"}</button>
              </div>
              <div className="mt-5 text-center text-sm text-slate-400">{mode === "login" ? "Need an account?" : "Already verified?"} <button onClick={() => setMode(mode === "login" ? "register" : "login")} className="text-indigo-300 hover:text-indigo-200">{mode === "login" ? "Register" : "Log in"}</button></div>
              <button onClick={() => setMode("landing")} className="mt-3 w-full text-center text-xs text-slate-500 hover:text-slate-300">Back to landing</button>
            </div>
          </main>
        )}
      </div>
    </div>
  );
}
