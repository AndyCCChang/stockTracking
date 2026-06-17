import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function RegisterPage() {
  const { isAuthenticated, register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setSubmitting(true);
      setError(null);
      await register({ name, email, password });
      navigate('/', { replace: true });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Register failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="app-shell flex min-h-screen items-center justify-center px-4 py-10 text-slate-100">
      <div className="surface w-full max-w-md rounded-2xl p-7 backdrop-blur-md">
        <p className="text-xs font-semibold uppercase text-emerald-300/90">Member Access</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Register</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">Create a private workspace so your trades and analytics stay isolated to your account.</p>

        {error ? <div className="mt-4 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-2 text-sm text-slate-300">
            <span>Name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} type="text" autoComplete="name" className="field-control w-full rounded-xl px-4 py-3 text-white outline-none transition" />
          </label>
          <label className="block space-y-2 text-sm text-slate-300">
            <span>Email</span>
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" className="field-control w-full rounded-xl px-4 py-3 text-white outline-none transition" />
          </label>
          <label className="block space-y-2 text-sm text-slate-300">
            <span>Password</span>
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="new-password" className="field-control w-full rounded-xl px-4 py-3 text-white outline-none transition" />
          </label>
          <button type="submit" disabled={submitting} className="w-full rounded-xl bg-emerald-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200 focus:outline-none focus:ring-2 focus:ring-emerald-300/40 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300">
            {submitting ? 'Creating Account...' : 'Register'}
          </button>
        </form>

        <p className="mt-6 text-sm text-slate-400">
          Already have an account? <Link to="/login" className="font-medium text-emerald-300 hover:text-emerald-200">Login</Link>
        </p>
      </div>
    </div>
  );
}
