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

  test('while delayed, exit chooser offers returning to delayedFrom by its label', () => {
    const onExitDelayed = vi.fn();
    render(<OrderTopBar {...baseProps} onExitDelayed={onExitDelayed}
      order={{ state: 'delayed', delayedFrom: 'sent', orderId: 'X' }} />);
    fireEvent.click(screen.getByRole('button', { name: /move out of delayed/i }));
    // Buttons show friendly labels, but the callback still gets the raw state id
    fireEvent.click(screen.getByRole('button', { name: /return to .*in production/i }));
    expect(onExitDelayed).toHaveBeenCalledWith('sent');
  });

  test('exit chooser lists other states by label and passes the raw id', () => {
    const onExitDelayed = vi.fn();
    render(<OrderTopBar {...baseProps} onExitDelayed={onExitDelayed}
      order={{ state: 'delayed', delayedFrom: 'sent', orderId: 'X' }} />);
    fireEvent.click(screen.getByRole('button', { name: /move out of delayed/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Printed' }));
    expect(onExitDelayed).toHaveBeenCalledWith('fulfilled');
  });
});

describe('OrderTopBar transition dialogs use display labels', () => {
  test('advance dialog names the next state by label, not raw id', () => {
    const onAdvanceState = vi.fn();
    render(<OrderTopBar {...baseProps} onAdvanceState={onAdvanceState} order={{ state: 'pending', orderId: 'X' }} />);
    fireEvent.click(screen.getByRole('button', { name: /move to/i }));
    expect(screen.getByText('Move order to "Printed"?')).toBeInTheDocument();
    expect(screen.queryByText(/"fulfilled"/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onAdvanceState).toHaveBeenCalledWith('fulfilled'); // raw id still flows to the API
  });

  test('move-back dialog names the previous state by label', () => {
    render(<OrderTopBar {...baseProps} order={{ state: 'fulfilled', orderId: 'X' }} />);
    fireEvent.click(screen.getByRole('button', { name: /move back/i }));
    expect(screen.getByText('Move order back to "Pending Print"?')).toBeInTheDocument();
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
