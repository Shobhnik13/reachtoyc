'use client';

import Link from 'next/link';
import {useEffect, useState} from 'react';

import {Loading, Spinner} from '@/components/Spinner';
import {api, EMAIL_LABEL, type Draft} from '@/lib/api';
import {toast} from '@/lib/toast';

export default function DraftsPage() {
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [sent, setSent] = useState('0');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState<number | null>(null);

  useEffect(() => {
    const qs = sent === '' ? '' : `&sent=${sent}`;
    setDrafts(null);
    api<{drafts: Draft[]}>(`/drafts?statuses=generated${qs}`).then((d) => setDrafts(d.drafts), (e) => setErr(e.message));
  }, [sent]);

  async function markSent(d: Draft, value: boolean) {
    setSaving(d.id);
    try {
      const res = await api<{draft: Draft}>(`/drafts/${d.id}`, {method: 'PUT', body: {sent: value}});
      setDrafts((ds) => ds?.map((x) => (x.id === d.id ? {...x, ...res.draft} : x)) || null);
      toast.success(`${d.company?.name} marked ${value ? 'sent' : 'not sent'}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(null);
    }
  }

  return (
    <>
      <h1>Drafts</h1>
      <p className="sub">Every generated email across all runs. Open a run to edit, regenerate or copy a draft.</p>
      <div className="bar">
        <select value={sent} onChange={(e) => setSent(e.target.value)}>
          <option value="0">Not sent yet</option>
          <option value="1">Sent</option>
          <option value="">All</option>
        </select>
      </div>
      {err ? <p className="status err">{err}</p> : null}
      {!drafts && !err ? <Loading label="Loading drafts" /> : null}
      {drafts && !drafts.length ? <p className="muted">Nothing here.</p> : null}
      {drafts?.length ? (
        <section className="panel">
          <table>
            <thead><tr><th>Company</th><th>To</th><th>Subject</th><th>Run</th><th>Sent</th></tr></thead>
            <tbody>
              {drafts.map((d) => (
                <tr key={d.id}>
                  <td>{d.company?.name}<br /><span className="muted" style={{fontSize: 12}}>{d.company?.batch}</span></td>
                  <td>{d.to_email || <span className="muted">none</span>} <span className={`badge ${d.email_kind}`}>{EMAIL_LABEL[d.email_kind]}</span></td>
                  <td>{d.subject}</td>
                  <td><Link href={`/runs/${d.run_id}`}>#{d.run_id}</Link></td>
                  <td>{saving === d.id ? <Spinner /> : <input type="checkbox" style={{width: 'auto'}} checked={d.sent} onChange={(e) => markSent(d, e.target.checked)} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </>
  );
}
