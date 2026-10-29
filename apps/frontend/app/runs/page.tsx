'use client';

import Link from 'next/link';
import {useEffect, useState} from 'react';

import DraftMore from '@/components/DraftMore';
import {Loading} from '@/components/Spinner';
import {ACTIVE, api, fmtDate, type Run} from '@/lib/api';

export default function RunsPage() {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [err, setErr] = useState('');

  const [tick, setTick] = useState(0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const load = (silent = false) =>
      api<{runs: Run[]}>('/runs', {silent}).then(
        (d) => {
          setRuns(d.runs);
          if (d.runs.some((r) => ACTIVE.includes(r.status))) timer = setTimeout(() => load(true), 5000);
        },
        (e) => setErr(e.message)
      );
    load();
    return () => clearTimeout(timer);
  }, [tick]);

  function onMore(run: Run) {
    setRuns((rs) => rs?.map((r) => (r.id === run.id ? run : r)) || null);
    setTick((t) => t + 1);
  }

  return (
    <>
      <div className="head">
        <h1>Runs</h1>
        <span className="row">
          <Link className="btn" href="/runs/company">Run for a different company</Link>
          <Link className="btn primary" href="/runs/new">+ New run</Link>
        </span>
      </div>
      <p className="sub">Each run picks a YC batch, finds founder emails, researches every company and drafts one personalised email per company from your profile.</p>
      {err ? <p className="status err">{err}. Is the backend running?</p> : null}
      {!runs && !err ? <Loading label="Loading runs" /> : null}
      {runs && !runs.length ? (
        <section className="panel">
          <p style={{marginTop: 0}}>No runs yet.</p>
          <p className="row"><Link className="btn" href="/profiles/new">1. Create a profile</Link><Link className="btn primary" href="/runs/new">2. Start a run</Link></p>
        </section>
      ) : null}
      {runs?.length ? (
        <section className="panel">
          <table>
            <thead><tr><th>Run</th><th>Batch</th><th>Profile</th><th>Status</th><th>Drafts</th><th>Sent</th><th>Started</th><th></th></tr></thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/runs/${r.id}`}>#{r.id}</Link></td>
                  <td>{r.batch}{r.source === 'url' ? <span className="muted" style={{fontSize: 12}}> · custom</span> : null}</td>
                  <td>{r.profile_name}</td>
                  <td><span className={`badge ${r.status}`}>{r.status}</span></td>
                  <td>{r.stats.drafts.generated} / {r.company_limit}{r.stats.drafts.failed ? <span className="err"> ({r.stats.drafts.failed} failed)</span> : null}</td>
                  <td>{r.stats.drafts.sent}</td>
                  <td className="muted">{fmtDate(r.started_at || r.created_at)}</td>
                  <td style={{textAlign: 'right'}}><DraftMore run={r} onDone={onMore} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </>
  );
}
