import type { FoodItem } from '../db/schema';
import { supabase, supabaseAnonKey, supabaseConfigured, supabaseUrl } from './supabase';

// Calls a Supabase Edge Function that proxies NVIDIA's chat endpoint.
// Rationale: NVIDIA does not allow browser CORS, and we never want the
// NVIDIA API key in the bundle. The function holds NVIDIA_API_KEY as a
// server-side secret and requires a logged-in Supabase user (JWT verify).

const DEFAULT_MODEL = 'moonshotai/kimi-k2-thinking';
const MODEL_STORAGE = 'sols-gym.nvidia_model';
const DEFAULT_TIMEOUT_MS = 90_000;
const FUNCTION_PATH = '/functions/v1/estimate-calories';

export function getNvidiaModel(): string {
  return localStorage.getItem(MODEL_STORAGE) ?? DEFAULT_MODEL;
}
export function setNvidiaModel(model: string): void {
  const v = model.trim();
  if (v && v !== DEFAULT_MODEL) localStorage.setItem(MODEL_STORAGE, v);
  else localStorage.removeItem(MODEL_STORAGE);
}

// Kept for UI copy; the key itself lives server-side now.
export function llmConfigured(): boolean {
  return supabaseConfigured;
}

export type EstimateOptions = {
  model?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
};

export async function estimateMealCalories(
  description: string,
  opts: EstimateOptions = {},
): Promise<FoodItem[]> {
  const desc = description.trim();
  if (!desc) throw new Error('Descrição vazia');
  if (!supabase) throw new Error('Supabase não configurado');

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Faça login na aba Configurações antes de analisar refeições.');
  }

  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const res = await fetch(`${supabaseUrl}${FUNCTION_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: supabaseAnonKey,
      },
      body: JSON.stringify({
        description: desc,
        model: opts.model ?? getNvidiaModel(),
      }),
      signal: controller.signal,
    });

    const body = await res.json().catch(() => ({} as Record<string, unknown>));
    if (!res.ok) {
      const msg = typeof body?.error === 'string' ? body.error : `HTTP ${res.status}`;
      throw new Error(msg);
    }
    const items = (body as { items?: unknown }).items;
    if (!Array.isArray(items)) throw new Error('Resposta sem campo "items"');
    return items as FoodItem[];
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('Requisição cancelada ou timeout');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
