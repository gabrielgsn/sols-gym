import { useId } from 'react';

type Props = {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  decimals?: number;
};

export function NumberStepper({
  label, value, onChange, step = 1, min = 0, max = 9999, suffix, decimals = 0,
}: Props) {
  const id = useId();
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  const fmt = (n: number) => (decimals > 0 ? n.toFixed(decimals) : String(n));

  return (
    <div className="flex flex-col gap-1 min-w-0">
      <label htmlFor={id} className="label flex items-baseline justify-between gap-1">
        <span>{label}</span>
        {suffix && <span className="normal-case text-[10px] text-slate-500 font-normal">{suffix}</span>}
      </label>
      <input
        id={id}
        inputMode={decimals > 0 ? 'decimal' : 'numeric'}
        className="input text-center text-2xl font-bold px-1 py-2 tabular-nums w-full"
        value={fmt(value)}
        onChange={(e) => {
          const n = Number(e.target.value.replace(',', '.'));
          if (!Number.isNaN(n)) onChange(clamp(n));
        }}
      />
      <div className="grid grid-cols-2 gap-1">
        <button
          type="button"
          aria-label={`Diminuir ${label}`}
          className="btn-ghost px-0 py-1 text-xl font-bold"
          onClick={() => onChange(clamp(Number((value - step).toFixed(decimals))))}
        >−</button>
        <button
          type="button"
          aria-label={`Aumentar ${label}`}
          className="btn-ghost px-0 py-1 text-xl font-bold"
          onClick={() => onChange(clamp(Number((value + step).toFixed(decimals))))}
        >+</button>
      </div>
    </div>
  );
}
