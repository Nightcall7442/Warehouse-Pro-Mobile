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
// кнопками, из-за которой кнопка «Сохранить состав» и оказывалась под
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
  text: { primary: '#000', secondary: '#444', tertiary: '#666', muted: '#999' },
  border: { default: '#ddd', subtle: '#eee', full: '#ccc' },
  accent: { primary: '#3b6fe0' },
  // Красный нужен кнопке «убрать позицию»: без него стенд падал на цвете
  // значка, а не на том, что проверяет. Набор намеренно неполный — от палитры
  // здесь нужны только те ветки, которых окно касается.
  status: { danger: '#d45050' },
} as unknown as ThemeColors;

const items = [
  // productId — не украшение: по нему окно отличает добавленную строку от
  // правки существующей, и по нему же не даёт завести один товар дважды.
  { id: 7, productId: 70, productName: 'Молоко', quantity: 3, unitPrice: 12000, unit: 'kg' },
];

const twoItems = [
  ...items,
  { id: 8, productId: 80, productName: 'Кефир', quantity: 1, unitPrice: 9000, unit: 'pcs' },
];

function renderModal(onSaveItems = jest.fn(), rows = items) {
  const view = render(
    <OrderEditModal
      visible
      notes=""
      discount=""
      items={rows}
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
    fireEvent.click(screen.getByText('Сохранить состав'));
    // Полкило — разница между возвратом магазина и недостачей склада.
    expect(onSaveItems).toHaveBeenCalledWith([{ itemId: 7, quantity: 2.5 }]);
  });

  it('пустое поле — ноль, а не NaN', () => {
    /*
      Проверяется РАЗБОР: пустая строка не должна давать NaN. Позиций в заказе
      две, потому что обнулить единственную больше нельзя — заказ без позиций
      отвергает и сервер, и окно (проверка ниже). С одной строкой это
      проверяло бы уже не разбор, а запрет.
    */
    const { onSaveItems } = renderModal(jest.fn(), twoItems);
    const first = document.querySelectorAll('input')[0] as HTMLInputElement;
    fireEvent.change(first, { target: { value: '' } });
    fireEvent.click(screen.getByText('Сохранить состав'));
    expect(onSaveItems).toHaveBeenCalledWith([{ itemId: 7, quantity: 0 }]);
  });

  it('последнюю позицию убрать нельзя', () => {
    /*
      Заказ без позиций сервер отвергает («В заказе должна остаться хотя бы
      одна позиция»). Раньше окно всё равно отправляло запрос и человек видел
      отказ после сохранения; теперь оно объясняет сразу и называет выход —
      отменить заказ целиком.
    */
    const { onSaveItems, input } = renderModal();
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.click(screen.getByText('Сохранить состав'));
    expect(onSaveItems).not.toHaveBeenCalled();
  });

  it('без правок кнопки сохранения нет', () => {
    renderModal();
    expect(screen.queryByText('Сохранить состав')).toBeNull();
  });

  it('убранная позиция уходит нулём, а не пропадает из списка', () => {
    /*
      Главное в правке состава. Сервер оставляет как было всё, чего нет в
      присланном списке (services/order.ts: «Lines the caller did not mention
      stay as they are»), — то есть просто не прислать строку значит НЕ удалить
      её, а молча сохранить вместе с резервом на складе.
    */
    const { onSaveItems } = renderModal(jest.fn(), twoItems);
    fireEvent.click(screen.getByLabelText('Убрать Молоко'));
    fireEvent.click(screen.getByText('Сохранить состав'));
    expect(onSaveItems).toHaveBeenCalledWith([{ itemId: 7, quantity: 0 }]);
  });

  it('убранное можно вернуть', () => {
    // Строка гаснет, а не исчезает: пропади она совсем — нажавший мимо не понял
    // бы, что произошло, и отменить это было бы нечем.
    renderModal(jest.fn(), twoItems);
    fireEvent.click(screen.getByLabelText('Убрать Молоко'));
    fireEvent.click(screen.getByLabelText('Вернуть Молоко'));
    expect(screen.queryByText('Сохранить состав')).toBeNull();
  });

  it('добавить товар просят у экрана, а не тянут сами', () => {
    /*
      Каталог грузит экран: окно осталось разметкой. Свой запрос внутри ронял
      бы пять проверок выше — их стенд рисует окно без провайдера запросов.
    */
    const onNeedCatalog = jest.fn();
    render(
      <OrderEditModal
        visible notes="" discount="" items={items} saving={false}
        onNotesChange={jest.fn()} onDiscountChange={jest.fn()}
        onSaveItems={jest.fn()} onSave={jest.fn()} onClose={jest.fn()}
        onNeedCatalog={onNeedCatalog}
        colors={colors}
      />,
    );
    fireEvent.click(screen.getByText('Добавить товар'));
    expect(onNeedCatalog).toHaveBeenCalled();
  });

  it('добавленный товар уходит товаром, а не позицией', () => {
    // Сервер различает правку позиции (itemId) и вставку новой (productId):
    // перепутай — и он ответит «позиция заказа не найдена» на добавление.
    const onSaveItems = jest.fn();
    render(
      <OrderEditModal
        visible notes="" discount="" items={items} saving={false}
        onNotesChange={jest.fn()} onDiscountChange={jest.fn()}
        onSaveItems={onSaveItems} onSave={jest.fn()} onClose={jest.fn()}
        onNeedCatalog={jest.fn()}
        catalog={[{ id: 99, name: 'Сметана', unitPrice: 15000, unit: 'pcs' }]}
        colors={colors}
      />,
    );
    fireEvent.click(screen.getByText('Добавить товар'));
    fireEvent.click(screen.getByText('Сметана'));
    fireEvent.click(screen.getByText('Сохранить состав'));
    expect(onSaveItems).toHaveBeenCalledWith([
      { productId: 99, quantity: 1, unitPrice: '15000' },
    ]);
  });

  it('единица подписана из общего справочника', () => {
    // «kg» — килограммы; код из базы курьеру и агенту не показываем.
    renderModal();
    expect(screen.getByText(/3 кг/)).toBeTruthy();
  });
});
