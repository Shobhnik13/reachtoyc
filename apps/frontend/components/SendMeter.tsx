'use client';

import Link from 'next/link';
import {useEffect, useState} from 'react';

import {api, type MailStatus, type Settings} from '@/lib/api';

export const MAIL_EVENT = 'reachtoyc:mail';

// Ask the meter to refresh right away, e.g. after a send or Send all
export function refreshMeter() {
  window.dispatchEvent(new Event(MAIL_EVENT));
}

// Top-bar usage meter: emails sent today against the daily limit, like a credits counter
export default function SendMeter() {
  const [mail, setMail] = useState<MailStatus | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const load = () =>
      api<{settings: Settings}>('/settings', {silent: true}).then(
        (d) => {
          setMail(d.settings.mail);
          setFailed(false);
          clearTimeout(timer);
          timer = setTimeout(load, d.settings.mail.queued ? 10000 : 30000);
        },
        () => {
          setFailed(true);
          clearTimeout(timer);
          timer = setTimeout(load, 30000);
        }
      );

    load();
    window.addEventListener(MAIL_EVENT, load);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(MAIL_EVENT, load);
    };
  }, []);

  if (failed || !mail) return null;

  if (!mail.configured) {
    return <Link href="/how-it-works#setup" className="meter off" title="Set GMAIL_USER and GMAIL_APP_PASSWORD in apps/backend/.env to send from the app">✉ Gmail not set up</Link>;
  }

  const limit = mail.daily_limit;
  const used = Math.min(limit, mail.sent_today);
  const left = Math.max(0, limit - mail.sent_today - mail.queued);
  const done = mail.sent_today >= limit;
  const pct = Math.min(100, Math.round((used / Math.max(1, limit)) * 100));

  return (
    <span
      className={`meter ${done ? 'done' : left <= Math.ceil(limit * 0.15) ? 'low' : ''}`}
      title={`${mail.sent_today} sent today from ${mail.from}${mail.queued ? `, ${mail.queued} queued` : ''}. Daily limit ${limit} (set in your profile); it resets at midnight.`}
    >
      <span className="meter-text">
        ✉ <b>{used}</b>/{limit} today
        <span className="meter-sub">{done ? ' · limit reached, resets at midnight' : ` · ${left} left`}</span>
      </span>
      <span className="meter-bar"><span style={{width: `${pct}%`}} /></span>
    </span>
  );
}
