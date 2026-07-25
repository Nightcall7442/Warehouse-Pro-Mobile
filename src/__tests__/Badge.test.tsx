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
import { render, screen } from '@testing-library/react-native';
import { Badge } from '../components/ui';

describe('Badge', () => {
  it('renders children text', () => {
    render(<Badge>New</Badge>);
    expect(screen.getByText('New')).toBeTruthy();
  });

  it('renders with default variant', () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText('Active')).toBeTruthy();
  });
});
