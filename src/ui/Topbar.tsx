import { FolderOpen, Keyboard, Moon, Sun } from 'lucide-react';
import { useT } from './i18n';
import { usePreferences } from './preferences';

export const REPOSITORY_URL = 'https://github.com/piecioshka/pptx-peek';

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.62 1.59.23 2.76.11 3.05.74.81 1.18 1.83 1.18 3.09 0 4.42-2.69 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z"
      />
    </svg>
  );
}

export function Topbar({
  fileName,
  onOpenFile,
  onOpenShortcuts,
}: {
  fileName: string;
  onOpenFile: () => void;
  onOpenShortcuts: () => void;
}) {
  const t = useT();
  const { lang, theme, toggleLang, toggleTheme } = usePreferences();

  return (
    <header className="topbar">
      <h1 className="logo">
        <img
          src={`${import.meta.env.BASE_URL}icon.svg`}
          alt=""
          width={24}
          height={24}
          className="logo-mark"
        />
        <span className="app-name">{t('appName')}</span>
      </h1>
      <div className="topbar-center">
        {fileName && (
          <>
            <span className="file-name" title={fileName}>
              {fileName}
            </span>
            <button
              type="button"
              className="button open-button"
              onClick={onOpenFile}
              title={`${t('openAnother')} (O)`}
            >
              <FolderOpen size={16} aria-hidden="true" />
              <span className="open-label">{t('openAnother')}</span>
            </button>
          </>
        )}
      </div>
      <div className="topbar-actions">
        <button
          type="button"
          className="button icon-button"
          onClick={onOpenShortcuts}
          aria-label={t('shortcuts')}
          title={`${t('shortcuts')} (?)`}
        >
          <Keyboard size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="button icon-button"
          onClick={toggleLang}
          aria-label={t('switchLanguage')}
          title={t('switchLanguage')}
        >
          <span className="flag" aria-hidden="true">
            {lang === 'pl' ? '🇵🇱' : '🇬🇧'}
          </span>
        </button>
        <button
          type="button"
          className="button icon-button"
          onClick={toggleTheme}
          aria-label={t('switchTheme')}
          title={t('switchTheme')}
        >
          {theme === 'dark' ? (
            <Sun size={16} aria-hidden="true" />
          ) : (
            <Moon size={16} aria-hidden="true" />
          )}
        </button>
        <a
          href={REPOSITORY_URL}
          className="button icon-button"
          aria-label={t('repository')}
          title={t('repository')}
          target="_blank"
          rel="noreferrer"
        >
          <GitHubIcon />
        </a>
      </div>
    </header>
  );
}
