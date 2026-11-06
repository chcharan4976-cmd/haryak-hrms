'use client';

import { useCallback, useMemo } from 'react';
import { hasPermission as checkPermission, canAccessModule } from './permissions';
import { ROLES } from '../constants';
import { useAuth } from '@/components/providers/auth-provider';

export function usePermissions() {
  const { userRoles } = useAuth();

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
