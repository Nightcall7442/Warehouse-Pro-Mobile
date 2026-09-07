/**
 * Правка количества в заказе.
 *
 * Разбор числа проверен отдельно (order-money.test.ts), но беда была не в
 * разборе, а в поле: оно переписывало себя на каждом нажатии числом, которое
 * само же и посчитало. Набранная точка исчезала на лету, и 2,5 кг молча
 * становились 2 кг. Такое ловится только на самом поле.
 */
// Значки к делу не относятся; заглушка компонентом, а не строкой, чтобы
// react-dom не ругался на регистр имени.
jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));

// Безопасная зона — нативный модуль, в jest его нет, и без подмены набор
// падает на импорте, не дойдя до первого теста. Подмена такая же, как в
// product-sheet.test.tsx: 48 снизу — панель навигации Android с тремя
// кнопками, из-за которой кнопка «Сохранить количество» и оказывалась под
// системной полосой.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 48, left: 0, right: 0 }),
}));

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { OrderEditModal } from '../components/order/OrderEditModal';
import type { ThemeColors } from '../theme';

const colors = {
  bg: { secondary: '#fff', card: '#f7f7f7', input: '#eee', elevated: '#e0e0e0' },
  text: { primary: '#000', tertiary: '#666', muted: '#999' },
  border: { default: '#ddd', subtle: '#eee', full: '#ccc' },
  accent: { primary: '#3b6fe0' },
} as unknown as ThemeColors;

const items = [
  { id: 7, productName: 'Молоко', quantity: 3, unitPrice: 12000, unit: 'kg' },
];

function renderModal(onSaveItems = jest.fn()) {
  const view = render(
    <OrderEditModal
      visible
      notes=""
      discount=""
      items={items}
      saving={false}
      onNotesChange={jest.fn()}
      onDiscountChange={jest.fn()}
      onSaveItems={onSaveItems}
      onSave={jest.fn()}
      onClose={jest.fn()}
      colors={colors}
    />
  );
  // Modal в react-native-web рисуется отдельным слоем, а не внутри container,
  // поэтому поле ищем по всему документу.
  const input = document.querySelector('input') as HTMLInputElement;
  return { ...view, input, onSaveItems };
}

describe('количество в правке заказа', () => {
  it('набранная точка остаётся в поле', () => {
    const { input } = renderModal();
    fireEvent.change(input, { target: { value: '2.' } });
    // Раньше здесь оказывалось «2»: поле переписывалось разобранным числом, и
    // дробное количество набрать было нельзя вовсе.
    expect(input.value).toBe('2.');
  });

  it('дробное уходит на сервер дробным', () => {
    const { input, onSaveItems } = renderModal();
    fireEvent.change(input, { target: { value: '2,5' } });
    fireEvent.click(screen.getByText('Сохранить количество'));
    // Полкило — разница между возвратом магазина и недостачей склада.
    expect(onSaveItems).toHaveBeenCalledWith([{ itemId: 7, quantity: 2.5 }]);
  });

  it('пустое поле — ноль, а не NaN', () => {
    const { input, onSaveItems } = renderModal();
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.click(screen.getByText('Сохранить количество'));
    expect(onSaveItems).toHaveBeenCalledWith([{ itemId: 7, quantity: 0 }]);
  });

  it('без правок кнопки сохранения нет', () => {
    renderModal();
    expect(screen.queryByText('Сохранить количество')).toBeNull();
  });

  it('единица подписана из общего справочника', () => {
    // «kg» — килограммы; код из базы курьеру и агенту не показываем.
    renderModal();
    expect(screen.getByText(/3 кг/)).toBeTruthy();
  });
});
