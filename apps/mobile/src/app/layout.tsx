'use client';

import './globals.css';

import { Suspense, useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import { FeedAuthBanner } from '@/components/auth/FeedAuthBanner';
import { GlobalLoginModal } from '@/components/auth/GlobalLoginModal';
import { FeedbackButton } from '@/components/feedback/FeedbackButton';
import { Providers } from '@/components/providers/Providers';
import { BottomNav } from '@/components/shared/BottomNav';
import { MobileHeader } from '@/components/shared/MobileHeader';
import { Sidebar } from '@/components/shared/Sidebar';

/**
 * Mobile root layout — client-only version.
 *
 * Differences from the web layout:
 * - No headers() / host detection (not relevant in native app)
 * - No waitlist host check
 * - No NftAccessGate server-side check
 * - No Vercel Analytics / SpeedInsights
 * - All rendering is client-side (required for static export)
 */
export default function MobileRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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
        {mounted ? (
          <Providers>
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

