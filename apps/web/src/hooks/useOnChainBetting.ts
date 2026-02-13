import { getContractAddresses } from '@babylon/contracts';
import { logger } from '@babylon/shared';
import { useCallback, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { apiUrl } from '@/utils/api-url';

/**
 * Result of an on-chain betting transaction.
 */
export interface OnChainBetResult {
  /** Transaction hash */
  txHash: string;
  /** Number of shares purchased/sold */
  shares: number;
  /** Gas used (if available) */
  gasUsed?: string;
}

// Get contract addresses for current network (localnet or testnet/mainnet)
const { diamond: DIAMOND_ADDRESS, network: NETWORK } = getContractAddresses();

/**
 * Hook for on-chain prediction market betting.
 *
 * Uses a server-side sponsored transaction flow via the /api/onchain route.
 */
export function useOnChainBetting() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { getAccessToken } = useAuth();

  const buyShares = useCallback(
    async (
      marketId: string,
      outcome: 'YES' | 'NO',
      numShares: number
    ): Promise<OnChainBetResult> => {
      setLoading(true);
      setError(null);

      try {
        logger.info('Buying shares on-chain', {
          network: NETWORK,
          diamond: DIAMOND_ADDRESS,
          marketId,
          outcome,
          numShares,
        });

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
            action: 'buy-shares',
            marketId,
            outcome,
            numShares,
          }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(
            data.error || `Buy failed: ${response.status}`
          );
        }

        const { txHash } = await response.json();
        return { txHash, shares: numShares };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Buy failed';
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [getAccessToken]
  );

  const sellShares = useCallback(
    async (
      marketId: string,
      outcome: 'YES' | 'NO',
      numShares: number
    ): Promise<OnChainBetResult> => {
      setLoading(true);
      setError(null);

      try {
        logger.info('Selling shares on-chain', {
          network: NETWORK,
          diamond: DIAMOND_ADDRESS,
          marketId,
          outcome,
          numShares,
        });

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
            action: 'sell-shares',
            marketId,
            outcome,
            numShares,
          }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(
            data.error || `Sell failed: ${response.status}`
          );
        }

        const { txHash } = await response.json();
        return { txHash, shares: numShares };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Sell failed';
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [getAccessToken]
  );

  return {
    buyShares,
    sellShares,
    loading,
    error,
    walletReady: true,
  };
}
