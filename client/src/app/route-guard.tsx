import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { getFirstAllowedRoute, navItems } from "@/layout/Sidebar";
import { useAuthStore } from "@/store/authStore";

const RouteGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuthStore();
  const location = useLocation();

  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'admin') return <>{children}</>;

  const allowed = user.permissions?.allowedTabs ?? [];

  const currentTopLevel = '/' + location.pathname.split('/')[1];
  const isExactOrParentMatch = allowed.includes(currentTopLevel) || allowed.includes(location.pathname);

  const isSubItemOfAllowedParent = !isExactOrParentMatch && navItems.some(item =>
      !item.break && item.subItems?.some(sub =>
          allowed.includes(sub.to) &&
          (sub.to === location.pathname || location.pathname.startsWith(sub.to + '/'))
      )
  );

  if (!isExactOrParentMatch && !isSubItemOfAllowedParent) {
      console.log('[RouteGuard] BLOCKED — redirecting to', getFirstAllowedRoute(user));
      return <Navigate to={getFirstAllowedRoute(user)} replace />;
  }

  return <>{children}</>;
};

export default RouteGuard;
