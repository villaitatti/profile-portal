import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
});
