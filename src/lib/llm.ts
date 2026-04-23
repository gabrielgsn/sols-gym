import type { FoodItem } from '../db/schema';
import { supabase, supabaseAnonKey, supabaseConfigured, supabaseUrl } from './supabase';

// Calls a Supabase Edge Function that proxies NVIDIA's chat endpoint.
// Rationale: NVIDIA does not allow browser CORS, and we never want the
// NVIDIA API key in the bundle. The function holds NVIDIA_API_KEY as a
// server-side secret and requires a logged-in Supabase user (JWT verify).

const DEFAULT_MODEL = 'google/gemma-3n-e4b-it';
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

  let { data: { session } } = await supabase.auth.getSession();
  // Force refresh if token is near expiry (<60s) — avoids stale-JWT 401.
  const exp = session?.expires_at ?? 0;
  const nowSec = Math.floor(Date.now() / 1000);
  if (session && exp && exp - nowSec < 60) {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) throw new Error(`Sessão expirada. Saia e entre de novo. (${error.message})`);
    session = data.session;
  }
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

    const rawText = await res.text();
    let body: Record<string, unknown> = {};
    try { body = rawText ? JSON.parse(rawText) : {}; } catch { /* keep empty */ }
    if (!res.ok) {
      const err =
        (typeof body?.error === 'string' && body.error) ||
        (typeof body?.message === 'string' && body.message) ||
        rawText.slice(0, 200) ||
        `HTTP ${res.status}`;
      throw new Error(`HTTP ${res.status}: ${err}`);
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
