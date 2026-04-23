// Supabase Edge Function — proxies NVIDIA's OpenAI-compatible chat endpoint so
// the browser never sees the NVIDIA API key (which does not allow browser CORS).
//
// Deploy:
//   supabase functions deploy estimate-calories
//   supabase secrets set NVIDIA_API_KEY=nvapi-...
//
// Invoke (from the app, authenticated user session):
//   POST /functions/v1/estimate-calories
//   body: { description: string, model?: string }
//   response: { items: FoodItem[] }
//
// Deno runtime; no npm imports.

type FoodItem = {
  name: string;
  kcal: number;
  protein?: number;
  carbs?: number;
  fat?: number;
};

const NVIDIA_BASE = 'https://integrate.api.nvidia.com/v1';
const DEFAULT_MODEL = 'moonshotai/kimi-k2-thinking';

const SYSTEM_PROMPT = `Você é um analista nutricional. Recebe descrição de refeição em português.
Retorna APENAS JSON válido, sem prosa, sem markdown, sem code fences.
Formato exato:
{ "items": [ { "name": "string descritivo com porção", "kcal": 500, "protein": 40, "carbs": 0, "fat": 30 } ] }

Regras:
- Estime kcal com base nas porções descritas. Se porção não informada, assuma porção típica para adulto.
- name deve incluir quantidade/porção sempre que possível (ex: "250g carne bovina", "2 ovos fritos").
- protein, carbs, fat em gramas, opcionais (omitir se não der pra estimar).
- Nunca adicione itens que não foram mencionados.
- Se a descrição não for de comida, retorne { "items": [] }.`;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
  });
}

function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fence) {
      try { return JSON.parse(fence[1]); } catch { /* fallthrough */ }
    }
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
  return items;
}

// Deno global — standard in Supabase Edge Functions runtime
declare const Deno: { env: { get(key: string): string | undefined } };

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const key = Deno.env.get('NVIDIA_API_KEY');
  if (!key) {
    return jsonResponse({ error: 'NVIDIA_API_KEY não configurada no servidor' }, 500);
  }

  let description = '';
  let model = DEFAULT_MODEL;
  try {
    const body = await req.json();
    description = typeof body?.description === 'string' ? body.description.trim() : '';
    if (typeof body?.model === 'string' && body.model.trim()) {
      model = body.model.trim();
    }
  } catch {
    return jsonResponse({ error: 'Body JSON inválido' }, 400);
  }
  if (!description) {
    return jsonResponse({ error: 'description obrigatório' }, 400);
  }

  let nvRes: Response;
  try {
    nvRes = await fetch(`${NVIDIA_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: description },
        ],
        temperature: 0.4,
        top_p: 0.9,
        max_tokens: 4096,
        stream: false,
      }),
    });
  } catch (e) {
    return jsonResponse({ error: `Upstream fetch falhou: ${e instanceof Error ? e.message : String(e)}` }, 502);
  }

  if (!nvRes.ok) {
    const text = await nvRes.text().catch(() => '');
    return jsonResponse(
      { error: `NVIDIA ${nvRes.status}: ${text.slice(0, 400) || nvRes.statusText}` },
      502,
    );
  }

  const data = await nvRes.json().catch(() => null);
  const content: string = data?.choices?.[0]?.message?.content ?? '';
  if (!content) {
    return jsonResponse({ error: 'Modelo retornou resposta vazia' }, 502);
  }

  try {
    const parsed = extractJson(content);
    const items = validateItems(parsed);
    return jsonResponse({ items });
  } catch (e) {
    return jsonResponse(
      { error: `Falha ao parsear resposta do modelo: ${e instanceof Error ? e.message : String(e)}`, raw: content.slice(0, 500) },
      502,
    );
  }
});
