import { WALLET_ERROR_MESSAGES } from '@babylon/shared';
import { useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { apiUrl } from '@/utils/api-url';

/**
 * Metadata for updating an agent profile on-chain.
 */
export interface AgentProfileMetadata {
  /** Display name */
  name: string;
  /** Username (optional) */
  username?: string | null;
  /** Bio/description (optional) */
  bio?: string | null;
  /** Profile image URL (optional) */
  profileImageUrl?: string | null;
  /** Cover image URL (optional) */
  coverImageUrl?: string | null;
  /** Agent type (default: 'user') */
  type?: 'user' | string;
  /** ISO timestamp of update */
  updated?: string;
}

interface UpdateAgentProfileInput {
  metadata: AgentProfileMetadata;
  endpoint?: string;
}

/**
 * Hook for updating an agent profile on-chain.
 *
 * Uses a server-side sponsored transaction flow via the /api/onchain route.
 */
export function useUpdateAgentProfileTx() {
  const { embeddedWalletReady, embeddedWalletAddress, getAccessToken } =
    useAuth();

  const updateAgentProfile = useCallback(
    async ({ metadata, endpoint }: UpdateAgentProfileInput) => {
      if (!embeddedWalletReady || !embeddedWalletAddress) {
        throw new Error(WALLET_ERROR_MESSAGES.NO_EMBEDDED_WALLET);
      }

      const userJwt = await getAccessToken().catch(() => null);
      if (!userJwt) {
        throw new Error('Authentication required');
      }

      const response = await fetch(apiUrl('/api/onchain'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userJwt}`,
        },
        body: JSON.stringify({
          action: 'update-agent-profile',
          metadata,
          endpoint,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Update failed: ${response.status}`);
      }

      const { txHash } = await response.json();
      return txHash;
    },
    [embeddedWalletReady, embeddedWalletAddress, getAccessToken]
  );

  return {
    updateAgentProfile,
    embeddedWalletAddress,
    embeddedWalletReady,
  };
}
