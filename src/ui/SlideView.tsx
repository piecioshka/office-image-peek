import type { Deck } from '../core/open-deck';
import { useT } from './i18n';
import { SlideCanvas } from './SlideCanvas';

export interface SlideViewProps {
  deck: Deck;
  current: number;
}

export function SlideView({ deck, current }: SlideViewProps) {
  const t = useT();
  const slide = deck.presentation.slides[current];
  return (
    <div className="slide-view" role="group" aria-label={t('slideView')}>
      {slide && (
        <SlideCanvas
          key={slide.partPath}
          deck={deck}
          slide={slide}
          mode="full"
        />
      )}
    </div>
  );
}
