// @vitest-environment jsdom
/* eslint-disable no-magic-numbers -- fixture sizes and slide numbers */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPptx, tinyPng } from '../../test/fixtures/build-pptx';
import { downloadBlob } from '../core/export';
import { openDeck, type Deck } from '../core/open-deck';
import { ImagePanel } from './ImagePanel';

vi.mock('../core/export', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../core/export')>();
  return { ...actual, downloadBlob: vi.fn() };
});

function noop(): void {
  // Nothing to do.
}

const RECT = { x: 0, y: 0, cx: 100, cy: 100 };

async function makeDeck(): Promise<Deck> {
  const bytes = buildPptx({
    slides: [
      { shapes: [{ kind: 'text', text: ['one'] }] },
      {
        shapes: [{ kind: 'picture', media: 'a.png', xfrm: RECT }],
      },
      {
        shapes: [
          { kind: 'picture', media: 'b.png', xfrm: RECT },
          { kind: 'picture', media: 'a.png', xfrm: RECT },
        ],
      },
    ],
    media: {
      'a.png': tinyPng(640, 480, 1),
      'b.png': tinyPng(32, 32, 2),
      'unused.png': tinyPng(16, 16, 3),
    },
  });
  return openDeck(new File([new Uint8Array(bytes)], 'demo.pptx'));
}

function fakeDirectory() {
  const written: string[] = [];
  const gate: { release: () => void } = { release: noop };
  const released = new Promise<void>((resolve) => {
    gate.release = resolve;
  });
  const dir = {
    getFileHandle: (name: string) =>
      released.then(() => ({
        createWritable: () =>
          Promise.resolve({
            write: () => {
              written.push(name);
              return Promise.resolve();
            },
            close: () => Promise.resolve(),
          }),
      })),
  };
  return { dir, written, gate };
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(downloadBlob).mockClear();
  if (typeof URL.createObjectURL !== 'function') {
    URL.createObjectURL = () => 'blob:fake';
    URL.revokeObjectURL = noop;
  }
});

afterEach(() => {
  Reflect.deleteProperty(window, 'showDirectoryPicker');
});

