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
    expect(screen.getByText('Drop a .pptx file or choose one')).toBeTruthy();
    await userEvent.click(
      screen.getByRole('button', { name: /switch language/i }),
    );
    expect(
      screen.getByText('Upuść plik .pptx albo wybierz z dysku'),
    ).toBeTruthy();
    expect(localStorage.getItem('pptx-peek:lang')).toBe('pl');
  });

  it('shows the invalid file message for a non-zip file', async () => {
    const { container } = render(<App />);
    const file = new File(['not a zip at all'], 'photo.jpg');
    await uploadFile(fileInput(container), file);
    expect(
      await screen.findByText('This is not a valid .pptx file'),
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

  it('opens the shortcuts dialog on ? and closes it on Escape', async () => {
    render(<App />);
    const dialog = document.querySelector('dialog');
    expect(dialog?.hasAttribute('open')).toBe(false);
    await userEvent.keyboard('?');
    expect(dialog?.hasAttribute('open')).toBe(true);
    await userEvent.keyboard('{Escape}');
    expect(dialog?.hasAttribute('open')).toBe(false);
  });
});
