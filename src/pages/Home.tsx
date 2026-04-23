import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { AsciiBanner } from '../components/AsciiBanner';
import { db, dbHelpers } from '../db/db';

export function Home() {
  const nav = useNavigate();
  const templates = useLiveQuery(
    () => db.templates.orderBy('updatedAt').reverse().filter((t) => !t.deletedAt).toArray(),
    [],
  );
  const active = useLiveQuery(
    () =>
      db.sessions
        .filter((s) => !s.finishedAt && !s.deletedAt)
        .reverse()
        .sortBy('startedAt')
        .then((arr) => arr[0]),
    [],
  );

  async function startFromTemplate(id: string, name: string) {
    const s = await dbHelpers.startSession(name, id);
    nav(`/workout/${s.id}`);
  }

  async function startAdHoc() {
    const name = prompt('Nome do treino?', 'Treino livre');
    if (!name) return;
    const s = await dbHelpers.startSession(name);
    nav(`/workout/${s.id}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col items-center gap-1">
        <AsciiBanner />
        <p className="text-sm text-slate-400">Bora treinar?</p>
      </header>

      {active && (
        <button
          className="card text-left hover:ring-2 hover:ring-accent"
          onClick={() => nav(`/workout/${active.id}`)}
        >
          <div className="text-xs uppercase tracking-wide text-amber-400">● Treino em andamento</div>
          <div className="font-semibold text-lg mt-1">{active.name}</div>
          <div className="text-xs text-slate-400">Toque para continuar</div>
        </button>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Iniciar rotina</h2>
        {templates?.length === 0 && (
          <p className="text-sm text-slate-500">
            Nenhuma rotina. Crie uma na aba Rotinas.
          </p>
        )}
        <ul className="grid grid-cols-2 gap-2">
          {templates?.map((t) => (
            <li key={t.id}>
              <button
                className="card w-full h-full text-left active:scale-95 transition"
                onClick={() => startFromTemplate(t.id, t.name)}
              >
                <div className="font-semibold">{t.name}</div>
                <div className="text-xs text-slate-400">
                  {t.exerciseIds.length} exerc.
                </div>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <button className="btn-ghost" onClick={startAdHoc}>
        + Treino livre (sem rotina)
      </button>
    </div>
  );
}
