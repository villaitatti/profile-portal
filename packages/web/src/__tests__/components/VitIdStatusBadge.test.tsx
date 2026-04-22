import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { VitIdStatusBadge } from '@/components/shared/VitIdStatusBadge';
import type { Auth0Candidate } from '@itatti/shared';

const candidate: Auth0Candidate = {
  userId: 'auth0|test',
  email: 'test@example.com',
  civicrmId: '42',
  name: 'Test User',
};

describe('VitIdStatusBadge — labels', () => {
  it('renders "Active" for status=active', () => {
    render(<VitIdStatusBadge status="active" matchedVia="primary-email" matched={candidate} />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders "Active (different email)" for status=active-different-email', () => {
    render(
      <VitIdStatusBadge
        status="active-different-email"
        matchedVia="civicrm-id"
        matched={candidate}
      />
    );
    expect(screen.getByText('Active (different email)')).toBeInTheDocument();
  });

  it('renders "Needs review" for status=needs-review', () => {
    render(
      <VitIdStatusBadge
        status="needs-review"
        reason="name-collision"
        candidates={[candidate]}
      />
    );
    expect(screen.getByText('Needs review')).toBeInTheDocument();
  });

  it('renders "No Account" for status=no-account', () => {
    render(<VitIdStatusBadge status="no-account" />);
    expect(screen.getByText('No Account')).toBeInTheDocument();
  });
});

describe('VitIdStatusBadge — info popover copy', () => {
  it('shows civicrm-id copy when matchedVia=civicrm-id', async () => {
    render(
      <VitIdStatusBadge
        status="active-different-email"
        matchedVia="civicrm-id"
        matched={candidate}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /what does/i }));
    expect(await screen.findByText(/came back for another fellowship/i)).toBeInTheDocument();
  });

  it('shows secondary-email copy when matchedVia=secondary-email', async () => {
    render(
      <VitIdStatusBadge
        status="active-different-email"
        matchedVia="secondary-email"
        matched={candidate}
        matchedViaEmail="old@secondary.com"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /what does/i }));
    expect(
      await screen.findByText((content) => content.includes('old@secondary.com'))
    ).toBeInTheDocument();
  });

  it('shows name-collision copy when reason=name-collision', async () => {
    render(
      <VitIdStatusBadge
        status="needs-review"
        reason="name-collision"
        candidates={[candidate]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /what does/i }));
    expect(
      await screen.findByText((content) => content.includes("can't tell which is the right one"))
    ).toBeInTheDocument();
  });

  it('shows duplicate-civicrm-contact copy with merge-tool guidance', async () => {
    render(
      <VitIdStatusBadge
        status="needs-review"
        reason="duplicate-civicrm-contact"
        candidates={[]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /what does/i }));
    expect(
      await screen.findByText((content) => content.includes('duplicates are merged'))
    ).toBeInTheDocument();
    expect(
      await screen.findByText((content) =>
        content.includes('Find and Merge Duplicate Contacts')
      )
    ).toBeInTheDocument();
  });

  it('shows primary-conflict copy', async () => {
    render(
      <VitIdStatusBadge
        status="needs-review"
        reason="primary-conflict"
        candidates={[candidate]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /what does/i }));
    expect(
      await screen.findByText((content) => content.includes('Two records exist for the same person'))
    ).toBeInTheDocument();
  });

  it('shows tier-conflict copy', async () => {
    render(
      <VitIdStatusBadge
        status="needs-review"
        reason="tier-conflict"
        candidates={[candidate]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /what does/i }));
    expect(
      await screen.findByText((content) => content.includes('data is inconsistent'))
    ).toBeInTheDocument();
  });

  it('shows no-account copy with provisioning guidance', async () => {
    render(<VitIdStatusBadge status="no-account" />);
    fireEvent.click(screen.getByRole('button', { name: /what does/i }));
    expect(
      await screen.findByText((content) => content.includes('Provision a new VIT ID'))
    ).toBeInTheDocument();
  });
});

describe('VitIdStatusBadge — accessibility', () => {
  it('info icon is an aria-labeled button', () => {
    render(<VitIdStatusBadge status="active" matchedVia="primary-email" matched={candidate} />);
    expect(screen.getByRole('button', { name: /what does "Active" mean/i })).toBeInTheDocument();
  });
});
