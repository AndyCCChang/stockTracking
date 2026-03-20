import { Link, NavLink, Outlet } from 'react-router-dom';

const navItems = [
  ['/', 'Dashboard'],
  ['/positions', 'Positions'],
  ['/realized', 'Realized P&L'],
  ['/yearly', 'Yearly Performance'],
  ['/metrics', 'Metrics']
];

export function Layout({ darkMode, onToggleDarkMode }: { darkMode: boolean; onToggleDarkMode: () => void }) {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="border-b border-slate-200 bg-white/90 dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/" className="text-xl font-semibold">Stock Journal</Link>
          <div className="flex items-center gap-4">
            <nav className="flex flex-wrap gap-3 text-sm">
              {navItems.map(([to, label]) => (
                <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'font-semibold text-emerald-500' : 'text-slate-500 dark:text-slate-300'}>
                  {label}
                </NavLink>
              ))}
            </nav>
            <button onClick={onToggleDarkMode} className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700">
              {darkMode ? 'Light' : 'Dark'} mode
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}
