import { render, screen } from '@testing-library/react';
import StateBadge, { STATE_COLORS } from '../components/StateBadge';

test('shipped has a distinct badge color', () => {
  expect(STATE_COLORS.shipped).toBeTruthy();
  expect(STATE_COLORS.shipped).not.toBe(STATE_COLORS.received);
});

test('renders the friendly label for shipped', () => {
  render(<StateBadge state="shipped" />);
  expect(screen.getByText('Shipped')).toBeInTheDocument();
});

test('renders Pending Print for the pending state', () => {
  render(<StateBadge state="pending" />);
  expect(screen.getByText('Pending Print')).toBeInTheDocument();
});

test('renders Printed for the fulfilled state', () => {
  render(<StateBadge state="fulfilled" />);
  expect(screen.getByText('Printed')).toBeInTheDocument();
});

test('falls back to the raw key for an unknown state', () => {
  render(<StateBadge state="mystery" />);
  expect(screen.getByText('mystery')).toBeInTheDocument();
});
