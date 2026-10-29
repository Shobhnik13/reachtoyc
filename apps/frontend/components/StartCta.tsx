'use client';

import Link from 'next/link';
import {useEffect, useState} from 'react';

import {api, type Profile} from '@/lib/api';

// First-time visitors get the setup guide; someone who already has a profile goes straight to their runs
export default function StartCta({className = 'btn primary', setupLabel = 'Get started →', appLabel = 'Your runs →'}: {className?: string; setupLabel?: string; appLabel?: string}) {
  const [hasProfile, setHasProfile] = useState(false);

  useEffect(() => {
    api<{profiles: Profile[]}>('/profiles', {silent: true}).then(
      (d) => setHasProfile(d.profiles.length > 0),
      () => setHasProfile(false)
    );
  }, []);

  return hasProfile ? (
    <Link href="/runs" className={className}>{appLabel}</Link>
  ) : (
    <Link href="/how-it-works#setup" className={className}>{setupLabel}</Link>
  );
}
