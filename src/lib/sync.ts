import { db } from '../db/db';
import type {
  BodyWeight, Exercise, FoodEntry, FoodItem, MealLabel,
  SetEntry, WorkoutSession, WorkoutTemplate,
} from '../db/schema';
import { supabase } from './supabase';

const LAST_PULL_KEY = 'sols-gym.lastPullAt';
const LAST_PUSH_KEY = 'sols-gym.lastPushAt';

export type SyncStatus =
  | { state: 'idle' }
  | { state: 'running'; step: string }
  | { state: 'ok'; at: number; pushed: number; pulled: number }
  | { state: 'error'; message: string };

const listeners = new Set<(s: SyncStatus) => void>();
let current: SyncStatus = { state: 'idle' };

export function onSyncStatus(cb: (s: SyncStatus) => void): () => void {
  listeners.add(cb);
  cb(current);
  return () => listeners.delete(cb);
}

function emit(next: SyncStatus) {
  current = next;
  listeners.forEach((cb) => cb(next));
}

const getNum = (k: string) => {
  const v = localStorage.getItem(k);
  return v ? Number(v) : 0;
};
const setNum = (k: string, n: number) => localStorage.setItem(k, String(n));

export function resetSyncCursors() {
  localStorage.removeItem(LAST_PULL_KEY);
  localStorage.removeItem(LAST_PUSH_KEY);
}

// ---------- MAPPERS (camelCase <-> snake_case) ----------

type RemoteExercise = {
  id: string; name: string; muscle_group: string; notes: string | null;
  created_at: number; updated_at: number; deleted_at: number | null;
};
type RemoteTemplate = {
  id: string; name: string; exercise_ids: string[];
  created_at: number; updated_at: number; deleted_at: number | null;
};
type RemoteSession = {
  id: string; template_id: string | null; name: string;
  started_at: number; finished_at: number | null; notes: string | null;
  updated_at: number; deleted_at: number | null;
};
type RemoteSet = {
  id: string; session_id: string; exercise_id: string; set_index: number;
  weight: number; reps: number; rir: number;
  completed_at: number; updated_at: number; deleted_at: number | null;
};
type RemoteBodyWeight = {
  id: string; kg: number; notes: string | null;
  created_at: number; updated_at: number; deleted_at: number | null;
};
type RemoteFoodEntry = {
  id: string;
  date: string;
  meal_label: string | null;
  description: string;
  items: FoodItem[];
  total_kcal: number;
  created_at: number; updated_at: number; deleted_at: number | null;
};

const toRemoteEx = (e: Exercise) => ({
  id: e.id, name: e.name, muscle_group: e.muscleGroup, notes: e.notes ?? null,
  created_at: e.createdAt, updated_at: e.updatedAt, deleted_at: e.deletedAt ?? null,
});
const fromRemoteEx = (r: RemoteExercise): Exercise => ({
  id: r.id, name: r.name, muscleGroup: r.muscle_group as Exercise['muscleGroup'],
  notes: r.notes ?? undefined,
  createdAt: Number(r.created_at), updatedAt: Number(r.updated_at),
  deletedAt: r.deleted_at == null ? undefined : Number(r.deleted_at),
});

const toRemoteTpl = (t: WorkoutTemplate) => ({
  id: t.id, name: t.name, exercise_ids: t.exerciseIds,
  created_at: t.createdAt, updated_at: t.updatedAt, deleted_at: t.deletedAt ?? null,
});
const fromRemoteTpl = (r: RemoteTemplate): WorkoutTemplate => ({
  id: r.id, name: r.name, exerciseIds: r.exercise_ids ?? [],
  createdAt: Number(r.created_at), updatedAt: Number(r.updated_at),
  deletedAt: r.deleted_at == null ? undefined : Number(r.deleted_at),
});

