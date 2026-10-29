'use client';

import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useEffect, useState} from 'react';
import {Toaster} from 'sonner';

import {onLoading} from '@/lib/api';

type Theme = 'light' | 'dark';

const LINKS = [
  {href: '/', label: 'Runs'},
  {href: '/drafts', label: 'Drafts'},
  {href: '/profiles', label: 'Profiles'},
  {href: '/how-it-works', label: 'How it works'}
];

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export default function Shell({children}: {children: React.ReactNode}) {
  const pathname = usePathname();
  const [theme, setTheme] = useState<Theme>('light');
  const [loading, setLoading] = useState(false);

  useEffect(() => setTheme(currentTheme()), []);

  // Show the bar only for requests that take longer than a blink
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return onLoading((n) => {
      clearTimeout(timer);
      if (n > 0) timer = setTimeout(() => setLoading(true), 120);
      else setLoading(false);
    });
  }, []);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('theme', next);
    } catch {}
    setTheme(next);
  }

  const active = (href: string) => (href === '/' ? pathname === '/' || pathname.startsWith('/runs/') && pathname !== '/runs/new' : pathname.startsWith(href));

  return (
    <>
      <header className="top">
        <nav>
          <Link href="/" className="brand"><span className="logo" aria-hidden>r</span>reachtoyc</Link>
          <div className="links">
            {LINKS.map((l) => <Link key={l.href} href={l.href} className={active(l.href) ? 'on' : ''}>{l.label}</Link>)}
          </div>
          <div className="right">
            <Link href="/runs/new" className="btn primary">+ New run</Link>
            <button type="button" className="icon" onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title={`${theme === 'dark' ? 'Light' : 'Dark'} mode`}>
              {theme === 'dark' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
              )}
            </button>
          </div>
        </nav>
        <div className={`toploader ${loading ? 'on' : ''}`} aria-hidden />
      </header>
      <main key={pathname} className="page">{children}</main>
      <Toaster position="top-center" theme={theme} richColors closeButton toastOptions={{className: 'toast'}} />
    </>
  );
}
