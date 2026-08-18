import React from 'react';
import { HashRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { PUBLIC_ROUTES, FOOTER_ROUTES } from '@/shared/constants';
import Navbar from '@/shared/components/Navbar';
import Footer from '@/shared/components/Footer';
import AppRouter from './router';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

const AppInner: React.FC = () => {
  const location = useLocation();
  const { loadUser } = useAuthStore();

  // loadUser is stable (zustand action) — safe to omit from deps
  React.useEffect(() => {
    loadUser();
  }, [loadUser]);

  React.useEffect(() => {
    document.body.style.overflow = '';
  }, [location.pathname]);

  const showNavbar = (PUBLIC_ROUTES as readonly string[]).includes(location.pathname);
  const showFooter = (FOOTER_ROUTES as readonly string[]).includes(location.pathname);

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
