import { useRef, useState } from 'react';
import { dbHelpers } from '../db/db';

export function Settings() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function onExport() {
    const json = await dbHelpers.exportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sols-gym-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus('Backup exportado.');
  }

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm('Importar vai SUBSTITUIR todos os dados atuais. Continuar?')) {
      e.target.value = '';
      return;
    }
    try {
      const text = await file.text();
      await dbHelpers.importJSON(text);
      setStatus('Backup importado com sucesso.');
    } catch (err) {
      setStatus(`Erro ao importar: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      e.target.value = '';
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Configurações</h1>

      <section className="card flex flex-col gap-3">
        <h2 className="font-semibold">Backup</h2>
        <p className="text-sm text-slate-400">
          Dados ficam só neste dispositivo. Exporte um JSON pra não perder.
        </p>
        <div className="flex gap-2">
          <button className="btn-primary flex-1" onClick={onExport}>
            Exportar JSON
          </button>
          <button className="btn-ghost flex-1" onClick={() => fileRef.current?.click()}>
            Importar JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={onImport}
          />
        </div>
        {status && <p className="text-xs text-slate-400">{status}</p>}
      </section>

      <section className="card flex flex-col gap-1 text-xs text-slate-400">
        <div>Sols Gym v0.1.0 · PWA local-first</div>
        <div>Dados armazenados no IndexedDB deste navegador/dispositivo.</div>
      </section>
    </div>
  );
}
