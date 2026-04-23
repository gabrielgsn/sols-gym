import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { db, dbHelpers } from '../db/db';
import { MEAL_LABELS, type FoodEntry, type FoodItem, type MealLabel } from '../db/schema';
import { estimateMealCalories, hasNvidiaKey } from '../lib/llm';
import { todayYMD } from '../lib/analytics';

function fmtDayHuman(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  const today = todayYMD();
  const yest = (() => {
    const t = new Date();
    t.setDate(t.getDate() - 1);
    return todayYMD(t);
  })();
  if (ymd === today) return 'Hoje';
  if (ymd === yest) return 'Ontem';
  return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', weekday: 'short' });
}

export function Food() {
  const entries = useLiveQuery(
    () => db.foodEntries.filter((f) => !f.deletedAt).toArray(),
    [],
  );

  const today = todayYMD();

  const byDay = useMemo(() => {
    const m = new Map<string, FoodEntry[]>();
    for (const e of entries ?? []) {
      const arr = m.get(e.date) ?? [];
      arr.push(e);
      m.set(e.date, arr);
    }
    // sort each day's entries by createdAt desc
    for (const arr of m.values()) arr.sort((a, b) => b.createdAt - a.createdAt);
    return m;
  }, [entries]);

  const sortedDays = useMemo(
    () => Array.from(byDay.keys()).sort((a, b) => b.localeCompare(a)),
    [byDay],
  );

  const todayEntries = byDay.get(today) ?? [];
  const todayTotal = todayEntries.reduce((s, e) => s + e.totalKcal, 0);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Comida</h1>

      <TodayCard date={today} entries={todayEntries} total={todayTotal} />

      <MealLogger defaultDate={today} />

      <HistoryList days={sortedDays.filter((d) => d !== today)} byDay={byDay} />
    </div>
  );
}

// ---------- TODAY ----------

