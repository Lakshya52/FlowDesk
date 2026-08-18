import React, { useMemo } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { getFirstAllowedRoute, navItems } from '@/shared/navigation';
import { useAuthStore } from '@/store/authStore';
import { isRouteAllowed } from '@/shared/utils';

const ProtectedRoute: React.FC = () => {
  const { user } = useAuthStore();
  const location = useLocation();

  const isAllowed = useMemo(() => {
    if (!user) return false;
    if (user.role === 'admin') return true;

    const allowed = user.permissions?.allowedTabs ?? [];

    if (isRouteAllowed(location.pathname, allowed)) return true;

    return navItems.some(
      (item) =>
        !item.break &&
        item.subItems?.some(
          (sub) =>
            allowed.includes(sub.to) &&
            (sub.to === location.pathname ||
              location.pathname.startsWith(sub.to + '/')),
        ),
    );
  }, [user, location.pathname]);

  if (!user) return <Navigate to="/login" replace />;
  if (!isAllowed) return <Navigate to={getFirstAllowedRoute(user as any)} replace />;

  return <Outlet />;
};

export default ProtectedRoute;
