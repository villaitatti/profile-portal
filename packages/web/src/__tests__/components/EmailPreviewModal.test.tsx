import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import {
  EmailPreviewModal,
  type EmailPreviewData,
} from '@/components/shared/EmailPreviewModal';

const samplePreview: EmailPreviewData = {
  to: 'sofia@example.com',
  bcc: ['angela@itatti.harvard.edu', 'it@itatti.harvard.edu'],
  subject: 'Welcome to I Tatti — Claim your VIT ID',
  body: '<p>Dear Sofia,</p>',
  bodyFormat: 'html',
};

describe('EmailPreviewModal', () => {
  it('shows a loading spinner while preview is null and disables Send', () => {
    render(
      <EmailPreviewModal
        open
        title="Send VIT ID invitation"
        preview={null}
        previewError={null}
        sendError={null}
        submitting={false}
        onCancel={() => {}}
        onConfirm={() => {}}
      />
    );
    // Send is disabled because preview hasn't loaded yet.
    const send = screen.getByRole('button', { name: /send email/i });
    expect(send).toBeDisabled();
  });

  it('renders To, BCC list, and Subject in the metadata strip when preview loads', () => {
    render(
      <EmailPreviewModal
        open
        title="Send VIT ID invitation"
        preview={samplePreview}
        previewError={null}
        sendError={null}
        submitting={false}
        onCancel={() => {}}
        onConfirm={() => {}}
      />
    );
    expect(screen.getByText('sofia@example.com')).toBeInTheDocument();
    expect(
      screen.getByText('angela@itatti.harvard.edu, it@itatti.harvard.edu')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Welcome to I Tatti — Claim your VIT ID')
    ).toBeInTheDocument();
    expect(screen.getByText(/locked/i)).toBeInTheDocument();
  });

  it('shows an inline destructive banner on previewError and keeps Send disabled', () => {
    render(
      <EmailPreviewModal
        open
        title="Send VIT ID invitation"
        preview={null}
        previewError="This appointee is missing a first name in CiviCRM."
        sendError={null}
        submitting={false}
        onCancel={() => {}}
        onConfirm={() => {}}
      />
    );
    expect(
      screen.getByText(/missing a first name/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /send email/i })
    ).toBeDisabled();
  });

  it('shows an inline destructive banner on sendError and KEEPS Send enabled for retry', () => {
    render(
      <EmailPreviewModal
        open
        title="Send VIT ID invitation"
        preview={samplePreview}
        previewError={null}
        sendError="SES rejected the message."
        submitting={false}
        onCancel={() => {}}
        onConfirm={() => {}}
      />
    );
    expect(screen.getByText(/SES rejected/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /send email/i })
    ).toBeEnabled();
  });

  it('calls onConfirm when Send is clicked', () => {
    const onConfirm = vi.fn();
    render(
      <EmailPreviewModal
        open
        title="Send VIT ID invitation"
        preview={samplePreview}
        previewError={null}
        sendError={null}
        submitting={false}
        onCancel={() => {}}
        onConfirm={onConfirm}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /send email/i }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('renders the BCC field as "(none)" when the BCC list is empty', () => {
    render(
      <EmailPreviewModal
        open
        title="Send bio email"
        preview={{ ...samplePreview, bcc: [] }}
        previewError={null}
        sendError={null}
        submitting={false}
        onCancel={() => {}}
        onConfirm={() => {}}
      />
    );
    expect(screen.getByText('(none)')).toBeInTheDocument();
  });
});
