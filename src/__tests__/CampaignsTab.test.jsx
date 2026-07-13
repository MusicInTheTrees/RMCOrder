import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CampaignsTab from '../components/CampaignsTab';
import { getJobs, createJob, cancelJob } from '../api/campaigns';

vi.mock('../api/campaigns', () => ({
  getJobs: vi.fn().mockResolvedValue({ jobs: [] }),
  createJob: vi.fn().mockResolvedValue({ job: { id: 'j1', status: 'scheduled' } }),
  cancelJob: vi.fn().mockResolvedValue({ job: { id: 'j1', status: 'cancelled' } }),
  rescheduleJob: vi.fn().mockResolvedValue({ job: { id: 'j1', status: 'scheduled' } }),
}));
vi.mock('../api/emailList', () => ({
  getContacts: vi.fn().mockResolvedValue({ contacts: [
    { name: 'Ann', email: 'ann@x.com', status: 'subscribed' },
    { name: 'Bo', email: 'bo@x.com', status: 'subscribed' },
  ] }),
}));

test('composing a whole-list blast with no schedule sends now', async () => {
  render(<CampaignsTab />);
  await screen.findByText(/No campaigns yet/i);
  await userEvent.type(screen.getByPlaceholderText(/Subject/i), 'New drop');
  await userEvent.type(screen.getByPlaceholderText(/Hello \[customer name\]/i), 'Big news!');
  await userEvent.click(screen.getByRole('button', { name: /Schedule blast/i }));
  await waitFor(() => expect(createJob).toHaveBeenCalledWith({
    subject: 'New drop', body: 'Big news!', recipients: 'list', sendAt: undefined,
  }));
});

test('selected-contacts mode sends the checked emails', async () => {
  render(<CampaignsTab />);
  await screen.findByText(/No campaigns yet/i);
  await userEvent.click(screen.getByLabelText(/Selected contacts/i));
  await userEvent.click(await screen.findByLabelText(/ann@x.com/i));
  await userEvent.type(screen.getByPlaceholderText(/Subject/i), 'S');
  await userEvent.type(screen.getByPlaceholderText(/Hello \[customer name\]/i), 'B');
  await userEvent.click(screen.getByRole('button', { name: /Schedule blast/i }));
  await waitFor(() => expect(createJob).toHaveBeenCalledWith(
    expect.objectContaining({ recipients: ['ann@x.com'] })));
});

test('history shows jobs and cancels a scheduled one', async () => {
  getJobs.mockResolvedValue({ jobs: [
    { id: 'j1', subject: 'Drop', recipients: 'list', sendAt: '2026-07-20T09:00:00.000Z', status: 'scheduled', error: '', results: [] },
    { id: 'j2', subject: 'Old', recipients: 'list', sendAt: '2026-07-01T09:00:00.000Z', status: 'sent', error: '', results: [] },
  ] });
  render(<CampaignsTab />);
  expect(await screen.findByText('Drop')).toBeInTheDocument();
  expect(screen.getByText('Old')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /Cancel/i }));
  await waitFor(() => expect(cancelJob).toHaveBeenCalledWith('j1'));
});
