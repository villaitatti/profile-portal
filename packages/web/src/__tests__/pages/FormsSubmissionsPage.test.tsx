import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

// Hoisted mocks for the hooks used by the page.
const {
  mockUseFormInvitations,
  mockUseFormResponse,
  mockUseFormRegistry,
  mockDownload,
  mockUseDownloadFormPdf,
} = vi.hoisted(() => ({
  mockUseFormInvitations: vi.fn(),
  mockUseFormResponse: vi.fn(),
  mockUseFormRegistry: vi.fn(),
  mockDownload: vi.fn(),
  mockUseDownloadFormPdf: vi.fn(),
}));

vi.mock('@/api/forms', () => ({
  useFormInvitations: mockUseFormInvitations,
  useFormResponse: mockUseFormResponse,
  useFormRegistry: mockUseFormRegistry,
}));

vi.mock('@/hooks/useDownloadFormPdf', () => ({
  useDownloadFormPdf: mockUseDownloadFormPdf,
}));

import { FormsSubmissionsPage } from '@/pages/admin/FormsSubmissionsPage';
import type { AdminFormInvitation, AdminFormInvitationsResponse } from '@/api/forms';
import type { FormDef } from '@itatti/shared';

const fellowMemorandum: FormDef = {
  id: 'fellow-memorandum',
  title: 'Memorandum I Tatti Fellowship',
  appointmentTypes: ['Fellow'],
  sections: [
    {
      title: 'Personal',
      fields: [
        { name: 'fullName', label: 'Full name', type: 'text', required: true },
        { name: 'birthdate', label: 'Birthdate', type: 'date', required: true },
      ],
    },
  ],
};

const inv1: AdminFormInvitation = {
  id: 'inv_1',
  fellowshipId: 10,
  contactId: 100,
  contactName: 'Maria Bianchi',
  academicYear: '2026-2027',
  formType: 'fellow-memorandum',
  formTitle: 'Memorandum I Tatti Fellowship',
  status: 'submitted',
  nominationSentAt: null,
  submittedAt: '2026-04-24T10:00:00.000Z',
  createdAt: '2026-04-20T10:00:00.000Z',
  hasResponse: true,
};

const inv2: AdminFormInvitation = {
  id: 'inv_2',
  fellowshipId: 11,
  contactId: 101,
  contactName: null, // CiviCRM-down fallback
  academicYear: '2025-2026',
  formType: 'fellow-memorandum',
  formTitle: 'Memorandum I Tatti Fellowship',
  status: 'submitted',
  nominationSentAt: null,
  submittedAt: '2026-04-18T10:00:00.000Z',
  createdAt: '2026-04-15T10:00:00.000Z',
  hasResponse: true,
};

const invRetired: AdminFormInvitation = {
  id: 'inv_retired',
  fellowshipId: 12,
  contactId: 102,
  contactName: 'Old Timer',
  academicYear: '2024-2025',
  formType: 'ancient-survey',
  formTitle: '(retired form: ancient-survey)',
  status: 'submitted',
  nominationSentAt: null,
  submittedAt: '2026-03-10T10:00:00.000Z',
  createdAt: '2026-03-05T10:00:00.000Z',
  hasResponse: true,
};

function payload(items: AdminFormInvitation[]): AdminFormInvitationsResponse {
  return {
    items,
    facets: {
      academicYears: Array.from(new Set(items.map((i) => i.academicYear))).sort().reverse(),
      formTypes: Array.from(new Set(items.map((i) => i.formType))).sort(),
    },
  };
}

function makeWrapper(initialPath = '/admin/forms') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialPath]}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  mockUseFormRegistry.mockReturnValue({ data: [fellowMemorandum], isLoading: false });
  mockUseFormResponse.mockReturnValue({
    data: {
      id: 'r_1',
      data: { fullName: 'Maria Bianchi', birthdate: '2026-04-24' },
      createdAt: '2026-04-24T10:00:00.000Z',
    },
    isLoading: false,
    isError: false,
  });
  mockUseDownloadFormPdf.mockReturnValue(mockDownload);
});

