
import { motion } from 'motion/react';
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Lock, Mail, Database, ArrowRight, CheckCircle2, AlertCircle,
  Eye, EyeOff, ShoppingCart, TrendingUp, Boxes, Zap,
  BarChart3, PackageCheck, Sparkles, Globe2, Package, ArrowUpRight
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { apiFetch } from '../lib/api.ts';
import { SeedExecutionResponse } from '../types/index.ts';

export function LoginPage() {
  const { login } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [seedEmpty, setSeedEmpty] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedFeedback, setSeedFeedback] = useState<{
    type: 'success' | 'error';
    title: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    apiFetch<{ isEmpty: boolean }>('/api/seed/status')
      .then((res) => setSeedEmpty(res.isEmpty))
      .catch(() => {});
  }, []);

  const handleBootstrapSeed = async () => {
    setSeeding(true);
    setSeedFeedback(null);

    try {
      const res = await apiFetch<SeedExecutionResponse>(
        '/api/seed/bootstrap',
        { method: 'POST' }
      );

      if (!res.success) {
        const msg = res.message || res.error || 'Database seed skipped or failed.';
        setSeedFeedback({
          type: 'error',
          title: 'Seed did not run',
          message: msg,
        });
        addToast({ type: 'error', title: 'Seed did not run', message: msg });
        return;
      }

      setSeedEmpty(false);
      setEmail('admin@optistock.in');
      setPassword('Admin@123');

      const countText =
        typeof res.totalInserted === 'number'
          ? `${res.totalInserted.toLocaleString('en-IN')} records inserted`
          : 'Demo dataset initialized';

      const detailMessage =
        res.message ||
        `${countText} into MongoDB Atlas${res.databaseName ? ` (${res.databaseName})` : ''}.`;

      setSeedFeedback({
        type: 'success',
        title: `MongoDB Seed Complete — ${countText}`,
        message: detailMessage,
      });

      addToast({
        type: 'success',
        title: `Seed complete (${countText})`,
        message: detailMessage,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to seed database.';

      setSeedFeedback({
        type: 'error',
        title: 'MongoDB Seed Failed',
        message: msg,
      });

      addToast({
        type: 'error',
        title: 'Seed failed',
        message: msg,
      });
    } finally {
      setSeeding(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      await login(email, password);
      addToast({ type: 'success', title: 'Signed in successfully' });
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#f5f8ff] lg:grid lg:grid-cols-[1.08fr_0.92fr]">

      {/* Background decoration */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-[28%] h-[34rem] w-[34rem] rounded-full bg-blue-200/40 blur-3xl" />
        <div className="absolute -bottom-48 right-[-8rem] h-[34rem] w-[34rem] rounded-full bg-sky-200/50 blur-3xl" />
      </div>

      {/* LEFT HERO SECTION */}
      <motion.aside
        initial={{ opacity: 0, x: -24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.55 }}
        className="relative hidden min-h-screen overflow-hidden px-10 py-9 text-white lg:flex lg:flex-col lg:justify-between xl:px-14"
        style={{
          background: 'linear-gradient(140deg,#eff6ff 0%,#dbeafe 44%,#93c5fd 100%)'
        }}
      >
        <div
          className="absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              'radial-gradient(circle at 72% 36%,rgba(37,99,235,.22),transparent 34%),radial-gradient(circle at 10% 90%,rgba(30,64,175,.22),transparent 34%)'
          }}
        />

        <div className="absolute -bottom-24 -left-20 h-80 w-[130%] rotate-[-8deg] rounded-[50%] bg-gradient-to-r from-blue-950 via-blue-800 to-blue-600 shadow-[0_-18px_60px_rgba(37,99,235,.18)]" />

        <div className="absolute -bottom-36 -left-16 h-72 w-[130%] rotate-[-8deg] rounded-[50%] border-t border-blue-200/40 bg-blue-950/70" />

        {/* Brand */}
        <div className="relative z-10 flex items-center gap-3 text-blue-950">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-lg">
            <ShoppingCart className="h-7 w-7 text-blue-700" />
          </div>

          <div>
            <div className="text-xl font-extrabold tracking-tight">
              OptiStock Retail
            </div>
            <div className="text-xs font-medium text-blue-800/80">
              Demand &amp; Supply Intelligence
            </div>
            <div className="mt-1 max-w-[290px] text-[10px] leading-4 text-blue-900/65">
              Demand-Driven Inventory Optimization System for Retailers
            </div>
          </div>
        </div>

        {/* Hero content */}
        <div className="relative z-10 -mt-4 max-w-2xl">

          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/60 px-3 py-1.5 text-xs font-semibold text-blue-800 shadow-sm backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" />
            SMARTER RETAIL OPERATIONS
          </div>

          <h2 className="max-w-xl text-5xl font-black leading-[1.08] tracking-[-0.045em] text-slate-950 xl:text-6xl">
            Demand &amp; <span className="text-blue-600">Supply</span>
          </h2>

          <p className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">
            Smarter Insights.{' '}
            <span className="italic text-blue-600">
              Better Decisions.
            </span>
          </p>

          <p className="mt-5 max-w-lg text-base leading-7 text-slate-700">
            Analyze demand, manage supply, and optimize your inventory with
            real-time data and intelligent insights.
          </p>

          {/* Feature cards */}
          <div className="mt-7 flex flex-wrap gap-3">
            {[
              { icon: BarChart3, label: 'Real-Time Analytics' },
              { icon: Boxes, label: 'Smart Inventory' },
              { icon: Zap, label: 'Optimized Supply Chain' }
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/80 bg-white/65 px-3.5 py-3 text-xs font-semibold text-blue-950 shadow-sm backdrop-blur"
              >
                <Icon className="h-5 w-5 text-blue-600" />
                {label}
              </div>
            ))}
          </div>

          {/* Main illustration */}
          <div className="relative mt-7 h-60 max-w-[650px]">

            {/* Globe */}
            <div className="absolute left-[24%] top-0 h-56 w-56 rounded-full border border-blue-300/50 bg-[radial-gradient(circle_at_35%_30%,rgba(255,255,255,.95),rgba(96,165,250,.36)_48%,rgba(37,99,235,.12)_72%,transparent_73%)] shadow-[inset_-18px_-12px_35px_rgba(37,99,235,.16)]" />

            <div className="absolute left-[27%] top-5 h-48 w-48 rounded-full border border-dashed border-blue-400/40" />

            <Globe2
              className="absolute left-[32%] top-8 h-36 w-36 text-blue-500/35"
              strokeWidth={0.8}
            />

            {/* Demand bars */}
            <div className="absolute bottom-2 left-[37%] flex h-36 items-end gap-2">
              {[38, 56, 76, 98, 122, 145].map((height, i) => (
                <motion.div
                  key={height}
                  initial={{ height: 0 }}
                  animate={{ height }}
                  transition={{
                    delay: 0.25 + i * 0.07,
                    duration: 0.5
                  }}
                  className="w-6 rounded-t-md border border-white/70 bg-gradient-to-t from-blue-700 via-blue-500 to-sky-300 shadow-md"
                />
              ))}
            </div>

            {/* Stock status */}
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{
                duration: 3.1,
                repeat: Infinity,
                ease: 'easeInOut'
              }}
              className="absolute bottom-3 left-0 z-10 rounded-2xl border border-white/90 bg-white/90 p-3.5 text-slate-900 shadow-xl shadow-blue-900/10 backdrop-blur"
            >
              <div className="flex items-center gap-2 text-xs font-semibold">
                <PackageCheck className="h-4 w-4 text-emerald-500" />
                Stock Status
              </div>

              <div className="mt-2 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full border-[6px] border-emerald-400 text-[10px] font-bold">
                  92%
                </div>
                <span className="text-xs text-slate-600">
                  Healthy<br />inventory
                </span>
              </div>
            </motion.div>

            {/* Demand trend */}
            <motion.div
              animate={{ y: [0, 7, 0] }}
              transition={{
                duration: 3.5,
                repeat: Infinity,
                ease: 'easeInOut'
              }}
              className="absolute right-0 top-1 z-10 rounded-2xl border border-white/90 bg-white/90 p-3.5 text-slate-900 shadow-xl shadow-blue-900/10 backdrop-blur"
            >
              <div className="text-xs font-semibold">
                Demand Trend
              </div>

              <div className="mt-2 flex items-center gap-2 text-2xl font-bold text-emerald-600">
                <TrendingUp className="h-7 w-7" />
                +12.5%
              </div>

              <div className="text-[10px] text-slate-500">
                Illustrative insight card
              </div>
            </motion.div>

            {/* Shopping trolley */}
            <motion.div
              animate={{ y: [0, -3, 0] }}
              transition={{
                duration: 2.8,
                repeat: Infinity,
                ease: 'easeInOut'
              }}
              className="absolute bottom-1 left-[23%] z-20 flex h-20 w-28 items-center justify-center rounded-2xl border border-white/90 bg-white/75 text-blue-800 shadow-lg backdrop-blur"
            >
              <ShoppingCart className="h-12 w-12" strokeWidth={1.7} />
            </motion.div>

            {/* Inventory boxes */}
            <div className="absolute bottom-0 right-[19%] z-10 flex items-end gap-1.5">
              <div className="flex h-12 w-12 items-center justify-center rounded-md border border-amber-700/20 bg-gradient-to-br from-amber-200 to-orange-300 text-amber-900 shadow-md">
                <Package className="h-6 w-6" />
              </div>

              <div className="flex h-16 w-14 items-center justify-center rounded-md border border-amber-700/20 bg-gradient-to-br from-orange-200 to-amber-400 text-amber-950 shadow-md">
                <Package className="h-7 w-7" />
              </div>
            </div>

            <ArrowUpRight className="absolute right-[23%] top-[42%] h-12 w-12 text-cyan-500 drop-shadow-md" />
          </div>
        </div>

        <div className="relative z-10 pb-1 text-sm font-semibold italic tracking-wide text-blue-100">
          Optimize Today, Grow Tomorrow.
        </div>
      </motion.aside>

      {/* RIGHT LOGIN SECTION */}
      <section className="relative z-10 flex min-h-screen items-center justify-center overflow-y-auto px-4 py-6 sm:px-8 sm:py-8">

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="my-auto w-full max-w-[480px]"
        >

          {/* Mobile brand */}
          <div className="mb-7 flex items-center gap-3 lg:hidden">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg">
              <ShoppingCart className="h-6 w-6" />
            </div>

            <div>
              <h1 className="text-lg font-extrabold text-slate-950">
                OptiStock Retail
              </h1>
              <p className="text-xs text-slate-500">
                Demand &amp; Supply Intelligence
              </p>
            </div>
          </div>

          {/* Welcome heading */}
          <div className="mb-4 hidden text-center lg:block">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-600 to-blue-800 text-white shadow-xl shadow-blue-600/20">
              <ShoppingCart className="h-9 w-9" />
            </div>

            <h1 className="text-2xl font-extrabold tracking-tight text-slate-950">
              Welcome Back!
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Sign in to continue to OptiStock Retail
            </p>
          </div>

          {/* Login card */}
          <div className="rounded-[28px] border border-white/90 bg-white/90 p-5 shadow-[0_24px_70px_rgba(30,64,175,.13)] backdrop-blur-xl sm:p-7">

            <div className="mb-6">
              <h2 className="text-xl font-bold tracking-tight text-slate-950">
                Sign in to your workspace
              </h2>

              <p className="mt-1.5 text-sm leading-5 text-slate-500">
                Access your inventory, sales and demand intelligence workspace.
              </p>
            </div>

            {/* Seed feedback */}
            {seedFeedback && (
              <div
                className={`mb-4 flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-xs ${
                  seedFeedback.type === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                    : 'border-rose-200 bg-rose-50 text-rose-900'
                }`}
              >
                {seedFeedback.type === 'success'
                  ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}

                <div>
                  <p className="font-semibold">{seedFeedback.title}</p>
                  <p className="mt-0.5 leading-relaxed">{seedFeedback.message}</p>
                </div>
              </div>
            )}

            {/* Empty database notice */}
            {seedEmpty && (
              <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-3.5">
                <div className="flex items-start gap-2.5">
                  <Database className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />

                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-blue-900">
                      Connected database is empty
                    </p>

                    <p className="mt-0.5 text-xs leading-relaxed text-blue-800">
                      Initialize the Indian retail demo dataset or register a new Admin account.
                    </p>

                    <button
                      type="button"
                      onClick={handleBootstrapSeed}
                      disabled={seeding}
                      className="mt-2.5 rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-800"
                    >
                      {seeding ? 'Seeding MongoDB Atlas...' : 'Initialize Demo Dataset'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Login error */}
            {error && (
              <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-800">
                {error}
              </div>
            )}

            {/* Login form */}
            <form onSubmit={handleSubmit} className="space-y-4">

              <div>
                <label className="mb-2 block text-xs font-semibold text-slate-700">
                  Email Address
                </label>

                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />

                  <input
                    type="email"
                    required
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email address"
                    className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50/80 pl-12 pr-4 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold text-slate-700">
                  Password
                </label>

                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />

                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50/80 pl-12 pr-12 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                  />

                  <button
                    type="button"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-700"
                  >
                    {showPassword
                      ? <EyeOff className="h-5 w-5" />
                      : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs">
                <label className="flex cursor-pointer items-center gap-2 text-slate-600">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 accent-blue-600"
                  />
                  Remember me
                </label>

                <span
                  className="font-semibold text-slate-400"
                  title="Password reset is not configured"
                >
                  Forgot password?
                </span>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="group flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-blue-500 text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed"
              >
                {submitting ? 'Signing in...' : 'Sign In'}
                <ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" />
              </button>
            </form>

            {/* Demo accounts */}
            {!seedEmpty && (
              <div className="mt-6 border-t border-slate-100 pt-5">
                <p className="mb-3 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Demo accounts · click to autofill
                </p>

                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Admin', email: 'admin@optistock.in', pass: 'Admin@123' },
                    { label: 'Manager', email: 'manager@optistock.in', pass: 'Manager@123' },
                    { label: 'Staff', email: 'staff@optistock.in', pass: 'Staff@123' }
                  ].map((acc) => (
                    <button
                      key={acc.label}
                      type="button"
                      onClick={() => {
                        setEmail(acc.email);
                        setPassword(acc.pass);
                      }}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-2.5 text-xs font-semibold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                    >
                      {acc.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <p className="mt-6 text-center text-xs text-slate-500">
              Need a new account?{' '}
              <Link to="/register" className="font-bold text-blue-700 hover:underline">
                Create account
              </Link>
            </p>
          </div>

          <p className="mt-5 text-center text-[11px] text-slate-400">
            Secure role-based access · OptiStock Retail
          </p>
        </motion.div>
      </section>
    </div>
  );
}
