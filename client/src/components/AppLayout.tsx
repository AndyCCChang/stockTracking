import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const navigation = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/trades', label: 'Trades' },
  { to: '/positions', label: 'Positions' },
  { to: '/realized-pnl', label: 'Realized PnL' },
  { to: '/yearly-performance', label: 'Yearly Performance' },
  { to: '/performance', label: 'Performance' }
];

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="app-shell min-h-screen bg-transparent text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-[1480px] flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="surface mb-5 rounded-2xl px-5 py-4 backdrop-blur-md">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-emerald-300/90">US Equity Journal</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Stock Tracking Workspace</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                Your journal is private to your account. Trades, positions, allocations, and analytics are all scoped to the signed-in member.
              </p>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-100 lg:min-w-72">
              <div className="min-w-0">
                <div className="truncate font-medium text-white">{user?.name || user?.email}</div>
                <div className="mt-0.5 truncate text-xs text-emerald-100/75">{user?.email}</div>
              </div>
              <button type="button" onClick={handleLogout} className="shrink-0 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-white transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-300/30">
                Logout
              </button>
            </div>
          </div>
        </header>

        <div className="grid flex-1 gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
          <aside className="surface h-fit rounded-2xl p-3 backdrop-blur-md lg:sticky lg:top-4">
            <nav className="flex gap-2 overflow-x-auto pb-1 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
              {navigation.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    [
                      'flex min-w-max items-center rounded-xl px-3 py-2.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-emerald-300/25 lg:min-w-0',
                      isActive
                        ? 'bg-emerald-300 text-slate-950 shadow-lg shadow-emerald-500/20'
                        : 'text-slate-300 hover:bg-white/[0.07] hover:text-white'
                    ].join(' ')
                  }
                >
                  <span className="truncate">{item.label}</span>
                </NavLink>
              ))}
            </nav>
          </aside>

          <main className="min-w-0 pb-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
