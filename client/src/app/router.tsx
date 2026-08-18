import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from '@/layout/AppLayout';
import ProtectedRoute from './protected-route';

const LandingOrDashboard = lazy(() => import('@/features/landing/LandingOrDashboard'));
const LoginPage = lazy(() => import('@/features/auth/LoginPage'));
const RegisterPage = lazy(() => import('@/features/auth/RegisterPage'));
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage'));
const AssignmentsPage = lazy(() => import('@/features/assignments/AssignmentsPage'));
const AssignmentDetailPage = lazy(() => import('@/features/assignments/AssignmentDetailPage'));
const TasksPage = lazy(() => import('@/features/tasks/TasksPage'));
const BoardsPage = lazy(() => import('@/features/boards/BoardsPage'));
const CalendarPage = lazy(() => import('@/features/calendar/CalendarPage'));
const ReportsPage = lazy(() => import('@/features/reports/ReportsPage'));
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'));
const BackupPage = lazy(() => import('@/features/backup/BackupPage'));
const TeamsPage = lazy(() => import('@/features/teams/TeamsPage'));
const ClientsPage = lazy(() => import('@/features/clients/ClientsPage'));
const CanvasPage = lazy(() => import('@/features/canvas/CanvasPage'));
const BulkEmailPage = lazy(() => import('@/features/bulk-email/BulkEmailPage'));
const ChatsPage = lazy(() => import('@/features/chat/ChatsPage'));
const CrmPage = lazy(() => import('@/features/crm/CrmPage'));
const NotFoundPage = lazy(() => import('@/features/errors/NotFoundPage'));
const Releases = lazy(() => import('@/features/docs/Releases'));
const Documentation = lazy(() => import('@/features/docs/Documentation'));

const PageLoader = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-primary)]" />
  </div>
);

const AppRouter: React.FC = () => {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<LandingOrDashboard />} />
        <Route path="/release" element={<Releases />} />
        <Route path="/documentation/:slug?" element={<Documentation />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route element={<AppLayout />}>
          <Route path="/reports" element={<Navigate to="/reports/employee" replace />} />
          <Route path="/crm" element={<Navigate to="/crm/dashboard" replace />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/assignments" element={<AssignmentsPage />} />
            <Route path="/assignments/:id" element={<AssignmentDetailPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/tasks/:id" element={<TasksPage />} />
            <Route path="/boards" element={<BoardsPage />} />
            <Route path="/clients" element={<ClientsPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/reports/:reportType" element={<ReportsPage />} />
            <Route path="/teams" element={<TeamsPage />} />
            <Route path="/canvas" element={<CanvasPage />} />
            <Route path="/bulk-email" element={<BulkEmailPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/backup" element={<BackupPage />} />
            <Route path="/chat" element={<ChatsPage />} />
            <Route path="/crm/:section/:subsection" element={<CrmPage />} />
            <Route path="/crm/:section" element={<CrmPage />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
};

export default AppRouter;
