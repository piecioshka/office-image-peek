// @vitest-environment jsdom
/* eslint-disable no-magic-numbers -- fixture sizes and OLE magic bytes */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildPptx, tinyPng } from '../../test/fixtures/build-pptx';
import { App } from './App';

function fileInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) {
    throw new Error('file input missing');
  }
  return input;
}

async function uploadFile(input: HTMLInputElement, file: File) {
  // The picker's accept filter is the browser's job; the app must still reject bad files.
  await userEvent.setup({ applyAccept: false }).upload(input, file);
}

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('lang');
  localStorage.clear();
});

describe('App shell', () => {
  it('renders the app name as the only h1', () => {
    render(<App />);
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toBe('PPTX Peek');
  });

  it('toggles the theme and persists it', async () => {
    render(<App />);
    const before = document.documentElement.dataset.theme;
    await userEvent.click(screen.getByRole('button', { name: /theme|motyw/i }));
    const after = document.documentElement.dataset.theme;
    expect(after).not.toBe(before);
    expect(localStorage.getItem('pptx-peek:theme')).toBe(after);
  });

  it('switches the language of the drop text', async () => {
    render(<App />);
    expect(screen.getByText(/^Drop a PowerPoint file/)).toBeTruthy();
    await userEvent.click(
      screen.getByRole('button', { name: /switch language/i }),
    );
    expect(screen.getByText(/^Upuść plik PowerPointa/)).toBeTruthy();
    expect(localStorage.getItem('pptx-peek:lang')).toBe('pl');
  });

  it('shows the invalid file message for a non-zip file', async () => {
    const { container } = render(<App />);
    const file = new File(['not a zip at all'], 'photo.jpg');
    await uploadFile(fileInput(container), file);
    expect(
      await screen.findByText('This is not a valid PowerPoint file'),
    ).toBeTruthy();
  });

  it('shows the encrypted message for an OLE file', async () => {
    const { container } = render(<App />);
    const ole = new Uint8Array(64);
    ole.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    await uploadFile(fileInput(container), new File([ole], 'old.ppt'));
    expect(
      await screen.findByText(
        'The file is password-protected or in the old .ppt format',
      ),
    ).toBeTruthy();
  });

  it('shows the file name of an opened deck in the topbar', async () => {
    const { container } = render(<App />);
    const bytes = buildPptx({
      slides: [
        {
          shapes: [
            {
              kind: 'picture',
              media: 'ppt/media/image1.png',
              xfrm: { x: 0, y: 0, cx: 100, cy: 100 },
            },
          ],
        },
      ],
      media: { 'ppt/media/image1.png': tinyPng(4, 4, 1) },
    });
    await uploadFile(
      fileInput(container),
      new File([new Uint8Array(bytes)], 'Q3 raport.pptx'),
    );
    await waitFor(() => {
      expect(screen.getByText('Q3 raport.pptx')).toBeTruthy();
    });
  });

  it('clears the image selection when another file is opened', async () => {
    const { container } = render(<App />);
    const deckWith = (name: string) =>
      new File(
        [
          new Uint8Array(
            buildPptx({
              slides: [
                {
                  shapes: [
                    {
                      kind: 'picture',
                      media: 'ppt/media/image1.png',
                      xfrm: { x: 0, y: 0, cx: 100, cy: 100 },
                    },
                  ],
                },
              ],
              media: { 'ppt/media/image1.png': tinyPng(4, 4, 1) },
            }),
          ),
        ],
        name,
      );
    await uploadFile(fileInput(container), deckWith('first.pptx'));
    const [box] = await screen.findAllByRole('checkbox', { name: /^first-/ });
    if (!box) {
      throw new Error('no tile checkbox');
    }
    await userEvent.click(box);
    expect(
      screen.getByRole('button', { name: 'Download selected (1)' }),
    ).toBeTruthy();
    await uploadFile(fileInput(container), deckWith('second.pptx'));
    await screen.findAllByRole('checkbox', { name: /^second-/ });
    expect(
      screen.getByRole('button', { name: 'Download selected (0)' }),
    ).toBeTruthy();
  });

  it('offers an open button next to the file name once a deck is open', async () => {
    const { container } = render(<App />);
    expect(screen.queryByRole('button', { name: 'Open another file' })).toBe(
      null,
    );
    const bytes = buildPptx({
      slides: [{ shapes: [{ kind: 'text', text: ['hi'] }] }],
      media: {},
    });
    const input = fileInput(container);
    await uploadFile(input, new File([new Uint8Array(bytes)], 'a.pptx'));
    const button = await screen.findByRole('button', {
      name: 'Open another file',
    });
    let clicked = 0;
    input.addEventListener('click', () => {
      clicked += 1;
    });
    await userEvent.click(button);
    expect(clicked).toBe(1);
  });

  it('accepts every PowerPoint package type in the file picker', () => {
    const { container } = render(<App />);
    const accept = fileInput(container).accept.split(',');
    for (const ext of ['.pptx', '.pptm', '.ppsx', '.ppsm', '.potx', '.potm']) {
      expect(accept).toContain(ext);
    }
  });

  it('opens a slide show saved as .ppsx', async () => {
    const { container } = render(<App />);
    const bytes = buildPptx({
      slides: [{ shapes: [{ kind: 'text', text: ['hi'] }] }],
      media: {},
    });
    await uploadFile(
      fileInput(container),
      new File([new Uint8Array(bytes)], 'Show.ppsx'),
    );
    expect(await screen.findByText('Show.ppsx')).toBeTruthy();
  });

  it('moves between slides with horizontal arrows and page keys', async () => {
    const { container } = render(<App />);
    const text = (t: string) => ({
      shapes: [{ kind: 'text' as const, text: [t] }],
    });
    const bytes = buildPptx({
      slides: [text('one'), text('two'), text('three')],
      media: {},
    });
    await uploadFile(
      fileInput(container),
      new File([new Uint8Array(bytes)], 'nav.pptx'),
    );
    await screen.findByText('nav.pptx');
    const current = () =>
      document
        .querySelector('.slide-button[aria-current="true"] .slide-number')
        ?.textContent?.trim();
    expect(current()).toBe('1');
    await userEvent.keyboard('{ArrowRight}');
    expect(current()).toBe('2');
    await userEvent.keyboard('{PageDown}');
    expect(current()).toBe('3');
    await userEvent.keyboard('{ArrowLeft}');
    expect(current()).toBe('2');
    await userEvent.keyboard('{PageUp}');
    expect(current()).toBe('1');
  });

  it('opens the shortcuts dialog on ? and closes it on Escape', async () => {
    render(<App />);
    const dialog = document.querySelector('dialog');
    expect(dialog?.hasAttribute('open')).toBe(false);
    await userEvent.keyboard('?');
    expect(dialog?.hasAttribute('open')).toBe(true);
    await userEvent.keyboard('{Escape}');
    expect(dialog?.hasAttribute('open')).toBe(false);
  });

  it('keeps A working while a tile checkbox has focus', async () => {
    const { container } = render(<App />);
    const pic = (media: string) => ({
      kind: 'picture' as const,
      media,
      xfrm: { x: 0, y: 0, cx: 100, cy: 100 },
    });
    const bytes = buildPptx({
      slides: [{ shapes: [pic('a.png'), pic('b.png')] }],
      media: { 'a.png': tinyPng(4, 4, 1), 'b.png': tinyPng(5, 5, 2) },
    });
    await uploadFile(
      fileInput(container),
      new File([new Uint8Array(bytes)], 'two.pptx'),
    );
    const boxes = await screen.findAllByRole('checkbox', { name: /^two-/ });
    const [first] = boxes;
    if (!first) {
      throw new Error('no tile checkbox');
    }
    await userEvent.click(first);
    expect(document.activeElement).toBe(first);
    await userEvent.keyboard('a');
    expect(
      screen.getByRole('button', { name: 'Download selected (2)' }),
    ).toBeTruthy();
  });
});
