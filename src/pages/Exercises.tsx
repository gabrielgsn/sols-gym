import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db, dbHelpers } from '../db/db';
import { MUSCLE_GROUPS, type Exercise, type MuscleGroup } from '../db/schema';

export function Exercises() {
  const exercises = useLiveQuery(
    () => db.exercises.orderBy('name').filter((e) => !e.deletedAt).toArray(),
    [],
  );
  const [editing, setEditing] = useState<Exercise | null>(null);
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Exercícios</h1>
        <button
          className="btn-primary"
          onClick={() => { setEditing(null); setShowForm(true); }}
        >
          + Novo
        </button>
      </header>

      {showForm && (
        <ExerciseForm
          initial={editing ?? undefined}
          onCancel={() => setShowForm(false)}
          onSaved={() => setShowForm(false)}
        />
      )}

      <ul className="flex flex-col gap-2">
        {exercises?.map((e) => (
          <li key={e.id} className="card flex items-center justify-between">
            <div>
              <div className="font-semibold">{e.name}</div>
              <div className="text-xs text-slate-400 capitalize">{e.muscleGroup}</div>
              {e.notes && <div className="text-xs text-slate-500 mt-1">{e.notes}</div>}
            </div>
            <div className="flex gap-2">
              <button
                className="btn-ghost text-sm"
                onClick={() => { setEditing(e); setShowForm(true); }}
              >Editar</button>
              <button
                className="btn-danger text-sm"
                onClick={() => {
                  if (confirm(`Apagar "${e.name}"?`)) dbHelpers.deleteExercise(e.id);
                }}
              >✕</button>
            </div>
          </li>
        ))}
        {exercises && exercises.length === 0 && (
          <li className="text-slate-500 text-center py-8 text-sm">
            Nenhum exercício cadastrado.
          </li>
        )}
      </ul>
    </div>
  );
}

function ExerciseForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial?: Exercise;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [muscleGroup, setMuscleGroup] = useState<MuscleGroup>(initial?.muscleGroup ?? 'peito');
  const [notes, setNotes] = useState(initial?.notes ?? '');

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (initial) {
      await dbHelpers.updateExercise(initial.id, { name: trimmed, muscleGroup, notes: notes || undefined });
    } else {
      await dbHelpers.createExercise({ name: trimmed, muscleGroup, notes: notes || undefined });
    }
    onSaved();
  }

  return (
    <div className="card flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label className="label">Nome</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>
      <div className="flex flex-col gap-1">
        <label className="label">Grupo muscular</label>
        <select
          className="input"
          value={muscleGroup}
          onChange={(e) => setMuscleGroup(e.target.value as MuscleGroup)}
        >
          {MUSCLE_GROUPS.map((g) => (
            <option key={g} value={g} className="bg-slate-900">{g}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="label">Notas (opcional)</label>
        <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="flex gap-2 justify-end">
        <button className="btn-ghost" onClick={onCancel}>Cancelar</button>
        <button className="btn-primary" onClick={save}>Salvar</button>
      </div>
    </div>
  );
}
