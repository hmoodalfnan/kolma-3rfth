'use client';

import { BrandLogo } from '@/components/ui/BrandLogo';
import { ViewSwitch } from '@/components/admin/ViewSwitch';

/** A thin top row carrying the brand mark and the admin view switch. */
export function StudentTopBar() {
  return (
    <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-4 pt-3">
      <BrandLogo className="h-8" />
      <ViewSwitch mode="user" />
    </div>
  );
}
