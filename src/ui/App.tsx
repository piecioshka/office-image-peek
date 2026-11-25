/* eslint-disable no-magic-numbers -- slide index arithmetic */
import {
  useCallback,
  useEffect,
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
import { ImagePreview } from './ImagePreview';
import { findAsset, useReleaseUrls } from './useObjectUrl';
import { usePreviewRoute } from './usePreviewRoute';
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

interface PreviewProps {
  previewId: string | null;
  openPreview(id: string): void;
  closePreview(): void;
}

function DeckLayout({
  deck,
  current,
  onSelect,
  panelRef,
  preview,
}: {
  deck: Deck;
  current: number;
  onSelect(index: number): void;
  panelRef: RefObject<PanelActions | null>;
  preview: PreviewProps;
}) {
  useReleaseUrls(deck);
  const previewed = findAsset(deck, preview.previewId);
  return (
    <div className="deck">
      <aside className="deck-slides">
        <SlideList deck={deck} current={current} onSelect={onSelect} />
      </aside>
      <section className="deck-view">
        {previewed ? (
          <ImagePreview
            key={previewed.id}
            deck={deck}
            asset={previewed}
            onClose={preview.closePreview}
          />
        ) : (
          <SlideView deck={deck} current={current} />
        )}
      </section>
      <aside className="deck-images">
        <ImagePanel
          deck={deck}
          slideIndex={current}
          onGoToSlide={(slide) => onSelect(slide - 1)}
          onPreview={preview.openPreview}
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

/** Opening a file or moving to a slide leaves the image preview. */
function useClosingPreview(
  deck: ReturnType<typeof useDeckState>,
  closePreview: () => void,
) {
  const { openFile, moveSlide, selectSlide } = deck;
  return {
    openFile: useCallback(
      (file: File) => {
        closePreview();
        openFile(file);
      },
      [openFile, closePreview],
    ),
    moveSlide: useCallback(
      (delta: number | 'first' | 'last') => {
        closePreview();
        moveSlide(delta);
      },
      [moveSlide, closePreview],
    ),
    selectSlide: useCallback(
      (index: number) => {
        closePreview();
        selectSlide(index);
      },
      [selectSlide, closePreview],
    ),
  };
}

/** Global shortcuts; the latest callbacks are read through a ref. */
function useAppShortcuts(input: ShortcutActions & { enabled: boolean }): void {
  const latest = useRef(input);
  useEffect(() => {
    latest.current = input;
  });
  const actions: ShortcutActions = useMemo(
    () => ({
      help: () => latest.current.help(),
      open: () => latest.current.open(),
      moveSlide: (delta) => latest.current.moveSlide(delta),
      selectAll: () => latest.current.selectAll(),
      download: () => latest.current.download(),
      closePreview: () => latest.current.closePreview(),
    }),
    [],
  );
  useShortcuts(actions, input.enabled);
}

export function App() {
  const t = useT();
  const deckState = useDeckState();
  const { state } = deckState;
  const preview = usePreviewRoute();
  const { openFile, moveSlide, selectSlide } = useClosingPreview(
    deckState,
    preview.closePreview,
  );
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<PanelActions | null>(null);

  const chooseFile = useCallback(() => inputRef.current?.click(), []);
  useAppShortcuts({
    help: () => setShortcutsOpen(true),
    open: chooseFile,
    moveSlide,
    selectAll: () => panelRef.current?.selectAll(),
    download: () => panelRef.current?.download(),
    closePreview: preview.closePreview,
    enabled: !shortcutsOpen,
  });
  useWindowDrop(openFile, setDragging);
  useLaunchQueue(openFile);

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
            preview={preview}
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
