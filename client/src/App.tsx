import React from "react";
// import React, { useState, useEffect } from "react";
import { HashRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import { getFirstAllowedRoute, navItems } from "./components/layout/Sidebar";
import { useAuthStore } from "./store/authStore";
// import { WifiOff } from "lucide-react";
// import axios from 'axios';
// import api from "./lib/api";
import AppLayout from "./components/layout/AppLayout";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import DashboardPage from "./pages/DashboardPage";
import AssignmentsPage from "./pages/AssignmentsPage";
import AssignmentDetailPage from "./pages/AssignmentDetailPage";
import TasksPage from "./pages/TasksPage";
import CalendarPage from "./pages/CalendarPage";
import ReportsPage from "./pages/ReportsPage";
import SettingsPage from "./pages/SettingsPage";
import TeamsPage from "./pages/TeamsPage";
import ClientsPage from "./pages/ClientsPage";
import CanvasPage from "./pages/CanvasPage";
import BulkEmailPage from "./pages/BulkEmailPage";
import ChatsPage from "./pages/ChatsPage";


const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

import LandingPageNew from "./pages/LandingPageNew";
// import LandingPage from "./pages/LandingPage";
import NotFoundPage from "./pages/NotFoundPage";
import Navbar from "./components/common/Navbar";
import Footer from "./components/common/Footer";
import Release from "./pages/Releases";
import Documentation from "./pages/Documentation";
import CrmPage from "./pages/CrmPage";
// import Buddy from "./components/common/Buddy";

// const OfflineBanner: React.FC = () => {
//   const [isOffline, setIsOffline] = useState(!navigator.onLine);

//   useEffect(() => {
//     const goOffline = () => setIsOffline(true);
//     const goOnline = () => setIsOffline(false);
//     window.addEventListener("offline", goOffline);
//     window.addEventListener("online", goOnline);
//     return () => {
//       window.removeEventListener("offline", goOffline);
//       window.removeEventListener("online", goOnline);
//     };
//   }, []);

//   if (!isOffline) return null;

//   return (
//     <div
//       style={{
//         position: "fixed",
//         top: 0,
//         left: 0,
//         right: 0,
//         zIndex: 99999,
//         display: "flex",
//         justifyContent: "center",
//         padding: "12px 16px",
//         pointerEvents: "none",
//         animation: "slideDown 0.35s ease-out",
//       }}
//     >
//       <div
//         style={{
//           display: "flex",
//           alignItems: "center",
//           gap: 10,
//           padding: "12px 24px",
//           borderRadius: 12,
//           background: "linear-gradient(135deg, #1e293b, #0f172a)",
//           color: "#f8fafc",
//           fontSize: "0.875rem",
//           fontWeight: 600,
//           boxShadow:
//             "0 8px 32px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.05)",
//           backdropFilter: "blur(12px)",
//           pointerEvents: "auto",
//         }}
//       >
//         <WifiOff size={18} style={{ color: "#f87171", flexShrink: 0 }} />
//         <span>Internet Connection Required</span>
//       </div>
//       <style>{`
//         @keyframes slideDown {
//           from { opacity: 0; transform: translateY(-20px); }
//           to   { opacity: 1; transform: translateY(0); }
//         }
//       `}</style>
//     </div>
//   );
// };

const App: React.FC = () => {
  // const [isBackendReady, setIsBackendReady] = useState<boolean | null>(null);

  // useEffect(() => {
  //   const checkBackend = async () => {
  //     try {
  //       await api.get("/health");
  //       setIsBackendReady(true);
  //     } catch (error) {
  //       console.error("Backend health check failed:", error);
  //       setIsBackendReady(false);
  //     }
  //   };

  //   checkBackend();
  // }, []);

  // if (isBackendReady === null) {
  //   return (
  //     <div className="min-h-screen  flex flex-col items-center justify-center font-outfit">
  //       <div className="relative">
  //         <div className="absolute bottom-5 left-1/2 -translate-x-1/2 w-16 h-16 border-4 border-[#3b82f6]/10 border-t-[#3b82f6] rounded-full animate-spin"></div>
  //         {/* <div className="absolute inset-0 w-16 h-16 border-4 border-transparent rounded-full animate-pulse"></div> */}
  //       </div>
  //       <br />
  //       <p className="mt-6 text-slate-500 font-medium animate-pulse tracking-wide uppercase text-sm">
  //         Establishing Server Connection
  //       </p>
  //     </div>
  //   );
  // }

  // if (isBackendReady === false) {
  //   return (
  //     <div
  //       className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center font-outfit "
  //       style={{ padding: "20px" }}
  //     >
  //       <div
  //         className="p-8 flex flex-col items-center justify-center gap-5  rounded-3xl bg-white border border-slate-200 shadow-xl max-w-md w-full relative overflow-hidden"
  //         style={{ padding: "30px" }}
  //       >
  //         <div className="absolute -top-24 -right-24 w-48 h-48 bg-[#ef4444]/5 rounded-full blur-3xl"></div>

  //         <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-red-100">
  //           <svg
  //             className="w-8 h-8 text-red-500"
  //             fill="none"
  //             stroke="currentColor"
  //             viewBox="0 0 24 24"
  //           >
  //             <path
  //               strokeLinecap="round"
  //               strokeLinejoin="round"
  //               strokeWidth="2"
  //               d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
  //             />
  //           </svg>
  //         </div>

  //         <h2 className="text-2xl font-bold text-slate-900 mb-2">
  //           Server Connection Failed
  //         </h2>
  //         <p className="text-slate-500 mb-8 leading-relaxed">
  //           We couldn't connect to FlowDesk services. This might be due to a
  //           temporary outage or network issues.
  //         </p>

  //         <button
  //           onClick={() => window.location.reload()}
  //           className="w-full py-4 cursor-pointer bg-linear-to-r from-[#3b82f6] to-[#8b5cf6] text-white font-semibold rounded-2xl transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(59,130,246,0.3)] active:scale-[0.98]"
  //           style={{ width: "100%", height: "50px" }}
  //         >
  //           Retry Connection
  //         </button>
  //       </div>
  //     </div>
  //   );
  // }

  return (
    <QueryClientProvider client={queryClient}>
      {/* <OfflineBanner /> */}
      <Toaster position="top-right" />
      <HashRouter>
        <AppInner />
      </HashRouter>
    </QueryClientProvider>
  );
};

const LandingOrDashboard: React.FC = () => {
    const { user } = useAuthStore();
    if (user) return <Navigate to="/dashboard" replace />;
    return <LandingPageNew />;
};


// ADD:
const RouteGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user } = useAuthStore();
    const location = useLocation();

    if (!user) return <Navigate to="/login" replace />;
    if (user.role === 'admin') return <>{children}</>;

    const allowed = user.permissions?.allowedTabs ?? [];
    // Match the parent tab (handles /reports/:reportType, /assignments/:id, etc.)
    const currentTopLevel = '/' + location.pathname.split('/')[1];
    const isExactOrParentMatch = allowed.includes(currentTopLevel) || allowed.includes(location.pathname);

    // Also check if the path is a subItem of an already-allowed parent (e.g. /tasks under /assignments)
    const isSubItemOfAllowedParent = !isExactOrParentMatch && navItems.some(item =>
        !item.break && allowed.includes(item.to) && item.subItems?.some(sub => sub.to === location.pathname)
    );

    if (!isExactOrParentMatch && !isSubItemOfAllowedParent) {
        return <Navigate to={getFirstAllowedRoute(user)} replace />;
    }

    return <>{children}</>;
};

