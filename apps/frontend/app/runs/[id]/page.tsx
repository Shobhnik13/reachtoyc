'use client';

import {useParams} from 'next/navigation';
import {useCallback, useEffect, useRef, useState} from 'react';

import DraftCard from '@/components/DraftCard';
import SendOne from '@/components/SendOne';
import {refreshMeter} from '@/components/SendMeter';
import {Loading, Spinner} from '@/components/Spinner';
import {ACTIVE, api, bestEmail, EMAIL_LABEL, fmtDate, type Company, type Draft, type EmailKind, type MailStatus, type Run, type Settings} from '@/lib/api';
import {confirmToast, toast} from '@/lib/toast';

const POLL_MS = 30000;
// A one-company run finishes in a minute or two, so its steps refresh faster
const SINGLE_POLL_MS = 4000;
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

  const [acting, setActing] = useState<'canceled' | 'queued' | 'regenerate' | 'send' | 'pause' | 'resume' | 'cancel-send' | null>(null);
  const [mail, setMail] = useState<MailStatus | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [oneOpen, setOneOpen] = useState(false);
  const [withGuesses, setWithGuesses] = useState(false);
  const [withCofounders, setWithCofounders] = useState(false);
  const [now, setNow] = useState(Date.now());

  const single = run?.source === 'url';

  // Filters run on the server; the list holds the first `count` matches and grows as you scroll
  const listUrl = useCallback(
    (limit?: number) => {
      const params = new URLSearchParams({run_id: id, statuses: single ? 'pending,scraped,skipped,failed' : SHOW_STATUSES[show]});
      if (query) params.set('q', query);
      if (hideSent) params.set('sent', '0');
      if (limit) params.set('limit', String(limit));
      return `/companies?${params}`;
    },
    [id, show, query, hideSent, single]
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
    const t = setInterval(() => load(true), single ? SINGLE_POLL_MS : POLL_MS);
    return () => clearInterval(t);
  }, [busy, load]);

  function onDraft(d: Draft) {
    if (d.send_status === 'queued') {
      refreshMeter();
      loadMail();
    }
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
  const loadMail = useCallback(() => {
    api<{settings: Settings}>('/settings', {silent: true}).then((d) => setMail(d.settings.mail), () => setMail(null));
  }, []);

  useEffect(() => {
    loadMail();
  }, [loadMail]);

  // While emails are queued: refresh the queue every 15s and tick the "next in" countdown every second
  const jobOpen = !!run?.send_job && ['pending', 'preparing'].includes(run.send_job.status);
  const sendingActive = !!run && (run.stats.send.queued > 0 || run.stats.send.sending > 0 || jobOpen);

  useEffect(() => {
    if (!sendingActive) return;
    const poll = setInterval(() => {
      load(true);
      loadMail();
    }, jobOpen ? 4000 : 15000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [sendingActive, jobOpen, load, loadMail]);

  async function sendAll(count: number) {
    const ok = await confirmToast(withCofounders ? `Send to ${count} companies and their co-founders?` : `Send ${count} emails from your Gmail?`, {
      description: `One at a time, about a minute apart${withCofounders ? '; every founder with an address gets their own copy, each counting toward today\'s limit' : ''}. You can pause or cancel anytime; sent emails can't be undone.`,
      confirmLabel: `Send ${count}`
    });
    if (!ok) return;
    setActing('send');
    try {
      // Returns at once: the job prepares the queue in the background and the bar below shows its progress
      const d = await api<{run: Run}>(`/runs/${id}`, {method: 'PUT', body: {send_all: true, include_guesses: withGuesses, include_cofounders: withCofounders}});
      setRun(d.run);
      setSendOpen(false);
      load(true);
      refreshMeter();
      toast.success('Send started', {description: 'Preparing the emails in the background. You can leave this page; sending continues while the backend runs.'});
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setActing(null);
    }
  }

  async function controlSending(action: 'pause' | 'resume' | 'cancel') {
    if (action === 'cancel' && !(await confirmToast('Cancel the send queue?', {description: 'Queued emails go back to unsent. Emails already sent stay sent.', confirmLabel: 'Cancel queue'}))) return;
    setActing(action === 'cancel' ? 'cancel-send' : action);
    try {
      const d = await api<{run: Run}>(`/runs/${id}`, {method: 'PUT', body: {sending: action}});
      setRun(d.run);
      load(true);
      loadMail();
      refreshMeter();
      toast.success(action === 'pause' ? 'Sending paused' : action === 'resume' ? 'Sending resumed' : 'Send queue canceled');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setActing(null);
    }
  }

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

  if (run.source === 'url') return <SingleCompanyRun run={run} company={companies?.[0] || null} acting={acting} onStatus={setStatus} onDraft={onDraft} mailReady={!!mail?.configured} />;

  const s = run.stats;
  const drafted = s.drafts.generated + s.drafts.failed;
  const pct = run.status === 'completed' ? 100 : Math.min(100, Math.round(((s.companies.scraped / run.company_limit) * 0.4 + (drafted / run.company_limit) * 0.6) * 100));
  const active = ACTIVE.includes(run.status);
  const unsent = Math.max(0, s.drafts.generated + s.drafts.failed - s.drafts.sent);
  const ready = s.ready;
  const readyCount = (Object.entries(ready) as [EmailKind, number][]).reduce((n, [k, v]) => n + (k === 'guess' && !withGuesses ? 0 : v), 0);
  const queuedNow = s.send.queued + s.send.sending;
  const leftToday = mail ? Math.max(0, run.daily_send_limit - mail.sent_today - mail.queued) : 0;
  const continuing = s.send.sent > 0;
  const toSend = readyCount;
  const willSend = Math.min(readyCount, leftToday);
  const nextIn = mail?.next_at ? Math.max(0, Math.round((new Date(mail.next_at).getTime() - now) / 1000)) : null;

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
            {!active && (readyCount > 0 || (ready.guess ?? 0) > 0) && !queuedNow && !jobOpen ? <button type="button" className={`send ${sendOpen ? 'on' : ''}`} disabled={!!acting} onClick={() => { setSendOpen((o) => !o); setOneOpen(false); }}>✉ {continuing ? `Continue sending (${toSend} left)` : 'Send all'}</button> : null}
            {!active && (readyCount > 0 || (ready.guess ?? 0) > 0) ? <button type="button" className={`ghost ${oneOpen ? 'on' : ''}`} disabled={!!acting} onClick={() => { setOneOpen((o) => !o); setSendOpen(false); }}>✉ Send one</button> : null}
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
        {oneOpen && mail?.configured ? <SendOne run={run} leftToday={leftToday} onSent={() => { load(true); loadMail(); }} onClose={() => setOneOpen(false)} /> : null}
        {oneOpen && mail && !mail.configured ? <p className="status err">Set <code>GMAIL_USER</code> and <code>GMAIL_APP_PASSWORD</code> in <code>apps/backend/.env</code> to send from the app.</p> : null}
        {!queuedNow && continuing && readyCount > 0 && !leftToday && mail?.configured ? (
          <p className="status" style={{marginTop: 12}}>
            <b>{readyCount} emails from this run still to send.</b> <span className="muted">Today&apos;s limit of {run.daily_send_limit} is used. Come back tomorrow and press <b>Continue sending</b>: it picks up from where it stopped, and nobody gets a second email.</span>
          </p>
        ) : null}
        {sendOpen && !queuedNow ? (
          <div className="sendbox">
            {!mail?.configured ? (
              <p className="status err" style={{margin: 0}}>Set <code>GMAIL_USER</code> and <code>GMAIL_APP_PASSWORD</code> in <code>apps/backend/.env</code> and restart the backend to send from your Gmail.</p>
            ) : (
              <>
                <p style={{margin: '0 0 8px'}}><b>{readyCount} emails ready to send</b> from {mail.from}:</p>
                <div className="row" style={{gap: 6}}>
                  {(['manual', 'valid', 'unknown', 'site', 'guess'] as EmailKind[]).filter((k) => ready[k]).map((k) => (
                    <span key={k} className={`badge ${k}`} style={k === 'guess' && !withGuesses ? {opacity: 0.45} : undefined}>{ready[k]} {EMAIL_LABEL[k]}</span>
                  ))}
                </div>
                <label className="chk" style={{marginTop: 10}}>
                  <input type="checkbox" checked={withCofounders} onChange={(e) => setWithCofounders(e.target.checked)} /> also send to co-founders (same email, their own greeting; each one counts toward today&apos;s limit)
                </label>
                {ready.guess ? (
                  <label className="chk" style={{marginTop: 6}}><input type="checkbox" checked={withGuesses} onChange={(e) => setWithGuesses(e.target.checked)} /> also send the {ready.guess} pattern guesses (about 1 in 5 may bounce)</label>
                ) : null}
                <p className="hint">
                  Daily limit {run.daily_send_limit} ({mail.sent_today} sent today{mail.queued ? `, ${mail.queued} queued` : ''}), so <b>{leftToday}</b> more can go out today. One at a time, 45-120 s apart. Addresses and companies you already emailed are skipped. Change the limit in your <a href={`/profiles/${run.profile_id}`}>profile</a>.
                </p>
                {!leftToday ? <p className="status err">Today&apos;s limit of {run.daily_send_limit} is reached. Send the rest tomorrow, or raise the limit in your profile.</p> : null}
                {leftToday && readyCount > leftToday ? <p className="status err">Only {leftToday} of the {readyCount} fit in today&apos;s limit. The other {readyCount - leftToday} stay unsent; send them tomorrow.</p> : null}
                <p className="row" style={{marginTop: 10}}>
                  <button type="button" className="send" disabled={!!acting || !willSend} onClick={() => sendAll(willSend)}>{acting === 'send' ? <Spinner /> : null}Send {willSend}</button>
                  <button type="button" className="ghost" onClick={() => setSendOpen(false)}>Close</button>
                </p>
              </>
            )}
          </div>
        ) : null}
        {jobOpen ? (
          <div className="sendbar">
            <Spinner />
            <span>
              <b>Preparing emails…</b> <span className="muted">{run.send_job!.total} queued so far{run.send_job!.include_cofounders ? ', including co-founders' : ''}. Sending starts as they are ready.</span>
            </span>
            <span className="row" style={{marginLeft: 'auto'}}>
              <button type="button" className="danger" disabled={!!acting} onClick={() => controlSending('cancel')}>{acting === 'cancel-send' ? <Spinner /> : null}Cancel</button>
            </span>
          </div>
        ) : null}
        {run.send_job?.status === 'failed' ? <p className="status err">Send job failed: {run.send_job.error}</p> : null}
        {run.send_job?.status === 'ready' && run.send_job.over_limit > 0 && !queuedNow ? (
          <p className="status muted">{run.send_job.over_limit} more were over today&apos;s limit and stay unsent. Come back tomorrow and press Continue sending.</p>
        ) : null}
        {!jobOpen && (queuedNow || run.send_paused) ? (
          <div className="sendbar">
            <span className={`badge ${run.send_paused ? 'canceled' : 'sending'}`}>{run.send_paused ? 'sending paused' : 'sending'}</span>
            <span>
              <b>{s.send.sent}</b> sent · <b>{s.send.queued}</b> queued{s.send.failed ? <> · <span className="err">{s.send.failed} failed</span></> : null}
              {!run.send_paused && mail ? (
                <span className="muted">
                  {' · '}
                  {mail.phase === 'sending' || s.send.sending ? 'sending now…' : nextIn !== null ? `next in ${nextIn}s` : 'starting…'}
                </span>
              ) : null}
            </span>
            <span className="row" style={{marginLeft: 'auto'}}>
              {run.send_paused ? (
                <button type="button" className="send" disabled={!!acting} onClick={() => controlSending('resume')}>{acting === 'resume' ? <Spinner /> : null}Resume sending</button>
              ) : (
                <button type="button" disabled={!!acting} onClick={() => controlSending('pause')}>{acting === 'pause' ? <Spinner /> : null}Pause</button>
              )}
              {s.send.queued ? <button type="button" className="danger" disabled={!!acting} onClick={() => controlSending('cancel')}>{acting === 'cancel-send' ? <Spinner /> : null}Cancel queue</button> : null}
            </span>
          </div>
        ) : null}
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
          <DraftCard key={c.id} company={c} serial={i + 1} onChange={onDraft} mailReady={!!mail?.configured} />
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

const STEPS: {key: string; label: (name: string) => string}[] = [
  {key: 'research', label: (name) => `Researching ${name}: what it builds, founders, open roles`},
  {key: 'emails', label: () => 'Finding and verifying emails'},
  {key: 'write', label: () => 'Writing your email'}
];

// One company from a URL: a step list while it works, then just the draft card
function SingleCompanyRun({run, company, acting, onStatus, onDraft, mailReady}: {run: Run; company: Company | null; acting: string | null; onStatus: (s: 'canceled' | 'queued') => void; onDraft: (d: Draft) => void; mailReady: boolean}) {
  const active = ACTIVE.includes(run.status);
  const draftStatus = company?.draft?.status;
  const current = !active ? (run.status === 'completed' ? 3 : -1) : run.status === 'drafting' || draftStatus === 'pending' ? 2 : run.status === 'enriching' ? 1 : 0;
  const failed = company?.status === 'failed' || draftStatus === 'failed' || run.status === 'failed';
  const done = !active && company?.status === 'scraped' && draftStatus && draftStatus !== 'pending';
  const name = company?.name || run.batch;

  return (
    <>
      <div className="head">
        <div>
          <h1>{name}</h1>
          <p className="sub" style={{marginBottom: 16}}>
            {company?.website ? <a href={company.website} target="_blank" rel="noopener noreferrer">{run.batch}</a> : run.batch} · {run.profile_name} · {run.ai_model} · {fmtDate(run.started_at || run.created_at)}
          </p>
        </div>
        <span className="row">
          {active ? <button type="button" className="danger" disabled={!!acting} onClick={() => onStatus('canceled')}>{acting === 'canceled' ? <Spinner /> : null}Cancel</button> : null}
          {!active && (failed || run.status === 'canceled') ? <button type="button" className="ai" disabled={!!acting} onClick={() => onStatus('queued')}>{acting === 'queued' ? <Spinner /> : null}Try again</button> : null}
        </span>
      </div>

      {!done ? (
        <section className="panel steps-panel">
          {STEPS.map((step, i) => {
            const state = current > i || (done && i < 3) ? 'done' : current === i ? 'now' : 'todo';
            return (
              <div key={step.key} className={`step-line ${state}`}>
                <span className="step-icon">{state === 'done' ? '✓' : state === 'now' ? <Spinner size={14} /> : i + 1}</span>
                <span>{step.label(name)}</span>
              </div>
            );
          })}
          {failed ? <p className="status err">{company?.error || company?.draft?.error || run.error || 'Something went wrong.'} Press Try again.</p> : null}
          {run.status === 'canceled' && !failed ? <p className="status muted">Canceled. Press Try again to continue.</p> : null}
          {run.error && !failed ? <p className="status muted">{run.error}</p> : null}
        </section>
      ) : null}

      {done && company ? <DraftCard company={company} onChange={onDraft} defaultOpen mailReady={mailReady} /> : null}
    </>
  );
}
