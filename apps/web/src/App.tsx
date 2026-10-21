import { Navigate, Route, Routes } from 'react-router-dom';
import { ReactNode } from 'react';
import { ErrorBoundary, Toasts } from './components/States';
import { Shell } from './components/Shell';
import { AssistantPage } from './pages/AssistantPage';
import { AuditPage } from './pages/AuditPage';
import { LoginPage } from './pages/LoginPage';
import { RolesPage } from './pages/RolesPage';
import { UserFormPage } from './pages/UserFormPage';
import { UsersPage } from './pages/UsersPage';
import { useSession } from './store/session';

function Protected({ children }: { children: ReactNode }) {
  const token = useSession((state) => state.accessToken);
  if (!token) return <Navigate to="/login" replace />;
  return <Shell>{children}</Shell>;
}

export function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/usuarios" element={<Protected><UsersPage /></Protected>} />
        <Route path="/usuarios/nuevo" element={<Protected><UserFormPage /></Protected>} />
        <Route path="/usuarios/:id" element={<Protected><UserFormPage /></Protected>} />
        <Route path="/roles" element={<Protected><RolesPage /></Protected>} />
        <Route path="/auditoria" element={<Protected><AuditPage /></Protected>} />
        <Route path="/asistente" element={<Protected><AssistantPage /></Protected>} />
        <Route path="*" element={<Navigate to="/usuarios" replace />} />
      </Routes>
      <Toasts />
    </ErrorBoundary>
  );
}
