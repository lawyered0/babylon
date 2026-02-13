/**
 * NFT Mint Execute API
 *
 * @route POST /api/nft/mint/execute
 * @access Authenticated users only
 *
 * @description
 * Executes the full NFT mint flow: prepare → send sponsored transaction → poll for confirmation.
 * Replaces the server action (_actions/nft.ts mintNftAction) with an API route
 * that works in both web (same-origin) and mobile (cross-origin) contexts.
 *
 * Returns one of:
 * - `{ status: 'confirmed', txHash, ... }` — Mint completed successfully
 * - `{ status: 'pending', txHash, message }` — Transaction submitted but confirmation is slow
 * - `{ status: 'error', error, step, errorId }` — Error occurred at a specific step
 */

import {
  extractPrivyApiDiagnostics,
  getAuthedUserContextFromPrivyTokenBundle,
  type PrivyApiDiagnostics,
  redactJwtLikeTokens,
  sendSponsoredEvmTransaction,
} from '@babylon/api';
import {
  type ConfirmResult,
  confirmMint,
  prepareMint,
} from '@babylon/api/services/nft-mint-service';
import { logger, ValidationError } from '@babylon/shared';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type { Address, Hex } from 'viem';

type MintStep =
  | 'auth'
  | 'user_context'
  | 'prepare'
  | 'send_transaction'
  | 'confirm';

type MintNftResult =
  | ({ status: 'confirmed'; txHash: Hex } & ConfirmResult)
  | { status: 'pending'; txHash: Hex; message: string }
  | {
      status: 'error';
      error: string;
      step: MintStep;
      errorId: string;
      debug?: PrivyApiDiagnostics;
    };

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : 'Unknown error';
}

function exposeOnchainErrorDetails(): boolean {
  const raw = process.env.EXPOSE_ONCHAIN_ERROR_DETAILS;
  if (!raw) return false;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

function toDebugDetails(error: unknown): PrivyApiDiagnostics | undefined {
  if (!exposeOnchainErrorDetails()) return undefined;
  const debug = extractPrivyApiDiagnostics(error, { redactJwtLike: true });
  return Object.keys(debug).length > 0 ? debug : undefined;
}

function toSafeLogError(error: unknown): {
  name?: string;
  message: string;
  stack?: string;
} {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: redactJwtLikeTokens(error.message),
      stack: error.stack ? redactJwtLikeTokens(error.stack) : undefined,
    };
  }
  return { message: redactJwtLikeTokens(errorMessage(error)) };
}

function toUserSafeMintError(step: MintStep, error: unknown): string {
  const msg = errorMessage(error).toLowerCase();

  const isAuthy =
    msg.includes('invalid jwt token provided') ||
    msg.includes('expired') ||
    msg.includes('missing privy token') ||
    msg.includes('authentication required');
  if (isAuthy || step === 'auth' || step === 'user_context') {
    return 'Your session has expired. Please sign in again and try minting.';
  }

  if (msg.includes('embedded wallet not ready')) {
    return 'Your wallet is still initializing. Please wait a few seconds and try again.';
  }

  if (step === 'prepare') {
    return 'Mint is temporarily unavailable. Please try again shortly.';
  }

  if (step === 'send_transaction') {
    return 'We could not submit the transaction. Please try again.';
  }

  if (step === 'confirm') {
    return 'Transaction submitted, but confirmation is taking longer than expected. Please check again shortly.';
  }

  return 'Mint failed. Please try again.';
}

