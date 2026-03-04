'use client';

import { useUser as useUserFromProvider, UserHookResult } from '@/firebase/provider';

/**
 * Re-exports the useUser hook from the provider.
 */
export function useUser(): UserHookResult {
  return useUserFromProvider();
}
