import { UserProfile } from '@/types/autolog';

export const SYSTEM_OWNER_EMAIL = 'apersson508@gmail.com';

export const PERMISSIONS = {
  MANAGE_USERS: 'MANAGE_USERS',
  VIEW_AUDIT_LOGS: 'VIEW_AUDIT_LOGS',
  MANAGE_VEHICLES: 'MANAGE_VEHICLES',
  MANAGE_MARKETPLACE: 'MANAGE_MARKETPLACE',
  MANAGE_MILEAGE: 'MANAGE_MILEAGE',
  MANAGE_PERSONNEL: 'MANAGE_PERSONNEL',
  MANAGE_FORUM: 'MANAGE_FORUM',
  RUN_SYSTEM_TOOLS: 'RUN_SYSTEM_TOOLS',
  MANAGE_DELETED_ACCOUNTS: 'MANAGE_DELETED_ACCOUNTS',
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  MANAGE_USERS: 'Hantera Användare (Blockera / Radera Profiler)',
  VIEW_AUDIT_LOGS: 'Se Aktivitetsloggar',
  MANAGE_VEHICLES: 'Hantera Fordon (Permanent Radering)',
  MANAGE_MARKETPLACE: 'Marknadsplats (Redigera / Ta bort Annonser)',
  MANAGE_MILEAGE: 'Behandla Miltalsansökningar',
  MANAGE_PERSONNEL: 'Personal & Rättigheter',
  MANAGE_FORUM: 'Moderera Forumet (Radera & Spärra)',
  RUN_SYSTEM_TOOLS: 'Kör Systemverktyg (Deep Scan, Krymp Bytes)',
  MANAGE_DELETED_ACCOUNTS: 'Hantera Raderade Konton (Spärra ut)',
};

export const hasPermission = (profile: UserProfile | null | undefined, email: string | null | undefined, permission: PermissionKey): boolean => {
  if (email === SYSTEM_OWNER_EMAIL) return true;
  if (!profile) return false;
  if (profile.role === 'Huvudadmin') return true; // Legacy fallback
  
  if (profile.role === 'Moderator') {
    // Legacy mapping (just for backwards compatibility during migration if they don't have permissions set)
    if (!profile.permissions) {
      const modPerms: PermissionKey[] = ['MANAGE_FORUM', 'MANAGE_MARKETPLACE', 'VIEW_AUDIT_LOGS'];
      return modPerms.includes(permission);
    }
  }

  if (profile.permissions && profile.permissions.includes(permission)) {
    return true;
  }
  return false;
};

export const canViewAdminPanel = (profile: UserProfile | null | undefined, email: string | null | undefined): boolean => {
  if (email === SYSTEM_OWNER_EMAIL) return true;
  if (!profile) return false;
  if (['Huvudadmin', 'Moderator', 'Admin'].includes(profile.role || '')) return true;
  if (profile.permissions && profile.permissions.length > 0) return true;
  return false; 
};
