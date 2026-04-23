import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { db } from '../db/db';
import { MUSCLE_GROUP_LABELS, type Exercise } from '../db/schema';

type Props = {
  selectedIds: string[];
  onToggle: (id: string) => void;
  onClose: () => void;
};

export function ExercisePicker({ selectedIds, onToggle, onClose }: Props) {
  const exercises = useLiveQuery(
    () => db.exercises.orderBy('name').filter((e) => !e.deletedAt).toArray(),
    [],
  );
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    if (!exercises) return [];
    const term = q.trim().toLowerCase();
    if (!term) return exercises;
    return exercises.filter(
      (e: Exercise) =>
        e.name.toLowerCase().includes(term) ||
        e.muscleGroup.toLowerCase().includes(term) ||
        MUSCLE_GROUP_LABELS[e.muscleGroup].toLowerCase().includes(term),
    );
  }, [exercises, q]);

  return (
    <div className="fixed inset-0 bg-slate-950/90 backdrop-blur z-50 flex flex-col">
      <div
        className="px-4 pb-3 border-b border-slate-800 flex items-center gap-2"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
      >
        <input
          autoFocus
          className="input flex-1"
          placeholder="Buscar exercício..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn-ghost" onClick={onClose}>Fechar</button>
      </div>
      <div
        className="flex-1 overflow-y-auto px-4 py-2"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
      >
        {filtered.length === 0 && (
          <p className="text-slate-500 text-center py-8 text-sm">
            Nenhum exercício. Cadastre na aba Exerc.
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {filtered.map((e) => {
            const on = selectedIds.includes(e.id);
            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onToggle(e.id)}
                  className={`w-full text-left card flex items-center justify-between ${
                    on ? 'ring-2 ring-accent' : ''
                  }`}
                >
                  <div>
                    <div className="font-semibold">{e.name}</div>
                    <div className="text-xs text-slate-400">{MUSCLE_GROUP_LABELS[e.muscleGroup]}</div>
                  </div>
                  <span className="text-xl">{on ? '✓' : '＋'}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
