import type { FoodItem } from '../db/schema';

// NVIDIA's OpenAI-compatible endpoint. User pastes own API key in Settings;
// key persists in localStorage only (never in bundle, never synced).
const NVIDIA_BASE = 'https://integrate.api.nvidia.com/v1';
const DEFAULT_MODEL = 'moonshotai/kimi-k2-thinking';
const KEY_STORAGE = 'sols-gym.nvidia_api_key';
const MODEL_STORAGE = 'sols-gym.nvidia_model';
const DEFAULT_TIMEOUT_MS = 60_000;

export function getNvidiaKey(): string {
  return localStorage.getItem(KEY_STORAGE) ?? '';
}
export function setNvidiaKey(key: string): void {
  if (key.trim()) localStorage.setItem(KEY_STORAGE, key.trim());
  else localStorage.removeItem(KEY_STORAGE);
}

export function getNvidiaModel(): string {
  return localStorage.getItem(MODEL_STORAGE) ?? DEFAULT_MODEL;
}
export function setNvidiaModel(model: string): void {
  const v = model.trim();
  if (v && v !== DEFAULT_MODEL) localStorage.setItem(MODEL_STORAGE, v);
  else localStorage.removeItem(MODEL_STORAGE);
}

export function hasNvidiaKey(): boolean {
  return getNvidiaKey().length > 0;
}

// ---------- JSON extraction ----------

// Models sometimes wrap JSON in prose or code fences even when told not to.
// Try parse as-is, fallback to extracting the outermost {...} block.
function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Strip code fences like ```json ... ```
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fence) {
      try { return JSON.parse(fence[1]); } catch { /* fallthrough */ }
    }
    // Outermost {...} block
    const first = trimmed.indexOf('{');
    const last = trimmed.lastIndexOf('}');
    if (first >= 0 && last > first) {
      try { return JSON.parse(trimmed.slice(first, last + 1)); } catch { /* fallthrough */ }
    }
    throw new Error('Resposta do modelo não é JSON válido');
  }
}

function coerceNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function validateItems(parsed: unknown): FoodItem[] {
  if (!parsed || typeof parsed !== 'object') throw new Error('JSON sem objeto raiz');
  const root = parsed as Record<string, unknown>;
  const rawItems = Array.isArray(root.items) ? root.items : null;
  if (!rawItems) throw new Error('JSON sem campo "items"');
  const items: FoodItem[] = [];
  for (const r of rawItems) {
    if (!r || typeof r !== 'object') continue;
    const row = r as Record<string, unknown>;
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    const kcal = coerceNumber(row.kcal);
    if (!name || kcal == null) continue;
    const item: FoodItem = { name, kcal: Math.round(kcal) };
    const p = coerceNumber(row.protein);
    const c = coerceNumber(row.carbs);
    const f = coerceNumber(row.fat);
    if (p != null) item.protein = Math.round(p * 10) / 10;
    if (c != null) item.carbs = Math.round(c * 10) / 10;
    if (f != null) item.fat = Math.round(f * 10) / 10;
    items.push(item);
  }
  if (items.length === 0) throw new Error('Nenhum item válido retornado');
  return items;
}

// ---------- Streaming request ----------

const SYSTEM_PROMPT = `Você é um analista nutricional. Recebe descrição de refeição em português.
Retorna APENAS JSON válido, sem prosa, sem markdown, sem code fences.
Formato exato:
{ "items": [ { "name": "string descritivo com porção", "kcal": 500, "protein": 40, "carbs": 0, "fat": 30 } ] }

Regras:
- Estime kcal com base nas porções descritas. Se porção não informada, assuma porção típica para adulto.
- name deve incluir quantidade/porção sempre que possível (ex: "250g carne bovina", "2 ovos fritos").
- protein, carbs, fat em gramas, opcionais (ometer se não der pra estimar).
- Nunca adicione itens que não foram mencionados.
- Se a descrição não for de comida, retorne { "items": [] }.`;

export type ChatOptions = {
  model?: string;
  signal?: AbortSignal;
  onProgress?: (partial: string) => void;
};

// Calls NVIDIA chat completions via OpenAI-compatible SSE stream.
// Returns concatenated assistant `content` (reasoning_content stripped).
async function streamChat(userMessage: string, opts: ChatOptions = {}): Promise<string> {
  const key = getNvidiaKey();
  if (!key) throw new Error('Chave NVIDIA não configurada. Abra Configurações → LLM.');

  const model = opts.model ?? getNvidiaModel();

  const res = await fetch(`${NVIDIA_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.4,
      top_p: 0.9,
      max_tokens: 4096,
      stream: true,
    }),
    signal: opts.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`NVIDIA ${res.status}: ${text.slice(0, 300) || res.statusText}`);
  }
  if (!res.body) throw new Error('Resposta sem body');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Parse SSE lines: "data: {...}\n"
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line || !line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const chunk = JSON.parse(payload);
        const delta = chunk?.choices?.[0]?.delta;
        if (delta?.content) {
          content += delta.content;
          opts.onProgress?.(content);
        }
        // Ignore delta.reasoning_content — it's chain-of-thought, not JSON output.
      } catch {
        // skip malformed chunk
      }
    }
  }

  return content;
}

// ---------- Public API ----------

export type EstimateOptions = {
  model?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  onProgress?: (partial: string) => void;
};

export async function estimateMealCalories(
  description: string,
  opts: EstimateOptions = {},
): Promise<FoodItem[]> {
  const desc = description.trim();
  if (!desc) throw new Error('Descrição vazia');

  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  // Compose external + internal abort
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const raw = await streamChat(desc, {
      model: opts.model,
      signal: controller.signal,
      onProgress: opts.onProgress,
    });
    const parsed = extractJson(raw);
    return validateItems(parsed);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('Requisição cancelada ou timeout');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
