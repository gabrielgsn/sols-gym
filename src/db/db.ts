import Dexie, { type Table } from 'dexie';
import type { BodyWeight, Exercise, SetEntry, WorkoutSession, WorkoutTemplate } from './schema';
import { uid } from '../lib/id';

class SolsGymDB extends Dexie {
  exercises!: Table<Exercise, string>;
  templates!: Table<WorkoutTemplate, string>;
  sessions!: Table<WorkoutSession, string>;
  sets!: Table<SetEntry, string>;
  bodyWeights!: Table<BodyWeight, string>;

  constructor() {
    super('sols-gym');
    this.version(1).stores({
      exercises: 'id, name, muscleGroup',
      templates: 'id, name, updatedAt',
      sessions: 'id, startedAt, templateId',
      sets: 'id, sessionId, exerciseId, completedAt, [sessionId+exerciseId]',
    });
    this.version(2)
      .stores({
        exercises: 'id, name, muscleGroup, updatedAt, deletedAt',
        templates: 'id, name, updatedAt, deletedAt',
        sessions: 'id, startedAt, templateId, updatedAt, deletedAt',
        sets: 'id, sessionId, exerciseId, completedAt, [sessionId+exerciseId], updatedAt, deletedAt',
      })
      .upgrade(async (tx) => {
        const now = Date.now();
        const tables = ['exercises', 'templates', 'sessions', 'sets'] as const;
        for (const t of tables) {
          await tx.table(t).toCollection().modify((row: { updatedAt?: number; createdAt?: number }) => {
            if (typeof row.updatedAt !== 'number') {
              row.updatedAt = row.createdAt ?? now;
            }
          });
        }
      });
    this.version(3).stores({
      bodyWeights: 'id, updatedAt, deletedAt',
    });
    this.version(4)
      .stores({
        exercises: 'id, name, muscleGroup, updatedAt, deletedAt',
      })
      .upgrade(async (tx) => {
        // Remap old Portuguese groups → new English taxonomy.
        // 'costas' → 'lats' and 'gluteo' → 'hamstrings' are best-guess;
        // user can re-tag individual exercises (e.g. rows → traps, stiff → lower_back).
        const map: Record<string, string> = {
          peito: 'chest',
          costas: 'lats',
          ombro: 'shoulder',
          biceps: 'biceps',
          triceps: 'triceps',
          perna: 'quads',
          gluteo: 'hamstrings',
          panturrilha: 'calves',
          core: 'abs',
          outro: 'abs',
        };
        const ts = Date.now();
        await tx.table('exercises').toCollection().modify((row: { muscleGroup?: string; updatedAt?: number }) => {
          const current = row.muscleGroup;
          if (current && map[current]) {
            row.muscleGroup = map[current];
            row.updatedAt = ts;
          }
        });
      });
  }
}

export const db = new SolsGymDB();

const SEED_EXERCISES: Array<Omit<Exercise, 'id' | 'createdAt' | 'updatedAt'>> = [
  { name: 'Supino reto barra', muscleGroup: 'chest' },
  { name: 'Supino inclinado halter', muscleGroup: 'chest' },
  { name: 'Crucifixo máquina', muscleGroup: 'chest' },
  { name: 'Puxada frente', muscleGroup: 'lats' },
  { name: 'Remada curvada', muscleGroup: 'lats' },
  { name: 'Remada baixa', muscleGroup: 'lats' },
  { name: 'Desenvolvimento halter', muscleGroup: 'shoulder' },
  { name: 'Elevação lateral', muscleGroup: 'shoulder' },
  { name: 'Rosca direta', muscleGroup: 'biceps' },
  { name: 'Rosca alternada', muscleGroup: 'biceps' },
  { name: 'Tríceps corda', muscleGroup: 'triceps' },
  { name: 'Tríceps francês', muscleGroup: 'triceps' },
  { name: 'Agachamento livre', muscleGroup: 'quads' },
  { name: 'Leg press', muscleGroup: 'quads' },
  { name: 'Cadeira extensora', muscleGroup: 'quads' },
  { name: 'Mesa flexora', muscleGroup: 'hamstrings' },
  { name: 'Stiff', muscleGroup: 'hamstrings' },
  { name: 'Elevação pélvica', muscleGroup: 'hamstrings' },
  { name: 'Panturrilha em pé', muscleGroup: 'calves' },
  { name: 'Abdominal prancha', muscleGroup: 'abs' },
];

export async function ensureSeed(): Promise<void> {
  const count = await db.exercises.count();
  if (count > 0) return;
  const now = Date.now();
  await db.exercises.bulkAdd(
    SEED_EXERCISES.map((e) => ({ ...e, id: uid(), createdAt: now, updatedAt: now })),
  );
}

const now = () => Date.now();