const toRemoteSess = (s: WorkoutSession) => ({
  id: s.id, template_id: s.templateId ?? null, name: s.name,
  started_at: s.startedAt, finished_at: s.finishedAt ?? null, notes: s.notes ?? null,
  updated_at: s.updatedAt, deleted_at: s.deletedAt ?? null,
});
const fromRemoteSess = (r: RemoteSession): WorkoutSession => ({
  id: r.id, templateId: r.template_id ?? undefined, name: r.name,
  startedAt: Number(r.started_at),
  finishedAt: r.finished_at == null ? undefined : Number(r.finished_at),
  notes: r.notes ?? undefined,
  updatedAt: Number(r.updated_at),
  deletedAt: r.deleted_at == null ? undefined : Number(r.deleted_at),
});

const toRemoteSet = (s: SetEntry) => ({
  id: s.id, session_id: s.sessionId, exercise_id: s.exerciseId, set_index: s.setIndex,
  weight: s.weight, reps: s.reps, rir: s.rir,
  completed_at: s.completedAt, updated_at: s.updatedAt, deleted_at: s.deletedAt ?? null,
});
const fromRemoteSet = (r: RemoteSet): SetEntry => ({
  id: r.id, sessionId: r.session_id, exerciseId: r.exercise_id, setIndex: r.set_index,
  weight: Number(r.weight), reps: r.reps, rir: r.rir,
  completedAt: Number(r.completed_at), updatedAt: Number(r.updated_at),
  deletedAt: r.deleted_at == null ? undefined : Number(r.deleted_at),
});

const toRemoteBW = (b: BodyWeight) => ({
  id: b.id, kg: b.kg, notes: b.notes ?? null,
  created_at: b.createdAt, updated_at: b.updatedAt, deleted_at: b.deletedAt ?? null,
});
const fromRemoteBW = (r: RemoteBodyWeight): BodyWeight => ({
  id: r.id, kg: Number(r.kg), notes: r.notes ?? undefined,
  createdAt: Number(r.created_at), updatedAt: Number(r.updated_at),
  deletedAt: r.deleted_at == null ? undefined : Number(r.deleted_at),
});

const toRemoteFE = (e: FoodEntry) => ({
  id: e.id,
  date: e.date,
  meal_label: e.mealLabel ?? null,
  description: e.description,
  items: e.items,
  total_kcal: e.totalKcal,
  created_at: e.createdAt, updated_at: e.updatedAt, deleted_at: e.deletedAt ?? null,
});
const fromRemoteFE = (r: RemoteFoodEntry): FoodEntry => ({
  id: r.id,
  date: r.date,
  mealLabel: (r.meal_label ?? undefined) as MealLabel | undefined,
  description: r.description,
  items: Array.isArray(r.items) ? r.items : [],
  totalKcal: Number(r.total_kcal),
  createdAt: Number(r.created_at),
  updatedAt: Number(r.updated_at),
  deletedAt: r.deleted_at == null ? undefined : Number(r.deleted_at),
});

// ---------- PUSH ----------

async function pushAll(lastPushAt: number): Promise<number> {
  if (!supabase) return 0;

  const [exercises, templates, sessions, sets, bodyWeights, foodEntries] = await Promise.all([
    db.exercises.where('updatedAt').above(lastPushAt).toArray(),
    db.templates.where('updatedAt').above(lastPushAt).toArray(),
    db.sessions.where('updatedAt').above(lastPushAt).toArray(),
    db.sets.where('updatedAt').above(lastPushAt).toArray(),
    db.bodyWeights.where('updatedAt').above(lastPushAt).toArray(),
    db.foodEntries.where('updatedAt').above(lastPushAt).toArray(),
  ]);

  let count = 0;
  if (exercises.length) {
    const { error } = await supabase.from('exercises').upsert(exercises.map(toRemoteEx));
    if (error) throw error;
    count += exercises.length;
  }
  if (templates.length) {
    const { error } = await supabase.from('templates').upsert(templates.map(toRemoteTpl));
    if (error) throw error;
    count += templates.length;
  }
  if (sessions.length) {
    const { error } = await supabase.from('sessions').upsert(sessions.map(toRemoteSess));
    if (error) throw error;
    count += sessions.length;
  }
  if (sets.length) {
    const { error } = await supabase.from('sets').upsert(sets.map(toRemoteSet));
    if (error) throw error;
    count += sets.length;
  }
  if (bodyWeights.length) {
    const { error } = await supabase.from('body_weights').upsert(bodyWeights.map(toRemoteBW));
    if (error) throw error;
    count += bodyWeights.length;
  }
  if (foodEntries.length) {
    const { error } = await supabase.from('food_entries').upsert(foodEntries.map(toRemoteFE));
    if (error) throw error;
    count += foodEntries.length;
  }
  return count;
}

