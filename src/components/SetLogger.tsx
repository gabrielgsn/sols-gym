import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { db, dbHelpers } from '../db/db';
import type { Exercise, SetEntry } from '../db/schema';
import { NumberStepper } from './NumberStepper';

type Props = {
  sessionId: string;
  exercise: Exercise;
};

export function SetLogger({ sessionId, exercise }: Props) {
  const sets = useLiveQuery(
    () =>
      db.sets
        .where('[sessionId+exerciseId]')
        .equals([sessionId, exercise.id])
        .sortBy('setIndex'),
    [sessionId, exercise.id],
  ) as SetEntry[] | undefined;

  const lastGlobal = useLiveQuery(() => dbHelpers.lastSetFor(exercise.id), [exercise.id]);

  const [weight, setWeight] = useState(0);
  const [reps, setReps] = useState(0);
  const [rir, setRir] = useState(2);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (touched) return;
    const seed = (sets && sets.length > 0 ? sets[sets.length - 1] : lastGlobal);
    if (seed) {
      setWeight(seed.weight);
      setReps(seed.reps);
      setRir(seed.rir);
    }
  }, [sets, lastGlobal, touched]);

  async function add() {
    const nextIdx = (sets?.length ?? 0) + 1;
    await dbHelpers.addSet({
      sessionId,
      exerciseId: exercise.id,
      setIndex: nextIdx,
      weight,
      reps,
      rir,
    });
    setTouched(false);
  }

  return (
    <div className="card flex flex-col gap-3">
      <div>
        <div className="font-semibold">{exercise.name}</div>
        <div className="text-xs text-slate-400 capitalize">{exercise.muscleGroup}</div>
      </div>

      {sets && sets.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {sets.map((s) => (
            <li key={s.id} className="flex items-center justify-between bg-slate-800/60 rounded-lg px-3 py-1.5">
              <span className="text-slate-400">Série {s.setIndex}</span>
              <span className="font-mono">
                {s.weight}kg × {s.reps} <span className="text-slate-500">RIR {s.rir}</span>
              </span>
              <button
                aria-label="Apagar série"
                className="text-slate-500 hover:text-red-400 text-xs"
                onClick={() => dbHelpers.deleteSet(s.id)}
              >✕</button>
            </li>
          ))}
        </ul>
      )}

      <div onPointerDown={() => setTouched(true)} className="grid grid-cols-3 gap-2">
        <NumberStepper label="Peso" value={weight} onChange={setWeight} step={2.5} decimals={1} suffix="kg" />
        <NumberStepper label="Reps" value={reps} onChange={setReps} step={1} />
        <NumberStepper label="RIR" value={rir} onChange={setRir} step={1} min={0} max={10} />
      </div>

      <button className="btn-primary" onClick={add}>
        + Adicionar série {(sets?.length ?? 0) + 1}
      </button>
    </div>
  );
}
