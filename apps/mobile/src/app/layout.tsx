'use client';

import './globals.css';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { Toaster } from 'sonner';
import { FeedAuthBanner } from '@/components/auth/FeedAuthBanner';
import { GlobalLoginModal } from '@/components/auth/GlobalLoginModal';
import { FeedbackButton } from '@/components/feedback/FeedbackButton';
import { Providers } from '@/components/providers/Providers';
import { BottomNav } from '@/components/shared/BottomNav';
import { MobileHeader } from '@/components/shared/MobileHeader';
import { Sidebar } from '@/components/shared/Sidebar';
import { AppUrlListener } from '@/mobile/components/AppUrlListener';

/**
 * OAuth redirect URL for Capacitor.
 *
 * Per Privy's Capacitor docs, social login OAuth flows (Farcaster, Twitter,
 * Discord, etc.) redirect to this HTTPS URL after authentication. The
 * AppUrlListener component intercepts the redirect via deep linking and
 * injects the OAuth params back into the WebView.
 *
 * Set NEXT_PUBLIC_OAUTH_REDIRECT_URL in env, or defaults to production.
 */
const OAUTH_REDIRECT_URL =
  process.env.NEXT_PUBLIC_OAUTH_REDIRECT_URL ||
  'https://babylon.market/redirect';

/**
 * Mobile root layout — client-only version.
 *
 * Differences from the web layout:
 * - No headers() / host detection (not relevant in native app)
 * - No waitlist host check
 * - No NftAccessGate server-side check
 * - No Vercel Analytics / SpeedInsights
 * - Passes customOAuthRedirectUrl to Privy for Capacitor OAuth flows
 * - All rendering is client-side (required for static export)
 */
export default function MobileRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const privyConfigOverride = useMemo(
    () => ({
      // Required for Capacitor OAuth — tells Privy where to redirect after
      // social login so the AppUrlListener can intercept the deep link
      customOAuthRedirectUrl: OAUTH_REDIRECT_URL,
    }),
    []
  );

  return (
    <html lang="en" suppressHydrationWarning className="overscroll-none">
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
        />
      </head>
      <body
        className="overscroll-none bg-background font-sans antialiased"
        suppressHydrationWarning
      >
        {/* Privy OAuth deep link handler — must be before PrivyProvider */}
        <AppUrlListener />

        {mounted ? (
          <Providers privyConfigOverride={privyConfigOverride}>
            <Toaster position="top-center" richColors />
            <Suspense fallback={null}>
              <GlobalLoginModal />
            </Suspense>

            {/* Mobile Header */}
            <Suspense fallback={null}>
              <MobileHeader />
            </Suspense>

            <div className="mark mx-auto flex min-h-screen max-w-7xl bg-sidebar">
              {/* Desktop Sidebar */}
              <Suspense fallback={null}>
                <Sidebar />
              </Suspense>

              {/* Main Content Area */}
              <main className="min-h-screen min-w-0 flex-1 bg-background pb-14 md:pb-0">
                {children}
              </main>

              {/* Mobile Bottom Navigation */}
              <Suspense fallback={null}>
                <BottomNav />
              </Suspense>
            </div>

            {/* Auth Banner */}
            <Suspense fallback={null}>
              <FeedAuthBanner />
            </Suspense>

            {/* Feedback Button */}
            <FeedbackButton />
          </Providers>
        ) : (
          <div className="min-h-screen bg-sidebar" />
        )}
      </body>
    </html>
  );
}
