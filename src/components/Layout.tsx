import { NavLink, Outlet } from 'react-router-dom';

const tabs = [
  { to: '/', label: 'Início', icon: '🏠' },
  { to: '/templates', label: 'Rotinas', icon: '📋' },
  { to: '/exercises', label: 'Exerc.', icon: '🏋️' },
  { to: '/progress', label: 'Progresso', icon: '📈' },
  { to: '/history', label: 'Histórico', icon: '📚' },
  { to: '/settings', label: 'Config', icon: '⚙️' },
];

export function Layout() {
  return (
    <div className="flex flex-col min-h-full">
      <main
        className="flex-1 px-4 max-w-xl w-full mx-auto"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top) + 1rem)',
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 6rem)',
        }}
      >
        <Outlet />
      </main>
      <nav
        className="fixed bottom-0 inset-x-0 bg-slate-900/95 backdrop-blur border-t border-slate-800"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <ul className="grid grid-cols-6 max-w-xl mx-auto">
          {tabs.map((t) => (
            <li key={t.to}>
              <NavLink
                to={t.to}
                end={t.to === '/'}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
                    isActive ? 'text-accent' : 'text-slate-400'
                  }`
                }
              >
                <span aria-hidden className="text-xl">{t.icon}</span>
                <span>{t.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
