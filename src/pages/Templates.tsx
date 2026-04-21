import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { db, dbHelpers } from '../db/db';

export function Templates() {
  const templates = useLiveQuery(
    () => db.templates.orderBy('updatedAt').reverse().filter((t) => !t.deletedAt).toArray(),
    [],
  );
  const [newName, setNewName] = useState('');

  async function create() {
    const n = newName.trim();
    if (!n) return;
    await dbHelpers.createTemplate(n);
    setNewName('');
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Rotinas</h1>
      </header>

      <div className="card flex gap-2">
        <input
          className="input flex-1"
          placeholder='Nova rotina (ex: "Anterior")'
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create()}
        />
        <button className="btn-primary" onClick={create} disabled={!newName.trim()}>
          Criar
        </button>
      </div>

      <ul className="flex flex-col gap-2">
        {templates?.map((t) => (
          <li key={t.id} className="card flex items-center justify-between">
            <Link to={`/templates/${t.id}`} className="flex-1">
              <div className="font-semibold">{t.name}</div>
              <div className="text-xs text-slate-400">
                {t.exerciseIds.length} exercício{t.exerciseIds.length === 1 ? '' : 's'}
              </div>
            </Link>
            <button
              className="btn-danger text-sm"
              onClick={() => {
                if (confirm(`Apagar rotina "${t.name}"?`)) dbHelpers.deleteTemplate(t.id);
              }}
            >✕</button>
          </li>
        ))}
        {templates && templates.length === 0 && (
          <li className="text-slate-500 text-center py-8 text-sm">
            Nenhuma rotina. Crie uma acima.
          </li>
        )}
      </ul>
    </div>
  );
}