const AppInner: React.FC = () => {
  const location = useLocation();
  const showNavbar = ["/", "/release", "/404"].includes(location.pathname);
  const showFooter = ["/", "/release", "/login", "/register"].includes(location.pathname);

  // Safety net: reset body overflow on route change in case a modal leaked it
  React.useEffect(() => {
    document.body.style.overflow = "";
  }, [location.pathname]);

  // Periodic safety net: reset overflow every 2 seconds if no modal is open
  React.useEffect(() => {
    const interval = setInterval(() => {
      const anyModalOpen = document.querySelector('[role="dialog"]') ||
        document.querySelector('.fixed[class*="z-"]');
      if (!anyModalOpen && document.body.style.overflow === "hidden") {
        document.body.style.overflow = "";
      }
    }, 2000);
    return () => clearInterval(interval);
  }, []);
  // const showFooter = location.pathname !== "/documentation" && !location.pathname.startsWith("/documentation/"); 

  return (
    <>
      {showNavbar && <Navbar />}
      <Routes>
        <Route path="/" element={<LandingOrDashboard  />} />
        <Route path="/release" element={<Release />} />
        <Route path="/documentation/:slug?" element={<Documentation />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<RouteGuard><DashboardPage /></RouteGuard>} />
          <Route path="/assignments" element={<RouteGuard><AssignmentsPage /></RouteGuard>} />
          <Route path="/assignments/:id" element={<RouteGuard><AssignmentDetailPage /></RouteGuard>} />
          <Route path="/tasks" element={<RouteGuard><TasksPage /></RouteGuard>} />
          <Route path="/clients" element={<RouteGuard><ClientsPage /></RouteGuard>} />
          <Route path="/calendar" element={<RouteGuard><CalendarPage /></RouteGuard>} />
          <Route
            path="/reports"
            element={<Navigate to="/reports/employee" replace />}
          />
          <Route path="/reports/:reportType" element={<RouteGuard><ReportsPage /></RouteGuard>} />
          {/* this following feature is discontinued - it is a common files sharing page in which user can able to share the files to each other in the application */}
          {/* <Route path="/files" element={<RouteGuard><FilesPage /></RouteGuard>} /> */} 
          <Route path="/teams" element={<RouteGuard><TeamsPage /></RouteGuard>} />
          <Route path="/canvas" element={<RouteGuard><CanvasPage /></RouteGuard>} />
          <Route path="/bulk-email" element={<RouteGuard><BulkEmailPage /></RouteGuard>} />
          <Route path="/settings" element={<RouteGuard><SettingsPage /></RouteGuard>} />
          <Route path="/chat" element={<RouteGuard><ChatsPage /></RouteGuard>} />
          <Route
            path="/crm"
            element={<Navigate to="/crm/dashboard" replace />}
          />
          <Route path="/crm/:section/:subsection" element={<RouteGuard><CrmPage /></RouteGuard>} />
          <Route path="/crm/:section" element={<RouteGuard><CrmPage /></RouteGuard>} />
        </Route>
        <Route path="*" element={<ProtectedNotFound />} />
      </Routes>
      {showFooter && <Footer />}
    </>
  );
};

// Simple helper to decide if we show 404 inside layout or full screen
const ProtectedNotFound: React.FC = () => {
  return <NotFoundPage />;
};

export default App;
