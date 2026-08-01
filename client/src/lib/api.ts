import axios from 'axios';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
    // baseURL: 'http://localhost:5000/api',
    headers: { 'Content-Type': 'application/json' },
});

let refreshPromise: Promise<string | null> | null = null;

async function maybeRefreshToken(): Promise<string | null> {
    const token = localStorage.getItem('flowdesk_token');
    if (!token) return null;

    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const expiresInMs = payload.exp * 1000 - Date.now();
        if (expiresInMs > 86400000) return token;
    } catch {
        return token;
    }

    if (!refreshPromise) {
        refreshPromise = api.post('/auth/refresh')
            .then(({ data }) => {
                localStorage.setItem('flowdesk_token', data.token);
                return data.token;
            })
            .catch(() => null)
            .finally(() => { refreshPromise = null; });
    }

    return refreshPromise;
}

api.interceptors.request.use(async (config) => {
    const isRefreshCall = config.url?.includes('/auth/refresh');
    if (isRefreshCall) {
        const token = localStorage.getItem('flowdesk_token');
        if (token) config.headers.Authorization = `Bearer ${token}`;
        return config;
    }

    const token = await maybeRefreshToken();
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// api.interceptors.response.use(
//     (response) => response,
//     (error) => {
//         if (error.response?.status === 401) {
//             localStorage.removeItem('flowdesk_token');
//             localStorage.removeItem('flowdesk_user');
//             const currentPath = window.location.hash ? window.location.hash.replace('#', '') : window.location.pathname;
//             if (!currentPath.includes('/login')) {
//                 if (window.location.hash) {
//                     window.location.href = '/#/login';
//                 } else {
//                     window.location.href = '/login';
//                 }
//             }
//         }
//         return Promise.reject(error);
//     }
// );

api.interceptors.response.use(
    (response) => response,
    (error) => {
        const url = error.config?.url || '';
        const isImportRoute = url.includes('/import/');

        if (error.response?.status === 401 && !isImportRoute) {
            localStorage.removeItem('flowdesk_token');
            localStorage.removeItem('flowdesk_user');
            const currentPath = window.location.hash ? window.location.hash.replace('#', '') : window.location.pathname;
            if (!currentPath.includes('/login')) {
                if (window.location.hash) {
                    window.location.href = '/#/login';
                } else {
                    window.location.href = '/login';
                }
            }
        }
        return Promise.reject(error);
    }
);

export default api;
