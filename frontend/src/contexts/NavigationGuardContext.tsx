import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

interface NavigationGuardContextType {
  isDirty: boolean;
  setIsDirty: (dirty: boolean) => void;
  requestNavigate: (path: string) => void;
  pendingNavPath: string | null;
  proceedNavigation: () => void;
  cancelNavigation: () => void;
}

const NavigationGuardContext = createContext<NavigationGuardContextType>({
  isDirty: false,
  setIsDirty: () => {},
  requestNavigate: () => {},
  pendingNavPath: null,
  proceedNavigation: () => {},
  cancelNavigation: () => {},
});

export function NavigationGuardProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [isDirty, setIsDirty] = useState(false);
  const [pendingNavPath, setPendingNavPath] = useState<string | null>(null);

  const requestNavigate = useCallback((path: string) => {
    if (isDirty) {
      setPendingNavPath(path);
    } else {
      navigate(path);
    }
  }, [isDirty, navigate]);

  const proceedNavigation = useCallback(() => {
    const path = pendingNavPath;
    setIsDirty(false);
    setPendingNavPath(null);
    if (path) navigate(path);
  }, [pendingNavPath, navigate]);

  const cancelNavigation = useCallback(() => {
    setPendingNavPath(null);
  }, []);

  return (
    <NavigationGuardContext.Provider value={{ isDirty, setIsDirty, requestNavigate, pendingNavPath, proceedNavigation, cancelNavigation }}>
      {children}
    </NavigationGuardContext.Provider>
  );
}

export const useNavigationGuard = () => useContext(NavigationGuardContext);
