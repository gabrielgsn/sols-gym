import type { Exercise, MuscleGroup, SetEntry } from '../db/schema';

// Epley-style e1RM adjusted for RIR.
// Standard Epley: weight * (1 + reps/30) assumes reps = AMRAP.
// If RIR > 0, user had more in the tank: add RIR to reps used in formula.
// This normalizes sets across rep/RIR schemes into a single strength proxy.
export function e1rm(weight: number, reps: number, rir: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  const effectiveReps = reps + Math.max(0, rir);
  return weight * (1 + effectiveReps / 30);
}

export function setE1rm(s: Pick<SetEntry, 'weight' | 'reps' | 'rir'>): number {
  return e1rm(s.weight, s.reps, s.rir);
}

export type SessionPoint = {
  sessionId: string;
  ts: number; // timestamp of best set (or min completedAt among session sets)
  topE1rm: number;
  topSet: SetEntry;
  volume: number; // sum weight*reps across sets in this session for this exercise
  setCount: number;
};

// Group sets by sessionId, return one point per session with best e1RM.
export function buildSessionSeries(sets: SetEntry[]): SessionPoint[] {
  const bySession = new Map<string, SetEntry[]>();
  for (const s of sets) {
    if (s.deletedAt) continue;
    const arr = bySession.get(s.sessionId) ?? [];
    arr.push(s);
    bySession.set(s.sessionId, arr);
  }
  const points: SessionPoint[] = [];
  for (const [sessionId, arr] of bySession) {
    let topSet = arr[0];
    let topE1rm = setE1rm(topSet);
    let volume = 0;
    let minTs = Infinity;
    for (const s of arr) {
      const v = setE1rm(s);
      if (v > topE1rm) {
        topE1rm = v;
        topSet = s;
      }
      volume += s.weight * s.reps;
      if (s.completedAt < minTs) minTs = s.completedAt;
    }
    points.push({
      sessionId,
      ts: minTs,
      topE1rm,
      topSet,
      volume,
      setCount: arr.length,
    });
  }
  points.sort((a, b) => a.ts - b.ts);
  return points;
}

export type ProgressStatus = 'progressing' | 'stalling' | 'plateau' | 'new';

export type ProgressSummary = {
  status: ProgressStatus;
  latestE1rm: number;
  latestTs: number;
  deltaKg: number; // latestE1rm - prevWindowBestE1rm
  daysSinceBest: number; // days since all-time best
  bestE1rm: number;
  bestTs: number;
  sessionsCount: number;
};

const DAY = 86400000;

// Target: +1 rep OR -1 RIR within 14 days ≈ +1kg e1RM at moderate loads.
// progressing: +1kg in last 14d vs prior 14d
// stalling:   0..+1kg in last 14d, or last session in last 14d but no gain vs 14-28d window
// plateau:    no all-time best in >21d AND 14d window flat/negative
// new:        <2 sessions total
export function summarizeProgress(points: SessionPoint[], now = Date.now()): ProgressSummary {
  if (points.length === 0) {
    return {
      status: 'new',
      latestE1rm: 0,
      latestTs: 0,
      deltaKg: 0,
      daysSinceBest: 0,
      bestE1rm: 0,
      bestTs: 0,
      sessionsCount: 0,
    };
  }
  const latest = points[points.length - 1];
  let best = points[0];
  for (const p of points) if (p.topE1rm > best.topE1rm) best = p;

  const recent = points.filter((p) => p.ts >= now - 14 * DAY);
  const prior = points.filter((p) => p.ts >= now - 28 * DAY && p.ts < now - 14 * DAY);
  const recentBest = recent.reduce((m, p) => Math.max(m, p.topE1rm), 0);
  const priorBest = prior.reduce((m, p) => Math.max(m, p.topE1rm), 0);
  const delta = recentBest - priorBest;
  const daysSinceBest = Math.floor((now - best.ts) / DAY);

  let status: ProgressStatus;
  if (points.length < 2) {
    status = 'new';
  } else if (delta >= 1) {
    status = 'progressing';
  } else if (daysSinceBest > 21) {
    status = 'plateau';
  } else {
    status = 'stalling';
  }

  return {
    status,
    latestE1rm: latest.topE1rm,
    latestTs: latest.ts,
    deltaKg: delta,
    daysSinceBest,
    bestE1rm: best.topE1rm,
    bestTs: best.ts,
    sessionsCount: points.length,
  };
}

