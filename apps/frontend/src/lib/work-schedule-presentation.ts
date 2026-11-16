export const days = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];
export const time = (m: number) =>
  Number.isFinite(m)
    ? `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
    : '';
export const minute = (s: string, end = false) => {
  if (!s) return Number.NaN;
  const [h, m] = s.split(':').map(Number);
  const n = (h ?? 0) * 60 + (m ?? 0);
  return end && n === 0 ? 1440 : n;
};
