import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import type { FellowDashboardEntry } from '@itatti/shared';

const {
  mockUseEmailPreview,
  mockSendBioMutateAsync,
  mockSendVitIdMutateAsync,
  mockMarkNominationMutateAsync,
} = vi.hoisted(() => ({
  mockUseEmailPreview: vi.fn(),
  mockSendBioMutateAsync: vi.fn(),
  mockSendVitIdMutateAsync: vi.fn(),
  mockMarkNominationMutateAsync: vi.fn(),
}));

// Partial mock: the hooks are stubbed, but SendBioEmailError / SendVitIdEmailError
// stay real so the table's typed-error handling is exercised for real.
vi.mock('@/api/fellows', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/fellows')>();
  return {
    ...actual,
    useSendBioEmail: () => ({ mutateAsync: mockSendBioMutateAsync }),
    useSendVitIdEmail: () => ({ mutateAsync: mockSendVitIdMutateAsync }),
    useEmailPreview: mockUseEmailPreview,
  };
});

vi.mock('@/api/forms', () => ({
  useMarkNominationSent: () => ({
    mutateAsync: mockMarkNominationMutateAsync,
    isPending: false,
  }),
  useGenerateFormInvitation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { FellowsTable } from '@/pages/admin/fellows/FellowsTable';
import { SendBioEmailError } from '@/api/fellows';

function makeFellow(
  overrides: Partial<FellowDashboardEntry> & { civicrmId: number }
): FellowDashboardEntry {
  return {
    firstName: 'Test',
    lastName: 'Fellow',
    email: `fellow-${overrides.civicrmId}@example.com`,
    fellowshipYear: '2025-2026',
    fellowshipId: overrides.civicrmId,
    status: 'active',
    civicrmIdStatus: 'ok',
    bioEmail: {
      status: 'none',
      sentAt: null,
      sendCount: 0,
      targetAcademicYear: null,
      canManuallySend: false,
    },
    vitIdInvitation: {
      status: 'none',
      sentAt: null,
      sendCount: 0,
      targetAcademicYear: null,
      canManuallySend: false,
    },
    appointeeStatus: 'enrolled',
    formInvitations: [],
    ...overrides,
  };
}

/** Fellow eligible for a first-time bio email. */
const bioFellow = makeFellow({
  civicrmId: 1,
  firstName: 'Sophie',
  lastName: 'Laurent',
  email: 'sophie@example.com',
  appointment: 'Fellow',
  bioEmail: {
    status: 'none',
    sentAt: null,
    sendCount: 0,
    targetAcademicYear: '2025-2026',
    canManuallySend: true,
  },
});

/** Fellow whose bio email already went out — the resend path. */
const resendFellow = makeFellow({
  civicrmId: 2,
  firstName: 'James',
  lastName: 'Chen',
  email: 'james@example.com',
  appointment: 'Fellow',
  bioEmail: {
    status: 'sent',
    sentAt: '2026-04-01T10:00:00.000Z',
    sendCount: 1,
    targetAcademicYear: '2025-2026',
    canManuallySend: false,
  },
});

/** Fellow eligible for the VIT ID invitation. */
const vitIdFellow = makeFellow({
  civicrmId: 3,
  firstName: 'Elena',
  lastName: 'Petrova',
  email: 'elena@example.com',
  appointment: 'Visiting Professor',
  status: 'no-account',
  appointeeStatus: 'accepted',
  vitIdInvitation: {
    status: 'none',
    sentAt: null,
    sendCount: 0,
    targetAcademicYear: '2025-2026',
    canManuallySend: true,
  },
});

async function openActionsMenu(user: ReturnType<typeof userEvent.setup>, name: string) {
  // Keyboard-open sidesteps Base UI's pointer click-through protection,
  // which swallows synthetic clicks that land too soon in jsdom.
  screen.getByRole('button', { name: `Open actions for ${name}` }).focus();
  await user.keyboard('{Enter}');
}

beforeEach(() => {
  vi.resetAllMocks();
  mockUseEmailPreview.mockReturnValue({
    data: {
      to: 'sophie@example.com',
      bcc: [],
      subject: 'Your bio & project description',
      body: 'Dear Sophie,',
      bodyFormat: 'text',
    },
    error: null,
    isLoading: false,
  });
  mockSendBioMutateAsync.mockResolvedValue({ eventId: 'evt-1', status: 'SENT', sentAt: null });
  mockSendVitIdMutateAsync.mockResolvedValue({ eventId: 'evt-2', status: 'SENT', sentAt: null });
});

// ─── Rendering ───────────────────────────────────────────────────────────────

describe('FellowsTable — rendering', () => {
  it('renders a row per fellow with name and email', () => {
    render(<FellowsTable fellows={[bioFellow, resendFellow, vitIdFellow]} paginate={false} />);

    expect(screen.getByText('Sophie Laurent')).toBeInTheDocument();
    expect(screen.getByText('sophie@example.com')).toBeInTheDocument();
    expect(screen.getByText('James Chen')).toBeInTheDocument();
    expect(screen.getByText('Elena Petrova')).toBeInTheDocument();
    // Each row gets its own actions menu.
    expect(
      screen.getByRole('button', { name: 'Open actions for James Chen' })
    ).toBeInTheDocument();
  });
});

// ─── Sorting ─────────────────────────────────────────────────────────────────

function bodyRows() {
  return screen.getAllByRole('row').slice(1); // skip the header row
}

describe('FellowsTable — sorting', () => {
  const adams = makeFellow({ civicrmId: 11, firstName: 'Ada', lastName: 'Adams', appointment: 'Zeta Chair' });
  const baker = makeFellow({ civicrmId: 12, firstName: 'Ben', lastName: 'Baker', appointment: 'Midway Fellow' });
  const carter = makeFellow({ civicrmId: 13, firstName: 'Cy', lastName: 'Carter', appointment: 'Alpha Fellow' });

  it('sorts by appointment ascending by default and exposes aria-sort', () => {
    render(<FellowsTable fellows={[adams, baker, carter]} paginate={false} />);

    expect(screen.getByRole('button', { name: /Appointment/ }).closest('th')).toHaveAttribute(
      'aria-sort',
      'ascending'
    );
    const rows = bodyRows();
    expect(within(rows[0]).getByText('Cy Carter')).toBeInTheDocument(); // Alpha
    expect(within(rows[2]).getByText('Ada Adams')).toBeInTheDocument(); // Zeta
  });

  it('clicking Name sorts by last name and flips direction on the second click', async () => {
    const user = userEvent.setup();
    render(<FellowsTable fellows={[baker, carter, adams]} paginate={false} />);

    const nameButton = screen.getByRole('button', { name: /^Name/ });
    await user.click(nameButton);

    expect(nameButton.closest('th')).toHaveAttribute('aria-sort', 'ascending');
    let rows = bodyRows();
    expect(within(rows[0]).getByText('Ada Adams')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Cy Carter')).toBeInTheDocument();

    await user.click(nameButton);

    expect(nameButton.closest('th')).toHaveAttribute('aria-sort', 'descending');
    rows = bodyRows();
    expect(within(rows[0]).getByText('Cy Carter')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Ada Adams')).toBeInTheDocument();
  });
});

// ─── Pagination ──────────────────────────────────────────────────────────────

describe('FellowsTable — pagination', () => {
  const manyFellows = Array.from({ length: 60 }, (_, i) =>
    makeFellow({
      civicrmId: 100 + i,
      firstName: 'Fellow',
      lastName: `Number${String(i + 1).padStart(2, '0')}`,
      appointment: 'Fellow',
    })
  );

  it('shows 50 rows per page with a range summary', () => {
    render(<FellowsTable fellows={manyFellows} paginate={true} />);

    expect(screen.getByText('Showing 1–50 of 60')).toBeInTheDocument();
    expect(screen.getByText('Fellow Number01')).toBeInTheDocument();
    expect(screen.queryByText('Fellow Number51')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
  });

  it('moves between pages with Next and Previous', async () => {
    const user = userEvent.setup();
    render(<FellowsTable fellows={manyFellows} paginate={true} />);

    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText('Showing 51–60 of 60')).toBeInTheDocument();
    expect(screen.getByText('Fellow Number51')).toBeInTheDocument();
    expect(screen.queryByText('Fellow Number01')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Previous' }));

    expect(screen.getByText('Showing 1–50 of 60')).toBeInTheDocument();
  });

  it('hides the pagination controls when paginate is false', () => {
    render(<FellowsTable fellows={manyFellows} paginate={false} />);

    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
    expect(screen.getByText('Fellow Number60')).toBeInTheDocument();
  });
});

// ─── Send bio email workflow ─────────────────────────────────────────────────

describe('FellowsTable — send bio email', () => {
  it('previews, sends, toasts success, and closes the modal', async () => {
    const user = userEvent.setup();
    render(<FellowsTable fellows={[bioFellow]} paginate={false} />);

    await openActionsMenu(user, 'Sophie Laurent');
    await user.click(await screen.findByRole('menuitem', { name: 'Send bio email' }));

    // Preview modal shows the rendered envelope before anything is sent.
    expect(await screen.findByText('Send bio email to Sophie Laurent')).toBeInTheDocument();
    expect(screen.getByText('Your bio & project description')).toBeInTheDocument();
    expect(mockSendBioMutateAsync).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Send email' }));

    await waitFor(() => {
      expect(mockSendBioMutateAsync).toHaveBeenCalledWith({
        contactId: 1,
        academicYear: '2025-2026',
        resend: false,
      });
    });
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Bio email sent to Sophie Laurent.');
    await waitFor(() => {
      expect(screen.queryByText('Send bio email to Sophie Laurent')).not.toBeInTheDocument();
    });
  });

  it('surfaces the mapped i18n message for a typed { reason } failure and keeps the modal open', async () => {
    mockSendBioMutateAsync.mockRejectedValue(new SendBioEmailError('no_primary_email'));
    const user = userEvent.setup();
    render(<FellowsTable fellows={[bioFellow]} paginate={false} />);

    await openActionsMenu(user, 'Sophie Laurent');
    await user.click(await screen.findByRole('menuitem', { name: 'Send bio email' }));
    await screen.findByText('Send bio email to Sophie Laurent');
    await user.click(screen.getByRole('button', { name: 'Send email' }));

    expect(
      await screen.findByText('No primary email is on file for this appointee.')
    ).toBeInTheDocument();
    // Angela can retry from the same modal.
    expect(screen.getByText('Send bio email to Sophie Laurent')).toBeInTheDocument();
    expect(vi.mocked(toast.success)).not.toHaveBeenCalled();
  });

  it('shows the queued toast when the send is accepted but not yet SENT', async () => {
    mockSendBioMutateAsync.mockResolvedValue({ eventId: 'evt-9', status: 'PENDING', sentAt: null });
    const user = userEvent.setup();
    render(<FellowsTable fellows={[bioFellow]} paginate={false} />);

    await openActionsMenu(user, 'Sophie Laurent');
    await user.click(await screen.findByRole('menuitem', { name: 'Send bio email' }));
    await screen.findByText('Send bio email to Sophie Laurent');
    await user.click(screen.getByRole('button', { name: 'Send email' }));

    await waitFor(() => {
      expect(vi.mocked(toast.success)).toHaveBeenCalledWith(
        'Bio email queued for Sophie Laurent (status: pending).'
      );
    });
  });
});

// ─── Re-send bio email workflow ──────────────────────────────────────────────

/**
 * The ConfirmResendDialog is a plain fixed-position sibling of the Base UI
 * preview modal; while the modal is open Base UI marks outside content
 * aria-hidden, so its buttons must be queried with hidden: true.
 */
function confirmResendDialog(): HTMLElement {
  const dialog = screen
    .getByText('Re-send bio email?')
    .closest('div[role="dialog"]');
  expect(dialog).not.toBeNull();
  return dialog as HTMLElement;
}

describe('FellowsTable — re-send bio email', () => {
  it('asks for explicit confirmation before re-sending, then sends with resend: true', async () => {
    const user = userEvent.setup();
    render(<FellowsTable fellows={[resendFellow]} paginate={false} />);

    await openActionsMenu(user, 'James Chen');
    await user.click(await screen.findByRole('menuitem', { name: 'Re-send bio email' }));

    // Preview modal warns that this email already went out.
    expect(await screen.findByText('Re-send bio email to James Chen')).toBeInTheDocument();
    expect(screen.getByText(/This bio email was already sent on/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Send email' }));

    // Confirm dialog interposes — nothing sent yet.
    expect(await screen.findByText('Re-send bio email?')).toBeInTheDocument();
    expect(mockSendBioMutateAsync).not.toHaveBeenCalled();

    // The confirm dialog renders as a sibling of the (still open) Base UI
    // preview modal, which aria-hides outside content — so role queries need
    // hidden: true and scoping to the confirm dialog itself.
    const confirmDialog = confirmResendDialog();
    await user.click(
      within(confirmDialog).getByRole('button', { name: 'Send again', hidden: true })
    );

    await waitFor(() => {
      expect(mockSendBioMutateAsync).toHaveBeenCalledWith({
        contactId: 2,
        academicYear: '2025-2026',
        resend: true,
      });
    });
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Bio email re-sent to James Chen.');
  });

  it('cancelling the confirm dialog sends nothing', async () => {
    const user = userEvent.setup();
    render(<FellowsTable fellows={[resendFellow]} paginate={false} />);

    await openActionsMenu(user, 'James Chen');
    await user.click(await screen.findByRole('menuitem', { name: 'Re-send bio email' }));
    await screen.findByText('Re-send bio email to James Chen');
    await user.click(screen.getByRole('button', { name: 'Send email' }));
    await screen.findByText('Re-send bio email?');

    await user.click(
      within(confirmResendDialog()).getByRole('button', { name: 'Cancel', hidden: true })
    );

    await waitFor(() => {
      expect(screen.queryByText('Re-send bio email?')).not.toBeInTheDocument();
    });
    expect(mockSendBioMutateAsync).not.toHaveBeenCalled();
    // The preview modal is still open for a second look.
    expect(screen.getByText('Re-send bio email to James Chen')).toBeInTheDocument();
  });
});

// ─── Send VIT ID invitation workflow ─────────────────────────────────────────

describe('FellowsTable — send VIT ID invitation', () => {
  it('sends the invitation from the actions menu and toasts success', async () => {
    const user = userEvent.setup();
    render(<FellowsTable fellows={[vitIdFellow]} paginate={false} />);

    await openActionsMenu(user, 'Elena Petrova');
    await user.click(await screen.findByRole('menuitem', { name: 'Send VIT ID email' }));

    expect(
      await screen.findByText('Send VIT ID invitation to Elena Petrova')
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Send email' }));

    await waitFor(() => {
      expect(mockSendVitIdMutateAsync).toHaveBeenCalledWith({
        contactId: 3,
        academicYear: '2025-2026',
      });
    });
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith(
      'VIT ID invitation sent to Elena Petrova.'
    );
  });
});
