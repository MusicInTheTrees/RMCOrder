import { render, screen } from '@testing-library/react';
import StateFlow from '../components/StateFlow';

test('renders every state in the regular flow', () => {
  render(<StateFlow order={{ state: 'building' }} />);
  for (const label of ['Building', 'In Production', 'Pending Print', 'Printed', 'In-Hand', 'Shipped']) {
    expect(screen.getByText(label)).toBeInTheDocument();
  }
});

test('marks the current state and dims future states', () => {
  render(<StateFlow order={{ state: 'pending' }} />);
  expect(screen.getByText('Pending Print').className).toContain('current');
  expect(screen.getByText('Building').className).toContain('past');
  expect(screen.getByText('Shipped').className).toContain('future');
});

test('a delayed order highlights the state it was delayed from with a Delayed tag', () => {
  render(<StateFlow order={{ state: 'delayed', delayedFrom: 'fulfilled' }} />);
  expect(screen.getByText('Printed').className).toContain('current');
  expect(screen.getByText('Delayed')).toBeInTheDocument();
});

test('accepts a custom state sequence for other order flows', () => {
  render(<StateFlow order={{ state: 'sent' }} states={['building', 'sent', 'received']} />);
  expect(screen.getByText('In Production').className).toContain('current');
  expect(screen.queryByText('Pending Print')).not.toBeInTheDocument();
});