export function statusLabel(s: ProgressStatus): { label: string; color: string; emoji: string } {
  switch (s) {
    case 'progressing': return { label: 'Progredindo', color: 'text-emerald-400', emoji: '🟢' };
    case 'stalling':    return { label: 'Estagnado',   color: 'text-amber-400',   emoji: '🟡' };
    case 'plateau':     return { label: 'Platô',       color: 'text-rose-400',    emoji: '🔴' };
    case 'new':         return { label: 'Novo',        color: 'text-slate-400',   emoji: '⚪' };
  }
}

// ---------- LAST 7 DAYS VOLUME ----------

export type WeeklyVolumeRow = {
  muscle: MuscleGroup;
  sets: number;
};

export type WeeklyVolume = {
  since: number;
  until: number;
  rows: WeeklyVolumeRow[];
};

// Count sets per muscle group in the last 7 days (rolling window from `now`).
// All sets counted (no RIR filter), ordered by the canonical MuscleGroup list.
export function buildWeeklyVolume(
  sets: SetEntry[],
  exercises: Exercise[],
  muscleOrder: MuscleGroup[],
  now = Date.now(),
): WeeklyVolume {
  const DAY = 86400000;
  const since = now - 7 * DAY;
  const exMap = new Map(exercises.map((e) => [e.id, e]));

  const counts = new Map<MuscleGroup, number>();
  for (const m of muscleOrder) counts.set(m, 0);

  for (const s of sets) {
    if (s.deletedAt) continue;
    if (s.completedAt < since || s.completedAt > now) continue;
    const ex = exMap.get(s.exerciseId);
    if (!ex || ex.deletedAt) continue;
    counts.set(ex.muscleGroup, (counts.get(ex.muscleGroup) ?? 0) + 1);
  }

  return {
    since,
    until: now,
    rows: muscleOrder.map((muscle) => ({ muscle, sets: counts.get(muscle) ?? 0 })),
  };
}

// ---------- BODY WEIGHT ----------

export function todayYMD(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function ymdToTs(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).getTime();
}

export type BodyWeightTrend = {
  latestKg: number | null;
  latestDate: string | null;
  delta7d: number | null;  // latest - avg(last 7 days excluding latest)
  delta30d: number | null; // latest - avg(last 30 days)
  avg7d: number | null;
  avg30d: number | null;
};

export function computeBodyWeightTrend(
  entries: Array<{ id: string; kg: number; deletedAt?: number }>,
  now = Date.now(),
): BodyWeightTrend {
  const active = entries
    .filter((e) => !e.deletedAt)
    .map((e) => ({ ts: ymdToTs(e.id), kg: e.kg }))
    .sort((a, b) => a.ts - b.ts);
  if (active.length === 0) {
    return { latestKg: null, latestDate: null, delta7d: null, delta30d: null, avg7d: null, avg30d: null };
  }
  const latest = active[active.length - 1];
  const DAY = 86400000;
  const past7 = active.filter((e) => e.ts >= now - 7 * DAY);
  const past30 = active.filter((e) => e.ts >= now - 30 * DAY);
  const avg = (arr: { kg: number }[]) =>
    arr.length === 0 ? null : arr.reduce((s, x) => s + x.kg, 0) / arr.length;
  const avg7d = avg(past7);
  const avg30d = avg(past30);
  // Compare latest against trailing avg excluding latest itself
  const past7Excl = past7.filter((e) => e.ts < latest.ts);
  const past30Excl = past30.filter((e) => e.ts < latest.ts);
  const avg7Excl = avg(past7Excl);
  const avg30Excl = avg(past30Excl);
  return {
    latestKg: latest.kg,
    latestDate: new Date(latest.ts).toISOString().slice(0, 10),
    delta7d: avg7Excl == null ? null : latest.kg - avg7Excl,
    delta30d: avg30Excl == null ? null : latest.kg - avg30Excl,
    avg7d,
    avg30d,
  };
}
