import { useEffect, useRef, useState } from 'react';
import { dbHelpers } from '../db/db';
import { sendMagicLink, signOut, useAuth } from '../hooks/useAuth';
import { onSyncStatus, resetSyncCursors, syncNow, type SyncStatus } from '../lib/sync';

function fmtDate(ts?: number) {
  if (!ts) return 'nunca';
  return new Date(ts).toLocaleString('pt-BR');
}

export function Settings() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [ioStatus, setIoStatus] = useState<string | null>(null);
  const { user, ready, configured } = useAuth();
  const [email, setEmail] = useState('');
  const [authMsg, setAuthMsg] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [sync, setSync] = useState<SyncStatus>({ state: 'idle' });

  useEffect(() => onSyncStatus(setSync), []);

  useEffect(() => {
    if (user) syncNow();
  }, [user]);

  async function onExport() {
    const json = await dbHelpers.exportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sols-gym-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setIoStatus('Backup exportado.');
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
      resetSyncCursors();
      setIoStatus('Backup importado. Próximo sync vai enviar tudo.');
    } catch (err) {
      setIoStatus(`Erro: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      e.target.value = '';
    }
  }

  async function onMagicLink() {
    if (!email.trim()) return;
    setAuthBusy(true);
    setAuthMsg(null);
    try {
      await sendMagicLink(email.trim(), window.location.origin);
      setAuthMsg(`Link enviado pra ${email}. Abra seu email.`);
    } catch (e) {
      setAuthMsg(`Erro: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setAuthBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Configurações</h1>

      {configured && (
        <section className="card flex flex-col gap-3">
          <h2 className="font-semibold">Sincronização na nuvem</h2>

          {!ready && <p className="text-sm text-slate-400">Carregando sessão…</p>}

          {ready && !user && (
            <>
              <p className="text-sm text-slate-400">
                Entre com email pra sincronizar entre celular e PC. Sem senha — link mágico.
              </p>
              <div className="flex gap-2">
                <input
                  className="input flex-1"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={authBusy}
                />
                <button className="btn-primary" onClick={onMagicLink} disabled={authBusy || !email.trim()}>
                  {authBusy ? '...' : 'Enviar link'}
                </button>
              </div>
              {authMsg && <p className="text-xs text-slate-400">{authMsg}</p>}
            </>
          )}

          {ready && user && (
            <>
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-xs text-slate-400">Logado como</div>
                  <div className="text-sm truncate">{user.email}</div>
                </div>
                <button className="btn-ghost text-sm" onClick={() => signOut()}>Sair</button>
              </div>

              <div className="flex gap-2">
                <button
                  className="btn-primary flex-1"
                  onClick={() => syncNow()}
                  disabled={sync.state === 'running'}
                >
                  {sync.state === 'running' ? `Sync: ${sync.step}` : 'Sincronizar agora'}
                </button>
              </div>

              <SyncBadge status={sync} />
            </>
          )}
        </section>
      )}

      {!configured && (
        <section className="card text-sm text-slate-400">
          Sync em nuvem não configurado. Defina <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>.
        </section>
      )}

      <section className="card flex flex-col gap-3">
        <h2 className="font-semibold">Backup local (JSON)</h2>
        <p className="text-sm text-slate-400">
          Export/import manual. Serve de seguro extra mesmo com sync na nuvem ativo.
        </p>
        <div className="flex gap-2">
          <button className="btn-primary flex-1" onClick={onExport}>Exportar JSON</button>
          <button className="btn-ghost flex-1" onClick={() => fileRef.current?.click()}>Importar JSON</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={onImport}
          />
        </div>
        {ioStatus && <p className="text-xs text-slate-400">{ioStatus}</p>}
      </section>

      <section className="card flex flex-col gap-1 text-xs text-slate-400">
        <div>Sols Gym v0.2.0 · PWA local-first + Supabase sync</div>
        <div>Dados no IndexedDB deste dispositivo + espelhados na nuvem quando logado.</div>
      </section>
    </div>
  );
}

function SyncBadge({ status }: { status: SyncStatus }) {
  if (status.state === 'idle') {
    return <p className="text-xs text-slate-500">Pronto pra sincronizar.</p>;
  }
  if (status.state === 'running') {
    return <p className="text-xs text-amber-400">● {status.step}</p>;
  }
  if (status.state === 'ok') {
    return (
      <p className="text-xs text-emerald-400">
        ✓ Sincronizado {fmtDate(status.at)} · ↑ {status.pushed} · ↓ {status.pulled}
      </p>
    );
  }
  return <p className="text-xs text-red-400">⚠ {status.message}</p>;
}