describe('ImagePanel', () => {
  it('lists every asset in the whole-deck scope', async () => {
    const deck = await makeDeck();
    render(<ImagePanel deck={deck} slideIndex={0} onGoToSlide={vi.fn()} />);
    expect(
      screen.getByRole('button', {
        name: `Whole deck (${deck.assets.length})`,
      }),
    ).toBeTruthy();
    expect(document.querySelectorAll('.tile')).toHaveLength(deck.assets.length);
  });

  it('shows only the images of the current slide in that scope', async () => {
    const deck = await makeDeck();
    render(<ImagePanel deck={deck} slideIndex={2} onGoToSlide={vi.fn()} />);
    await userEvent.click(
      screen.getByRole('button', { name: /^Current slide/ }),
    );
    expect(document.querySelectorAll('.tile')).toHaveLength(2);
    expect(
      screen.getByRole('button', { name: 'Current slide (2)' }),
    ).toBeTruthy();
  });

  it('describes a tile with format, size and bytes', async () => {
    const deck = await makeDeck();
    render(<ImagePanel deck={deck} slideIndex={0} onGoToSlide={vi.fn()} />);
    expect(screen.getAllByText(/^PNG · 640×480 · /).length).toBeGreaterThan(0);
  });

  it('jumps to a slide from a slide chip', async () => {
    const deck = await makeDeck();
    const onGoToSlide = vi.fn();
    render(<ImagePanel deck={deck} slideIndex={0} onGoToSlide={onGoToSlide} />);
    const tile = screen.getByRole('checkbox', { name: 'demo-slajd-03-01.png' });
    const item = tile.closest('li');
    expect(item).not.toBeNull();
    if (item) {
      await userEvent.click(within(item).getByRole('button', { name: '3' }));
    }
    expect(onGoToSlide).toHaveBeenCalledWith(3);
  });

  it('keeps the selection across scopes and counts it', async () => {
    const deck = await makeDeck();
    render(<ImagePanel deck={deck} slideIndex={1} onGoToSlide={vi.fn()} />);
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'demo-slajd-02-01.png' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: /^Current slide/ }),
    );
    await userEvent.click(screen.getByRole('button', { name: /^Whole deck/ }));
    expect(
      screen.getByRole('button', { name: 'Download selected (1)' }),
    ).toBeTruthy();
  });

  it('selects everything with the select-all checkbox', async () => {
    const deck = await makeDeck();
    render(<ImagePanel deck={deck} slideIndex={0} onGoToSlide={vi.fn()} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all' }));
    expect(
      screen.getByRole('button', {
        name: `Download selected (${deck.assets.length})`,
      }),
    ).toBeTruthy();
  });

  it('writes the selection to the picked directory', async () => {
    const deck = await makeDeck();
    const { dir, written, gate } = fakeDirectory();
    gate.release();
    const picker = vi.fn(() => Promise.resolve(dir));
    Object.defineProperty(window, 'showDirectoryPicker', {
      value: picker,
      configurable: true,
    });
    render(<ImagePanel deck={deck} slideIndex={0} onGoToSlide={vi.fn()} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all' }));
    await userEvent.click(
      screen.getByRole('button', { name: /^Download selected/ }),
    );
    await waitFor(() => expect(written).toHaveLength(deck.assets.length));
    expect(picker).toHaveBeenCalledWith({ mode: 'readwrite' });
    expect(written).toContain('demo-slajd-02-01.png');
  });

  it('falls back to a ZIP named after the deck', async () => {
    const deck = await makeDeck();
    render(<ImagePanel deck={deck} slideIndex={0} onGoToSlide={vi.fn()} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all' }));
    await userEvent.click(
      screen.getByRole('button', { name: /^Download selected/ }),
    );
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1));
    expect(vi.mocked(downloadBlob).mock.calls[0]?.[1]).toBe('demo-images.zip');
  });

  it('names the ZIP in the interface language', async () => {
    document.documentElement.lang = 'pl';
    try {
      const deck = await makeDeck();
      render(<ImagePanel deck={deck} slideIndex={0} onGoToSlide={vi.fn()} />);
      await userEvent.click(
        screen.getByRole('checkbox', { name: 'Zaznacz wszystkie' }),
      );
      await userEvent.click(
        screen.getByRole('button', { name: /^Pobierz zaznaczone/ }),
      );
      await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1));
      expect(vi.mocked(downloadBlob).mock.calls[0]?.[1]).toBe(
        'demo-obrazki.zip',
      );
    } finally {
      document.documentElement.removeAttribute('lang');
    }
  });

  it('shows a busy label with an ellipsis while writing', async () => {
    const deck = await makeDeck();
    const { dir, gate } = fakeDirectory();
    Object.defineProperty(window, 'showDirectoryPicker', {
      value: () => Promise.resolve(dir),
      configurable: true,
    });
    render(<ImagePanel deck={deck} slideIndex={0} onGoToSlide={vi.fn()} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all' }));
    await userEvent.click(
      screen.getByRole('button', { name: /^Download selected/ }),
    );
    const busy = await screen.findByRole('button', { name: /^Downloading… / });
    expect(busy.getAttribute('aria-busy')).toBe('true');
    expect(busy.hasAttribute('disabled')).toBe(true);
    gate.release();
    await screen.findByRole('button', { name: /^Download selected/ });
  });

  it('stays silent when the picker is cancelled', async () => {
    const deck = await makeDeck();
    Object.defineProperty(window, 'showDirectoryPicker', {
      value: () => Promise.reject(new DOMException('x', 'AbortError')),
      configurable: true,
    });
    render(<ImagePanel deck={deck} slideIndex={0} onGoToSlide={vi.fn()} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all' }));
    await userEvent.click(
      screen.getByRole('button', { name: /^Download selected/ }),
    );
    await screen.findByRole('button', { name: /^Download selected/ });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('reports other picker errors inline', async () => {
    const deck = await makeDeck();
    Object.defineProperty(window, 'showDirectoryPicker', {
      value: () => Promise.reject(new Error('boom')),
      configurable: true,
    });
    render(<ImagePanel deck={deck} slideIndex={0} onGoToSlide={vi.fn()} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all' }));
    await userEvent.click(
      screen.getByRole('button', { name: /^Download selected/ }),
    );
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Could not save the images',
    );
  });

  it('downloads a single original under its export name', async () => {
    const deck = await makeDeck();
    render(<ImagePanel deck={deck} slideIndex={0} onGoToSlide={vi.fn()} />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Download demo-slajd-02-01.png' }),
    );
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1));
    expect(vi.mocked(downloadBlob).mock.calls[0]?.[1]).toBe(
      'demo-slajd-02-01.png',
    );
  });

  it('gives a missing asset no checkbox and no download', async () => {
    const deck = await makeDeck();
    const first = deck.assets[0];
    if (!first) {
      throw new Error('no assets');
    }
    const broken: Deck = {
      ...deck,
      assets: [
        {
          ...first,
          id: 'ppt/media/gone.png',
          archivePath: null,
          missing: true,
          fileName: 'gone.png',
        },
      ],
    };
    render(<ImagePanel deck={broken} slideIndex={0} onGoToSlide={vi.fn()} />);
    expect(screen.queryByRole('checkbox', { name: 'gone.png' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Download gone/ })).toBeNull();
    expect(screen.getByText('missing from file')).toBeTruthy();
  });
});

