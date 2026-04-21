import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { Templates } from './pages/Templates';
import { TemplateEdit } from './pages/TemplateEdit';
import { Exercises } from './pages/Exercises';
import { ActiveWorkout } from './pages/ActiveWorkout';
import { History } from './pages/History';
import { Settings } from './pages/Settings';
import { ensureSeed } from './db/db';

export default function App() {
  useEffect(() => {
    ensureSeed().catch(console.error);
  }, []);

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/templates" element={<Templates />} />
        <Route path="/templates/:id" element={<TemplateEdit />} />
        <Route path="/exercises" element={<Exercises />} />
        <Route path="/workout/:id" element={<ActiveWorkout />} />
        <Route path="/history" element={<History />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
