import { NavLink, Outlet } from 'react-router-dom';

const navigation = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/trades', label: 'Trades' },
  { to: '/positions', label: 'Positions' },
  { to: '/realized-pnl', label: 'Realized PnL' },
  { to: '/yearly-performance', label: 'Yearly Performance' },
  { to: '/performance', label: 'Performance' }
];

export function AppLayout() {
  return (
    <div className="min-h-screen bg-transparent text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-2xl shadow-slate-950/30 backdrop-blur">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-emerald-300/80">US Equity Journal</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">Stock Tracking Workspace</h1>
              <p className="mt-3 max-w-2xl text-sm text-slate-300">
                Phase 1 foundation for trade records, position monitoring, and profit analysis.
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
              Frontend skeleton ready. Backend health check and SQLite connection included.
            </div>
          </div>
        </header>

        <div className="grid flex-1 gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="rounded-3xl border border-white/10 bg-slate-950/60 p-4 backdrop-blur">
            <nav className="space-y-2">
              {navigation.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    [
                      'block rounded-2xl px-4 py-3 text-sm font-medium transition',
                      isActive
                        ? 'bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20'
                        : 'text-slate-300 hover:bg-white/5 hover:text-white'
                    ].join(' ')
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </aside>

          <main className="rounded-3xl border border-white/10 bg-slate-950/50 p-6 backdrop-blur">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
