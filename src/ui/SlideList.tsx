import { useEffect, useRef } from 'react';
import type { Deck } from '../core/open-deck';
import { useT } from './i18n';
import { SlideCanvas } from './SlideCanvas';

export interface SlideListProps {
  deck: Deck;
  current: number;
  onSelect(index: number): void;
}

export function SlideList({ deck, current, onSelect }: SlideListProps) {
  const t = useT();
  const selected = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    selected.current?.scrollIntoView?.({ block: 'nearest' });
  }, [current]);
  return (
    <nav aria-label={t('slides')}>
      <ol className="slide-list">
        {deck.presentation.slides.map((slide, i) => (
          <li key={slide.partPath} className="slide-item">
            <button
              type="button"
              ref={i === current ? selected : null}
              className={
                slide.hidden ? 'slide-button slide-hidden' : 'slide-button'
              }
              {...(i === current ? { 'aria-current': 'true' } : {})}
              onClick={() => onSelect(i)}
            >
              <SlideCanvas deck={deck} slide={slide} mode="thumbnail" />
              <span className="slide-number">
                {slide.index}
                {slide.hidden && (
                  <span className="slide-hidden-label">{t('hiddenSlide')}</span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
