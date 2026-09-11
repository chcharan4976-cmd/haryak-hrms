import { ROLES } from '../constants';

export const ROLE_PERMISSIONS: Record<string, Record<string, string[]>> = {
  [ROLES.SUPER_ADMIN]: {
    all: ['*'], // Has all permissions
  },
  [ROLES.HR_ADMIN]: {
    employee: ['create', 'read', 'update', 'delete', 'manage_onboarding'],
    document: ['create', 'read', 'update', 'delete', 'verify'],
    leave: ['read', 'manage_types', 'view_all'],
    department: ['create', 'read', 'update', 'delete'],
    compensation: ['read'],
  },
  [ROLES.PAYROLL_ADMIN]: {
    compensation: ['create', 'read', 'update', 'delete', 'manage_structures'],
    payroll: ['run', 'read', 'update', 'approve', 'lock'],
    payslip: ['generate', 'read', 'publish'],
    report: ['read', 'export'],
  },
  [ROLES.MANAGER]: {
    team: ['read_members'],
    leave: ['read_team', 'approve'],
    attendance: ['read_team', 'approve_regularization'],
  },
  [ROLES.EMPLOYEE]: {
    employee: ['read_own', 'update_own'],
    document: ['read_own', 'upload_own'],
    leave: ['read_own', 'apply', 'cancel_own'],
    attendance: ['read_own', 'mark', 'regularize'],
    payslip: ['read_own'],
    compensation: ['read_own'],
  }
};

export function hasPermission(userRoles: string[], module: string, action: string): boolean {
  if (userRoles.includes(ROLES.SUPER_ADMIN)) {
    return true;
  }

  for (const role of userRoles) {
    const rolePerms = ROLE_PERMISSIONS[role];
    if (!rolePerms) continue;

    // Check if role has all permissions for the module, or specifically the requested action
    if (rolePerms[module]) {
      if (rolePerms[module].includes('*') || rolePerms[module].includes(action)) {
        return true;
      }
    }
    
    // Check global '*'
    if (rolePerms['all'] && rolePerms['all'].includes('*')) {
      return true;
    }
  }

  return false;
}

export function canAccessModule(userRoles: string[], module: string): boolean {
  if (userRoles.includes(ROLES.SUPER_ADMIN)) {
    return true;
  }

  for (const role of userRoles) {
    const rolePerms = ROLE_PERMISSIONS[role];
    if (!rolePerms) continue;
    
    if (rolePerms['all'] && rolePerms['all'].includes('*')) {
      return true;
    }

    if (rolePerms[module] && rolePerms[module].length > 0) {
      return true;
    }
  }

  return false;
}

export function getAccessibleModules(userRoles: string[]): string[] {
  if (userRoles.includes(ROLES.SUPER_ADMIN)) {
    return ['*']; // Can access everything
  }

  const modules = new Set<string>();

  for (const role of userRoles) {
    const rolePerms = ROLE_PERMISSIONS[role];
    if (!rolePerms) continue;

    Object.keys(rolePerms).forEach(module => {
      if (module !== 'all') {
        modules.add(module);
      }
    });
  }

  return Array.from(modules);
}
