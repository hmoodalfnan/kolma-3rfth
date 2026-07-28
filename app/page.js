'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredRole } from '@/lib/auth/session';
import { homeFor } from '@/lib/auth/guard';
import { SkeletonList } from '@/components/ui/Skeleton';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace(homeFor(getStoredRole()?.role));
  }, [router]);

  return (
    <div className="mx-auto w-full max-w-md p-6">
      <SkeletonList rows={4} />
    </div>
  );
}