// ---------- PULL ----------

async function pullTable<R, L extends { id: string; updatedAt: number }>(
  table: 'exercises' | 'templates' | 'sessions' | 'sets' | 'body_weights' | 'food_entries',
  lastPullAt: number,
  map: (r: R) => L,
  store: 'exercises' | 'templates' | 'sessions' | 'sets' | 'bodyWeights' | 'foodEntries',
): Promise<number> {
  if (!supabase) return 0;
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .gt('updated_at', lastPullAt);
  if (error) throw error;
  if (!data || data.length === 0) return 0;

  const rows = (data as R[]).map(map);
  const ids = rows.map((r) => r.id);
  const existing = await db.table(store).bulkGet(ids);
  const toPut: L[] = [];
  rows.forEach((remote, i) => {
    const local = existing[i] as L | undefined;
    if (!local || remote.updatedAt > local.updatedAt) toPut.push(remote);
  });
  if (toPut.length) await db.table(store).bulkPut(toPut);
  return toPut.length;
}

async function pullAll(lastPullAt: number): Promise<{ count: number; maxUpdatedAt: number }> {
  if (!supabase) return { count: 0, maxUpdatedAt: lastPullAt };

  const [nEx, nTpl, nSess, nSet, nBW, nFE] = await Promise.all([
    pullTable<RemoteExercise, Exercise>('exercises', lastPullAt, fromRemoteEx, 'exercises'),
    pullTable<RemoteTemplate, WorkoutTemplate>('templates', lastPullAt, fromRemoteTpl, 'templates'),
    pullTable<RemoteSession, WorkoutSession>('sessions', lastPullAt, fromRemoteSess, 'sessions'),
    pullTable<RemoteSet, SetEntry>('sets', lastPullAt, fromRemoteSet, 'sets'),
    pullTable<RemoteBodyWeight, BodyWeight>('body_weights', lastPullAt, fromRemoteBW, 'bodyWeights'),
    pullTable<RemoteFoodEntry, FoodEntry>('food_entries', lastPullAt, fromRemoteFE, 'foodEntries'),
  ]);
  return { count: nEx + nTpl + nSess + nSet + nBW + nFE, maxUpdatedAt: Date.now() };
}

// ---------- SYNC NOW ----------

let running = false;

export async function syncNow(): Promise<void> {
  if (!supabase) {
    emit({ state: 'error', message: 'Supabase não configurado' });
    return;
  }
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    emit({ state: 'error', message: 'Faça login primeiro' });
    return;
  }
  if (running) return;
  running = true;

  try {
    emit({ state: 'running', step: 'enviando…' });
    const lastPushAt = getNum(LAST_PUSH_KEY);
    const pushStartedAt = Date.now();
    const pushed = await pushAll(lastPushAt);
    setNum(LAST_PUSH_KEY, pushStartedAt);

    emit({ state: 'running', step: 'baixando…' });
    const lastPullAt = getNum(LAST_PULL_KEY);
    const { count: pulled, maxUpdatedAt } = await pullAll(lastPullAt);
    setNum(LAST_PULL_KEY, maxUpdatedAt);

    emit({ state: 'ok', at: Date.now(), pushed, pulled });
  } catch (e) {
    emit({ state: 'error', message: e instanceof Error ? e.message : String(e) });
  } finally {
    running = false;
  }
}
