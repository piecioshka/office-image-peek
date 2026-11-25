import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ImageAsset } from '../core/inventory';
import type { Deck } from '../core/open-deck';
import { canCopyImages, copyAsset, copyPlan } from './clipboard';
import { useT } from './i18n';

const CONFIRM_MS = 2000;

type Status = 'idle' | 'copying' | 'copied' | 'failed';

function noop(): void {
  // Nothing to clean up.
}

export function CopyButton({ deck, asset }: { deck: Deck; asset: ImageAsset }) {
  const t = useT();
  const [status, setStatus] = useState<Status>('idle');
  useEffect(() => {
    if (status !== 'copied') {
      return noop;
    }
    const timer = window.setTimeout(() => setStatus('idle'), CONFIRM_MS);
    return () => window.clearTimeout(timer);
  }, [status]);
  const plan = copyPlan(asset);
  if (plan === null || !canCopyImages()) {
    return null;
  }
  const copy = () => {
    setStatus('copying');
    copyAsset(deck, asset).then(
      () => setStatus('copied'),
      () => setStatus('failed'),
    );
  };
  const labels: Partial<Record<Status, string>> = {
    copying: t('copying'),
    copied: t('copied'),
  };
  const label = labels[status] ?? t('copy', { name: asset.fileName });
  return (
    <>
      <button
        type="button"
        className="button icon-button"
        aria-label={label}
        title={label}
        disabled={status === 'copying'}
        aria-busy={status === 'copying'}
        onClick={copy}
      >
        {status === 'copied' ? (
          <Check size={16} aria-hidden="true" />
        ) : (
          <Copy size={16} aria-hidden="true" />
        )}
      </button>
      {status === 'failed' && (
        <p className="tile-error" role="alert">
          {t('copyError')}
        </p>
      )}
    </>
  );
}
