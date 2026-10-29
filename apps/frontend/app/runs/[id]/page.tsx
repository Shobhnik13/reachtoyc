'use client';

import {useParams} from 'next/navigation';
import {useCallback, useEffect, useRef, useState} from 'react';

import DraftCard from '@/components/DraftCard';
import {Loading, Spinner} from '@/components/Spinner';
import {ACTIVE, api, bestEmail, EMAIL_LABEL, fmtDate, type Company, type Draft, type Run} from '@/lib/api';
import {confirmToast, toast} from '@/lib/toast';

const POLL_MS = 30000;
const PAGE = 10;
const SHOW_STATUSES: Record<string, string> = {drafts: 'scraped', skipped: 'skipped,failed', all: 'scraped,skipped,failed'};

export default function RunPage() {
  const {id} = useParams<{id: string}>();
  const [run, setRun] = useState<Run | null>(null);
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [total, setTotal] = useState(0);
  const [count, setCount] = useState(PAGE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [show, setShow] = useState('drafts');
  const [hideSent, setHideSent] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const lastStatus = useRef<string | null>(null);
  const lastDrafts = useRef<Map<number, string>>(new Map());

  const [acting, setActing] = useState<'canceled' | 'queued' | 'regenerate' | null>(null);

  // Filters run on the server; the list holds the first `count` matches and grows as you scroll
  const listUrl = useCallback(
    (limit?: number) => {
      const params = new URLSearchParams({run_id: id, statuses: SHOW_STATUSES[show]});
      if (query) params.set('q', query);
      if (hideSent) params.set('sent', '0');
      if (limit) params.set('limit', String(limit));
      return `/companies?${params}`;
    },
    [id, show, query, hideSent]
  );

  const load = useCallback(async (silent = false) => {
    try {
      const [r, c] = await Promise.all([api<{run: Run}>(`/runs/${id}`, {silent}), api<{companies: Company[]; total: number}>(listUrl(count), {silent})]);
      // Toast when the run finishes or a single regenerate lands, not on the first load
      const prev = lastStatus.current;
      if (prev && ACTIVE.includes(prev as Run['status']) && !ACTIVE.includes(r.run.status)) {
        const d = r.run.stats.drafts;
        if (r.run.status === 'completed') toast.success(`Run #${r.run.id} finished`, {description: `${d.generated} drafts ready${d.failed ? `, ${d.failed} failed` : ''}.`});
        else if (r.run.status === 'failed') toast.error(`Run #${r.run.id} failed`, {description: r.run.error || undefined});
      }
      for (const co of c.companies) {
        const before = lastDrafts.current.get(co.id);
        if (before === 'pending' && co.draft?.status === 'generated' && !ACTIVE.includes(r.run.status)) toast.success(`New draft for ${co.name}`);
        if (before === 'pending' && co.draft?.status === 'failed') toast.error(`Draft for ${co.name} failed`, {description: co.draft.error || undefined});
      }
      lastStatus.current = r.run.status;
      lastDrafts.current = new Map(c.companies.map((co) => [co.id, co.draft?.status || '']));
      setRun(r.run);
      setCompanies(c.companies);
      setTotal(c.total);
      setErr('');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }, [id, listUrl, count]);

  const busy = !!run && (ACTIVE.includes(run.status) || !!companies?.some((c) => c.draft?.status === 'pending'));

  // Debounce search typing
  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  // New filters start again from the first page
  useEffect(() => {
    setCount(PAGE);
    setCompanies(null);
  }, [show, query, hideSent]);

  useEffect(() => {
    load(count > PAGE);
  }, [load]);

  // Load the next page when the bottom of the list scrolls into view
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !companies || companies.length >= total) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !loadingMore) {
        setLoadingMore(true);
        setCount((n) => n + PAGE);
      }
    }, {rootMargin: '300px'});
    obs.observe(el);
    return () => obs.disconnect();
  }, [companies, total, loadingMore]);

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => load(true), POLL_MS);
    return () => clearInterval(t);
  }, [busy, load]);

  function onDraft(d: Draft) {
    setCompanies((cs) => cs?.map((c) => (c.id === d.company_id ? {...c, draft: d} : c)) || null);
    if (d.status === 'pending') setTimeout(() => load(true), POLL_MS);
  }

  async function setStatus(status: 'canceled' | 'queued') {
    const ok = await confirmToast(status === 'queued' ? 'Resume this run?' : 'Cancel this run?', {
      description: status === 'queued' ? 'It continues scraping and writing drafts, billed to your AI key.' : 'Drafts written so far are kept. You can resume later.',
      confirmLabel: status === 'queued' ? 'Resume' : 'Cancel run'
    });
    if (!ok) return;
    setActing(status);
    try {
      const d = await api<{run: Run}>(`/runs/${id}`, {method: 'PUT', body: {status}});
      lastStatus.current = d.run.status;
      setRun(d.run);
      toast.success(status === 'queued' ? `Run #${id} resumed` : `Run #${id} canceled`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setActing(null);
    }
  }

  // Rewrites every unsent draft of this run with the profile's current prompt; sent drafts stay as they are
  async function regenerateAll(count: number) {
    const ok = await confirmToast(`Regenerate all ${count} unsent drafts?`, {
      description: `Rewrites them with your current profile prompt. ${count} AI calls with web search, billed to your key.${run?.use_apify ? ' Founders whose Apify result never saved get looked up again on Apify.' : ''} Sent drafts are not touched. You can cancel the run midway.`,
      confirmLabel: `Regenerate ${count}`
    });
    if (!ok) return;
    setActing('regenerate');
    try {
      const d = await api<{run: Run}>(`/runs/${id}`, {method: 'PUT', body: {status: 'queued', regenerate: true}});
      lastStatus.current = d.run.status;
      setRun(d.run);
      load(true);
      toast.success(`Regenerating ${count} drafts`, {description: 'New versions appear as they are written.'});
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setActing(null);
    }
  }

  // Export covers every match for the current filters, not just the loaded page
  async function exportCsv() {
    let all: Company[];
    try {
      all = (await api<{companies: Company[]}>(listUrl())).companies;
    } catch (e) {
      return toast.error((e as Error).message);
    }
    const header = ['Company', 'Batch', 'To', 'Email', 'Email status', 'Subject', 'Body', 'Hook', 'Sent', 'Website', 'YC'];
    const rows = all.filter((c) => c.draft?.status === 'generated').map((c) => {
      const d = c.draft!;
      const f = c.founders.find((x) => x.id === d.founder_id);
      return [c.name, c.batch, f?.name || '', d.to_email, EMAIL_LABEL[d.email_kind], d.subject, d.body, d.hook, d.sent ? 'yes' : 'no', c.website, `https://www.ycombinator.com/companies/${c.slug}`];
    });
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], {type: 'text/csv;charset=utf-8'}));
    a.download = `reachtoyc-run-${id}.csv`;
    a.click();
    toast.success(`Exported ${rows.length} draft${rows.length === 1 ? '' : 's'}`);
  }

  if (!run) return err ? <p className="status err">{err}</p> : <Loading label="Loading run" />;

  const s = run.stats;
  const drafted = s.drafts.generated + s.drafts.failed;
  const pct = run.status === 'completed' ? 100 : Math.min(100, Math.round(((s.companies.scraped / run.company_limit) * 0.4 + (drafted / run.company_limit) * 0.6) * 100));
  const active = ACTIVE.includes(run.status);
  const unsent = Math.max(0, s.drafts.generated + s.drafts.failed - s.drafts.sent);

  return (
    <>
      <h1>Run #{run.id} · {run.batch}</h1>
      <p className="sub">
        {run.profile_name} · {run.ai_model} · {run.company_limit} companies{run.hiring_only ? ' · hiring only' : ''}{run.use_apify ? ' · Apify' : ''} · started {fmtDate(run.started_at || run.created_at)}
      </p>

      <section className="panel">
        <div className="row">
          <span className={`badge ${run.status}`}>{run.status}</span>
          {active ? <Spinner size={13} /> : null}
          <span className="muted" style={{fontSize: 13}}>
            {run.status === 'scraping' ? 'Reading founders from YC…' : run.status === 'enriching' ? 'Looking up verified emails on Apify…' : run.status === 'drafting' ? 'Researching companies and writing emails…' : run.finished_at ? `finished ${fmtDate(run.finished_at)}` : ''}
          </span>
          <span style={{marginLeft: 'auto'}} className="row">
            {!active && unsent > 0 ? <button type="button" className="ai" disabled={!!acting} onClick={() => regenerateAll(unsent)}>{acting === 'regenerate' ? <Spinner /> : null}✦ Regenerate all ({unsent})</button> : null}
            {active ? <button type="button" className="danger" disabled={!!acting} onClick={() => setStatus('canceled')}>{acting === 'canceled' ? <Spinner /> : null}Cancel run</button> : null}
            {!active && (run.status !== 'completed' || s.drafts.failed > 0) ? <button type="button" className="ai" disabled={!!acting} onClick={() => setStatus('queued')}>{acting === 'queued' ? <Spinner /> : null}{run.status === 'completed' ? 'Retry failed' : 'Resume'}</button> : null}
          </span>
        </div>
        <div className="progress"><div style={{width: `${pct}%`}} /></div>
        <div className="stats">
          <span><b>{s.companies.scraped}</b>companies</span>
          <span><b>{s.drafts.generated}</b>drafts</span>
          <span><b>{s.drafts.pending}</b>writing</span>
          <span><b className={s.drafts.failed ? 'err' : ''}>{s.drafts.failed}</b>failed</span>
          <span><b>{s.companies.skipped}</b>skipped</span>
          <span><b>{s.drafts.sent}</b>sent</span>
        </div>
        {run.error ? <p className="status err">{run.error}</p> : null}
      </section>

      <div className="bar">
        <input type="search" placeholder="Search company or founder" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={show} onChange={(e) => setShow(e.target.value)}>
          <option value="drafts">Drafts</option>
          <option value="skipped">Skipped / failed</option>
          <option value="all">All</option>
        </select>
        <label className="chk"><input type="checkbox" checked={hideSent} onChange={(e) => setHideSent(e.target.checked)} /> hide sent</label>
        <button type="button" onClick={exportCsv}>Export CSV</button>
      </div>
      {err ? <p className="status err">{err}</p> : null}
      <p className="muted" style={{fontSize: 13}}>{companies ? `${companies.length} of ${total} shown` : ''}</p>
      {!companies ? <Loading label="Loading drafts" /> : null}
      {companies && !companies.length ? <p className="muted">Nothing matches.</p> : null}
      {companies?.map((c, i) =>
        c.status === 'scraped' ? (
          <DraftCard key={c.id} company={c} serial={i + 1} onChange={onDraft} />
        ) : (
          <details key={c.id} className="card">
            <summary><span className="serial">{i + 1}.</span><span className="name">{c.name}</span><span className={`badge ${c.status}`}>{c.status}</span><span className="meta">{c.error}</span></summary>
            <div className="cbody"><p className="r muted">{c.one_liner}</p>{c.founders.map((f) => <p key={f.id} className="r">{f.name} · {bestEmail(f).email || 'no email'}</p>)}</div>
          </details>
        )
      )}
      {companies && companies.length < total ? (
        <div ref={sentinel} className="loading">{loadingMore ? <><span className="spin" style={{width: 18, height: 18}} /> Loading more…</> : null}</div>
      ) : null}
    </>
  );
}
