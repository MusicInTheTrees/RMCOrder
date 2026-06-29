import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SizeButtons from '../components/SizeButtons';

const LABELS = ['S', 'M', 'L'];

test('clicking + increments total for a size label', async () => {
  const onChange = vi.fn();
  render(<SizeButtons sizeLabels={LABELS} sizes={{}} onChange={onChange} />);
  const plusButtons = screen.getAllByText('+');
  // First + is for 'S' (index 0)
  await userEvent.click(plusButtons[0]);
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ S: { total: 1, inventory: 0 } }));
});

test('inventory cannot exceed total', async () => {
  const onChange = vi.fn();
  const sizes = { M: { total: 2, inventory: 2 } };
  render(<SizeButtons sizeLabels={LABELS} sizes={sizes} onChange={onChange} />);
  // With M total=2 inventory=2, the inv + button should be disabled
  // The inv + appears after the size + buttons; find by context
  const allPlus = screen.getAllByText('+');
  // allPlus: [S+, M+, L+, M-inv+]  — M-inv+ should be disabled
  const invPlus = allPlus[allPlus.length - 1];
  expect(invPlus).toBeDisabled();
});

test('renders all provided size labels', () => {
  render(<SizeButtons sizeLabels={['XS', 'S', 'M', 'L', 'XL', '2XL']} sizes={{}} onChange={vi.fn()} />);
  expect(screen.getByText('XS')).toBeInTheDocument();
  expect(screen.getByText('2XL')).toBeInTheDocument();
});
