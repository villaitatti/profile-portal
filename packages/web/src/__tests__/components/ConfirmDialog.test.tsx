import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';

describe('ConfirmDialog', () => {
  it('renders title and description when open', () => {
    render(
      <ConfirmDialog
        open={true}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        title="Delete Mapping"
        description="Are you sure you want to delete this?"
      />
    );
    expect(screen.getByText('Delete Mapping')).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to delete this?')).toBeInTheDocument();
  });

  it('calls onConfirm when confirm button is clicked', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
        title="Remove Item"
        description="Confirm removal?"
        confirmLabel="Remove"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('calls onCancel when cancel button is clicked', () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        onConfirm={vi.fn()}
        onCancel={onCancel}
        title="Delete"
        description="Confirm?"
      />
    );
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });
});
