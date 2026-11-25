/* eslint-disable no-magic-numbers -- set arithmetic and counts */
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { assetsForSlide, type ImageAsset } from '../core/inventory';
import type { Deck } from '../core/open-deck';
import { ImageTile, isSelectable } from './ImageTile';
import { useT, type MessageKey } from './i18n';
import { useDownload, type Progress } from './useDownload';
import './images.css';

export interface PanelActions {
  selectAll(): void;
  download(): void;
}

export interface ImagePanelProps {
  deck: Deck;
  slideIndex: number;
  onGoToSlide(slide: number): void;
  actionsRef?: RefObject<PanelActions | null>;
}

type Scope = 'deck' | 'slide';

const GROUPS: { key: MessageKey; match: (a: ImageAsset) => boolean }[] = [
  {
    key: 'groupSlide',
    match: (a) => a.externalUrl === null && a.origin === 'slide',
  },
  {
    key: 'groupLayout',
    match: (a) => a.externalUrl === null && a.origin === 'layout',
  },
  {
    key: 'groupUnused',
    match: (a) => a.externalUrl === null && a.origin === 'unused',
  },
  { key: 'groupExternal', match: (a) => a.externalUrl !== null },
];

/** Tiles in the order they are shown: grouped for the deck, flat for a slide. */
function displayOrder(scope: Scope, visible: ImageAsset[]): ImageAsset[] {
  if (scope === 'slide') {
    return visible;
  }
  return GROUPS.flatMap((group) => visible.filter(group.match));
}

function rangeIds(order: ImageAsset[], from: string, to: string): string[] {
  const start = order.findIndex((a) => a.id === from);
  const end = order.findIndex((a) => a.id === to);
  if (start < 0 || end < 0) {
    return [to];
  }
  return order
    .slice(Math.min(start, end), Math.max(start, end) + 1)
    .filter(isSelectable)
    .map((a) => a.id);
}

function useSelection(visible: ImageAsset[], order: ImageAsset[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const toggle = useCallback(
    (id: string, range: boolean) => {
      setSelected((current) => {
        const next = new Set(current);
        const turnOn = !current.has(id);
        const ids =
          range && anchor !== null ? rangeIds(order, anchor, id) : [id];
        ids.forEach((each) => (turnOn ? next.add(each) : next.delete(each)));
        return next;
      });
      setAnchor(id);
    },
    [anchor, order],
  );
  const selectable = visible.filter(isSelectable);
  const allSelected =
    selectable.length > 0 && selectable.every((a) => selected.has(a.id));
  const toggleAll = useCallback(() => {
    setSelected((current) => {
      const next = new Set(current);
      const every = selectable.every((a) => next.has(a.id));
      selectable.forEach((a) => (every ? next.delete(a.id) : next.add(a.id)));
      return next;
    });
  }, [selectable]);
  const selectAll = useCallback(() => {
    setSelected((current) => {
      const next = new Set(current);
      selectable.forEach((a) => next.add(a.id));
      return next;
    });
  }, [selectable]);
  return { selected, toggle, toggleAll, selectAll, allSelected };
}

function usePanelActions(
  ref: RefObject<PanelActions | null> | undefined,
  actions: PanelActions,
) {
  useEffect(() => {
    if (ref) {
      ref.current = actions;
    }
  });
}

function Scopes({
  scope,
  onScope,
  deckCount,
  slideCount,
}: {
  scope: Scope;
  onScope(scope: Scope): void;
  deckCount: number;
  slideCount: number;
}) {
  const t = useT();
  return (
    <div className="scope" role="group" aria-label={t('imageScope')}>
      <button
        type="button"
        className="scope-button"
        aria-pressed={scope === 'deck'}
        onClick={() => onScope('deck')}
      >
        {t('scopeDeck', { n: deckCount })}
      </button>
      <button
        type="button"
        className="scope-button"
        aria-pressed={scope === 'slide'}
        onClick={() => onScope('slide')}
      >
        {t('scopeSlide', { n: slideCount })}
      </button>
    </div>
  );
}

function DownloadControls({
  allSelected,
  onToggleAll,
  count,
  progress,
  failed,
  onDownload,
}: {
  allSelected: boolean;
  onToggleAll(): void;
  count: number;
  progress: Progress | null;
  failed: boolean;
  onDownload(): void;
}) {
  const t = useT();
  return (
    <>
      <div className="images-actions">
        <label className="images-all">
          <input type="checkbox" checked={allSelected} onChange={onToggleAll} />
          {t('selectAll')}
        </label>
        <button
          type="button"
          className="button button-primary"
          disabled={progress !== null || count === 0}
          aria-busy={progress !== null}
          onClick={onDownload}
        >
          {progress === null
            ? t('downloadSelected', { n: count })
            : t('downloading', { done: progress.done, total: progress.total })}
        </button>
      </div>
      {failed && (
        <p className="images-error" role="alert">
          {t('saveError')}
        </p>
      )}
    </>
  );
}

function Tiles({
  scope,
  visible,
  renderTile,
}: {
  scope: Scope;
  visible: ImageAsset[];
  renderTile(asset: ImageAsset): ReactNode;
}) {
  const t = useT();
  if (visible.length === 0) {
    return <p className="images-empty">{t('noImages')}</p>;
  }
  if (scope === 'slide') {
    return <ul className="tiles">{visible.map(renderTile)}</ul>;
  }
  return GROUPS.map((group) => {
    const items = visible.filter(group.match);
    return items.length === 0 ? null : (
      <div key={group.key} className="tile-group">
        <h2 className="tile-group-title">{t(group.key)}</h2>
        <ul className="tiles">{items.map(renderTile)}</ul>
      </div>
    );
  });
}

export function ImagePanel({
  deck,
  slideIndex,
  onGoToSlide,
  actionsRef,
}: ImagePanelProps) {
  const t = useT();
  const [scope, setScope] = useState<Scope>('deck');
  const slideNumber =
    deck.presentation.slides[slideIndex]?.index ?? slideIndex + 1;
  const onSlide = useMemo(
    () => assetsForSlide(deck.assets, slideNumber),
    [deck.assets, slideNumber],
  );
  const visible = scope === 'deck' ? deck.assets : onSlide;
  const order = useMemo(() => displayOrder(scope, visible), [scope, visible]);
  const { selected, toggle, toggleAll, selectAll, allSelected } = useSelection(
    visible,
    order,
  );
  const { progress, failed, run } = useDownload(deck);
  const chosen = deck.assets.filter(
    (a) => isSelectable(a) && selected.has(a.id),
  );
  const download = useCallback(() => {
    if (chosen.length > 0 && progress === null) {
      void run(chosen);
    }
  }, [chosen, progress, run]);
  usePanelActions(actionsRef, { selectAll, download });

  const renderTile = (asset: ImageAsset) => (
    <ImageTile
      key={asset.id}
      deck={deck}
      asset={asset}
      selected={selected.has(asset.id)}
      onToggle={toggle}
      onGoToSlide={onGoToSlide}
    />
  );
  return (
    <section className="images" aria-label={t('images')}>
      <header className="images-header">
        <Scopes
          scope={scope}
          onScope={setScope}
          deckCount={deck.assets.length}
          slideCount={onSlide.length}
        />
        <DownloadControls
          allSelected={allSelected}
          onToggleAll={toggleAll}
          count={chosen.length}
          progress={progress}
          failed={failed}
          onDownload={download}
        />
      </header>
      <Tiles scope={scope} visible={visible} renderTile={renderTile} />
    </section>
  );
}
