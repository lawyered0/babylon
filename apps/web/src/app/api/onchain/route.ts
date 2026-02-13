/**
 * On-Chain Transaction API
 *
 * @route POST /api/onchain
 * @access Authenticated users only
 *
 * @description
 * Executes sponsored on-chain transactions via Privy embedded wallets.
 * Replaces the previous server actions (_actions/onchain.ts) with an API route
 * that works in both web (same-origin) and mobile (cross-origin) contexts.
 *
 * Supported actions (via `action` field in request body):
 * - `buy-shares`: Buy prediction market shares
 * - `sell-shares`: Sell prediction market shares
 * - `update-agent-profile`: Update agent profile on identity registry
 */

import {
  getAuthedUserContextFromPrivyTokenBundle,
  sendSponsoredEvmTransaction,
  withErrorHandling,
} from '@babylon/api';
import { getContractAddresses } from '@babylon/contracts';
import {
  CAPABILITIES_HASH,
  CHAIN,
  getIdentityRegistryAddress,
  identityRegistryAbi,
  WALLET_ERROR_MESSAGES,
} from '@babylon/shared';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { type Address, encodeFunctionData, type Hex, pad } from 'viem';
import type { AgentProfileMetadata } from '@/hooks/useUpdateAgentProfileTx';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function marketIdToBytes32(marketId: string): `0x${string}` {
  return pad(`0x${BigInt(marketId).toString(16)}` as `0x${string}`, {
    size: 32,
  });
}

const { diamond: DIAMOND_ADDRESS } = getContractAddresses();

const PREDICTION_MARKET_ABI = [
  {
    type: 'function',
    name: 'buyShares',
    inputs: [
      { name: '_marketId', type: 'bytes32' },
      { name: '_outcome', type: 'uint8' },
      { name: '_numShares', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'sellShares',
    inputs: [
      { name: '_marketId', type: 'bytes32' },
      { name: '_outcome', type: 'uint8' },
      { name: '_numShares', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

function extractPrivyToken(request: NextRequest): string {
  const cookieToken = request.cookies.get('privy-token')?.value;
  const authHeader = request.headers.get('authorization');
  const headerToken = authHeader?.startsWith('Bearer ')
    ? authHeader.substring(7)
    : undefined;

  const token = headerToken ?? cookieToken;
  if (!token) {
    throw new Error('Authentication required: no Privy token found.');
  }
  return token;
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

async function handleSharesTrade(
  token: string,
  body: { marketId: string; outcome: 'YES' | 'NO'; numShares: number },
  side: 'buyShares' | 'sellShares'
): Promise<{ txHash: Hex }> {
  const ctx = await getAuthedUserContextFromPrivyTokenBundle({
    primary: token,
  });

  const data = encodeFunctionData({
    abi: PREDICTION_MARKET_ABI,
    functionName: side,
    args: [
      marketIdToBytes32(body.marketId),
      body.outcome === 'YES' ? 1 : 0,
      BigInt(Math.floor(body.numShares * 1e18)),
    ],
  });

  const { hash } = await sendSponsoredEvmTransaction({
    walletId: ctx.privyWalletId,
    to: DIAMOND_ADDRESS as Address,
    data,
    valueWei: 0n,
    caip2: `eip155:${CHAIN.id}`,
    chainId: CHAIN.id,
  });

  return { txHash: hash };
}

async function handleUpdateAgentProfile(
  token: string,
  body: { metadata: AgentProfileMetadata; endpoint?: string }
): Promise<{ txHash: Hex }> {
  const ctx = await getAuthedUserContextFromPrivyTokenBundle({
    primary: token,
  });

  const registryAddress = getIdentityRegistryAddress();
  if (!registryAddress) {
    throw new Error('Identity registry not configured for this chain');
  }
  if (!ctx.walletAddress) {
    throw new Error(WALLET_ERROR_MESSAGES.NO_EMBEDDED_WALLET);
  }

  const endpoint =
    body.endpoint ??
    `https://babylon.market/agent/${ctx.walletAddress.toLowerCase()}`;

  const data = encodeFunctionData({
    abi: identityRegistryAbi,
    functionName: 'updateAgent',
    args: [
      endpoint,
      CAPABILITIES_HASH,
      JSON.stringify({
        ...body.metadata,
        type: body.metadata.type ?? 'user',
        updated: body.metadata.updated ?? new Date().toISOString(),
      }),
    ],
  });

  const { hash } = await sendSponsoredEvmTransaction({
    walletId: ctx.privyWalletId,
    to: registryAddress,
    data,
    valueWei: 0n,
    caip2: `eip155:${CHAIN.id}`,
    chainId: CHAIN.id,
  });

  return { txHash: hash };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export const POST = withErrorHandling(async (request: NextRequest) => {
  const token = extractPrivyToken(request);
  const body = await request.json();
  const action = body.action as string;

  switch (action) {
    case 'buy-shares':
    case 'sell-shares': {
      if (!body.marketId || !body.outcome || body.numShares == null) {
        return NextResponse.json(
          { error: 'Missing required fields: marketId, outcome, numShares' },
          { status: 400 }
        );
      }
      const side = action === 'buy-shares' ? 'buyShares' : 'sellShares';
      const result = await handleSharesTrade(token, body, side);
      return NextResponse.json({ success: true, ...result });
    }

    case 'update-agent-profile': {
      if (!body.metadata) {
        return NextResponse.json(
          { error: 'Missing required field: metadata' },
          { status: 400 }
        );
      }
      const result = await handleUpdateAgentProfile(token, body);
      return NextResponse.json({ success: true, ...result });
    }

    default:
      return NextResponse.json(
        { error: `Unknown action: ${action ?? 'undefined'}` },
        { status: 400 }
      );
  }
});
