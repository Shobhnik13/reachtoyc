'use client';

import {useEffect, useMemo, useState} from 'react';

import {refreshMeter} from '@/components/SendMeter';
import {Spinner} from '@/components/Spinner';
import {api, bestEmail, EMAIL_LABEL, swapGreeting, type Company, type Draft, type Run} from '@/lib/api';
import {confirmToast, toast} from '@/lib/toast';

// Pick one company and one person from the run and send that email now
export default function SendOne({run, leftToday, onSent, onClose}: {run: Run; leftToday: number; onSent: () => void; onClose: () => void}) {
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [companyId, setCompanyId] = useState('');
  const [founderId, setFounderId] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{companies: Company[]}>(`/companies?run_id=${run.id}&statuses=scraped&sent=0&limit=1000`, {silent: true}).then(
      (d) => {
        const sendable = d.companies
          .filter((c) => c.draft && c.draft.status === 'generated' && !c.draft.sent && ['unsent', 'failed'].includes(c.draft.send_status))
          .sort((a, b) => a.name.localeCompare(b.name));
        setCompanies(sendable);
        if (sendable[0]) setCompanyId(String(sendable[0].id));
      },
      (e) => toast.error(e.message)
    );
  }, [run.id]);

  const company = useMemo(() => companies?.find((c) => String(c.id) === companyId) || null, [companies, companyId]);
  const draft = company?.draft as Draft | undefined;

  // Default to whoever the draft is written to
  useEffect(() => {
    if (draft) setFounderId(String(draft.founder_id ?? company?.founders[0]?.id ?? ''));
  }, [draft, company]);

  const founder = company?.founders.find((f) => String(f.id) === founderId);
  const email = founder ? bestEmail(founder) : null;
  const switching = !!founder && founder.id !== draft?.founder_id;
  const to = switching ? email?.email || '' : draft?.to_email || '';
  const current = company?.founders.find((f) => f.id === draft?.founder_id);
  const previewBody = draft ? (switching && current && founder ? swapGreeting(draft.body, current.name, founder.name) : draft.body) : '';

  async function send() {
    if (!draft || !founder || !to) return;
    const ok = await confirmToast(`Send to ${founder.name} at ${company?.name}?`, {description: `${to}, from your Gmail, as written. This can't be undone.`, confirmLabel: 'Send now'});
    if (!ok) return;
    setBusy(true);
    try {
      // Same company, so the email still fits: switching only swaps the address and greeting, no AI call
      if (switching) await api(`/drafts/${draft.id}`, {method: 'PUT', body: {founder_id: founder.id}});
      await api(`/drafts/${draft.id}`, {method: 'PUT', body: {send: true}});
      toast.success(`Sending to ${founder.name}`, {description: `${to} · goes out within a few seconds`});
      refreshMeter();
      setCompanies((cs) => cs?.filter((c) => c.id !== company?.id) || null);
      onSent();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sendbox">
      {!companies ? (
        <p className="row muted" style={{margin: 0}}><Spinner /> Loading companies…</p>
      ) : !companies.length ? (
        <p className="muted" style={{margin: 0}}>Every written email in this run is already sent or queued.</p>
      ) : (
        <>
          <div className="grid" style={{marginBottom: 8}}>
            <label className="f">
              Company ({companies.length} ready)
              <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="f">
              Person
              <select value={founderId} onChange={(e) => setFounderId(e.target.value)}>
                {company?.founders.map((f) => {
                  const e = bestEmail(f);
                  return <option key={f.id} value={f.id} disabled={!e.email}>{f.name}{f.title ? ` (${f.title})` : ''} · {e.email || 'no email'}{e.email ? ` · ${EMAIL_LABEL[e.kind]}` : ''}</option>;
                })}
              </select>
            </label>
          </div>
          {draft ? (
            <div className="preview-send">
              <p><span className="muted">To</span> {to || <span className="err">no address</span>} {email && to ? <span className={`badge ${switching ? email.kind : draft.email_kind}`}>{EMAIL_LABEL[switching ? email.kind : draft.email_kind]}</span> : null}</p>
              <p><span className="muted">Subject</span> {draft.subject}</p>
              <p className="muted" style={{whiteSpace: 'pre-wrap'}}>{previewBody.split('\n').slice(0, 3).join('\n')}…</p>
              {switching ? <p className="hint" style={{margin: 0}}>Switching to {founder?.name}: the address and greeting change, the rest of the email stays.</p> : null}
            </div>
          ) : null}
          {!leftToday ? <p className="status err">Today&apos;s limit is used. Come back tomorrow.</p> : null}
          <p className="row" style={{marginTop: 10}}>
            <button type="button" className="send" disabled={busy || !to || !leftToday} onClick={send}>{busy ? <Spinner /> : '✉ '}Send{founder ? ` to ${founder.name.split(' ')[0]}` : ''}</button>
            <button type="button" className="ghost" onClick={onClose}>Close</button>
          </p>
        </>
      )}
    </div>
  );
}
