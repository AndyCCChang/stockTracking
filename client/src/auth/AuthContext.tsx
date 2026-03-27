import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { login as loginRequest, register as registerRequest, setAuthToken, setUnauthorizedHandler, type AuthUser, type LoginPayload, type RegisterPayload } from '../lib/api';

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => void;
};

const TOKEN_STORAGE_KEY = 'stock-tracking-token';
const USER_STORAGE_KEY = 'stock-tracking-user';

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [{ token, user }, setAuthState] = useState(readStoredAuth);

  useEffect(() => {
    setAuthToken(token);
  }, [token]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(USER_STORAGE_KEY);
      setAuthToken(null);
      setAuthState({ token: null, user: null });
    });

    return () => {
      setUnauthorizedHandler(null);
    };
  }, []);

  async function handleLogin(payload: LoginPayload) {
    const response = await loginRequest(payload);
    localStorage.setItem(TOKEN_STORAGE_KEY, response.token);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(response.user));
    setAuthState({ token: response.token, user: response.user });
  }

  async function handleRegister(payload: RegisterPayload) {
    const response = await registerRequest(payload);
    localStorage.setItem(TOKEN_STORAGE_KEY, response.token);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(response.user));
    setAuthState({ token: response.token, user: response.user });
  }

  function logout() {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
    setAuthToken(null);
    setAuthState({ token: null, user: null });
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: Boolean(token && user),
        login: handleLogin,
        register: handleRegister,
        logout
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
