import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function LoginPage() {
  const { isAuthenticated, login, authNotice, clearAuthNotice } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = typeof location.state === 'object' && location.state && 'from' in location.state && typeof location.state.from === 'string'
    ? location.state.from
    : '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      clearAuthNotice();
    };
  }, []);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setSubmitting(true);
      setError(null);
      await login({ email, password });
      navigate(redirectTo, { replace: true });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-slate-100">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/80 p-8 shadow-2xl shadow-slate-950/40">
        <p className="text-sm uppercase tracking-[0.28em] text-emerald-300/80">Member Access</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">Login</h1>
        <p className="mt-3 text-sm text-slate-400">Sign in to access your private journal, trades, and analytics.</p>

        <div className="mt-4 rounded-2xl border border-sky-400/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
          <p className="font-medium text-white">Demo Access</p>
          <p className="mt-1 text-sky-100/90">Use <span className="font-mono">demo@example.com</span> / <span className="font-mono">DemoPass123!</span> when running the local memory database mode.</p>
        </div>

        {authNotice ? (
          <div className="mt-4 rounded-2xl border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            <div className="flex items-start justify-between gap-3">
              <span>{authNotice}</span>
              <button type="button" onClick={clearAuthNotice} className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[11px] font-medium text-amber-50 transition hover:bg-white/10">
                Dismiss
              </button>
            </div>
          </div>
        ) : null}

        {error ? <div className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-2 text-sm text-slate-300">
            <span>Email</span>
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-emerald-300/40" />
          </label>
          <label className="block space-y-2 text-sm text-slate-300">
            <span>Password</span>
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-emerald-300/40" />
          </label>
          <button type="submit" disabled={submitting} className="w-full rounded-full bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300">
            {submitting ? 'Signing In...' : 'Login'}
          </button>
        </form>

        <p className="mt-6 text-sm text-slate-400">
          Need an account? <Link to="/register" className="font-medium text-emerald-300 hover:text-emerald-200">Register</Link>
        </p>
      </div>
    </div>
  );
}
