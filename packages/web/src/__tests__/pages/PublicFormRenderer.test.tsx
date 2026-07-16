import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FormDef } from '@itatti/shared';
import { COUNTRIES, TITLE_OPTIONS } from '@itatti/shared';
import { PublicFormRenderer } from '@/pages/forms/PublicFormRenderer';

const addressForm: FormDef = {
  id: 'renderer-address-test',
  title: 'Renderer Address Test',
  appointmentTypes: ['Fellow'],
  sections: [
    {
      title: 'Personal Information',
      icon: 'user',
      fields: [
        {
          name: 'title',
          label: 'Title',
          type: 'select',
          required: false,
          options: [...TITLE_OPTIONS],
          layout: 'third',
        },
      ],
    },
    {
      title: 'Legal Address',
      icon: 'map-pin',
      fields: [
        { name: 'legalStreetAddress', label: 'Street address', type: 'text', required: true, layout: 'full' },
        { name: 'legalCity', label: 'City', type: 'text', required: true, layout: 'half' },
        { name: 'legalPostalCode', label: 'Postal code', type: 'text', required: false, layout: 'half' },
        { name: 'legalStateProvince', label: 'State / Province', type: 'text', required: false, layout: 'half' },
        {
          name: 'legalCountry',
          label: 'Country',
          type: 'select',
          required: true,
          options: [...COUNTRIES],
          layout: 'half',
        },
      ],
    },
  ],
};