function TodayCard({
  date, entries, total,
}: { date: string; entries: FoodEntry[]; total: number }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = entries.find((e) => e.id === editingId) ?? null;

  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">Hoje</h2>
        <span className="text-xs text-slate-400">{fmtDayHuman(date)}</span>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold tabular-nums">{Math.round(total)}</span>
        <span className="text-sm text-slate-400">kcal</span>
      </div>

      {entries.length === 0 ? (
        <p className="text-xs text-slate-500">Nenhuma refeição registrada hoje.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((e) => (
            <li key={e.id}>
              <button
                onClick={() => setEditingId(e.id)}
                className="w-full text-left bg-slate-800/40 rounded-xl px-3 py-2 flex items-center gap-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-slate-400">
                    {e.mealLabel ?? 'refeição'} · {e.items.length} itens
                  </div>
                  <div className="text-sm truncate">{e.description}</div>
                </div>
                <span className="font-mono text-sm tabular-nums">{Math.round(e.totalKcal)}</span>
                <span className="text-slate-500">›</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing && <EntryEditor entry={editing} onClose={() => setEditingId(null)} />}
    </div>
  );
}

// ---------- MEAL LOGGER ----------

function MealLogger({ defaultDate }: { defaultDate: string }) {
  const [description, setDescription] = useState('');
  const [mealLabel, setMealLabel] = useState<MealLabel | ''>('');
  const [date, setDate] = useState(defaultDate);
  const [items, setItems] = useState<FoodItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  // Tick elapsed seconds while busy
  useEffect(() => {
    if (!busy) return;
    setElapsed(0);
    const start = Date.now();
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [busy]);

  async function analyze() {
    if (!description.trim()) return;
    if (!hasNvidiaKey()) {
      setError('Configure a chave NVIDIA em Configurações → LLM.');
      return;
    }
    setError(null);
    setItems(null);
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const result = await estimateMealCalories(description, { signal: ctrl.signal });
      setItems(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  function cancel() {
    abortRef.current?.abort();
  }

  async function save() {
    if (!items || items.length === 0) return;
    await dbHelpers.addFoodEntry({
      date,
      mealLabel: mealLabel || undefined,
      description: description.trim(),
      items,
    });
    setDescription('');
    setItems(null);
    setMealLabel('');
    setError(null);
  }

  function discard() {
    setItems(null);
    setError(null);
  }

  function updateItem(idx: number, patch: Partial<FoodItem>) {
    setItems((prev) => prev && prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function removeItem(idx: number) {
    setItems((prev) => prev && prev.filter((_, i) => i !== idx));
  }

  const total = items?.reduce((s, i) => s + (Number(i.kcal) || 0), 0) ?? 0;

  return (
    <div className="card flex flex-col gap-3">
      <h2 className="font-semibold">Logar refeição</h2>

      <div className="flex flex-col gap-1">
        <label className="label">Descrição</label>
        <textarea
          className="input min-h-[88px] resize-y"
          placeholder="ex: 250g carne bovina, 2 ovos fritos, 2 fatias queijo gouda"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={busy}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1 min-w-0">
          <label className="label">Refeição</label>
          <select
            className="input"
            value={mealLabel}
            onChange={(e) => setMealLabel(e.target.value as MealLabel | '')}
            disabled={busy}
          >
            <option value="">—</option>
            {MEAL_LABELS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1 min-w-0">
          <label className="label">Data</label>
          <input
            className="input w-full"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={busy}
          />
        </div>
      </div>

      {items == null && (
        busy ? (
          <div className="flex gap-2">
            <div className="flex-1 bg-slate-800/60 rounded-xl px-3 py-2 text-sm text-slate-300">
              Pensando… {elapsed}s
            </div>
            <button className="btn-ghost" onClick={cancel}>Cancelar</button>
          </div>
        ) : (
          <button
            className="btn-primary w-full"
            onClick={analyze}
            disabled={!description.trim()}
          >
            Analisar
          </button>
        )
      )}

      {error && <p className="text-xs text-rose-400 break-words">{error}</p>}

      {items && (
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold">Itens ({items.length})</span>
            <span className="font-mono text-sm tabular-nums">{Math.round(total)} kcal</span>
          </div>
          <ul className="flex flex-col gap-2">
            {items.map((it, i) => (
              <ItemEditor
                key={i}
                item={it}
                onChange={(patch) => updateItem(i, patch)}
                onRemove={() => removeItem(i)}
              />
            ))}
          </ul>
          <div className="flex gap-2">
            <button className="btn-primary flex-1" onClick={save} disabled={items.length === 0}>
              Salvar
            </button>
            <button className="btn-ghost" onClick={discard}>Descartar</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ItemEditor({
  item, onChange, onRemove,
}: { item: FoodItem; onChange: (p: Partial<FoodItem>) => void; onRemove: () => void }) {
  return (
    <li className="bg-slate-800/40 rounded-xl p-2 flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          className="input flex-1 text-sm"
          type="text"
          value={item.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
        <button className="btn-ghost text-xs px-2" onClick={onRemove} aria-label="Remover">
          ✕
        </button>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <NumField label="kcal" value={item.kcal} onChange={(n) => onChange({ kcal: n })} />
        <NumField label="P(g)" value={item.protein} onChange={(n) => onChange({ protein: n })} optional />
        <NumField label="C(g)" value={item.carbs} onChange={(n) => onChange({ carbs: n })} optional />
        <NumField label="G(g)" value={item.fat} onChange={(n) => onChange({ fat: n })} optional />
      </div>
    </li>
  );
}

function NumField({
  label, value, onChange, optional,
}: {
  label: string;
  value: number | undefined;
  onChange: (n: number | undefined) => void;
  optional?: boolean;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-slate-400">{label}</span>
      <input
        className="input text-sm px-2 py-1"
        type="number"
        inputMode="decimal"
        step="0.1"
        value={value ?? ''}
        onChange={(e) => {
          const v = e.target.value;
          if (v === '') {
            onChange(optional ? undefined : 0);
          } else {
            const n = parseFloat(v.replace(',', '.'));
            onChange(Number.isFinite(n) ? n : optional ? undefined : 0);
          }
        }}
      />
    </label>
  );
}

// ---------- ENTRY EDITOR (saved entry modal) ----------

function EntryEditor({ entry, onClose }: { entry: FoodEntry; onClose: () => void }) {
  const [items, setItems] = useState<FoodItem[]>(entry.items);
  const [mealLabel, setMealLabel] = useState<MealLabel | ''>(entry.mealLabel ?? '');
  const [date, setDate] = useState(entry.date);
  const [saving, setSaving] = useState(false);

  const total = items.reduce((s, i) => s + (Number(i.kcal) || 0), 0);

  async function persist() {
    setSaving(true);
    try {
      await dbHelpers.updateFoodEntry(entry.id, {
        items,
        mealLabel: mealLabel || undefined,
        date,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm('Deletar esta refeição?')) return;
    await dbHelpers.deleteFoodEntry(entry.id);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-slate-950/90 backdrop-blur z-50 flex flex-col">
      <header
        className="flex items-center justify-between px-4 pb-3 border-b border-slate-800"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
      >
        <div className="min-w-0 flex-1">
          <div className="font-bold truncate">Editar refeição</div>
          <div className="text-xs text-slate-400 truncate">{entry.description}</div>
        </div>
        <button className="btn-ghost" onClick={onClose}>Fechar</button>
      </header>

      <div
        className="flex-1 overflow-y-auto px-4 pt-4 flex flex-col gap-4 max-w-xl w-full mx-auto"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
      >
        <div className="card flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1 min-w-0">
              <label className="label">Refeição</label>
              <select
                className="input"
                value={mealLabel}
                onChange={(e) => setMealLabel(e.target.value as MealLabel | '')}
              >
                <option value="">—</option>
                {MEAL_LABELS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1 min-w-0">
              <label className="label">Data</label>
              <input
                className="input w-full"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-sm font-semibold">Total</span>
            <span className="font-mono text-sm tabular-nums">{Math.round(total)} kcal</span>
          </div>
        </div>

        <ul className="flex flex-col gap-2">
          {items.map((it, i) => (
            <ItemEditor
              key={i}
              item={it}
              onChange={(patch) => setItems((prev) => prev.map((x, j) => (j === i ? { ...x, ...patch } : x)))}
              onRemove={() => setItems((prev) => prev.filter((_, j) => j !== i))}
            />
          ))}
        </ul>

        <div className="flex gap-2">
          <button className="btn-primary flex-1" onClick={persist} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
          <button className="btn-danger" onClick={remove} disabled={saving}>
            Deletar
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- HISTORY ----------

function HistoryList({
  days, byDay,
}: { days: string[]; byDay: Map<string, FoodEntry[]> }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);

  const editingEntry = useMemo(() => {
    if (!editingId) return null;
    for (const arr of byDay.values()) {
      const found = arr.find((e) => e.id === editingId);
      if (found) return found;
    }
    return null;
  }, [editingId, byDay]);

  function toggle(day: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  }

  if (days.length === 0) {
    return (
      <div className="card">
        <p className="text-xs text-slate-500">Sem histórico ainda.</p>
      </div>
    );
  }

  // Show last 14 days max in UI
  const view = days.slice(0, 14);

  return (
    <div className="card flex flex-col gap-2">
      <h2 className="font-semibold">Histórico</h2>
      <ul className="flex flex-col gap-1">
        {view.map((day) => {
          const arr = byDay.get(day) ?? [];
          const total = arr.reduce((s, e) => s + e.totalKcal, 0);
          const isOpen = expanded.has(day);
          return (
            <li key={day} className="bg-slate-800/30 rounded-xl overflow-hidden">
              <button
                onClick={() => toggle(day)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left"
              >
                <span className="flex-1 text-sm">{fmtDayHuman(day)}</span>
                <span className="text-xs text-slate-500">{arr.length} ref.</span>
                <span className="font-mono text-sm tabular-nums w-16 text-right">
                  {Math.round(total)}
                </span>
                <span className="text-slate-500">{isOpen ? '▾' : '▸'}</span>
              </button>
              {isOpen && (
                <ul className="flex flex-col gap-1 px-3 pb-2">
                  {arr.map((e) => (
                    <li key={e.id}>
                      <button
                        onClick={() => setEditingId(e.id)}
                        className="w-full text-left bg-slate-900/60 rounded-lg px-3 py-1.5 flex items-center gap-2"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] uppercase tracking-wide text-slate-500">
                            {e.mealLabel ?? 'refeição'}
                          </div>
                          <div className="text-sm truncate">{e.description}</div>
                        </div>
                        <span className="font-mono text-xs tabular-nums">{Math.round(e.totalKcal)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      {editingEntry && <EntryEditor entry={editingEntry} onClose={() => setEditingId(null)} />}
    </div>
  );
}
