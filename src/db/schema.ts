export type MuscleGroup =
  | 'peito'
  | 'costas'
  | 'ombro'
  | 'biceps'
  | 'triceps'
  | 'perna'
  | 'gluteo'
  | 'panturrilha'
  | 'core'
  | 'outro';

export const MUSCLE_GROUPS: MuscleGroup[] = [
  'peito', 'costas', 'ombro', 'biceps', 'triceps',
  'perna', 'gluteo', 'panturrilha', 'core', 'outro',
];

export interface Exercise {
  id: string;
  name: string;
  muscleGroup: MuscleGroup;
  notes?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface WorkoutTemplate {
  id: string;
  name: string;
  exerciseIds: string[];
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface WorkoutSession {
  id: string;
  templateId?: string;
  name: string;
  startedAt: number;
  finishedAt?: number;
  notes?: string;
  updatedAt: number;
  deletedAt?: number;
}

export interface SetEntry {
  id: string;
  sessionId: string;
  exerciseId: string;
  setIndex: number;
  weight: number;
  reps: number;
  rir: number;
  completedAt: number;
  updatedAt: number;
  deletedAt?: number;
}
