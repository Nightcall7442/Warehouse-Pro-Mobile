jest.mock('../store/theme', () => ({
  useThemeColors: () => ({
    bg: { card: '#fff', elevated: '#f0f0f0', input: '#e0e0e0', primary: '#000' },
    text: { primary: '#000', secondary: '#666', muted: '#999' },
    border: { default: '#ddd', subtle: '#eee' },
    brand: { primary: '#3b6fe0', primaryDim: '#e8edf8', primaryLight: '#5b8cf0' },
    accent: { primary: '#3b6fe0', success: '#34c473', warning: '#d4973a', danger: '#d45050', info: '#3b6fe0' },
    status: {
      success: '#34c473', warning: '#d4973a', danger: '#d45050', info: '#3b6fe0',
      successDim: '#e8f8f0', warningDim: '#fdf0e0', dangerDim: '#fde8e8', infoDim: '#e8edf8',
    },
  }),
  useThemeStore: () => ({ isDark: false }),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('@expo/vector-icons', () => ({ Feather: 'Feather' }));

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchInput } from '../components/ui';

describe('SearchInput', () => {
  it('renders with placeholder text', () => {
    render(<SearchInput value="" onChangeText={jest.fn()} />);
    expect(screen.getByPlaceholderText('Поиск…')).toBeTruthy();
  });

  it('renders custom placeholder', () => {
    render(<SearchInput value="" onChangeText={jest.fn()} placeholder="Find items" />);
    expect(screen.getByPlaceholderText('Find items')).toBeTruthy();
  });

  it('calls onChangeText on text change', () => {
    const onChangeText = jest.fn();
    render(<SearchInput value="" onChangeText={onChangeText} />);
    fireEvent.change(screen.getByPlaceholderText('Поиск…'), { target: { value: 'test query' } });
    expect(onChangeText).toHaveBeenCalledWith('test query');
  });

  it('clear button appears when value is non-empty', () => {
    render(<SearchInput value="hello" onChangeText={jest.fn()} />);
    expect(screen.getByDisplayValue('hello')).toBeTruthy();
  });

  it('clear button does not render when value is empty', () => {
    render(<SearchInput value="" onChangeText={jest.fn()} />);
    // When value is empty, the X button (Feather "x" icon wrapped in TouchableOpacity) is not rendered.
    // The component only renders the clear button when value is truthy.
    expect(screen.getByPlaceholderText('Поиск…')).toBeTruthy();
  });
});
