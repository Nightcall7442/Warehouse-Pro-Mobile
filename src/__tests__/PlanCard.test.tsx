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
import { render, screen, fireEvent } from '@testing-library/react-native';
import { PlanCard } from '../components/ui';

const basePlan = {
  id: 1,
  shopName: 'Test Shop',
  shopAddress: '123 Main St',
  status: 'planned',
};

describe('PlanCard', () => {
  it('renders shop name', () => {
    render(<PlanCard plan={basePlan} />);
    expect(screen.getByText('Test Shop')).toBeTruthy();
  });

  it('shows debt when shopDebt > 0', () => {
    render(<PlanCard plan={{ ...basePlan, shopDebt: '50000' }} />);
    expect(screen.getByText(/Долг/)).toBeTruthy();
  });

  it('does not show debt when shopDebt is 0', () => {
    render(<PlanCard plan={{ ...basePlan, shopDebt: '0' }} />);
    expect(screen.queryByText(/Долг/)).toBeNull();
  });

  it('shows correct status text for planned', () => {
    render(<PlanCard plan={basePlan} />);
    expect(screen.getByText('Запланирован')).toBeTruthy();
  });

  it('shows correct status text for visited', () => {
    render(<PlanCard plan={{ ...basePlan, status: 'visited' }} />);
    expect(screen.getByText('Посещён')).toBeTruthy();
  });

  it('shows correct status text for skipped', () => {
    render(<PlanCard plan={{ ...basePlan, status: 'skipped' }} />);
    expect(screen.getByText('Пропущен')).toBeTruthy();
  });

  it('calls onVisit when visit button pressed', () => {
    const onVisit = jest.fn();
    render(<PlanCard plan={basePlan} onVisit={onVisit} onSkip={jest.fn()} />);
    fireEvent.press(screen.getByText('Готово'));
    expect(onVisit).toHaveBeenCalledTimes(1);
  });

  it('calls onSkip when skip button pressed', () => {
    const onSkip = jest.fn();
    render(<PlanCard plan={basePlan} onVisit={jest.fn()} onSkip={onSkip} />);
    fireEvent.press(screen.getByText('Пропустить'));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});
