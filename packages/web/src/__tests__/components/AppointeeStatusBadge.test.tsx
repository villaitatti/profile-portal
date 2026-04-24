import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { AppointeeStatusBadge } from '@/components/shared/AppointeeStatusBadge';
import type { AppointeeStatus } from '@itatti/shared';

describe('AppointeeStatusBadge', () => {
  const expectations: Array<{ status: AppointeeStatus; label: string }> = [
    { status: 'nominated', label: 'Nominated' },
    { status: 'accepted', label: 'Accepted' },
    { status: 'vit-id-sent', label: 'VIT ID Sent' },
    { status: 'vit-id-claimed', label: 'VIT ID Claimed' },
    { status: 'enrolled', label: 'Enrolled' },
  ];

  it.each(expectations)('renders label for $status', ({ status, label }) => {
    render(<AppointeeStatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('renders a destructive sub-label beneath the chip when given one', () => {
    render(
      <AppointeeStatusBadge
        status="accepted"
        subLabel="Last send failed"
        subLabelTone="destructive"
      />
    );
    expect(screen.getByText('Accepted')).toBeInTheDocument();
    const sub = screen.getByText('Last send failed');
    expect(sub).toBeInTheDocument();
    expect(sub).toHaveClass('text-destructive');
  });

  it.each(expectations)(
    'has a descriptive title (tooltip) for $status',
    ({ status }) => {
      // Every lifecycle state renders a non-trivial title. If the tooltip
      // map ever loses a state's copy, this test catches it before the
      // regression reaches Angela's dashboard.
      const { container } = render(<AppointeeStatusBadge status={status} />);
      const chip = container.querySelector('[title]');
      expect(chip).toBeTruthy();
      const title = chip?.getAttribute('title') ?? '';
      expect(title.length).toBeGreaterThan(10);
    }
  );
});
