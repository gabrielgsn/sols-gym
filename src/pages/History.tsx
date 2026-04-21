import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db, dbHelpers } from '../db/db';
import type { SetEntry } from '../db/schema';

function fmtDate(ts: number) {
  const d = new Date(ts);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function fmtDuration(start: number, end?: number) {
  if (!end) return '—';
  const min = Math.round((end - start) / 60000);
  if (min < 60) return `${min}min`;
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
}

export function History() {
  const sessions = useLiveQuery(
    () => db.sessions.orderBy('startedAt').reverse().filter((s) => !s.deletedAt).toArray(),
    [],
  );
  const allSets = useLiveQuery(
    () => db.sets.filter((s) => !s.deletedAt).toArray(),
    [],
  );

  const setsBySession = new Map<string, SetEntry[]>();
  for (const s of allSets ?? []) {
    const arr = setsBySession.get(s.sessionId) ?? [];
    arr.push(s);
    setsBySession.set(s.sessionId, arr);
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Histórico</h1>
      <ul className="flex flex-col gap-2">
        {sessions?.map((s) => {
          const setList = setsBySession.get(s.id) ?? [];
          const volume = setList.reduce((acc, x) => acc + x.weight * x.reps, 0);
          const exCount = new Set(setList.map((x) => x.exerciseId)).size;
          return (
            <li key={s.id} className="card flex items-center gap-2">
              <Link to={`/workout/${s.id}`} className="flex-1 min-w-0">
                <div className="font-semibold truncate">{s.name}</div>
                <div className="text-xs text-slate-400">
                  {fmtDate(s.startedAt)} · {fmtDuration(s.startedAt, s.finishedAt)}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {exCount} exerc. · {setList.length} séries · vol {Math.round(volume)}kg
                  {!s.finishedAt && <span className="ml-2 text-amber-400">● em andamento</span>}
                </div>
              </Link>
              <button
                className="btn-danger text-sm"
                onClick={() => {
                  if (confirm('Apagar sessão?')) dbHelpers.deleteSession(s.id);
                }}
              >✕</button>
            </li>
          );
        })}
        {sessions && sessions.length === 0 && (
          <li className="text-slate-500 text-center py-8 text-sm">
            Nenhum treino registrado ainda.
          </li>
        )}
      </ul>
    </div>
  );
}
