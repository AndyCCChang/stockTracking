import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { login as loginRequest, register as registerRequest, setAuthToken, setUnauthorizedHandler, type AuthUser, type LoginPayload, type RegisterPayload } from '../lib/api';

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  authNotice: string | null;
  login: (payload: LoginPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => void;
  clearAuthNotice: () => void;
};

const TOKEN_STORAGE_KEY = 'stock-tracking-token';
const USER_STORAGE_KEY = 'stock-tracking-user';
const AUTH_NOTICE_STORAGE_KEY = 'stock-tracking-auth-notice';
const DEFAULT_UNAUTHORIZED_NOTICE = 'Your session expired or is no longer valid. Please sign in again.';

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredAuth() {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  const rawUser = localStorage.getItem(USER_STORAGE_KEY);
  if (!token || !rawUser) {
    return { token: null, user: null };
  }

  try {
    const user = JSON.parse(rawUser) as AuthUser;
    return { token, user };
  } catch {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
    return { token: null, user: null };
  }
}

function readStoredAuthNotice() {
  const notice = sessionStorage.getItem(AUTH_NOTICE_STORAGE_KEY);
  return notice && notice.length > 0 ? notice : null;
}

function clearPersistedAuth() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(USER_STORAGE_KEY);
}

function persistAuthNotice(message: string | null) {
  if (message) {
    sessionStorage.setItem(AUTH_NOTICE_STORAGE_KEY, message);
    return;
  }

  sessionStorage.removeItem(AUTH_NOTICE_STORAGE_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [{ token, user }, setAuthState] = useState(readStoredAuth);
  const [authNotice, setAuthNotice] = useState<string | null>(readStoredAuthNotice);

  useEffect(() => {
    setAuthToken(token);
  }, [token]);

  useEffect(() => {
    setUnauthorizedHandler((message) => {
      clearPersistedAuth();
      setAuthToken(null);
      setAuthState({ token: null, user: null });
      const nextMessage = message || DEFAULT_UNAUTHORIZED_NOTICE;
      persistAuthNotice(nextMessage);
      setAuthNotice(nextMessage);
    });

    return () => {
      setUnauthorizedHandler(null);
    };
  }, []);

  async function handleLogin(payload: LoginPayload) {
    const response = await loginRequest(payload);
    persistAuthNotice(null);
    setAuthNotice(null);
    localStorage.setItem(TOKEN_STORAGE_KEY, response.token);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(response.user));
    setAuthState({ token: response.token, user: response.user });
  }

  async function handleRegister(payload: RegisterPayload) {
    const response = await registerRequest(payload);
    persistAuthNotice(null);
    setAuthNotice(null);
    localStorage.setItem(TOKEN_STORAGE_KEY, response.token);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(response.user));
    setAuthState({ token: response.token, user: response.user });
  }

  function logout() {
    clearPersistedAuth();
    persistAuthNotice(null);
    setAuthNotice(null);
    setAuthToken(null);
    setAuthState({ token: null, user: null });
  }

  function clearAuthNotice() {
    persistAuthNotice(null);
    setAuthNotice(null);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: Boolean(token && user),
        authNotice,
        login: handleLogin,
        register: handleRegister,
        logout,
        clearAuthNotice
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}
