import Dexie, { type Table } from 'dexie';
import type { Exercise, SetEntry, WorkoutSession, WorkoutTemplate } from './schema';
import { uid } from '../lib/id';

class SolsGymDB extends Dexie {
  exercises!: Table<Exercise, string>;
  templates!: Table<WorkoutTemplate, string>;
  sessions!: Table<WorkoutSession, string>;
  sets!: Table<SetEntry, string>;

  constructor() {
    super('sols-gym');
    this.version(1).stores({
      exercises: 'id, name, muscleGroup',
      templates: 'id, name, updatedAt',
      sessions: 'id, startedAt, templateId',
      sets: 'id, sessionId, exerciseId, completedAt, [sessionId+exerciseId]',
    });
  }
}

export const db = new SolsGymDB();

const SEED_EXERCISES: Array<Omit<Exercise, 'id' | 'createdAt'>> = [
  { name: 'Supino reto barra', muscleGroup: 'peito' },
  { name: 'Supino inclinado halter', muscleGroup: 'peito' },
  { name: 'Crucifixo máquina', muscleGroup: 'peito' },
  { name: 'Puxada frente', muscleGroup: 'costas' },
  { name: 'Remada curvada', muscleGroup: 'costas' },
  { name: 'Remada baixa', muscleGroup: 'costas' },
  { name: 'Desenvolvimento halter', muscleGroup: 'ombro' },
  { name: 'Elevação lateral', muscleGroup: 'ombro' },
  { name: 'Rosca direta', muscleGroup: 'biceps' },
  { name: 'Rosca alternada', muscleGroup: 'biceps' },
  { name: 'Tríceps corda', muscleGroup: 'triceps' },
  { name: 'Tríceps francês', muscleGroup: 'triceps' },
  { name: 'Agachamento livre', muscleGroup: 'perna' },
  { name: 'Leg press', muscleGroup: 'perna' },
  { name: 'Cadeira extensora', muscleGroup: 'perna' },
  { name: 'Mesa flexora', muscleGroup: 'perna' },
  { name: 'Stiff', muscleGroup: 'gluteo' },
  { name: 'Elevação pélvica', muscleGroup: 'gluteo' },
  { name: 'Panturrilha em pé', muscleGroup: 'panturrilha' },
  { name: 'Abdominal prancha', muscleGroup: 'core' },
];

export async function ensureSeed(): Promise<void> {
  const count = await db.exercises.count();
  if (count > 0) return;
  const now = Date.now();
  await db.exercises.bulkAdd(
    SEED_EXERCISES.map((e) => ({ ...e, id: uid(), createdAt: now })),
  );
}

export const dbHelpers = {
  async createExercise(input: Omit<Exercise, 'id' | 'createdAt'>): Promise<Exercise> {
    const ex: Exercise = { ...input, id: uid(), createdAt: Date.now() };
    await db.exercises.add(ex);
    return ex;
  },
  updateExercise(id: string, patch: Partial<Exercise>) {
    return db.exercises.update(id, patch);
  },
  deleteExercise(id: string) {
    return db.exercises.delete(id);
  },

  async createTemplate(name: string, exerciseIds: string[] = []): Promise<WorkoutTemplate> {
    const now = Date.now();
    const t: WorkoutTemplate = { id: uid(), name, exerciseIds, createdAt: now, updatedAt: now };
    await db.templates.add(t);
    return t;
  },
  updateTemplate(id: string, patch: Partial<WorkoutTemplate>) {
    return db.templates.update(id, { ...patch, updatedAt: Date.now() });
  },
  deleteTemplate(id: string) {
    return db.templates.delete(id);
  },

  async startSession(name: string, templateId?: string): Promise<WorkoutSession> {
    const s: WorkoutSession = {
      id: uid(),
      name,
      templateId,
      startedAt: Date.now(),
    };
    await db.sessions.add(s);
    return s;
  },
  finishSession(id: string) {
    return db.sessions.update(id, { finishedAt: Date.now() });
  },
  updateSession(id: string, patch: Partial<WorkoutSession>) {
    return db.sessions.update(id, patch);
  },
  async deleteSession(id: string) {
    await db.transaction('rw', db.sessions, db.sets, async () => {
      await db.sets.where('sessionId').equals(id).delete();
      await db.sessions.delete(id);
    });
  },

  async addSet(input: Omit<SetEntry, 'id' | 'completedAt'>): Promise<SetEntry> {
    const s: SetEntry = { ...input, id: uid(), completedAt: Date.now() };
    await db.sets.add(s);
    return s;
  },
  updateSet(id: string, patch: Partial<SetEntry>) {
    return db.sets.update(id, patch);
  },
  deleteSet(id: string) {
    return db.sets.delete(id);
  },

  async lastSetFor(exerciseId: string): Promise<SetEntry | undefined> {
    return db.sets
      .where('exerciseId').equals(exerciseId)
      .reverse()
      .sortBy('completedAt')
      .then((arr) => arr[0]);
  },

  async exportJSON(): Promise<string> {
    const [exercises, templates, sessions, sets] = await Promise.all([
      db.exercises.toArray(),
      db.templates.toArray(),
      db.sessions.toArray(),
      db.sets.toArray(),
    ]);
    return JSON.stringify(
      { version: 1, exportedAt: Date.now(), exercises, templates, sessions, sets },
      null,
      2,
    );
  },

  async importJSON(raw: string): Promise<void> {
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) throw new Error('Formato inválido');
    await db.transaction('rw', db.exercises, db.templates, db.sessions, db.sets, async () => {
      await Promise.all([
        db.exercises.clear(),
        db.templates.clear(),
        db.sessions.clear(),
        db.sets.clear(),
      ]);
      await db.exercises.bulkAdd(data.exercises ?? []);
      await db.templates.bulkAdd(data.templates ?? []);
      await db.sessions.bulkAdd(data.sessions ?? []);
      await db.sets.bulkAdd(data.sets ?? []);
    });
  },
};
