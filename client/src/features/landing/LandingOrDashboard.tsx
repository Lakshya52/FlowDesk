import React from "react";
import { Navigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import LandingPageNew from "./LandingPageNew";

const LandingOrDashboard: React.FC = () => {
    const { user } = useAuthStore();
    if (user) return <Navigate to="/dashboard" replace />;
    return <LandingPageNew />;
};

export default LandingOrDashboard;
