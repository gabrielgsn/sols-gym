import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams } from 'react-router-dom';
import { db, dbHelpers } from '../db/db';
import { SetLogger } from '../components/SetLogger';
import { useEffect, useMemo, useState } from 'react';
import { ExercisePicker } from '../components/ExercisePicker';

function useElapsed(startedAt?: number, finishedAt?: number) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (finishedAt) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [finishedAt]);
  if (!startedAt) return '';
  const end = finishedAt ?? Date.now();
  const s = Math.max(0, Math.floor((end - startedAt) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
}

export function ActiveWorkout() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const session = useLiveQuery(() => (id ? db.sessions.get(id) : undefined), [id]);
  const template = useLiveQuery(
    () => (session?.templateId ? db.templates.get(session.templateId) : undefined),
    [session?.templateId],
  );
  const exercises = useLiveQuery(() => db.exercises.toArray(), []);
  const setsInSession = useLiveQuery(
    () => (id ? db.sets.where('sessionId').equals(id).toArray() : []),
    [id],
  );

  const elapsed = useElapsed(session?.startedAt, session?.finishedAt);
  const [adhocExerciseIds, setAdhocExerciseIds] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);

  const exerciseIds = useMemo(() => {
    const base = template?.exerciseIds ?? [];
    const extra = adhocExerciseIds.filter((x) => !base.includes(x));
    const usedFromSets = Array.from(new Set((setsInSession ?? []).map((s) => s.exerciseId)));
    const combined = [...base, ...extra];
    for (const u of usedFromSets) if (!combined.includes(u)) combined.push(u);
    return combined;
  }, [template, adhocExerciseIds, setsInSession]);

  const exMap = new Map((exercises ?? []).map((e) => [e.id, e]));

  if (!session) {
    return <p className="text-slate-500">Sessão não encontrada.</p>;
  }

  async function finish() {
    if (!id) return;
    if (session?.finishedAt) return;
    if (!confirm('Finalizar treino?')) return;
    await dbHelpers.finishSession(id);
    nav('/history');
  }

  async function discard() {
    if (!id) return;
    if (!confirm('Descartar este treino? Todas as séries serão apagadas.')) return;
    await dbHelpers.deleteSession(id);
    nav('/');
  }

  const totalSets = setsInSession?.length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">{session.name}</h1>
          <div className="text-xs text-slate-400">
            {session.finishedAt ? 'Finalizado' : 'Em andamento'} · {elapsed} · {totalSets} série{totalSets === 1 ? '' : 's'}
          </div>
        </div>
        {!session.finishedAt && (
          <button className="btn-primary" onClick={finish}>Finalizar</button>
        )}
      </header>

      <ul className="flex flex-col gap-3">
        {exerciseIds.map((exId) => {
          const ex = exMap.get(exId);
          if (!ex) return null;
          return (
            <li key={exId}>
              <SetLogger sessionId={session.id} exercise={ex} />
            </li>
          );
        })}
      </ul>

      {!session.finishedAt && (
        <div className="flex flex-col gap-2">
          <button className="btn-ghost" onClick={() => setPicking(true)}>
            + Adicionar exercício à sessão
          </button>
          <button className="btn-danger text-sm self-start" onClick={discard}>
            Descartar treino
          </button>
        </div>
      )}

      {picking && (
        <ExercisePicker
          selectedIds={exerciseIds}
          onToggle={(exId) => {
            if (exerciseIds.includes(exId)) return;
            setAdhocExerciseIds((prev) => [...prev, exId]);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}
