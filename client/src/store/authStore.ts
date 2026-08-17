import { create } from 'zustand';
import api from '@/lib/api';

interface Tenant {
    _id: string;
    name: string;
    plan: 'free' | 'starter' | 'pro' | 'enterprise';
}

interface User {
    _id: string;
    name: string;
    email: string;
    role: string;
    avatar?: string;
    isActive: boolean;
    tenantId: string | Tenant;
    permissions: {
        allowedTabs: string[];
    };
    employeeId: string;
}

interface AuthState {
    user: User | null;
    token: string | null;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<User>;
    register: (data: { name: string; email: string; password: string; companyName: string; website?: string; phone?: string; industry?: string }) => Promise<void>;
    verifyRegistrationOtp: (email: string, otp: string) => Promise<void>;
    resendRegistrationOtp: (email: string) => Promise<void>;
    logout: () => void;
    loadUser: () => Promise<void>;
    forgotPassword: (email: string) => Promise<void>;
    verifyForgotPasswordOtp: (email: string, otp: string) => Promise<void>;
    changePassword: (newPassword: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
    user: JSON.parse(localStorage.getItem('flowdesk_user') || 'null'),
    token: localStorage.getItem('flowdesk_token'),
    isLoading: false,

    login: async (email: string, password: string) => {
        set({ isLoading: true });
        try {
            const { data } = await api.post('/auth/login', { email, password });
            localStorage.setItem('flowdesk_token', data.token);
            localStorage.setItem('flowdesk_user', JSON.stringify(data.user));
            set({ user: data.user, token: data.token, isLoading: false });
            return data.user;
        } catch (error: any) {
            set({ isLoading: false });
            throw new Error(error.response?.data?.message || 'Login failed');
        }
    },

    register: async (data: { name: string; email: string; password: string; companyName: string; website?: string; phone?: string; industry?: string }) => {
        set({ isLoading: true });
        try {
            const response = await api.post('/auth/register', data);
            set({ isLoading: false });
            return response.data;
        } catch (error: any) {
            set({ isLoading: false });
            throw new Error(error.response?.data?.message || 'Registration failed');
        }
    },

    verifyRegistrationOtp: async (email: string, otp: string) => {
        set({ isLoading: true });
        try {
            const { data } = await api.post('/auth/verify-registration-otp', { email, otp });
            localStorage.setItem('flowdesk_token', data.token);
            localStorage.setItem('flowdesk_user', JSON.stringify(data.user));
            if (data.tenant) {
                localStorage.setItem('flowdesk_tenant', JSON.stringify(data.tenant));
            }
            set({ user: data.user, token: data.token, isLoading: false });
            
            // const { data } = await api.post('/auth/verify-registration-otp', { email, otp });
            // localStorage.setItem('flowdesk_token', data.token);
            // localStorage.setItem('flowdesk_user', JSON.stringify(data.user));
            // set({ user: data.user, token: data.token, isLoading: false });
        } catch (error: any) {
            set({ isLoading: false });
            throw new Error(error.response?.data?.message || 'Verification failed');
        }
    },

    resendRegistrationOtp: async (email: string) => {
        try {
            const { data } = await api.post('/auth/resend-registration-otp', { email });
            return data;
        } catch (error: any) {
            throw new Error(error.response?.data?.message || 'Failed to resend OTP');
        }
    },

    logout: () => {
        localStorage.removeItem('flowdesk_token');
        localStorage.removeItem('flowdesk_user');
        set({ user: null, token: null });
    },

    loadUser: async () => {
        try {
            const { data } = await api.get('/auth/me');
            localStorage.setItem('flowdesk_user', JSON.stringify(data.user));
            set({ user: data.user });
        } catch {
            localStorage.removeItem('flowdesk_token');
            localStorage.removeItem('flowdesk_user');
            set({ user: null, token: null });
        }
    },

    forgotPassword: async (email: string) => {
        set({ isLoading: true });
        try {
            await api.post('/auth/forgot-password', { email });
            set({ isLoading: false });
        } catch (error: any) {
            set({ isLoading: false });
            throw new Error(error.response?.data?.message || 'Failed to send OTP');
        }
    },

    verifyForgotPasswordOtp: async (email: string, otp: string) => {
        set({ isLoading: true });
        try {
            const { data } = await api.post('/auth/verify-forgot-password-otp', { email, otp });
            localStorage.setItem('flowdesk_token', data.token);
            localStorage.setItem('flowdesk_user', JSON.stringify(data.user));
            set({ user: data.user, token: data.token, isLoading: false });
        } catch (error: any) {
            set({ isLoading: false });
            throw new Error(error.response?.data?.message || 'Failed to verify OTP');
        }
    },

    changePassword: async (newPassword: string) => {
        set({ isLoading: true });
        try {
            await api.put('/auth/change-password', { newPassword });
            set({ isLoading: false });
        } catch (error: any) {
            set({ isLoading: false });
            throw new Error(error.response?.data?.message || 'Failed to change password');
        }
    },
}));
