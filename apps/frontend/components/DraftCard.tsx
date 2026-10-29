'use client';

import {useEffect, useRef, useState} from 'react';

import {Spinner} from '@/components/Spinner';
import {api, bestEmail, EMAIL_LABEL, safeUrl, type Company, type Draft} from '@/lib/api';
import {toast} from '@/lib/toast';

type Part = 'body' | 'subject' | 'all';

const PART_LABEL: Record<Part, string> = {body: 'Regenerate email', subject: 'Regenerate subject', all: 'Regenerate all'};

function CopyButton({text, label, what, primary}: {text: string; label: string; what: string; primary?: boolean}) {
  return (
    <button type="button" className={primary ? 'primary' : ''} disabled={!text} onClick={() => navigator.clipboard.writeText(text).then(
      () => toast.success(`Copied ${what}`),
      () => toast.error("Couldn't copy to the clipboard")
    )}>
      {label}
    </button>
  );
}

export default function DraftCard({company, serial, onChange, defaultOpen = false}: {company: Company; serial?: number; onChange: (d: Draft) => void; defaultOpen?: boolean}) {
  const draft = company.draft;
  const [subject, setSubject] = useState(draft?.subject || '');
  const [body, setBody] = useState(draft?.body || '');
  const [toEmail, setToEmail] = useState(draft?.to_email || '');
  const [busy, setBusy] = useState<string | null>(null);
  const [regenOpen, setRegenOpen] = useState(false);
  const [instructions, setInstructions] = useState('');
  // Last values from the server; a field the user hasn't touched since then follows the server
  const synced = useRef({subject: draft?.subject || '', body: draft?.body || '', to_email: draft?.to_email || ''});
  const dirty = !!draft && (subject !== draft.subject || body !== draft.body || toEmail !== draft.to_email);

  useEffect(() => {
    if (!draft) return;
    const prev = synced.current;
    setSubject((v) => (v === prev.subject ? draft.subject : v));
    setBody((v) => (v === prev.body ? draft.body : v));
    setToEmail((v) => (v === prev.to_email ? draft.to_email : v));
    synced.current = {subject: draft.subject, body: draft.body, to_email: draft.to_email};
  }, [draft?.subject, draft?.body, draft?.to_email, draft?.status]);

  async function put(patch: Record<string, unknown>, success?: string, action = 'save') {
    if (!draft) return;
    setBusy(action);
    try {
      const d = await api<{draft: Draft}>(`/drafts/${draft.id}`, {method: 'PUT', body: patch});
      // Our own action: show exactly what the server saved
      synced.current = {subject: d.draft.subject, body: d.draft.body, to_email: d.draft.to_email};
      setSubject(d.draft.subject);
      setBody(d.draft.body);
      setToEmail(d.draft.to_email);
      onChange(d.draft);
      if (success) toast.success(success);
      return d.draft;
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  // Unsaved edits go first, so a partial regenerate builds on what's on screen
  async function regenerate(part: Part) {
    if (dirty && part !== 'all') await put({subject, body, to_email: toEmail}, undefined, `regen-${part}`);
    const saved = await put({status: 'pending', part, instructions: instructions.trim() || undefined}, `${PART_LABEL[part]} for ${company.name}…`, `regen-${part}`);
    if (saved) {
      setRegenOpen(false);
      setInstructions('');
    }
  }

  // Same company, so the email still fits: swap the address and greeting, no AI call
  async function switchTo(founder: {id: number; name: string}) {
    if (dirty) await put({subject, body}, undefined, `founder-${founder.id}`);
    await put({founder_id: founder.id}, `Now writing to ${founder.name}`, `founder-${founder.id}`);
  }

  const recipient = company.founders.find((f) => f.id === draft?.founder_id);
  const kind = draft?.email_kind || 'none';
  const generated = draft?.status === 'generated';
  const label = !draft ? 'waiting' : draft.status === 'pending' ? 'writing…' : draft.status === 'failed' ? 'failed' : EMAIL_LABEL[kind];
  const badge = !draft || draft.status === 'pending' ? 'pending' : draft.status === 'failed' ? 'failed' : kind;
  const mailto = `mailto:${encodeURIComponent(toEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <details className={`card ${draft?.sent ? 'sent' : ''}`} open={defaultOpen || undefined}>
      <summary>
        {serial ? <span className="serial">{serial}.</span> : null}
        <span className="name">{company.name}</span>
        <span className={`badge ${badge}`}>{label}</span>
        {draft?.sent ? <span className="badge valid">sent</span> : null}
        <span className="meta">
          {recipient?.name || company.founders[0]?.name || ''}
          <br />
          {company.batch}
          {company.job_count ? <><br /><span className="site">{company.job_count} open role{company.job_count === 1 ? '' : 's'}</span></> : null}
        </span>
      </summary>
      <div className="cbody">
        <p className="r muted">
          {company.one_liner}
          {safeUrl(company.website) ? <> · <a href={safeUrl(company.website)} target="_blank" rel="noopener">website</a></> : null}
          {company.slug.startsWith('url-') ? null : <>{' · '}<a href={`https://www.ycombinator.com/companies/${company.slug}`} target="_blank" rel="noopener">YC</a></>}
          {safeUrl(recipient?.linkedin) ? <> · <a href={safeUrl(recipient?.linkedin)} target="_blank" rel="noopener">LinkedIn</a></> : null}
          {safeUrl(recipient?.twitter) ? <> · <a href={safeUrl(recipient?.twitter)} target="_blank" rel="noopener">X</a></> : null}
        </p>
        {company.jobs.length ? (
          <p className="r"><b>Jobs</b>{company.jobs.map((j, i) => <span key={i}>{i ? ' · ' : ''}{safeUrl(j.url) ? <a href={safeUrl(j.url)} target="_blank" rel="noopener">{j.title}</a> : j.title}</span>)}</p>
        ) : null}
        <div className="r">
          <b>{company.slug.startsWith('url-') ? 'People' : 'Founders'}</b>
          {company.founders.map((f) => {
            const e = bestEmail(f);
            const isTo = f.id === draft?.founder_id;
            return (
              <div key={f.id} style={{margin: '4px 0 0 74px'}}>
                {f.name}{f.title ? ` (${f.title})` : ''} · {e.email || 'no email'} <span className={`badge ${e.kind}`}>{EMAIL_LABEL[e.kind]}</span>
                {isTo ? <span className="badge recipient">recipient</span> : draft && draft.status !== 'pending' ? <> <button type="button" className="ghost sm" disabled={!!busy} onClick={() => switchTo(f)}>{busy === `founder-${f.id}` ? <Spinner /> : null}switch to {f.name.split(' ')[0]}</button></> : null}
              </div>
            );
          })}
        </div>

        {draft?.status === 'failed' ? <p className="status err">{draft.error}</p> : null}
        {draft?.status === 'pending' ? <p className="status muted row"><Spinner /> Writing with AI…</p> : null}

        {generated ? (
          <>
            {draft.error ? <p className="status err">Last regenerate failed: {draft.error}. Your email is unchanged.</p> : null}
            <label className="f" style={{marginTop: 12}}>To<input value={toEmail} onChange={(e) => setToEmail(e.target.value)} placeholder="name@company.com" /></label>
            {!draft.to_email ? <p className="hint">No email found for this company. Type the address in To and press Save edits.</p> : null}
            {recipient && recipient.email_guesses.length > 1 && kind === 'guess' ? <p className="hint">Other guesses: {recipient.email_guesses.slice(1).join(', ')}</p> : null}
            <label className="f" style={{marginTop: 10}}>Subject<input value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
            <label className="f" style={{marginTop: 10}}>Body<textarea value={body} onChange={(e) => setBody(e.target.value)} style={{minHeight: 340}} /></label>
          </>
        ) : null}

        <div className="acts">
          {generated ? (
            <>
              <CopyButton primary text={body} label="Copy body" what="body" />
              <CopyButton text={subject} label="Copy subject" what="subject" />
              <CopyButton text={toEmail} label="Copy email" what={toEmail} />
              <a className="btn" href={mailto}>Open in mail app</a>
              {dirty ? <button type="button" className="save" disabled={!!busy} onClick={() => put({subject, body, to_email: toEmail}, 'Edits saved')}>{busy === 'save' ? <Spinner /> : null}Save edits</button> : null}
              <button type="button" className={draft.sent ? 'success on' : 'success'} disabled={!!busy} onClick={() => put({sent: !draft.sent}, draft.sent ? `${company.name} marked not sent` : `${company.name} marked sent`, 'sent')}>
                {busy === 'sent' ? <Spinner /> : draft.sent ? '✓ ' : null}{draft.sent ? 'Sent' : 'Mark sent'}
              </button>
            </>
          ) : null}
          {draft && draft.status !== 'pending' ? (
            <button type="button" className={`ai ${regenOpen ? 'on' : ''}`} disabled={!!busy} onClick={() => setRegenOpen((o) => !o)}>✦ Regenerate</button>
          ) : null}
        </div>

        {regenOpen && draft && draft.status !== 'pending' ? (
          <div className="regen">
            <label className="f">
              Context for the AI <span className="muted" style={{fontWeight: 400}}>(optional, 1-2 lines)</span>
              <textarea
                className="short"
                maxLength={500}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="e.g. lead with the aistetic agentic pipeline, mention their founding engineer role, keep the why line shorter"
              />
            </label>
            <div className="row" style={{marginTop: 10}}>
              {(generated ? (['body', 'subject', 'all'] as Part[]) : (['all'] as Part[])).map((p) => (
                <button key={p} type="button" className="ai" disabled={!!busy} onClick={() => regenerate(p)}>
                  {busy === `regen-${p}` ? <Spinner /> : null}{PART_LABEL[p]}
                </button>
              ))}
              <button type="button" className="ghost" onClick={() => setRegenOpen(false)}>Close</button>
            </div>
            <p className="hint">
              Email: new body, keeps your subject. Subject: new subject from the current email, no web search. All: fresh research and a full rewrite. Each is one AI call on your key.
            </p>
          </div>
        ) : null}
      </div>
    </details>
  );
}
