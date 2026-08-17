import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import RouteGuard from "./route-guard";
import AppLayout from "@/layout/AppLayout";
import LandingOrDashboard from "@/features/landing/LandingOrDashboard";

import LoginPage from "@/features/auth/LoginPage";
import RegisterPage from "@/features/auth/RegisterPage";
import DashboardPage from "@/features/dashboard/DashboardPage";
import AssignmentsPage from "@/features/assignments/AssignmentsPage";
import AssignmentDetailPage from "@/features/assignments/AssignmentDetailPage";
import TasksPage from "@/features/tasks/TasksPage";
import BoardsPage from "@/features/boards/BoardsPage";
import CalendarPage from "@/features/calendar/CalendarPage";
import ReportsPage from "@/features/reports/ReportsPage";
import SettingsPage from "@/features/settings/SettingsPage";
import BackupPage from "@/features/backup/BackupPage";
import TeamsPage from "@/features/teams/TeamsPage";
import ClientsPage from "@/features/clients/ClientsPage";
import CanvasPage from "@/features/canvas/CanvasPage";
import BulkEmailPage from "@/features/bulk-email/BulkEmailPage";
import ChatsPage from "@/features/chat/ChatsPage";
import CrmPage from "@/features/crm/CrmPage";
import NotFoundPage from "@/features/errors/NotFoundPage";
import Releases from "@/features/docs/Releases";
import Documentation from "@/features/docs/Documentation";

const ProtectedNotFound: React.FC = () => {
  return <NotFoundPage />;
};

const AppRouter: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<LandingOrDashboard />} />
      <Route path="/release" element={<Releases />} />
      <Route path="/documentation/:slug?" element={<Documentation />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route element={<AppLayout />}>
        <Route path="/dashboard" element={<RouteGuard><DashboardPage /></RouteGuard>} />
        <Route path="/assignments" element={<RouteGuard><AssignmentsPage /></RouteGuard>} />
        <Route path="/assignments/:id" element={<RouteGuard><AssignmentDetailPage /></RouteGuard>} />
        <Route path="/tasks" element={<RouteGuard><TasksPage /></RouteGuard>} />
        <Route path="/tasks/:id" element={<RouteGuard><TasksPage /></RouteGuard>} />
        <Route path="/boards" element={<RouteGuard><BoardsPage /></RouteGuard>} />
        <Route path="/clients" element={<RouteGuard><ClientsPage /></RouteGuard>} />
        <Route path="/calendar" element={<RouteGuard><CalendarPage /></RouteGuard>} />
        <Route path="/reports" element={<Navigate to="/reports/employee" replace />} />
        <Route path="/reports/:reportType" element={<RouteGuard><ReportsPage /></RouteGuard>} />
        <Route path="/teams" element={<RouteGuard><TeamsPage /></RouteGuard>} />
        <Route path="/canvas" element={<RouteGuard><CanvasPage /></RouteGuard>} />
        <Route path="/bulk-email" element={<RouteGuard><BulkEmailPage /></RouteGuard>} />
        <Route path="/settings" element={<RouteGuard><SettingsPage /></RouteGuard>} />
        <Route path="/backup" element={<RouteGuard><BackupPage /></RouteGuard>} />
        <Route path="/chat" element={<RouteGuard><ChatsPage /></RouteGuard>} />
        <Route path="/crm" element={<Navigate to="/crm/dashboard" replace />} />
        <Route path="/crm/:section/:subsection" element={<RouteGuard><CrmPage /></RouteGuard>} />
        <Route path="/crm/:section" element={<RouteGuard><CrmPage /></RouteGuard>} />
      </Route>
      <Route path="*" element={<ProtectedNotFound />} />
    </Routes>
  );
};

export default AppRouter;
