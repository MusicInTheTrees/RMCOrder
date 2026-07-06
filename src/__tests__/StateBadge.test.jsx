import { render, screen } from '@testing-library/react';
import StateBadge, { STATE_COLORS } from '../components/StateBadge';

test('shipped has a distinct badge color', () => {
  expect(STATE_COLORS.shipped).toBeTruthy();
  expect(STATE_COLORS.shipped).not.toBe(STATE_COLORS.received);
});

test('renders the shipped label', () => {
  render(<StateBadge state="shipped" />);
  expect(screen.getByText('shipped')).toBeInTheDocument();
});
