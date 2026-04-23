export type MuscleGroup =
  | 'chest'
  | 'lats'
  | 'traps'
  | 'shoulder'
  | 'biceps'
  | 'triceps'
  | 'quads'
  | 'hamstrings'
  | 'calves'
  | 'abs'
  | 'lower_back';

export const MUSCLE_GROUPS: MuscleGroup[] = [
  'chest', 'lats', 'traps', 'shoulder', 'biceps', 'triceps',
  'quads', 'hamstrings', 'calves', 'abs', 'lower_back',
];

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: 'Chest',
  lats: 'Lats',
  traps: 'Traps',
  shoulder: 'Shoulder',
  biceps: 'Biceps',
  triceps: 'Triceps',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  calves: 'Calves',
  abs: 'Abs',
  lower_back: 'Lower Back',
};

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

// Body weight entry. id = YYYY-MM-DD so a new entry on the same day overwrites.
export interface BodyWeight {
  id: string; // YYYY-MM-DD
  kg: number;
  notes?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

// ---------- FOOD / CALORIES ----------

// One parsed food item inside a meal. Macros optional; kcal required.
export interface FoodItem {
  name: string;      // "250g carne bovina"
  kcal: number;
  protein?: number;  // grams
  carbs?: number;    // grams
  fat?: number;      // grams
}

export const MEAL_LABELS = ['café', 'lanche', 'almoço', 'jantar', 'ceia'] as const;
export type MealLabel = typeof MEAL_LABELS[number];

// One logged meal. Multiple per day allowed.
export interface FoodEntry {
  id: string;                // uuid
  date: string;              // YYYY-MM-DD
  mealLabel?: MealLabel;
  description: string;       // user's raw natural-language description
  items: FoodItem[];         // LLM parse, editable
  totalKcal: number;         // cached sum(items.kcal)
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}
