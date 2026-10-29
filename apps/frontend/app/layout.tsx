import type {Metadata} from 'next';

import Shell from '@/components/Shell';
import './globals.css';

export const metadata: Metadata = {
  title: 'reachtoyc',
  description: 'Find YC founders, research their companies, and draft personalised outreach from your own profile.'
};

// Set the theme before first paint so there's no flash: saved choice, else the OS setting
const themeScript = `try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{__html: themeScript}} />
      </head>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