function tileBoxes(): HTMLElement[] {
  return screen
    .getAllByRole('checkbox')
    .filter((box) => box.closest('.tile') !== null);
}

async function shiftClick(
  user: ReturnType<typeof userEvent.setup>,
  target: HTMLElement,
) {
  await user.keyboard('{Shift>}');
  await user.click(target);
  await user.keyboard('{/Shift}');
}

function downloadButton(count: number): HTMLElement {
  return screen.getByRole('button', { name: `Download selected (${count})` });
}

describe('ImagePanel selection', () => {
  it('selects a range of tiles with Shift-click', async () => {
    const deck = await makeDeck();
    const user = userEvent.setup();
    render(<ImagePanel deck={deck} slideIndex={0} onGoToSlide={vi.fn()} />);
    const tiles = tileBoxes();
    const [first] = tiles;
    const last = tiles.at(-1);
    if (!first || !last || tiles.length < 3) {
      throw new Error('expected at least three tiles');
    }
    await user.click(first);
    await shiftClick(user, last);
    expect(downloadButton(tiles.length)).toBeTruthy();
    await shiftClick(user, first);
    expect(downloadButton(0)).toBeTruthy();
  });

  it('toggles only one tile on a plain click', async () => {
    const deck = await makeDeck();
    render(<ImagePanel deck={deck} slideIndex={0} onGoToSlide={vi.fn()} />);
    const [first, second] = tileBoxes();
    if (!first || !second) {
      throw new Error('expected tiles');
    }
    await userEvent.click(first);
    await userEvent.click(second);
    expect(downloadButton(2)).toBeTruthy();
  });
});

describe('ImagePanel sorting', () => {
  it('sorts by resolution when asked', async () => {
    const bytes = buildPptx({
      slides: [
        {
          shapes: [
            { kind: 'picture', media: 'small.png', xfrm: RECT },
            { kind: 'picture', media: 'big.png', xfrm: RECT },
          ],
        },
      ],
      media: { 'small.png': tinyPng(8, 8, 1), 'big.png': tinyPng(64, 48, 2) },
    });
    const deck = await openDeck(
      new File([new Uint8Array(bytes)], 'sizes.pptx'),
    );
    render(<ImagePanel deck={deck} slideIndex={0} onGoToSlide={vi.fn()} />);
    const metas = () =>
      Array.from(document.querySelectorAll('.tile-meta')).map(
        (el) => (el.textContent ?? '').split(' · ')[1],
      );
    expect(metas()).toEqual(['8×8', '64×48']);
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Sort' }),
      'pixels',
    );
    expect(metas()).toEqual(['64×48', '8×8']);
  });

  it('hides images of other formats', async () => {
    const deck = await makeDeck();
    render(<ImagePanel deck={deck} slideIndex={0} onGoToSlide={vi.fn()} />);
    const select = screen.getByRole('combobox', { name: 'Format' });
    expect(
      Array.from(select.querySelectorAll('option')).map((o) => o.value),
    ).toEqual(['all', 'png']);
    await userEvent.selectOptions(select, 'png');
    expect(document.querySelectorAll('.tile')).toHaveLength(deck.assets.length);
  });
});

describe('ImagePanel summary', () => {
  it('summarizes media weight in the whole-deck scope', async () => {
    const deck = await makeDeck();
    const onPreview = vi.fn();
    render(
      <ImagePanel
        deck={deck}
        slideIndex={0}
        onGoToSlide={vi.fn()}
        onPreview={onPreview}
      />,
    );
    const summary = screen.getByRole('region', { name: 'Media summary' });
    expect(within(summary).getByText(/of the file$/)).toBeTruthy();
    expect(within(summary).getByText('Unused')).toBeTruthy();
    const [heaviest] = within(summary).getAllByRole('button');
    if (!heaviest) {
      throw new Error('no largest image listed');
    }
    await userEvent.click(heaviest);
    expect(onPreview).toHaveBeenCalledWith(deck.assets[0]?.id);
  });

  it('hides the summary in the current-slide scope', async () => {
    const deck = await makeDeck();
    render(<ImagePanel deck={deck} slideIndex={0} onGoToSlide={vi.fn()} />);
    await userEvent.click(
      screen.getByRole('button', { name: /^Current slide/ }),
    );
    expect(screen.queryByRole('region', { name: 'Media summary' })).toBe(null);
  });
});
