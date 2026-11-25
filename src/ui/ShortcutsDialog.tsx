import { useEffect, useRef } from 'react';
import { useEscape } from './hooks';
import { useT, type MessageKey } from './i18n';

const SHORTCUTS: { keys: string[]; label: MessageKey }[] = [
  { keys: ['?'], label: 'shortcutHelp' },
  { keys: ['↑', '↓'], label: 'shortcutNavigate' },
  { keys: ['←', '→'], label: 'shortcutNavigate' },
  { keys: ['PgUp', 'PgDn'], label: 'shortcutNavigate' },
  { keys: ['Home', 'End'], label: 'shortcutEnds' },
  { keys: ['Esc'], label: 'shortcutClosePreview' },
  { keys: ['O'], label: 'shortcutOpen' },
  { keys: ['A'], label: 'shortcutSelectAll' },
  { keys: ['Shift'], label: 'shortcutRange' },
  { keys: ['D'], label: 'shortcutDownload' },
];

export function ShortcutsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<Element | null>(null);
  useEscape(dialogRef, open);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      returnFocusRef.current = document.activeElement;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const handleClose = () => {
    onClose();
    const target = returnFocusRef.current;
    if (target instanceof HTMLElement) {
      target.focus();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="shortcuts"
      aria-labelledby="shortcuts-title"
      onClose={handleClose}
    >
      <div className="shortcuts-header">
        <h2 id="shortcuts-title" className="shortcuts-title">
          {t('shortcuts')}
        </h2>
        <button
          type="button"
          className="button"
          onClick={() => dialogRef.current?.close()}
        >
          {t('close')}
        </button>
      </div>
      <dl className="shortcuts-list">
        {SHORTCUTS.map((item) => (
          <div key={item.keys.join()} className="shortcuts-row">
            <dt className="shortcuts-keys">
              {item.keys.map((key) => (
                <kbd key={key} className="kbd">
                  {key}
                </kbd>
              ))}
            </dt>
            <dd className="shortcuts-label">{t(item.label)}</dd>
          </div>
        ))}
      </dl>
    </dialog>
  );
}
