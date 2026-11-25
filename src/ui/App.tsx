/* eslint-disable no-magic-numbers -- slide index arithmetic */
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type RefObject,
} from 'react';
import { openDeck, type Deck } from '../core/open-deck';
import { DropZone } from './DropZone';
import { errorMessageKey } from './errors';
import {
  useLaunchQueue,
  useShortcuts,
  useWindowDrop,
  type ShortcutActions,
} from './hooks';
import { useT, type MessageKey } from './i18n';
import { useReleaseUrls } from './useObjectUrl';
import { ImagePanel, type PanelActions } from './ImagePanel';
import { SlideList } from './SlideList';
import { SlideView } from './SlideView';
import { ShortcutsDialog } from './ShortcutsDialog';
import { Topbar } from './Topbar';
import './tokens.css';
import './app.css';
import './slides.css';

/** Presentations, macro-enabled decks, slide shows and templates share one package layout. */
export const POWERPOINT_TYPES: Record<string, string> = {
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    '.pptx',
  'application/vnd.ms-powerpoint.presentation.macroEnabled.12': '.pptm',
  'application/vnd.openxmlformats-officedocument.presentationml.slideshow':
    '.ppsx',
  'application/vnd.ms-powerpoint.slideshow.macroEnabled.12': '.ppsm',
  'application/vnd.openxmlformats-officedocument.presentationml.template':
    '.potx',
  'application/vnd.ms-powerpoint.template.macroEnabled.12': '.potm',
};

const FILE_ACCEPT = [
  ...Object.values(POWERPOINT_TYPES),
  ...Object.keys(POWERPOINT_TYPES),
].join(',');

export type AppState =
  | { status: 'empty' }
  | { status: 'loading'; fileName: string }
  | { status: 'error'; message: MessageKey }
  | { status: 'ready'; deck: Deck; slideIndex: number };

function clampSlide(index: number, count: number): number {
  return Math.max(0, Math.min(index, count - 1));
}

function nextSlideIndex(
  current: number,
  delta: number | 'first' | 'last',
  count: number,
): number {
  if (delta === 'first') {
    return 0;
  }
  if (delta === 'last') {
    return clampSlide(count - 1, count);
  }
  return clampSlide(current + delta, count);
}

function fileNameOf(state: AppState): string {
  if (state.status === 'ready') {
    return state.deck.fileName;
  }
  return state.status === 'loading' ? state.fileName : '';
}

function DeckLayout({
  deck,
  current,
  onSelect,
  panelRef,
}: {
  deck: Deck;
  current: number;
  onSelect(index: number): void;
  panelRef: RefObject<PanelActions | null>;
}) {
  useReleaseUrls(deck);
  return (
    <div className="deck">
      <aside className="deck-slides">
        <SlideList deck={deck} current={current} onSelect={onSelect} />
      </aside>
      <section className="deck-view">
        <SlideView deck={deck} current={current} />
      </section>
      <aside className="deck-images">
        <ImagePanel
          deck={deck}
          slideIndex={current}
          onGoToSlide={(slide) => onSelect(slide - 1)}
          actionsRef={panelRef}
        />
      </aside>
    </div>
  );
}

function useDeckState() {
  const [state, setState] = useState<AppState>({ status: 'empty' });
  const attempt = useRef(0);
  const openFile = useCallback((file: File) => {
    attempt.current += 1;
    const id = attempt.current;
    setState({ status: 'loading', fileName: file.name });
    openDeck(file).then(
      (deck) => {
        if (id === attempt.current) {
          setState({ status: 'ready', deck, slideIndex: 0 });
        }
      },
      (error: unknown) => {
        if (id === attempt.current) {
          setState({ status: 'error', message: errorMessageKey(error) });
        }
      },
    );
  }, []);
  const moveSlide = useCallback((delta: number | 'first' | 'last') => {
    setState((current) => {
      if (current.status !== 'ready') {
        return current;
      }
      const count = current.deck.presentation.slides.length;
      return {
        ...current,
        slideIndex: nextSlideIndex(current.slideIndex, delta, count),
      };
    });
  }, []);
  const selectSlide = useCallback((index: number) => {
    setState((current) => {
      if (current.status !== 'ready') {
        return current;
      }
      const count = current.deck.presentation.slides.length;
      return { ...current, slideIndex: clampSlide(index, count) };
    });
  }, []);
  return { state, openFile, moveSlide, selectSlide };
}

export function App() {
  const t = useT();
  const { state, openFile, moveSlide, selectSlide } = useDeckState();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<PanelActions | null>(null);

  const chooseFile = useCallback(() => inputRef.current?.click(), []);
  const actions: ShortcutActions = useMemo(
    () => ({
      help: () => setShortcutsOpen(true),
      open: chooseFile,
      moveSlide,
      selectAll: () => panelRef.current?.selectAll(),
      download: () => panelRef.current?.download(),
    }),
    [chooseFile, moveSlide],
  );
  useWindowDrop(openFile, setDragging);
  useLaunchQueue(openFile);
  useShortcuts(actions, !shortcutsOpen);

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) {
      openFile(file);
    }
  };

  return (
    <div className={dragging ? 'app app-dragging' : 'app'}>
      <Topbar
        fileName={fileNameOf(state)}
        onOpenFile={chooseFile}
        onOpenShortcuts={() => setShortcutsOpen(true)}
      />
      <main className="main">
        {state.status === 'ready' && (
          <DeckLayout
            deck={state.deck}
            current={state.slideIndex}
            onSelect={selectSlide}
            panelRef={panelRef}
          />
        )}
        {state.status === 'loading' && (
          <p className="status" role="status" aria-busy="true">
            {t('opening')}
          </p>
        )}
        {(state.status === 'empty' || state.status === 'error') && (
          <DropZone
            errorKey={state.status === 'error' ? state.message : null}
            onChoose={chooseFile}
          />
        )}
      </main>
      <input
        ref={inputRef}
        type="file"
        accept={FILE_ACCEPT}
        className="file-input"
        tabIndex={-1}
        aria-hidden="true"
        onChange={onPick}
      />
      <ShortcutsDialog
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
    </div>
  );
}
