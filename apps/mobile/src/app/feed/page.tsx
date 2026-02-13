'use client';

import { Suspense } from 'react';
import { FeedSkeleton } from '@/components/shared/Skeleton';
import { FeedClient } from '@web/app/feed/FeedClient';

export default function MobileFeedPage() {
  return (
    <Suspense fallback={<FeedSkeleton />}>
      <FeedClient />
    </Suspense>
  );
}

