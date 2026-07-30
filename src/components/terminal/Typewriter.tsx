'use client';

import { useEffect, useState } from 'react';

interface TypewriterProps {
  text: string;
  speed?: number; // chars per second
  className?: string;
  style?: React.CSSProperties;
  onComplete?: () => void;
}

export function Typewriter({ text, speed = 60, className, style, onComplete }: TypewriterProps) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    setDisplayed('');
    setDone(false);
    if (!text) {
      setDone(true);
      onComplete?.();
      return;
    }
    const intervalMs = 1000 / speed;
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(interval);
        setDone(true);
        onComplete?.();
      }
    }, intervalMs);
    return () => clearInterval(interval);
  }, [text, speed, onComplete]);

  return (
    <span className={className} style={style}>
      {displayed}
      {!done && <span className="typewriter-cursor" style={{ display: 'inline-block', width: 6, height: 12, background: '#5EEAD4', marginLeft: 2, verticalAlign: 'middle', animation: 'blink 1s steps(2) infinite' }} />}
    </span>
  );
}