function backoffSleep(
  attempt: number,
  baseMs = 1000,
  maxMs = 5000
): Promise<void> {
  const exponentialDelay = Math.min(baseMs * 2 ** attempt, maxMs);
  const jitter = exponentialDelay * 0.1 * (Math.random() * 2 - 1);
  const finalDelay = Math.round(exponentialDelay + jitter);
  return new Promise((resolve) => setTimeout(resolve, finalDelay));
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Step 1: Extract auth token
  const cookieToken = request.cookies.get('privy-token')?.value;
  const authHeader = request.headers.get('authorization');
  const headerToken = authHeader?.startsWith('Bearer ')
    ? authHeader.substring(7)
    : undefined;

  const privyToken = headerToken ?? cookieToken;
  if (!privyToken) {
    const step: MintStep = 'auth';
    const errorId = crypto.randomUUID();
    return NextResponse.json(
      {
        status: 'error',
        error: 'Authentication required: no Privy token found. Please sign in and try again.',
        step,
        errorId,
      } satisfies MintNftResult,
      { status: 401 }
    );
  }

  // Step 2: Get user context
  let ctx: Awaited<ReturnType<typeof getAuthedUserContextFromPrivyTokenBundle>>;
  try {
    ctx = await getAuthedUserContextFromPrivyTokenBundle({
      primary: privyToken,
    });
  } catch (e) {
    const step: MintStep = 'user_context';
    const errorId = crypto.randomUUID();
    logger.warn(
      'NFT mint user context failed',
      { errorId, step, error: toSafeLogError(e) },
      'mintNftApi'
    );
    return NextResponse.json(
      {
        status: 'error',
        error: toUserSafeMintError(step, e),
        step,
        errorId,
        debug: toDebugDetails(e),
      } satisfies MintNftResult,
      { status: 401 }
    );
  }

  // Step 3: Prepare mint
  let prepare: Awaited<ReturnType<typeof prepareMint>>;
  try {
    prepare = await prepareMint(ctx.dbUserId);
  } catch (e) {
    const step: MintStep = 'prepare';
    const errorId = crypto.randomUUID();
    logger.error(
      'NFT mint prepare failed',
      { errorId, step, userId: ctx.dbUserId, error: toSafeLogError(e) },
      'mintNftApi'
    );
    return NextResponse.json(
      {
        status: 'error',
        error: toUserSafeMintError(step, e),
        step,
        errorId,
        debug: toDebugDetails(e),
      } satisfies MintNftResult,
      { status: 500 }
    );
  }

  // Step 4: Send transaction via Privy
  let hash: Hex;
  try {
    const result = await sendSponsoredEvmTransaction({
      walletId: ctx.privyWalletId,
      to: prepare.contractAddress as Address,
      data: prepare.encodedData,
      valueWei: 0n,
      caip2: `eip155:${prepare.chainId}`,
      chainId: prepare.chainId,
    });
    hash = result.hash;
  } catch (e) {
    const step: MintStep = 'send_transaction';
    const errorId = crypto.randomUUID();
    logger.error(
      'NFT mint send transaction failed',
      {
        errorId,
        step,
        userId: ctx.dbUserId,
        privyId: ctx.privyId,
        walletId: ctx.privyWalletId,
        error: toSafeLogError(e),
      },
      'mintNftApi'
    );
    return NextResponse.json(
      {
        status: 'error',
        error: toUserSafeMintError(step, e),
        step,
        errorId,
        debug: toDebugDetails(e),
      } satisfies MintNftResult,
      { status: 500 }
    );
  }

  // Step 5: Poll for confirmation
  const maxAttempts = 14;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const confirmed = await confirmMint(ctx.dbUserId, hash, prepare.to);
      return NextResponse.json({
        status: 'confirmed',
        txHash: hash,
        ...confirmed,
      } satisfies MintNftResult);
    } catch (error) {
      if (
        error instanceof ValidationError &&
        error.message.startsWith('Transaction not found:')
      ) {
        await backoffSleep(attempt);
        continue;
      }
      const step: MintStep = 'confirm';
      const errorId = crypto.randomUUID();
      logger.error(
        'NFT mint confirm failed',
        {
          errorId,
          step,
          userId: ctx.dbUserId,
          txHash: hash,
          error: toSafeLogError(error),
        },
        'mintNftApi'
      );
      return NextResponse.json(
        {
          status: 'error',
          error: toUserSafeMintError(step, error),
          step,
          errorId,
          debug: toDebugDetails(error),
        } satisfies MintNftResult,
        { status: 500 }
      );
    }
  }

  logger.warn(
    'NFT mint transaction pending after timeout',
    { txHash: hash, userId: ctx.dbUserId, attempts: maxAttempts },
    'mintNftApi'
  );

  return NextResponse.json({
    status: 'pending',
    txHash: hash,
    message:
      'Transaction submitted but confirmation is taking longer than expected. ' +
      'Your NFT should appear shortly. You can track the transaction on a block explorer.',
  } satisfies MintNftResult);
}