describe('PublicFormRenderer', () => {
  it('enforces date bounds in the input and before submission', () => {
    const onSubmit = vi.fn();
    const dateForm: FormDef = {
      id: 'date-bounds-test',
      title: 'Date Bounds Test',
      appointmentTypes: ['Fellow'],
      sections: [
        {
          title: 'Personal Information',
          fields: [
            {
              name: 'dateOfBirth',
              label: 'Date of birth',
              type: 'date',
              required: true,
              minDate: '1900-01-01',
              maxDate: 'today',
            },
          ],
        },
      ],
    };

    render(
      <PublicFormRenderer
        formDef={dateForm}
        onSubmit={onSubmit}
        isSubmitting={false}
        isSuccess={false}
      />
    );

    const input = screen.getByLabelText(/^Date of birth/);
    expect(input).toHaveAttribute('min', '1900-01-01');
    expect(input).toHaveAttribute('max', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    fireEvent.change(input, { target: { value: '2099-01-01' } });
    fireEvent.click(screen.getByRole('button', { name: /submit form/i }));

    expect(screen.getByText('Date cannot be in the future')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('allows optional title while submitting the split legal address', () => {
    const onSubmit = vi.fn();
    render(
      <PublicFormRenderer
        formDef={addressForm}
        onSubmit={onSubmit}
        isSubmitting={false}
        isSuccess={false}
      />
    );

    fireEvent.change(screen.getByLabelText(/Street address/), {
      target: { value: 'Via di Vincigliata 26' },
    });
    fireEvent.change(screen.getByLabelText(/City/), { target: { value: 'Florence' } });
    fireEvent.change(screen.getByLabelText('Postal code'), { target: { value: '50135' } });
    fireEvent.change(screen.getByLabelText('State / Province'), { target: { value: 'FI' } });

    fireEvent.click(screen.getByRole('combobox', { name: 'Country' }));
    fireEvent.click(screen.getByText('Italy'));
    fireEvent.click(screen.getByRole('button', { name: /submit form/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      legalStreetAddress: 'Via di Vincigliata 26',
      legalCity: 'Florence',
      legalPostalCode: '50135',
      legalStateProvince: 'FI',
      legalCountry: 'Italy',
    });
  });

  it('uses compact non-search selects for short option lists', async () => {
    const user = userEvent.setup();
    render(
      <PublicFormRenderer
        formDef={addressForm}
        onSubmit={vi.fn()}
        isSubmitting={false}
        isSuccess={false}
      />
    );

    await user.click(screen.getByRole('combobox', { name: 'Title' }));

    expect(screen.getByRole('option', { name: 'Dr.' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Prof.' })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/search select title/i)).not.toBeInTheDocument();
  });

  it('requires street, city, and country but not title, postal code, or state/province', () => {
    const onSubmit = vi.fn();
    render(
      <PublicFormRenderer
        formDef={addressForm}
        onSubmit={onSubmit}
        isSubmitting={false}
        isSuccess={false}
      />
    );

    expect(screen.getByLabelText('State / Province')).toHaveAttribute('type', 'text');

    fireEvent.click(screen.getByRole('button', { name: /submit form/i }));

    expect(screen.getAllByText('This field is required')).toHaveLength(3);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('keeps conditional fields hidden until their radio gate matches', () => {
    const conditionalForm: FormDef = {
      id: 'renderer-conditional-test',
      title: 'Renderer Conditional Test',
      appointmentTypes: ['Fellow'],
      sections: [
        {
          title: 'Status',
          fields: [
            {
              name: 'statusAtItatti',
              label: 'Status at I Tatti',
              type: 'radio',
              required: true,
              options: ['Independent Scholar', 'Other'],
            },
            {
              name: 'statusOther',
              label: 'If other, please indicate',
              type: 'text',
              required: false,
              conditionalOn: { field: 'statusAtItatti', value: 'Other' },
            },
          ],
        },
      ],
    };

    render(
      <PublicFormRenderer
        formDef={conditionalForm}
        onSubmit={vi.fn()}
        isSubmitting={false}
        isSuccess={false}
      />
    );

    expect(screen.queryByLabelText('If other, please indicate')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Other'));

    expect(screen.getByLabelText('If other, please indicate')).toBeInTheDocument();
  });

  it('shows the status other field beneath a select with animation styling', async () => {
    const user = userEvent.setup();
    const conditionalForm: FormDef = {
      id: 'renderer-status-select-test',
      title: 'Renderer Status Select Test',
      appointmentTypes: ['Fellow'],
      sections: [
        {
          title: 'Status',
          fields: [
            {
              name: 'statusAtItatti',
              label: 'What will your status be while residing at I Tatti?',
              type: 'select',
              required: true,
              options: ['Independent Scholar', 'Other'],
              layout: 'full',
            },
            {
              name: 'statusOther',
              label: 'If other, please indicate',
              type: 'text',
              required: false,
              layout: 'full',
              conditionalOn: { field: 'statusAtItatti', value: 'Other' },
            },
          ],
        },
      ],
    };

    render(
      <PublicFormRenderer
        formDef={conditionalForm}
        onSubmit={vi.fn()}
        isSubmitting={false}
        isSuccess={false}
      />
    );

    expect(screen.queryByLabelText('If other, please indicate')).not.toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: /What will your status be/ }));
    await user.click(screen.getByRole('option', { name: 'Other' }));

    const otherField = screen.getByLabelText('If other, please indicate');
    expect(otherField).toBeInTheDocument();
    expect(otherField.closest('div')).toHaveClass('motion-safe:animate-in');
  });

  it('renders family subheaders and submits complete repeatable children', () => {
    const onSubmit = vi.fn();
    const familyForm: FormDef = {
      id: 'renderer-family-test',
      title: 'Renderer Family Test',
      appointmentTypes: ['Fellow'],
      sections: [
        {
          title: 'Family',
          fields: [
            { name: 'partnerSubheader', label: 'Partner', type: 'subheader', required: false },
            { name: 'partnerName', label: 'Full name of partner', type: 'text', required: false },
            { name: 'childrenSubheader', label: 'Children', type: 'subheader', required: false },
            {
              name: 'children',
              label: 'Children',
              type: 'repeatable-group',
              required: false,
              addLabel: 'Add child',
              itemLabel: 'Child',
              fields: [
                { name: 'fullName', label: 'Full name', type: 'text', required: true },
                { name: 'dateOfBirth', label: 'Date of birth', type: 'date', required: true },
                { name: 'datesOfStay', label: 'Dates of stay', type: 'text', required: true },
              ],
            },
          ],
        },
      ],
    };

    render(
      <PublicFormRenderer
        formDef={familyForm}
        onSubmit={onSubmit}
        isSubmitting={false}
        isSuccess={false}
      />
    );

    expect(screen.getByRole('heading', { name: 'Partner' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: 'Children' }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Add child' }));
    const childFullName = screen.getAllByLabelText(/^Full name/).at(-1)!;
    fireEvent.change(childFullName, {
      target: { value: 'Giulia Bianchi' },
    });
    fireEvent.change(screen.getByLabelText(/^Date of birth/), {
      target: { value: '2018-04-24' },
    });
    fireEvent.change(screen.getByLabelText(/^Dates of stay/), {
      target: { value: 'September to December' },
    });
    fireEvent.click(screen.getByRole('button', { name: /submit form/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      children: [
        {
          fullName: 'Giulia Bianchi',
          dateOfBirth: '2018-04-24',
          datesOfStay: 'September to December',
        },
      ],
    });
  });

  it('uses the repeatable group label in the empty state copy', () => {
    const guestForm: FormDef = {
      id: 'renderer-guests-test',
      title: 'Renderer Guests Test',
      appointmentTypes: ['Fellow'],
      sections: [
        {
          title: 'Guests',
          fields: [
            {
              name: 'guests',
              label: 'Guests',
              type: 'repeatable-group',
              required: false,
              addLabel: 'Add guest',
              itemLabel: 'Guest',
              fields: [
                { name: 'fullName', label: 'Full name', type: 'text', required: true },
              ],
            },
          ],
        },
      ],
    };

    render(
      <PublicFormRenderer
        formDef={guestForm}
        onSubmit={vi.fn()}
        isSubmitting={false}
        isSuccess={false}
      />
    );

    expect(screen.getByText('No guests added.')).toBeInTheDocument();
  });

  it('requires every field in an added child row', () => {
    const onSubmit = vi.fn();
    const familyForm: FormDef = {
      id: 'renderer-child-required-test',
      title: 'Renderer Child Required Test',
      appointmentTypes: ['Fellow'],
      sections: [
        {
          title: 'Family',
          fields: [
            {
              name: 'children',
              label: 'Children',
              type: 'repeatable-group',
              required: false,
              addLabel: 'Add child',
              itemLabel: 'Child',
              fields: [
                { name: 'fullName', label: 'Full name', type: 'text', required: true },
                { name: 'dateOfBirth', label: 'Date of birth', type: 'date', required: true },
                { name: 'datesOfStay', label: 'Dates of stay', type: 'text', required: true },
              ],
            },
          ],
        },
      ],
    };

    render(
      <PublicFormRenderer
        formDef={familyForm}
        onSubmit={onSubmit}
        isSubmitting={false}
        isSuccess={false}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add child' }));
    fireEvent.change(screen.getByLabelText(/^Full name/), {
      target: { value: 'Giulia Bianchi' },
    });
    fireEvent.click(screen.getByRole('button', { name: /submit form/i }));

    expect(screen.getAllByText('This field is required')).toHaveLength(2);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
