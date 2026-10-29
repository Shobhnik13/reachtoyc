'use client';

import {useState} from 'react';

import {Spinner} from '@/components/Spinner';
import {ACTIVE, api, type Run} from '@/lib/api';
import {confirmToast, toast} from '@/lib/toast';

// Adds the next N new companies of the batch to an existing run (50 + 20 = 70), never repeating one
export default function DraftMore({run, onDone}: {run: Run; onDone: (run: Run) => void}) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState('20');
  const [busy, setBusy] = useState(false);
  const left = run.stats.companies.pending;

  if (ACTIVE.includes(run.status) || left < 1) return null;

  async function submit() {
    const n = Math.min(parseInt(count) || 0, left);
    if (n < 1) return toast.error('Pick at least 1 company');
    const ok = await confirmToast(`Draft ${n} more for run #${run.id}?`, {
      description: `Next ${n} new companies from ${run.batch} (${run.stats.companies.scraped} → ${run.stats.companies.scraped + n} in this run). ${n} AI calls${run.use_apify ? ' plus Apify lookups' : ''}, billed to your keys.`,
      confirmLabel: `Draft ${n} more`
    });
    if (!ok) return;
    setBusy(true);
    try {
      const d = await api<{run: Run}>(`/runs/${run.id}`, {method: 'PUT', body: {status: 'queued', add_companies: n}});
      toast.success(`Run #${run.id}: drafting ${n} more`, {description: `${d.run.company_limit} companies in this run when done.`});
      setOpen(false);
      onDone(d.run);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return <button type="button" className="ai sm" onClick={() => setOpen(true)}>+ Draft more</button>;
  }

  return (
    <span className="more">
      <input type="number" min="1" max={Math.min(500, left)} value={count} onChange={(e) => setCount(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} aria-label="How many more companies" autoFocus />
      <button type="button" className="ai sm" disabled={busy} onClick={submit}>{busy ? <Spinner /> : null}Draft</button>
      <button type="button" className="ghost sm" onClick={() => setOpen(false)} aria-label="Close">✕</button>
      <span className="muted" style={{fontSize: 12}}>{left} left</span>
    </span>
  );
}
