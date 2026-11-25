import { useCallback, useEffect, useRef, useState } from 'react';

const PREFIX = '#image=';

function readHash(): string | null {
  const { hash } = window.location;
  if (!hash.startsWith(PREFIX)) {
    return null;
  }
  try {
    return decodeURIComponent(hash.slice(PREFIX.length));
  } catch {
    return null;
  }
}

/**
 * The previewed image lives in the URL hash, so the browser Back button
 * returns to the slide. Closing pops our own history entry when there is one.
 */
export function usePreviewRoute() {
  const [id, setId] = useState<string | null>(readHash);
  const pushed = useRef(false);
  useEffect(() => {
    const onHash = () => {
      const next = readHash();
      pushed.current = pushed.current && next !== null;
      setId(next);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const open = useCallback((next: string) => {
    if (readHash() === null) {
      pushed.current = true;
      window.location.hash = PREFIX + encodeURIComponent(next);
    } else {
      window.history.replaceState(null, '', PREFIX + encodeURIComponent(next));
    }
    setId(next);
  }, []);
  const close = useCallback(() => {
    if (readHash() === null) {
      setId(null);
      return;
    }
    if (pushed.current) {
      pushed.current = false;
      window.history.back();
    } else {
      const { pathname, search } = window.location;
      window.history.replaceState(null, '', pathname + search);
    }
    setId(null);
  }, []);
  return { previewId: id, openPreview: open, closePreview: close };
}
