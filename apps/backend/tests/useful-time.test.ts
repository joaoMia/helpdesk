import { it, expect } from '@jest/globals';
import {
  fullyCovered,
  netSeconds,
  mergeWindows,
} from '../src/modules/calendars/useful-time.js';
it('janelas úteis descontam pausa apenas dentro do expediente e sem duplicar sobreposições', () => {
  expect(
    netSeconds(
      [
        { start: 0, end: 10000 },
        { start: 20000, end: 30000 },
      ],
      [
        { start: 5000, end: 25000 },
        { start: 6000, end: 26000 },
      ],
    ),
  ).toBe(9);
});
it('janelas adjacentes e segmentos versionados cobrem o intervalo; lacunas não geram métricas fictícias', () => {
  expect(
    fullyCovered(
      [
        { start: 0, end: 1000 },
        { start: 1000, end: 2000 },
      ],
      0,
      2000,
    ),
  ).toBe(true);
  expect(fullyCovered([{ start: 1000, end: 2000 }], 0, 2000)).toBe(false);
  expect(
    fullyCovered(
      [
        { start: 0, end: 999 },
        { start: 1000, end: 2000 },
      ],
      0,
      2000,
    ),
  ).toBe(false);
});
it('junção de janelas não modifica entradas nem conta tempo duplicado', () => {
  const input = [
    { start: 2000, end: 4000 },
    { start: 0, end: 3000 },
  ];
  expect(mergeWindows(input)).toEqual([{ start: 0, end: 4000 }]);
  expect(input[0]!.start).toBe(2000);
  expect(netSeconds(input, [])).toBe(4);
  expect(netSeconds(input, [{ start: -100, end: 10000 }])).toBe(0);
});
