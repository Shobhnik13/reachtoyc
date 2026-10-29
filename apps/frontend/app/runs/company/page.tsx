'use client';

import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useEffect, useState} from 'react';

import {Loading, Spinner} from '@/components/Spinner';
import {api, type Profile, type Run} from '@/lib/api';
import {confirmToast, toast} from '@/lib/toast';

// Same workflow as a YC run, for one company you pick: research, emails, Apify check, then the draft
export default function CompanyRunPage() {
  const router = useRouter();
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [form, setForm] = useState({profile_id: '', website: '', contact_name: '', email: ''});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{profiles: Profile[]}>('/profiles').then(
      (d) => {
        setProfiles(d.profiles);
        if (d.profiles[0]) setForm((f) => ({...f, profile_id: String(d.profiles[0].id)}));
      },
      (e) => toast.error(e.message)
    );
  }, []);

  const profile = profiles?.find((p) => String(p.id) === form.profile_id);
  const missing = profile ? [!profile.has_ai_key && profile.ai_key_env, !profile.has_apify_token && 'APIFY_TOKEN'].filter(Boolean) as string[] : [];
  const ready = !!profile && !missing.length && !!profile.resume_markdown.trim();
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({...form, [k]: e.target.value});

  async function start(e: React.FormEvent) {
    e.preventDefault();
    const ok = await confirmToast(`Research ${form.website.trim()} and write an email?`, {
      description: `About 2 AI calls on ${profile?.ai_model} (research, then the email)${form.email.trim() ? '' : ' plus Apify lookups for the people found'}, billed to your keys.`,
      confirmLabel: 'Start'
    });
    if (!ok) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = {source: 'url', profile_id: parseInt(form.profile_id), website: form.website.trim()};
      if (form.email.trim()) body.email = form.email.trim();
      if (form.contact_name.trim()) body.contact_name = form.contact_name.trim();
      const d = await api<{run: Run}>('/runs', {method: 'POST', body});
      toast.success(`Researching ${d.run.batch}`, {description: 'The draft shows up on the run page when it is written.'});
      router.push(`/runs/${d.run.id}`);
    } catch (err) {
      toast.error((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Run for a different company</h1>
      <p className="sub">Any company, not just YC. Paste its website: the AI researches what it builds and who runs it, emails are found and checked with Apify, and one email is written with your profile, prompt and subject line.</p>
      {!profiles ? <Loading label="Loading profiles" /> : null}
      {profiles && !profiles.length ? <p className="muted">Create a <Link href="/profiles/new">profile</Link> first.</p> : null}
      <form onSubmit={start} hidden={!profiles?.length}>
        <section className="panel">
          <div className="grid">
            <label className="f">
              Profile
              <select value={form.profile_id} onChange={set('profile_id')}>
                {profiles?.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.ai_model})</option>)}
              </select>
            </label>
            <label className="f" style={{gridColumn: 'span 2'}}>
              Company website
              <input required value={form.website} onChange={set('website')} placeholder="https://acme.com" inputMode="url" />
            </label>
          </div>
          <div className="grid">
            <label className="f">
              Contact name <span className="muted" style={{fontWeight: 400}}>(optional)</span>
              <input value={form.contact_name} onChange={set('contact_name')} placeholder="Jane Doe" />
            </label>
            <label className="f">
              Their email <span className="muted" style={{fontWeight: 400}}>(optional)</span>
              <input type="email" value={form.email} onChange={set('email')} placeholder="jane@acme.com" />
            </label>
          </div>
          <p className="hint">
            Know who to write to? Enter their email and it&apos;s used as is. Otherwise the founders are found from the web, with emails from the company site, pattern guesses and Apify. If no email turns up, the email is still written and you type the address on the run page.
          </p>
        </section>

        {profile && missing.length ? (
          <p className="status err">Set {missing.join(' and ')} in <code>apps/backend/.env</code> and restart the backend. Both the AI key and Apify are needed for this. <Link href="/how-it-works">How it works</Link></p>
        ) : null}
        {profile && !missing.length && !profile.resume_markdown.trim() ? <p className="status err">Add your resume to the <Link href={`/profiles/${profile.id}`}>profile</Link> first.</p> : null}

        <p className="row">
          <button className="primary" type="submit" disabled={busy || !ready || !form.website.trim()}>{busy ? <><Spinner /> Starting…</> : 'Research and write'}</button>
        </p>
      </form>
    </>
  );
}
