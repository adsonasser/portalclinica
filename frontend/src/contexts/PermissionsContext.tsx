import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAuth, type PermissionMap } from './AuthContext';

interface PermissionsContextType {
  permissions: PermissionMap;
  can: (module: string, action: string) => boolean;
  canView: (module: string) => boolean;
  isAdmin: boolean;
}

const PermissionsContext = createContext<PermissionsContextType | null>(null);

// Modules that ALWAYS require explicit permission check (not bypassed for any role)
const ALWAYS_CHECK: string[] = [];

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const { permissions, isAdmin } = useMemo(() => {
    if (!user) return { permissions: {} as PermissionMap, isAdmin: false };

    const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
    const permissions: PermissionMap = (user.accessProfile?.permissions as PermissionMap) ?? {};
    return { permissions, isAdmin };
  }, [user]);

  const can = useMemo(() => (module: string, action: string): boolean => {
    if (!user) return false;
    // ADMINs bypass permission checks unless forced otherwise
    if (isAdmin && !ALWAYS_CHECK.includes(module)) return true;
    const modPerms = permissions[module];
    if (!modPerms) return false;
    // If view is false, nothing else is allowed
    if (action !== 'view' && !modPerms['view']) return false;
    return modPerms[action] === true;
  }, [user, isAdmin, permissions]);

  const canView = useMemo(() => (module: string): boolean => can(module, 'view'), [can]);

  return (
    <PermissionsContext.Provider value={{ permissions, can, canView, isAdmin }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  const ctx = useContext(PermissionsContext);
  if (!ctx) throw new Error('usePermissions must be used inside PermissionsProvider');
  return ctx;
}
