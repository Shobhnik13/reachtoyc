'use client';

import {useEffect, useRef, useState} from 'react';

// Fades its children up the first time they scroll into view
export default function Reveal({children, delay = 0, className = ''}: {children: React.ReactNode; delay?: number; className?: string}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setShown(true);
          obs.disconnect();
        }
      },
      {rootMargin: '0px 0px -10% 0px'}
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} className={`reveal ${shown ? 'in' : ''} ${className}`} style={{transitionDelay: `${delay}ms`}}>
      {children}
    </div>
  );
}
