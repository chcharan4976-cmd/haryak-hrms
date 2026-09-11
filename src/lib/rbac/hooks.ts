'use client';

import { useCallback, useMemo } from 'react';
import { hasPermission as checkPermission, canAccessModule } from './permissions';
import { ROLES } from '../constants';
// TODO: Replace with actual auth context import when ready
// import { useAuth } from '@/components/auth/auth-provider';

// Mock hook until auth context is ready
function useAuth() {
  return {
    user: { id: 'mock', email: 'mock@haryak.com' },
    roles: [ROLES.EMPLOYEE], // default fallback
  };
}

export function usePermissions() {
  const { roles: userRoles } = useAuth();

  const hasPermission = useCallback(
    (module: string, action: string) => {
      return checkPermission(userRoles || [], module, action);
    },
    [userRoles]
  );

  const canAccess = useCallback(
    (module: string) => {
      return canAccessModule(userRoles || [], module);
    },
    [userRoles]
  );

  const isAdmin = useMemo(() => userRoles?.includes(ROLES.SUPER_ADMIN), [userRoles]);
  const isHR = useMemo(() => userRoles?.includes(ROLES.SUPER_ADMIN) || userRoles?.includes(ROLES.HR_ADMIN), [userRoles]);
  const isPayrollAdmin = useMemo(() => userRoles?.includes(ROLES.SUPER_ADMIN) || userRoles?.includes(ROLES.PAYROLL_ADMIN), [userRoles]);
  const isManager = useMemo(() => userRoles?.includes(ROLES.MANAGER) || userRoles?.includes(ROLES.SUPER_ADMIN), [userRoles]);
  const isEmployee = useMemo(() => userRoles?.includes(ROLES.EMPLOYEE) || userRoles?.length > 0, [userRoles]);

  return {
    userRoles: userRoles || [],
    hasPermission,
    canAccess,
    isAdmin,
    isHR,
    isPayrollAdmin,
    isManager,
    isEmployee,
  };
}
