/** Ключ даты 'YYYY-MM-DD' из года, месяца (1–12) и дня */
export function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Сетка месяца по неделям, неделя начинается с понедельника.
 * Пустые клетки до первого и после последнего дня — null.
 */
export function buildMonthGrid(year: number, month: number): (number | null)[][] {
  const daysInMonth = new Date(year, month, 0).getDate();
  // getDay(): 0 — воскресенье; переводим в 0 — понедельник
  const offset = (new Date(year, month - 1, 1).getDay() + 6) % 7;

  const cells: (number | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
