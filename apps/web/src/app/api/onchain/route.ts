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

function marketIdToBytes32(marketId: string): `0x${string}` {
  const bigintValue = BigInt(marketId);
  const hexValue = `0x${bigintValue.toString(16)}` as `0x${string}`;
  return pad(hexValue, { size: 32 });
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

/**
 * Extract Privy token from the Authorization header.
 * In the API route context, cookies may not be available cross-origin,
 * so we rely on the Bearer token.
 */
function extractPrivyToken(request: NextRequest): string {
  const cookieToken = request.cookies.get('privy-token')?.value;
  const authHeader = request.headers.get('authorization');
  const headerToken = authHeader?.startsWith('Bearer ')
    ? authHeader.substring(7)
    : undefined;

  const token = headerToken ?? cookieToken;
  if (!token) {
    throw new Error(
      'Authentication required: no Privy token found. Please sign in and try again.'
    );
  }
  return token;
}

async function handleBuyShares(
  token: string,
  body: {
    marketId: string;
    outcome: 'YES' | 'NO';
    numShares: number;
  }
): Promise<{ txHash: Hex }> {
  const ctx = await getAuthedUserContextFromPrivyTokenBundle({
    primary: token,
  });

  const marketIdBytes32 = marketIdToBytes32(body.marketId);
  const outcomeIndex = body.outcome === 'YES' ? 1 : 0;
  const sharesBigInt = BigInt(Math.floor(body.numShares * 1e18));

  const data = encodeFunctionData({
    abi: PREDICTION_MARKET_ABI,
    functionName: 'buyShares',
    args: [marketIdBytes32, outcomeIndex, sharesBigInt],
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

async function handleSellShares(
  token: string,
  body: {
    marketId: string;
    outcome: 'YES' | 'NO';
    numShares: number;
  }
): Promise<{ txHash: Hex }> {
  const ctx = await getAuthedUserContextFromPrivyTokenBundle({
    primary: token,
  });

  const marketIdBytes32 = marketIdToBytes32(body.marketId);
  const outcomeIndex = body.outcome === 'YES' ? 1 : 0;
  const sharesBigInt = BigInt(Math.floor(body.numShares * 1e18));

  const data = encodeFunctionData({
    abi: PREDICTION_MARKET_ABI,
    functionName: 'sellShares',
    args: [marketIdBytes32, outcomeIndex, sharesBigInt],
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

interface AgentProfileMetadata {
  name: string;
  username?: string | null;
  bio?: string | null;
  profileImageUrl?: string | null;
  coverImageUrl?: string | null;
  type?: 'user' | string;
  updated?: string;
}

async function handleUpdateAgentProfile(
  token: string,
  body: {
    metadata: AgentProfileMetadata;
    endpoint?: string;
  }
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
  const metadataJson = JSON.stringify({
    ...body.metadata,
    type: body.metadata.type ?? 'user',
    updated: body.metadata.updated ?? new Date().toISOString(),
  });

  const data = encodeFunctionData({
    abi: identityRegistryAbi,
    functionName: 'updateAgent',
    args: [endpoint, CAPABILITIES_HASH, metadataJson],
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

type OnchainAction = 'buy-shares' | 'sell-shares' | 'update-agent-profile';

export const POST = withErrorHandling(async (request: NextRequest) => {
  const token = extractPrivyToken(request);
  const body = await request.json();

  const action = body.action as OnchainAction;
  if (!action) {
    return NextResponse.json(
      { error: 'Missing required field: action' },
      { status: 400 }
    );
  }

  let result: { txHash: Hex };

  switch (action) {
    case 'buy-shares':
      if (!body.marketId || !body.outcome || body.numShares == null) {
        return NextResponse.json(
          { error: 'Missing required fields: marketId, outcome, numShares' },
          { status: 400 }
        );
      }
      result = await handleBuyShares(token, {
        marketId: body.marketId,
        outcome: body.outcome,
        numShares: body.numShares,
      });
      break;

    case 'sell-shares':
      if (!body.marketId || !body.outcome || body.numShares == null) {
        return NextResponse.json(
          { error: 'Missing required fields: marketId, outcome, numShares' },
          { status: 400 }
        );
      }
      result = await handleSellShares(token, {
        marketId: body.marketId,
        outcome: body.outcome,
        numShares: body.numShares,
      });
      break;

    case 'update-agent-profile':
      if (!body.metadata) {
        return NextResponse.json(
          { error: 'Missing required field: metadata' },
          { status: 400 }
        );
      }
      result = await handleUpdateAgentProfile(token, {
        metadata: body.metadata,
        endpoint: body.endpoint,
      });
      break;

    default:
      return NextResponse.json(
        { error: `Unknown action: ${action}` },
        { status: 400 }
      );
  }

  return NextResponse.json({ success: true, ...result });
});
