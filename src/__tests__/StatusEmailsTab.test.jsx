import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StatusEmailsTab from '../components/StatusEmailsTab';
import {
  getStatusEmailTemplates, pullStatusEmailTemplates, pushStatusEmailTemplates,
} from '../api/customerEmails';

vi.mock('../api/customerEmails', () => ({
  getStatusEmailTemplates: vi.fn(),
  saveStatusEmailTemplates: vi.fn().mockResolvedValue({}),
  pullStatusEmailTemplates: vi.fn(),
  pushStatusEmailTemplates: vi.fn(),
  previewCustomerEmail: vi.fn(),
  generateCustomerDrafts: vi.fn(),
  sendCustomerEmail: vi.fn(),
}));

// All five states must be present or the component crashes on render.
const BASE = {
  templates: {
    sent: { subject: 'S-sent', body: 'B-sent' },
    pending: { subject: 'S-pending', body: 'B-pending' },
    fulfilled: { subject: 'S-fulfilled', body: 'B-fulfilled' },
    shipped: { subject: 'S-shipped', body: 'B-shipped' },
    delayed: { subject: 'S-delayed', body: 'B-delayed' },
  },
  genericCustomerName: 'Friend',
};

beforeEach(() => {
  vi.clearAllMocks();
  getStatusEmailTemplates.mockResolvedValue(BASE);
  pushStatusEmailTemplates.mockResolvedValue({ ok: true });
});

test('pull asks for confirmation; cancel does not call the API', async () => {
  render(<StatusEmailsTab />);
  await userEvent.click(await screen.findByRole('button', { name: /Pull from Drive/i }));
  expect(screen.getByText(/replaces your local status emails/i)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(pullStatusEmailTemplates).not.toHaveBeenCalled();
});

test('pull confirm replaces the editor state and reports success', async () => {
  pullStatusEmailTemplates.mockResolvedValue({
    ...BASE,
    templates: { ...BASE.templates, sent: { subject: 'Partner subject', body: 'PB' } },
    genericCustomerName: 'Partner Name',
  });
  render(<StatusEmailsTab />);
  await userEvent.click(await screen.findByRole('button', { name: /Pull from Drive/i }));
  await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  expect(await screen.findByText(/Pulled latest from Drive/i)).toBeInTheDocument();
  expect(screen.getByDisplayValue('Partner subject')).toBeInTheDocument();
  expect(screen.getByDisplayValue('Partner Name')).toBeInTheDocument();
});

test('push uploads and reports success', async () => {
  render(<StatusEmailsTab />);
  await userEvent.click(await screen.findByRole('button', { name: /Push to Drive/i }));
  expect(await screen.findByText(/Pushed to Drive/i)).toBeInTheDocument();
  expect(pushStatusEmailTemplates).toHaveBeenCalled();
});

test('push failure shows the server error', async () => {
  pushStatusEmailTemplates.mockRejectedValue(new Error('Drive down'));
  render(<StatusEmailsTab />);
  await userEvent.click(await screen.findByRole('button', { name: /Push to Drive/i }));
  expect(await screen.findByText(/Push failed: Drive down/i)).toBeInTheDocument();
});
