'use client';

import {useRouter} from 'next/navigation';
import {useEffect, useState} from 'react';

import {Loading, Spinner} from '@/components/Spinner';
import {api, type Profile, type Run} from '@/lib/api';
import {confirmToast, toast} from '@/lib/toast';

export default function NewRunPage() {
  const router = useRouter();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [batches, setBatches] = useState<{batch: string; count: number}[]>([]);
  const [form, setForm] = useState({profile_id: '', batch: '', company_limit: '20', hiring_only: false, skip_contacted: true, use_apify: false});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{profiles: Profile[]}>('/profiles').then((d) => {
      setProfiles(d.profiles);
      setLoaded(true);
      const first = d.profiles[0];
      if (first) setForm((f) => ({...f, profile_id: String(first.id), use_apify: first.has_apify_token}));
    }, (e) => {
      setMsg(e.message);
      setLoaded(true);
    });
    api<{batches: {batch: string; count: number}[]}>('/batches').then((d) => {
      setBatches(d.batches);
      // Newest batch with a real number of companies, not one still filling up
      const pick = d.batches.find((b) => b.count >= 20) || d.batches[0];
      if (pick) setForm((f) => ({...f, batch: f.batch || pick.batch}));
    }, (e) => setMsg(`Couldn't load batches: ${e.message}`));
  }, []);

  const profile = profiles.find((p) => String(p.id) === form.profile_id);
  const ready = profile && profile.has_ai_key && profile.resume_markdown.trim();

  async function start(e: React.FormEvent) {
    e.preventDefault();
    const ok = await confirmToast(`Start a run for ${form.company_limit} companies from ${form.batch}?`, {
      description: `Calls ${profile?.ai_model}${form.use_apify ? ' and Apify' : ''} for each company, billed to your keys.`,
      confirmLabel: 'Start run'
    });
    if (!ok) return;
    setBusy(true);
    setMsg('');
    try {
      const d = await api<{run: Run}>('/runs', {method: 'POST', body: {...form, profile_id: parseInt(form.profile_id), company_limit: parseInt(form.company_limit)}});
      toast.success(`Run #${d.run.id} started`, {description: `${form.batch} · ${form.company_limit} companies`});
      router.push(`/runs/${d.run.id}`);
    } catch (err) {
      toast.error((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <h1>New run</h1>
      <p className="sub">A run reads the batch from YC, finds founders and their emails, researches each company on the web, and writes one draft per company.</p>
      {!loaded ? <Loading label="Loading profiles and batches" /> : null}
      {loaded && !profiles.length ? <p className="muted">Create a <a href="/profiles/new">profile</a> first.</p> : null}
      <form onSubmit={start} hidden={!loaded}>
        <section className="panel">
          <div className="grid">
            <label className="f">
              Profile
              <select value={form.profile_id} onChange={(e) => {
                const p = profiles.find((x) => String(x.id) === e.target.value);
                setForm({...form, profile_id: e.target.value, use_apify: !!p?.has_apify_token});
              }}>
                {profiles.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.ai_model})</option>)}
              </select>
            </label>
            <label className="f">
              YC batch
              <select value={form.batch} onChange={(e) => setForm({...form, batch: e.target.value})}>
                {!batches.length ? <option>Loading…</option> : null}
                {batches.map((b) => <option key={b.batch} value={b.batch}>{b.batch} ({b.count} companies)</option>)}
              </select>
            </label>
            <label className="f">Companies to draft<input type="number" min="1" max="500" value={form.company_limit} onChange={(e) => setForm({...form, company_limit: e.target.value})} /></label>
          </div>
          <div className="row" style={{gap: 18}}>
            <label className="chk"><input type="checkbox" checked={form.hiring_only} onChange={(e) => setForm({...form, hiring_only: e.target.checked})} /> only companies hiring on YC</label>
            <label className="chk"><input type="checkbox" checked={form.skip_contacted} onChange={(e) => setForm({...form, skip_contacted: e.target.checked})} /> skip companies drafted in earlier runs</label>
            <label className="chk" title={profile?.has_apify_token ? '' : 'Set APIFY_TOKEN in apps/backend/.env first'}>
              <input type="checkbox" disabled={!profile?.has_apify_token} checked={form.use_apify} onChange={(e) => setForm({...form, use_apify: e.target.checked})} /> verify emails with Apify
            </label>
          </div>
          <p className="hint">Companies are taken newest-launched first. Nothing starts until you press Start run. Each draft is one AI call with web search, so cost grows with the number of companies{form.use_apify && profile ? `; Apify is capped at $${profile.apify_max_usd} per 50 founders` : ''}.</p>
        </section>
        {profile && !ready ? <p className="status err">{!profile.has_ai_key ? `Set ${profile.ai_key_env} in apps/backend/.env and restart the backend. ` : ''}{!profile.resume_markdown.trim() ? <>Add your resume to the <a href={`/profiles/${profile.id}`}>profile</a>.</> : null}</p> : null}
        <p className="row">
          <button className="primary" type="submit" disabled={busy || !ready || !form.batch}>{busy ? <><Spinner /> Starting…</> : 'Start run'}</button>
          {msg ? <span className="status err">{msg}</span> : null}
        </p>
      </form>
    </>
  );
}
