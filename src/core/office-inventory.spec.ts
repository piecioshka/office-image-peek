// @vitest-environment jsdom
/* eslint-disable no-magic-numbers -- fixture sizes */
import { describe, expect, it } from 'vitest';
import { tinyJpeg, tinyPng } from '../../test/fixtures/build-pptx';
import { buildDocx, buildXlsx } from '../../test/fixtures/build-office';
import { openDeck } from './open-deck';

function file(bytes: Uint8Array, name: string): File {
  return new File([new Uint8Array(bytes)], name);
}

const summary = (deck: Awaited<ReturnType<typeof openDeck>>) =>
  deck.assets.map((a) => [a.fileName, a.origin, a.slides]);

describe('Word documents', () => {
  it('groups body and header pictures and finds unused media', async () => {
    const deck = await openDeck(
      file(
        buildDocx({
          body: ['b.png', 'a.jpeg'],
          header: ['logo.png'],
          media: {
            'a.jpeg': tinyJpeg(10, 20),
            'b.png': tinyPng(4, 3, 1),
            'logo.png': tinyPng(2, 2, 2),
            'old.png': tinyPng(5, 5, 3),
          },
        }),
        'Raport Q3.docx',
      ),
    );
    expect(deck.kind).toBe('docx');
    expect(deck.presentation.slides).toEqual([]);
    expect(summary(deck)).toEqual([
      ['raport-q3-obraz-01.png', 'slide', []],
      ['raport-q3-obraz-02.jpeg', 'slide', []],
      ['raport-q3-naglowek-01.png', 'layout', []],
      ['raport-q3-nieuzywany-01.png', 'unused', []],
    ]);
    expect(deck.assets[1]?.width).toBe(10);
  });
});

describe('Excel workbooks', () => {
  it('assigns drawings to sheets, keeps in-cell pictures and names sheets', async () => {
    const deck = await openDeck(
      file(
        buildXlsx({
          sheets: [
            { name: 'Sales', pictures: ['chart.png'] },
            { name: 'Empty', pictures: [] },
            { name: 'Team', pictures: ['p1.png', 'p2.png', 'chart.png'] },
          ],
          inCells: ['cell.png'],
          media: {
            'chart.png': tinyPng(8, 8, 1),
            'p1.png': tinyPng(3, 3, 2),
            'p2.png': tinyPng(3, 3, 3),
            'cell.png': tinyPng(1, 1, 4),
            'stale.png': tinyPng(2, 2, 5),
          },
        }),
        'budget.xlsx',
      ),
    );
    expect(deck.kind).toBe('xlsx');
    expect(deck.places.map((p) => p.name)).toEqual(['Sales', 'Empty', 'Team']);
    expect(summary(deck)).toEqual([
      ['budget-arkusz-01-01.png', 'slide', [1, 3]],
      ['budget-arkusz-03-01.png', 'slide', [3]],
      ['budget-arkusz-03-02.png', 'slide', [3]],
      ['budget-komorka-01.png', 'slide', []],
      ['budget-nieuzywany-01.png', 'unused', []],
    ]);
  });
});
