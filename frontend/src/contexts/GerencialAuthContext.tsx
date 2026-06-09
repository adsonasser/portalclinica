import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { gerencialAuthApi } from '../services/gerencialApi';

interface GerencialUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface GerencialAuthContextType {
  user: GerencialUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const GerencialAuthContext = createContext<GerencialAuthContextType | null>(null);

export function GerencialAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<GerencialUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('gerencial_token');
    if (token) {
      gerencialAuthApi.me()
        .then((u) => {
          if (u.role !== 'SUPER_ADMIN') throw new Error('not superadmin');
          setUser(u);
        })
        .catch(() => {
          localStorage.removeItem('gerencial_token');
          localStorage.removeItem('gerencial_user');
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const { token, user: u } = await gerencialAuthApi.login(email, password);
    localStorage.setItem('gerencial_token', token);
    localStorage.setItem('gerencial_user', JSON.stringify(u));
    setUser(u);
  };

  const logout = () => {
    localStorage.removeItem('gerencial_token');
    localStorage.removeItem('gerencial_user');
    setUser(null);
    window.location.href = '/gerencial/login';
  };

  return (
    <GerencialAuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </GerencialAuthContext.Provider>
  );
}

export function useGerencialAuth() {
  const ctx = useContext(GerencialAuthContext);
  if (!ctx) throw new Error('useGerencialAuth must be inside GerencialAuthProvider');
  return ctx;
}
