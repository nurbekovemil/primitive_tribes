import type { Sex } from './constants';

const MALE = ['Ур', 'Гро', 'Тар', 'Бок', 'Рык', 'Дорг', 'Кам', 'Зук', 'Мог', 'Хорт', 'Вар', 'Брон', 'Гук', 'Тур', 'Арг', 'Олк', 'Сар', 'Дым'];
const FEMALE = ['Ана', 'Ми', 'Лия', 'Ола', 'Иса', 'Ру', 'Тэя', 'Нава', 'Эла', 'Ки', 'Мара', 'Уна', 'Зоя', 'Вела', 'Рая', 'Ния', 'Сая'];

export function randomName(sex: Sex): string {
  const list = sex === 'm' ? MALE : FEMALE;
  return list[Math.floor(Math.random() * list.length)];
}
