import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { db, dbHelpers } from '../db/db';
import { ExercisePicker } from '../components/ExercisePicker';

export function TemplateEdit() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const template = useLiveQuery(() => (id ? db.templates.get(id) : undefined), [id]);
  const exercises = useLiveQuery(() => db.exercises.toArray(), []);
  const [name, setName] = useState('');
  const [ids, setIds] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (template) {
      setName(template.name);
      setIds(template.exerciseIds);
    }
  }, [template]);

  if (!template) {
    return <p className="text-slate-500">Rotina não encontrada.</p>;
  }

  const exerciseMap = new Map((exercises ?? []).map((e) => [e.id, e]));

  async function save() {
    if (!id) return;
    await dbHelpers.updateTemplate(id, { name: name.trim() || 'Sem nome', exerciseIds: ids });
    nav('/templates');
  }

  function move(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    const next = ids.slice();
    [next[idx], next[j]] = [next[j], next[idx]];
    setIds(next);
  }

  function remove(exId: string) {
    setIds(ids.filter((x) => x !== exId));
  }

  function toggle(exId: string) {
    setIds(ids.includes(exId) ? ids.filter((x) => x !== exId) : [...ids, exId]);
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-2">
        <Link to="/templates" className="btn-ghost text-sm">← Voltar</Link>
        <h1 className="text-xl font-bold truncate flex-1 text-right">Editar rotina</h1>
      </header>

      <div className="card flex flex-col gap-2">
        <label className="label">Nome da rotina</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Exercícios ({ids.length})</h2>
        <button className="btn-primary text-sm" onClick={() => setPicking(true)}>
          + Adicionar
        </button>
      </div>

      <ul className="flex flex-col gap-2">
        {ids.map((exId, idx) => {
          const ex = exerciseMap.get(exId);
          return (
            <li key={exId} className="card flex items-center gap-2">
              <div className="flex-1">
                <div className="font-semibold">{ex?.name ?? '(removido)'}</div>
                {ex && <div className="text-xs text-slate-400 capitalize">{ex.muscleGroup}</div>}
              </div>
              <button className="btn-ghost text-sm" onClick={() => move(idx, -1)} disabled={idx === 0}>↑</button>
              <button className="btn-ghost text-sm" onClick={() => move(idx, 1)} disabled={idx === ids.length - 1}>↓</button>
              <button className="btn-danger text-sm" onClick={() => remove(exId)}>✕</button>
            </li>
          );
        })}
        {ids.length === 0 && (
          <li className="text-slate-500 text-center py-6 text-sm">
            Nenhum exercício. Toque em "Adicionar".
          </li>
        )}
      </ul>

      <div className="flex justify-end gap-2">
        <Link to="/templates" className="btn-ghost">Cancelar</Link>
        <button className="btn-primary" onClick={save}>Salvar</button>
      </div>

      {picking && (
        <ExercisePicker
          selectedIds={ids}
          onToggle={toggle}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}
