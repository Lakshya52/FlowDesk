import React from "react";
import { HashRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import { useAuthStore } from "@/store/authStore";
import Navbar from "@/shared/components/Navbar";
import Footer from "@/shared/components/Footer";
import AppRouter from "./router";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

const AppInner: React.FC = () => {
  const location = useLocation();
  const { token, loadUser } = useAuthStore();
  const showNavbar = ["/", "/release", "/404"].includes(location.pathname);
  const showFooter = ["/", "/release", "/login", "/register"].includes(location.pathname);

  React.useEffect(() => {
    if (token) {
      loadUser();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    document.body.style.overflow = "";
  }, [location.pathname]);

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

  return (
    <>
      {showNavbar && <Navbar />}
      <AppRouter />
      {showFooter && <Footer />}
    </>
  );
};

const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <Toaster position="top-right" />
      <HashRouter>
        <AppInner />
      </HashRouter>
    </QueryClientProvider>
  );
};

export default App;
