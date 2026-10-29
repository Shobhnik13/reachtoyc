'use client';

import {useParams} from 'next/navigation';
import {useEffect, useState} from 'react';

import ProfileForm from '@/components/ProfileForm';
import {Loading} from '@/components/Spinner';
import {api, type Profile} from '@/lib/api';

export default function EditProfilePage() {
  const {id} = useParams<{id: string}>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api<{profile: Profile}>(`/profiles/${id}`).then((d) => setProfile(d.profile), (e) => setErr(e.message));
  }, [id]);

  return (
    <>
      <h1>{profile ? profile.name : 'Profile'}</h1>
      <p className="sub">Changes apply to every draft written or regenerated from now on, including in runs that already exist.</p>
      {err ? <p className="status err">{err}</p> : null}
      {profile ? <ProfileForm key={profile.id} profile={profile} /> : !err ? <Loading label="Loading profile" /> : null}
    </>
  );
}
