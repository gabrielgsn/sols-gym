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
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="label">{label}</label>
      <div className="flex items-stretch gap-2">
        <button
          type="button"
          aria-label={`Diminuir ${label}`}
          className="btn-ghost px-3 text-xl font-bold"
          onClick={() => onChange(clamp(Number((value - step).toFixed(decimals))))}
        >−</button>
        <input
          id={id}
          inputMode={decimals > 0 ? 'decimal' : 'numeric'}
          className="input text-center text-lg font-semibold flex-1"
          value={fmt(value)}
          onChange={(e) => {
            const n = Number(e.target.value.replace(',', '.'));
            if (!Number.isNaN(n)) onChange(clamp(n));
          }}
        />
        <button
          type="button"
          aria-label={`Aumentar ${label}`}
          className="btn-ghost px-3 text-xl font-bold"
          onClick={() => onChange(clamp(Number((value + step).toFixed(decimals))))}
        >+</button>
      </div>
      {suffix && <span className="text-xs text-slate-500">{suffix}</span>}
    </div>
  );
}
