import { useT, type MessageKey } from './i18n';

export function DropZone({
  errorKey,
  onChoose,
}: {
  errorKey: MessageKey | null;
  onChoose: () => void;
}) {
  const t = useT();
  return (
    <div className="dropzone">
      <p className="dropzone-text">{t('dropText')}</p>
      <button
        type="button"
        className="button button-primary"
        onClick={onChoose}
      >
        {t('chooseFile')}
      </button>
      {errorKey && (
        <p className="dropzone-error" role="alert">
          {t(errorKey)}
        </p>
      )}
    </div>
  );
}
