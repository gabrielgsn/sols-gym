import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { Templates } from './pages/Templates';
import { TemplateEdit } from './pages/TemplateEdit';
import { Exercises } from './pages/Exercises';
import { ActiveWorkout } from './pages/ActiveWorkout';
import { History } from './pages/History';
import { Progress } from './pages/Progress';
import { Food } from './pages/Food';
import { Settings } from './pages/Settings';
import { ensureSeed } from './db/db';
import { useAuth } from './hooks/useAuth';
import { syncNow } from './lib/sync';

export default function App() {
  const { user } = useAuth();

  useEffect(() => {
    ensureSeed().catch(console.error);
  }, []);

  // Trigger sync on login, on focus, and every 5 minutes while logged in.
  useEffect(() => {
    if (!user) return;
    syncNow();
    const onFocus = () => syncNow();
    window.addEventListener('focus', onFocus);
    const iv = setInterval(() => syncNow(), 5 * 60 * 1000);
    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(iv);
    };
  }, [user]);

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/templates" element={<Templates />} />
        <Route path="/templates/:id" element={<TemplateEdit />} />
        <Route path="/exercises" element={<Exercises />} />
        <Route path="/workout/:id" element={<ActiveWorkout />} />
        <Route path="/history" element={<History />} />
        <Route path="/progress" element={<Progress />} />
        <Route path="/food" element={<Food />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
