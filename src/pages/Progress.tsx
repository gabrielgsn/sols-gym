import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { db, dbHelpers } from '../db/db';
import { MUSCLE_GROUPS, MUSCLE_GROUP_LABELS, type Exercise, type SetEntry } from '../db/schema';
import {
  buildSessionSeries,
  buildWeeklyVolume,
  computeBodyWeightTrend,
  statusLabel,
  summarizeProgress,
  todayYMD,
  ymdToTs,
  type ProgressStatus,
  type SessionPoint,
  type WeeklyVolume,
} from '../lib/analytics';

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function fmtFullDate(ts: number): string {
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function Progress() {
  const exercises = useLiveQuery(
    () => db.exercises.filter((e) => !e.deletedAt).toArray(),
    [],
  );
  const allSets = useLiveQuery(
    () => db.sets.filter((s) => !s.deletedAt).toArray(),
    [],
  );
  const bodyWeights = useLiveQuery(
    () => db.bodyWeights.filter((b) => !b.deletedAt).toArray(),
    [],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | ProgressStatus>('all');

  const setsByExercise = useMemo(() => {
    const m = new Map<string, SetEntry[]>();
    for (const s of allSets ?? []) {
      const arr = m.get(s.exerciseId) ?? [];
      arr.push(s);
      m.set(s.exerciseId, arr);
    }
    return m;
  }, [allSets]);

  const rows = useMemo(() => {
    if (!exercises) return [];
    return exercises
      .map((ex) => {
        const sets = setsByExercise.get(ex.id) ?? [];
        const points = buildSessionSeries(sets);
        const summary = summarizeProgress(points);
        return { ex, points, summary };
      })
      .filter((r) => r.summary.sessionsCount > 0)
      .sort((a, b) => {
        const order: Record<ProgressStatus, number> = { plateau: 0, stalling: 1, new: 2, progressing: 3 };
        const da = order[a.summary.status];
        const db_ = order[b.summary.status];
        if (da !== db_) return da - db_;
        return b.summary.latestTs - a.summary.latestTs;
      });
  }, [exercises, setsByExercise]);

  const filtered = filter === 'all' ? rows : rows.filter((r) => r.summary.status === filter);

  const selected = selectedId ? rows.find((r) => r.ex.id === selectedId) : null;

  const weeklyVolume = useMemo(
    () => buildWeeklyVolume(allSets ?? [], exercises ?? [], MUSCLE_GROUPS),
    [allSets, exercises],
  );

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Progresso</h1>
        {rows.length > 0 && (
          <div className="text-xs text-slate-400">
            {rows.length} exerc. ativos
          </div>
        )}
      </header>

      <BodyWeightCard entries={bodyWeights ?? []} />

      <WeeklyVolumeCard volume={weeklyVolume} />

      <div className="card flex flex-col gap-2">
        <h2 className="font-semibold">Por exercício</h2>
        <div className="text-xs text-slate-400">
          Meta: +1 rep ou −1 RIR a cada 2 semanas. e1RM = peso × (1 + (reps + RIR) / 30).
        </div>
        <div className="flex flex-wrap gap-1 text-xs">
          {(['all', 'plateau', 'stalling', 'new', 'progressing'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2 py-1 rounded-full border ${
                filter === f
                  ? 'bg-accent/20 border-accent text-accent'
                  : 'border-slate-700 text-slate-400'
              }`}
            >
              {f === 'all' ? 'Todos' : statusLabel(f).label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 && (
        <p className="text-slate-500 text-center py-8 text-sm">
          Sem dados. Registre treinos no histórico.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {filtered.map(({ ex, summary }) => {
          const s = statusLabel(summary.status);
          return (
            <li key={ex.id}>
              <button
                onClick={() => setSelectedId(ex.id)}
                className="card w-full text-left flex items-center gap-3"
              >
                <span className="text-2xl" aria-hidden>{s.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{ex.name}</div>
                  <div className="text-xs text-slate-400">
                    {MUSCLE_GROUP_LABELS[ex.muscleGroup]} · {summary.sessionsCount} sessões
                  </div>
                  <div className="text-xs mt-0.5">
                    <span className={s.color}>{s.label}</span>
                    <span className="text-slate-500"> · e1RM {summary.latestE1rm.toFixed(1)}kg</span>
                    {summary.status === 'progressing' && (
                      <span className="text-emerald-400"> · +{summary.deltaKg.toFixed(1)}kg/14d</span>
                    )}
                    {summary.status === 'plateau' && (
                      <span className="text-rose-400"> · {summary.daysSinceBest}d sem PR</span>
                    )}
                    {summary.status === 'stalling' && summary.deltaKg !== 0 && (
                      <span className="text-amber-400"> · {summary.deltaKg >= 0 ? '+' : ''}{summary.deltaKg.toFixed(1)}kg/14d</span>
                    )}
                  </div>
                </div>
                <span className="text-slate-500">›</span>
              </button>
            </li>
          );
        })}
      </ul>

      {selected && (
        <ExerciseDetail
          ex={selected.ex}
          points={selected.points}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

function ExerciseDetail({
  ex,
  points,
  onClose,
}: {
  ex: Exercise;
  points: SessionPoint[];
  onClose: () => void;
}) {
  const summary = summarizeProgress(points);
  const s = statusLabel(summary.status);

  return (
    <div className="fixed inset-0 bg-slate-950/90 backdrop-blur z-50 flex flex-col">
      <header className="flex items-center justify-between p-4 border-b border-slate-800">
        <div className="min-w-0 flex-1">
          <div className="font-bold truncate">{ex.name}</div>
          <div className="text-xs text-slate-400">{MUSCLE_GROUP_LABELS[ex.muscleGroup]}</div>
        </div>
        <button className="btn-ghost" onClick={onClose}>Fechar</button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 max-w-xl w-full mx-auto">
        <div className="card flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl" aria-hidden>{s.emoji}</span>
            <span className={`font-semibold ${s.color}`}>{s.label}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <Stat label="e1RM atual" value={`${summary.latestE1rm.toFixed(1)}kg`} />
            <Stat label="Melhor e1RM" value={`${summary.bestE1rm.toFixed(1)}kg`} />
            <Stat label="Δ 14 dias" value={`${summary.deltaKg >= 0 ? '+' : ''}${summary.deltaKg.toFixed(1)}kg`} />
            <Stat label="Desde PR" value={`${summary.daysSinceBest}d`} />
          </div>
        </div>

        <Chart points={points} />

        <div className="card flex flex-col gap-2">
          <h3 className="font-semibold text-sm">Histórico ({points.length} sessões)</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {[...points].reverse().map((p) => (
              <li key={p.sessionId} className="flex items-center justify-between gap-2 bg-slate-800/40 rounded px-3 py-1.5">
                <span className="text-slate-400 text-xs">{fmtFullDate(p.ts)}</span>
                <span className="font-mono text-xs">
                  {p.topSet.weight}kg × {p.topSet.reps} <span className="text-slate-500">RIR {p.topSet.rir}</span>
                </span>
                <span className="font-mono text-xs text-accent">
                  e1RM {p.topE1rm.toFixed(1)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

function Chart({ points }: { points: SessionPoint[] }) {
  if (points.length === 0) return null;

  const W = 320;
  const H = 180;
  const PAD_L = 36;
  const PAD_R = 8;
  const PAD_T = 12;
  const PAD_B = 26;

  const xs = points.map((p) => p.ts);
  const ys = points.map((p) => p.topE1rm);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const rangeX = Math.max(1, maxX - minX);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const padY = Math.max(1, (maxY - minY) * 0.15);
  const y0 = Math.max(0, minY - padY);
  const y1 = maxY + padY;
  const rangeY = Math.max(1, y1 - y0);

  const xToPx = (x: number) =>
    points.length === 1 ? (W - PAD_L - PAD_R) / 2 + PAD_L : PAD_L + ((x - minX) / rangeX) * (W - PAD_L - PAD_R);
  const yToPx = (y: number) => PAD_T + (1 - (y - y0) / rangeY) * (H - PAD_T - PAD_B);

  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xToPx(p.ts).toFixed(1)} ${yToPx(p.topE1rm).toFixed(1)}`)
    .join(' ');

  // Y-axis labels (3 ticks)
  const yTicks = [y0, (y0 + y1) / 2, y1];
  const xTicks = points.length <= 4
    ? points.map((p) => p.ts)
    : [minX, (minX + maxX) / 2, maxX];

  return (
    <div className="card flex flex-col gap-2">
      <h3 className="font-semibold text-sm">Evolução e1RM</h3>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Gráfico de evolução">
        {yTicks.map((y, i) => (
          <g key={i}>
            <line
              x1={PAD_L} y1={yToPx(y)} x2={W - PAD_R} y2={yToPx(y)}
              stroke="currentColor" strokeOpacity={0.1} strokeDasharray="2 3"
            />
            <text
              x={PAD_L - 4} y={yToPx(y) + 3}
              fontSize="9" textAnchor="end" fill="currentColor" fillOpacity={0.5}
            >
              {y.toFixed(0)}
            </text>
          </g>
        ))}

        {xTicks.map((x, i) => (
          <text
            key={i}
            x={xToPx(x)} y={H - 8}
            fontSize="9" textAnchor="middle" fill="currentColor" fillOpacity={0.5}
          >
            {fmtDate(x)}
          </text>
        ))}

        <path d={pathD} fill="none" stroke="#38bdf8" strokeWidth={2} />

        {points.map((p, i) => (
          <circle
            key={i}
            cx={xToPx(p.ts)} cy={yToPx(p.topE1rm)}
            r={3} fill="#38bdf8"
          >
            <title>{`${fmtFullDate(p.ts)}\n${p.topSet.weight}kg × ${p.topSet.reps} RIR ${p.topSet.rir}\ne1RM ${p.topE1rm.toFixed(1)}kg`}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}

// ---------- BODY WEIGHT CARD ----------

function BodyWeightCard({ entries }: { entries: Array<{ id: string; kg: number; deletedAt?: number }> }) {
  const trend = useMemo(() => computeBodyWeightTrend(entries), [entries]);
  const [input, setInput] = useState('');
  const [date, setDate] = useState(todayYMD());
  const [saving, setSaving] = useState(false);

  async function save() {
    const kg = parseFloat(input.replace(',', '.'));
    if (!kg || kg <= 0 || kg > 500) return;
    setSaving(true);
    try {
      await dbHelpers.upsertBodyWeight({ date, kg });
      setInput('');
    } finally {
      setSaving(false);
    }
  }

  const series = useMemo(() => {
    return entries
      .filter((e) => !e.deletedAt)
      .map((e) => ({ ts: ymdToTs(e.id), kg: e.kg }))
      .sort((a, b) => a.ts - b.ts);
  }, [entries]);

  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Peso corporal</h2>
        {trend.latestKg != null && (
          <span className="text-xs text-slate-400">
            {trend.latestDate}
          </span>
        )}
      </div>

      {trend.latestKg != null ? (
        <div className="grid grid-cols-3 gap-2 text-sm">
          <Stat label="Atual" value={`${trend.latestKg.toFixed(1)}kg`} />
          <Stat
            label="Δ 7d"
            value={trend.delta7d == null ? '—' : `${trend.delta7d >= 0 ? '+' : ''}${trend.delta7d.toFixed(1)}kg`}
          />
          <Stat
            label="Δ 30d"
            value={trend.delta30d == null ? '—' : `${trend.delta30d >= 0 ? '+' : ''}${trend.delta30d.toFixed(1)}kg`}
          />
        </div>
      ) : (
        <div className="text-xs text-slate-500">Nenhum registro ainda.</div>
      )}

      {series.length >= 2 && <BodyWeightSpark points={series} />}

      <div className="flex gap-2 items-end">
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <label className="label">Peso (kg)</label>
          <input
            className="input"
            type="number"
            inputMode="decimal"
            step="0.1"
            placeholder="ex: 78.5"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="label">Data</label>
          <input
            className="input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <button
          className="btn-primary"
          onClick={save}
          disabled={saving || !input}
        >
          Salvar
        </button>
      </div>
    </div>
  );
}

function BodyWeightSpark({ points }: { points: { ts: number; kg: number }[] }) {
  const W = 320, H = 60, PAD = 4;
  const xs = points.map((p) => p.ts);
  const ys = points.map((p) => p.kg);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const rangeX = Math.max(1, maxX - minX);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const padY = Math.max(0.5, (maxY - minY) * 0.15);
  const y0 = minY - padY, y1 = maxY + padY;
  const rangeY = Math.max(0.1, y1 - y0);
  const xToPx = (x: number) => PAD + ((x - minX) / rangeX) * (W - 2 * PAD);
  const yToPx = (y: number) => PAD + (1 - (y - y0) / rangeY) * (H - 2 * PAD);
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xToPx(p.ts).toFixed(1)} ${yToPx(p.kg).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Tendência de peso">
      <path d={d} fill="none" stroke="#38bdf8" strokeWidth={1.5} />
      {points.map((p, i) => (
        <circle key={i} cx={xToPx(p.ts)} cy={yToPx(p.kg)} r={1.5} fill="#38bdf8" />
      ))}
    </svg>
  );
}

// ---------- LAST 7 DAYS VOLUME ----------

function WeeklyVolumeCard({ volume }: { volume: WeeklyVolume }) {
  const { rows } = volume;
  const total = rows.reduce((s, r) => s + r.sets, 0);
  const maxCount = Math.max(1, ...rows.map((r) => r.sets));

  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">Volume (últimos 7 dias)</h2>
        <span className="text-xs text-slate-500">{total} séries</span>
      </div>

      {total === 0 ? (
        <p className="text-xs text-slate-500">Nenhuma série registrada nos últimos 7 dias.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((r) => {
            const pct = (r.sets / maxCount) * 100;
            return (
              <li key={r.muscle} className="flex items-center gap-2">
                <span className="text-sm w-24 shrink-0">{MUSCLE_GROUP_LABELS[r.muscle]}</span>
                <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="font-mono text-sm tabular-nums w-8 text-right">{r.sets}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