export const dbHelpers = {
  async createExercise(input: Omit<Exercise, 'id' | 'createdAt' | 'updatedAt'>): Promise<Exercise> {
    const ts = now();
    const ex: Exercise = { ...input, id: uid(), createdAt: ts, updatedAt: ts };
    await db.exercises.add(ex);
    return ex;
  },
  updateExercise(id: string, patch: Partial<Exercise>) {
    return db.exercises.update(id, { ...patch, updatedAt: now() });
  },
  deleteExercise(id: string) {
    return db.exercises.update(id, { deletedAt: now(), updatedAt: now() });
  },

  async createTemplate(name: string, exerciseIds: string[] = []): Promise<WorkoutTemplate> {
    const ts = now();
    const t: WorkoutTemplate = { id: uid(), name, exerciseIds, createdAt: ts, updatedAt: ts };
    await db.templates.add(t);
    return t;
  },
  updateTemplate(id: string, patch: Partial<WorkoutTemplate>) {
    return db.templates.update(id, { ...patch, updatedAt: now() });
  },
  deleteTemplate(id: string) {
    return db.templates.update(id, { deletedAt: now(), updatedAt: now() });
  },

  async startSession(name: string, templateId?: string): Promise<WorkoutSession> {
    const ts = now();
    const s: WorkoutSession = {
      id: uid(),
      name,
      templateId,
      startedAt: ts,
      updatedAt: ts,
    };
    await db.sessions.add(s);
    return s;
  },
  finishSession(id: string) {
    const ts = now();
    return db.sessions.update(id, { finishedAt: ts, updatedAt: ts });
  },
  updateSession(id: string, patch: Partial<WorkoutSession>) {
    return db.sessions.update(id, { ...patch, updatedAt: now() });
  },
  async deleteSession(id: string) {
    const ts = now();
    await db.transaction('rw', db.sessions, db.sets, async () => {
      await db.sessions.update(id, { deletedAt: ts, updatedAt: ts });
      await db.sets.where('sessionId').equals(id).modify({ deletedAt: ts, updatedAt: ts });
    });
  },

  async addSet(input: Omit<SetEntry, 'id' | 'completedAt' | 'updatedAt'>): Promise<SetEntry> {
    const ts = now();
    const s: SetEntry = { ...input, id: uid(), completedAt: ts, updatedAt: ts };
    await db.sets.add(s);
    return s;
  },
  updateSet(id: string, patch: Partial<SetEntry>) {
    return db.sets.update(id, { ...patch, updatedAt: now() });
  },
  deleteSet(id: string) {
    return db.sets.update(id, { deletedAt: now(), updatedAt: now() });
  },

  async upsertBodyWeight(input: { date: string; kg: number; notes?: string }): Promise<BodyWeight> {
    const ts = now();
    const existing = await db.bodyWeights.get(input.date);
    const row: BodyWeight = {
      id: input.date,
      kg: input.kg,
      notes: input.notes,
      createdAt: existing?.createdAt ?? ts,
      updatedAt: ts,
      deletedAt: undefined,
    };
    await db.bodyWeights.put(row);
    return row;
  },
  deleteBodyWeight(id: string) {
    return db.bodyWeights.update(id, { deletedAt: now(), updatedAt: now() });
  },

  async lastSetFor(exerciseId: string): Promise<SetEntry | undefined> {
    return db.sets
      .where('exerciseId').equals(exerciseId)
      .filter((s) => !s.deletedAt)
      .reverse()
      .sortBy('completedAt')
      .then((arr) => arr[0]);
  },

  async exportJSON(): Promise<string> {
    const [exercises, templates, sessions, sets, bodyWeights] = await Promise.all([
      db.exercises.toArray(),
      db.templates.toArray(),
      db.sessions.toArray(),
      db.sets.toArray(),
      db.bodyWeights.toArray(),
    ]);
    return JSON.stringify(
      { version: 3, exportedAt: Date.now(), exercises, templates, sessions, sets, bodyWeights },
      null,
      2,
    );
  },

  async importJSON(raw: string): Promise<void> {
    const data = JSON.parse(raw);
    if (!data || ![1, 2, 3].includes(data.version)) throw new Error('Formato inválido');
    const ts = now();
    const patchTs = <T extends { updatedAt?: number; createdAt?: number }>(arr: T[]): T[] =>
      arr.map((r) => ({ ...r, updatedAt: r.updatedAt ?? r.createdAt ?? ts }));
    await db.transaction('rw', [db.exercises, db.templates, db.sessions, db.sets, db.bodyWeights], async () => {
      await Promise.all([
        db.exercises.clear(),
        db.templates.clear(),
        db.sessions.clear(),
        db.sets.clear(),
        db.bodyWeights.clear(),
      ]);
      await db.exercises.bulkAdd(patchTs(data.exercises ?? []));
      await db.templates.bulkAdd(patchTs(data.templates ?? []));
      await db.sessions.bulkAdd(patchTs(data.sessions ?? []));
      await db.sets.bulkAdd(patchTs(data.sets ?? []));
      await db.bodyWeights.bulkAdd(patchTs(data.bodyWeights ?? []));
    });
  },
};

// Query helpers that exclude soft-deleted rows
export const qry = {
  exercises: () => db.exercises.filter((e) => !e.deletedAt),
  templates: () => db.templates.filter((t) => !t.deletedAt),
  sessions: () => db.sessions.filter((s) => !s.deletedAt),
  sets: () => db.sets.filter((s) => !s.deletedAt),
  bodyWeights: () => db.bodyWeights.filter((b) => !b.deletedAt),
};
