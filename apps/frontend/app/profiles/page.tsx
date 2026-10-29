'use client';

import Link from 'next/link';
import {useEffect, useState} from 'react';

import {Loading} from '@/components/Spinner';
import {api, fmtDate, type Profile} from '@/lib/api';

export default function ProfilesPage() {
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api<{profiles: Profile[]}>('/profiles').then((d) => setProfiles(d.profiles), (e) => setErr(e.message));
  }, []);

  return (
    <>
      <h1>Profiles</h1>
      <p className="sub">A profile holds your AI provider and model, resume Markdown and system prompt. API keys and the database URL live in apps/backend/.env.</p>
      <p><Link className="btn primary" href="/profiles/new">New profile</Link></p>
      {err ? <p className="status err">{err}</p> : null}
      {!profiles && !err ? <Loading label="Loading profiles" /> : null}
      {profiles && !profiles.length ? <p className="muted">No profiles yet.</p> : null}
      {profiles?.length ? (
        <section className="panel">
          <table>
            <thead><tr><th>Name</th><th>Model</th><th>Keys</th><th>Resume</th><th>Created</th></tr></thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id}>
                  <td><Link href={`/profiles/${p.id}`}>{p.name}</Link></td>
                  <td>{p.ai_provider} · {p.ai_model}</td>
                  <td>
                    <span className={`badge ${p.has_ai_key ? 'valid' : 'failed'}`}>AI {p.has_ai_key ? 'set' : 'missing'}</span>{' '}
                    <span className={`badge ${p.has_apify_token ? 'valid' : 'none'}`}>Apify {p.has_apify_token ? 'set' : 'off'}</span>
                  </td>
                  <td>{p.resume_markdown.length ? `${p.resume_markdown.length.toLocaleString()} chars` : <span className="err">empty</span>}</td>
                  <td className="muted">{fmtDate(p.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </>
  );
}
