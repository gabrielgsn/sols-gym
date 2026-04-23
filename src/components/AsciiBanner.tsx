import { useEffect, useState } from 'react';

// Simple animated ASCII banner — SOLS GYM box + rep-counter bar that fills
// from 0 to TOTAL then resets. Uses <pre> monospace; no deps. Keep font-mono
// so box-drawing chars align. Colors follow the app's accent theme.

const BAR_WIDTH = 20;
const TOTAL = 10;
const TICK_MS = 500;

export function AsciiBanner() {
  const [rep, setRep] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setRep((r) => (r + 1) % (TOTAL + 1));
    }, TICK_MS);
    return () => clearInterval(t);
  }, []);

  const filled = Math.round((rep / TOTAL) * BAR_WIDTH);
  const bar = '█'.repeat(filled) + '░'.repeat(BAR_WIDTH - filled);
  const repLabel = `${String(rep).padStart(2, ' ')}/${TOTAL}`;

  // Box is 32 chars wide (30 inner). Each line below is exactly 32 chars.
  return (
    <pre
      className="text-accent font-mono leading-tight whitespace-pre select-none text-[11px] sm:text-xs"
      aria-hidden
    >
{`╔══════════════════════════════╗
║       S O L S    G Y M       ║
╚══════════════════════════════╝
 REP ▐${bar}▌ ${repLabel}`}
    </pre>
  );
}
