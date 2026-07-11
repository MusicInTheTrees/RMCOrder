import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import OrderTopBar from '../components/OrderTopBar';
import { STATE_LABELS } from '../emailStates';

const baseProps = {
  onAdvanceState: () => {}, onRegressState: () => {}, onGenerateDraft: () => {}, onNameChange: () => {},
  onEnterDelayed: vi.fn(), onExitDelayed: vi.fn(), saving: false,
};

describe('OrderTopBar delayed controls', () => {
  test('shows a Delayed button that fires onEnterDelayed (after confirm)', () => {
    const onEnterDelayed = vi.fn();
    render(<OrderTopBar {...baseProps} onEnterDelayed={onEnterDelayed} order={{ state: 'sent', orderId: 'X' }} />);
    fireEvent.click(screen.getByRole('button', { name: /delayed/i }));
    fireEvent.click(screen.getByRole('button', { name: /^confirm$|^yes$|^ok$/i }));
    expect(onEnterDelayed).toHaveBeenCalled();
  });

  test('while delayed, exit chooser offers returning to delayedFrom', () => {
    const onExitDelayed = vi.fn();
    render(<OrderTopBar {...baseProps} onExitDelayed={onExitDelayed}
      order={{ state: 'delayed', delayedFrom: 'sent', orderId: 'X' }} />);
    fireEvent.click(screen.getByRole('button', { name: /move out of delayed/i }));
    fireEvent.click(screen.getByRole('button', { name: /return to .*sent/i }));
    expect(onExitDelayed).toHaveBeenCalledWith('sent');
  });
});

describe('OrderTopBar state progression', () => {
  test('pending advances to fulfilled (paid removed)', () => {
    render(<OrderTopBar {...baseProps} order={{ state: 'pending', orderId: 'X' }} />);
    // Next-state badge shows the friendly label for fulfilled
    expect(screen.getByText(STATE_LABELS.fulfilled)).toBeInTheDocument();
    expect(screen.queryByText('paid')).not.toBeInTheDocument();
  });

  test('hides move controls for an unknown state', () => {
    render(<OrderTopBar {...baseProps} order={{ state: 'paid', orderId: 'X' }} />);
    expect(screen.queryByRole('button', { name: /move to/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /move back/i })).not.toBeInTheDocument();
  });
});
