import { test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ActiveInactiveList from '../components/ActiveInactiveList';

const ACTIVE = [{ name: 'Black', active: true }, { name: 'White', active: true }];
const INACTIVE = [{ name: 'Red', active: false }];

function setup(overrides = {}) {
  const props = {
    label: 'Colors',
    itemLabel: 'color',
    activeItems: ACTIVE,
    inactiveItems: INACTIVE,
    getKey: c => c.name,
    onToggle: vi.fn(),
    onDelete: vi.fn(),
    onReorder: vi.fn(),
    onAdd: vi.fn(),
    addPlaceholder: 'Color name...',
    ...overrides,
  };
  render(<ActiveInactiveList {...props} />);
  return props;
}

test('renders active and inactive entries under their column headers', () => {
  setup();
  expect(screen.getByText('Colors')).toBeInTheDocument();
  expect(screen.getByText('Black')).toBeInTheDocument();
  expect(screen.getByText('Red')).toBeInTheDocument();
  expect(screen.getByText(/Active \(drag to reorder\)/)).toBeInTheDocument();
  expect(screen.getByText('Inactive')).toBeInTheDocument();
});

test('move buttons toggle active state by key', async () => {
  const { onToggle } = setup();
  const rows = screen.getAllByTitle('Move to inactive');
  await userEvent.click(rows[0]);
  expect(onToggle).toHaveBeenCalledWith('Black', false);
  await userEvent.click(screen.getByTitle('Move to active'));
  expect(onToggle).toHaveBeenCalledWith('Red', true);
});

test('delete buttons report the entry key', async () => {
  const { onDelete } = setup();
  await userEvent.click(screen.getAllByTitle('Delete color')[2]);
  expect(onDelete).toHaveBeenCalledWith('Red');
});

test('adding via Enter submits the trimmed name and clears the input', async () => {
  const { onAdd } = setup();
  const input = screen.getByPlaceholderText('Color name...');
  await userEvent.type(input, '  Navy  {Enter}');
  expect(onAdd).toHaveBeenCalledWith('Navy');
  expect(input.value).toBe('');
});

test('add button submits the name', async () => {
  const { onAdd } = setup();
  await userEvent.type(screen.getByPlaceholderText('Color name...'), 'Navy');
  await userEvent.click(screen.getByRole('button', { name: 'Add' }));
  expect(onAdd).toHaveBeenCalledWith('Navy');
});

test('drag and drop within the active column reports from/to indices', () => {
  const { onReorder } = setup();
  const handles = screen.getAllByText('⠿');
  const firstRow = handles[0].closest('.ai-row');
  const secondRow = handles[1].closest('.ai-row');
  fireEvent.dragStart(firstRow);
  fireEvent.drop(secondRow);
  expect(onReorder).toHaveBeenCalledWith(0, 1);
});

test('renderLeading renders extra content per row', () => {
  setup({ renderLeading: c => <span data-testid={`swatch-${c.name}`} /> });
  expect(screen.getByTestId('swatch-Black')).toBeInTheDocument();
  expect(screen.getByTestId('swatch-Red')).toBeInTheDocument();
});