describe('FormsSubmissionsPage', () => {
  it('selects the most recent submission on load and renders its fields', async () => {
    mockUseFormInvitations.mockReturnValue({
      data: payload([inv1, inv2]),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<FormsSubmissionsPage />, { wrapper: makeWrapper() });

    // Most recent row (inv_1) is the default selection; detail heading shows
    // its form title.
    const heading = screen.getByRole('heading', { name: /Memorandum I Tatti Fellowship/ });
    expect(heading).toBeInTheDocument();

    // Visible field pairs render from the response data via getVisibleSections.
    // The detail pane shows both the meta line ("Maria Bianchi · 2026-2027")
    // and the Full name field value ("Maria Bianchi"). Both are expected;
    // getAllByText captures them.
    expect(screen.getByText('Full name')).toBeInTheDocument();
    expect(screen.getAllByText('Maria Bianchi').length).toBeGreaterThanOrEqual(2);
    // Date field renders via the local-date parser.
    expect(screen.getByText('24 Apr 2026')).toBeInTheDocument();
  });

  it('renders "Contact #<id>" for rows with null contactName (CiviCRM-down fallback)', () => {
    mockUseFormInvitations.mockReturnValue({
      data: payload([inv2]),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<FormsSubmissionsPage />, { wrapper: makeWrapper() });

    expect(screen.getAllByText(/Contact #101/).length).toBeGreaterThan(0);
  });

  it('shows the retired-form message and disables PDF download on retired rows', () => {
    mockUseFormInvitations.mockReturnValue({
      data: payload([invRetired]),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<FormsSubmissionsPage />, { wrapper: makeWrapper() });

    expect(
      screen.getByText(/This form is no longer in the registry/)
    ).toBeInTheDocument();

    // Both the list-row PDF button (icon variant) AND the detail-pane
    // Download PDF button render with the same aria-label. Both must be
    // disabled on a retired row — assert on all of them.
    const buttons = screen.getAllByRole('button', {
      name: /Download PDF for Old Timer/,
    });
    expect(buttons.length).toBeGreaterThanOrEqual(1);
    buttons.forEach((b) => expect(b).toBeDisabled());
  });

  it('calls useDownloadFormPdf when a list-row PDF button is clicked, without selecting the row', async () => {
    // inv2 has a null contactName (CiviCRM-down path); put both rows in the
    // same academic year so the default-year filter doesn't hide inv2.
    const inv2SameYear = { ...inv2, academicYear: inv1.academicYear };
    mockUseFormInvitations.mockReturnValue({
      data: payload([inv1, inv2SameYear]),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<FormsSubmissionsPage />, { wrapper: makeWrapper() });

    // Scope to the submissions list so we don't pick up the detail pane's
    // Download PDF button. The second row is inv_2 (contactName=null →
    // falls back to "Contact #101" in the aria-label).
    const list = screen.getByRole('list', { name: 'Form submissions' });
    // data-invitation-id scoping is the cleanest way to target a specific
    // row's button: aria-labels can collide between list-row and detail-pane
    // buttons when the same invitation is both listed and selected.
    const row2 = within(list)
      .getAllByRole('listitem')
      .find((li) => li.getAttribute('data-invitation-id') === 'inv_2')!;
    const row2Button = within(row2).getByRole('button', { name: /Download PDF/ });

    const user = userEvent.setup();
    await user.click(row2Button);

    expect(mockDownload).toHaveBeenCalledWith({
      invitationId: 'inv_2',
      contactName: null,
      formTitle: 'Memorandum I Tatti Fellowship',
    });

    // The originally-selected inv_1 row should still be selected —
    // clicking the PDF button must not propagate to the row click.
    const rows = within(list).getAllByRole('listitem');
    expect(rows[0].getAttribute('aria-selected')).toBe('true');
    expect(rows[1].getAttribute('aria-selected')).toBe('false');
  });

  it('honors the ?invitation=<id> deep link on initial load', () => {
    mockUseFormInvitations.mockReturnValue({
      data: payload([inv1, inv2]),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<FormsSubmissionsPage />, {
      wrapper: makeWrapper('/admin/forms?invitation=inv_2'),
    });

    // inv_2 belongs to academic year 2025-2026 (older than 2026-2027).
    // The deep-link rule pins the default year to the deep-linked row's
    // year so the row is visible. Assert inv_2 is selected in the list.
    const list = screen.getByRole('list', { name: 'Form submissions' });
    const selectedRow = within(list)
      .getAllByRole('listitem')
      .find((li) => li.getAttribute('aria-selected') === 'true');
    expect(selectedRow?.getAttribute('data-invitation-id')).toBe('inv_2');
  });

  it('keeps focus in the list when ArrowDown moves selection (not hijacked to detail)', async () => {
    // Both rows in the SAME academic year so the default-year filter doesn't
    // hide one of them.
    const invA = { ...inv1, id: 'inv_a' };
    const invB = { ...inv1, id: 'inv_b', submittedAt: '2026-04-20T10:00:00.000Z' };
    mockUseFormInvitations.mockReturnValue({
      data: payload([invA, invB]),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<FormsSubmissionsPage />, { wrapper: makeWrapper() });

    const list = screen.getByRole('list', { name: 'Form submissions' });
    const firstRow = within(list).getAllByRole('listitem')[0];
    firstRow.focus();
    expect(document.activeElement).toBe(firstRow);

    const user = userEvent.setup();
    await user.keyboard('{ArrowDown}');

    // Focus should remain in the list — specifically on the newly-selected
    // second row. Re-query because React re-renders may have detached the
    // previous node references. This guards OV2 (focus only moves on
    // Enter/click).
    await waitFor(() => {
      const rowsAfter = within(list).getAllByRole('listitem');
      expect(document.activeElement).toBe(rowsAfter[1]);
    });

    // Detail heading must NOT have focus.
    const heading = document.getElementById('submission-detail-heading');
    expect(document.activeElement).not.toBe(heading);
  });

  it('shows an empty state with no submissions at all', () => {
    mockUseFormInvitations.mockReturnValue({
      data: payload([]),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<FormsSubmissionsPage />, { wrapper: makeWrapper() });

    expect(screen.getByText(/No submissions yet/)).toBeInTheDocument();
  });

  it('surfaces a retry banner when the list query errors out', async () => {
    const refetch = vi.fn();
    mockUseFormInvitations.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    });

    render(<FormsSubmissionsPage />, { wrapper: makeWrapper() });

    const retry = screen.getByRole('button', { name: /Retry/ });
    const user = userEvent.setup();
    await user.click(retry);
    expect(refetch).toHaveBeenCalled();
  });

  // Decision OV2: Enter moves focus to the detail heading; Arrow keys do not.
  it('Enter on a list row moves focus to the detail heading', async () => {
    const invA = { ...inv1, id: 'inv_a' };
    const invB = { ...inv1, id: 'inv_b', submittedAt: '2026-04-20T10:00:00.000Z' };
    mockUseFormInvitations.mockReturnValue({
      data: payload([invA, invB]),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<FormsSubmissionsPage />, { wrapper: makeWrapper() });

    const list = screen.getByRole('list', { name: 'Form submissions' });
    const firstRow = within(list).getAllByRole('listitem')[0];
    firstRow.focus();
    const user = userEvent.setup();
    await user.keyboard('{Enter}');

    await waitFor(() => {
      const heading = document.getElementById('submission-detail-heading');
      expect(document.activeElement).toBe(heading);
    });
  });

  it('Home and End jump to the first and last list rows', async () => {
    const invA = { ...inv1, id: 'inv_a' };
    const invB = { ...inv1, id: 'inv_b', submittedAt: '2026-04-22T10:00:00.000Z' };
    const invC = { ...inv1, id: 'inv_c', submittedAt: '2026-04-20T10:00:00.000Z' };
    mockUseFormInvitations.mockReturnValue({
      data: payload([invA, invB, invC]),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<FormsSubmissionsPage />, { wrapper: makeWrapper() });

    const list = screen.getByRole('list', { name: 'Form submissions' });
    const rows = within(list).getAllByRole('listitem');
    rows[0].focus();
    const user = userEvent.setup();

    await user.keyboard('{End}');
    await waitFor(() => {
      const rowsNow = within(list).getAllByRole('listitem');
      expect(document.activeElement).toBe(rowsNow[rowsNow.length - 1]);
    });

    await user.keyboard('{Home}');
    await waitFor(() => {
      const rowsNow = within(list).getAllByRole('listitem');
      expect(document.activeElement).toBe(rowsNow[0]);
    });
  });

  it('filters list by formType when ?formType is present in URL', () => {
    const invMemo = { ...inv1, formType: 'fellow-memorandum' };
    const invOther = {
      ...inv1,
      id: 'inv_other',
      formType: 'visiting-professor',
      formTitle: 'Visiting Professor Form',
    };
    mockUseFormInvitations.mockReturnValue({
      data: payload([invMemo, invOther]),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<FormsSubmissionsPage />, {
      wrapper: makeWrapper('/admin/forms?formType=visiting-professor'),
    });

    const list = screen.getByRole('list', { name: 'Form submissions' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(1);
    expect(rows[0].getAttribute('data-invitation-id')).toBe('inv_other');
  });

  it('filters list by search substring (matches formTitle when contactName is null)', () => {
    const invNamed = { ...inv1, contactName: 'Maria Bianchi' };
    const invNull = {
      ...inv1,
      id: 'inv_null',
      contactName: null,
      formTitle: 'Research Grant Application',
      formType: 'research-grant',
    };
    mockUseFormInvitations.mockReturnValue({
      data: payload([invNamed, invNull]),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<FormsSubmissionsPage />, {
      wrapper: makeWrapper('/admin/forms?q=research'),
    });

    const list = screen.getByRole('list', { name: 'Form submissions' });
    const rows = within(list).getAllByRole('listitem');
    // Only the research-grant row matches; the contactName=null row is
    // reachable via formTitle. Guards the `${contactName ?? ''}` fallback.
    expect(rows).toHaveLength(1);
    expect(rows[0].getAttribute('data-invitation-id')).toBe('inv_null');
  });
});
