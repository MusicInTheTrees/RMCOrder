import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import NewOrderDialog from '../components/NewOrderDialog';

describe('NewOrderDialog', () => {
  test('invokes the right callback per choice', () => {
    const onCustom = vi.fn(), onBlank = vi.fn(), onCancel = vi.fn();
    render(<NewOrderDialog onCustom={onCustom} onBlank={onBlank} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: /custom order/i }));
    expect(onCustom).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /blank order/i }));
    expect(onBlank).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
