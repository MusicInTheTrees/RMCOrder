import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import EmailScreen from '../components/EmailScreen';

vi.mock('../api/emailList', () => ({
  getContacts: vi.fn().mockResolvedValue({ contacts: [] }),
  addContact: vi.fn(),
  updateContact: vi.fn(),
  deleteContact: vi.fn(),
  bulkAction: vi.fn(),
  runBackfill: vi.fn(),
  syncSheet: vi.fn(),
}));
vi.mock('../api/campaigns', () => ({
  getJobs: vi.fn().mockResolvedValue({ jobs: [] }),
  createJob: vi.fn(),
  cancelJob: vi.fn(),
  rescheduleJob: vi.fn(),
}));

test('shows Email List tab by default and switches to Email Campaign', async () => {
  render(<MemoryRouter><EmailScreen /></MemoryRouter>);
  expect(screen.getByRole('heading', { name: 'Email' })).toBeInTheDocument();
  expect(await screen.findByText(/No contacts yet/i)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Email Campaign' }));
  expect(await screen.findByText(/No campaigns yet/i)).toBeInTheDocument();
});
