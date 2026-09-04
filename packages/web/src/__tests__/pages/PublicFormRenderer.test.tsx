import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Link, RouterProvider } from 'react-router';
import { useState, type ComponentProps, type Dispatch, type SetStateAction } from 'react';
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

type RendererProps = ComponentProps<typeof PublicFormRenderer>;

/**
 * The renderer calls useBlocker, which only works under a data router, so
 * every test mounts through createMemoryRouter. The harness adds a link to an
 * /away route (to exercise blocked navigation) and exposes updateProps —
 * with a data router the route element is fixed at creation time, so plain
 * rerender() cannot deliver new props.
 */
function renderForm(initialProps: RendererProps) {
  let setProps: Dispatch<SetStateAction<RendererProps>>;
  function Harness() {
    const [props, set] = useState(initialProps);
    setProps = set;
    return (
      <>
        <Link to="/away">go-elsewhere</Link>
        <PublicFormRenderer {...props} />
      </>
    );
  }
  const router = createMemoryRouter([
    { path: '/', element: <Harness /> },
    { path: '/away', element: <h1>Away page</h1> },
  ]);
  const utils = render(<RouterProvider router={router} />);
  return {
    ...utils,
    router,
    updateProps: (next: Partial<RendererProps>) =>
      act(() => setProps((prev) => ({ ...prev, ...next }))),
  };
}

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

    renderForm({ formDef: dateForm, onSubmit, isSubmitting: false, isSuccess: false });

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
    renderForm({ formDef: addressForm, onSubmit, isSubmitting: false, isSuccess: false });

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
    renderForm({ formDef: addressForm, onSubmit: vi.fn(), isSubmitting: false, isSuccess: false });

    await user.click(screen.getByRole('combobox', { name: 'Title' }));

    // Base UI opens the select popup on the next animation frame, so the
    // options appear asynchronously after the click.
    expect(await screen.findByRole('option', { name: 'Dr.' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Prof.' })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/search select title/i)).not.toBeInTheDocument();
  });

  it('requires street, city, and country but not title, postal code, or state/province', () => {
    const onSubmit = vi.fn();
    renderForm({ formDef: addressForm, onSubmit, isSubmitting: false, isSuccess: false });

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

    renderForm({ formDef: conditionalForm, onSubmit: vi.fn(), isSubmitting: false, isSuccess: false });

    expect(screen.queryByLabelText('If other, please indicate')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Other'));

    expect(screen.getByLabelText('If other, please indicate')).toBeInTheDocument();
  });

  it('drops a conditional field value once its gate stops matching', () => {
    const onSubmit = vi.fn();
    const conditionalForm: FormDef = {
      id: 'renderer-conditional-clear-test',
      title: 'Renderer Conditional Clear Test',
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

    renderForm({ formDef: conditionalForm, onSubmit, isSubmitting: false, isSuccess: false });

    fireEvent.click(screen.getByLabelText('Other'));
    fireEvent.change(screen.getByLabelText('If other, please indicate'), {
      target: { value: 'Visiting Professor' },
    });

    // Switching away hides the field — its stale value must not be submitted.
    fireEvent.click(screen.getByLabelText('Independent Scholar'));
    expect(screen.queryByLabelText('If other, please indicate')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Submit/ }));

    expect(onSubmit).toHaveBeenCalledWith({ statusAtItatti: 'Independent Scholar' });
  });

  it('lists server-provided field detail under the submit error banner', () => {
    renderForm({
      formDef: addressForm,
      onSubmit: vi.fn(),
      isSubmitting: false,
      isSuccess: false,
      submitError: 'Validation failed',
      submitIssues: [
        { path: 'legalCity', message: 'String must contain at most 64 character(s)' },
        { path: '', message: 'Payload too large' },
      ],
    });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Validation failed');
    // The dotted path resolves to the label the appointee actually saw.
    expect(alert).toHaveTextContent('City: String must contain at most 64 character(s)');
    // Form-wide issues render without a label prefix.
    expect(alert).toHaveTextContent('Payload too large');
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

    renderForm({ formDef: conditionalForm, onSubmit: vi.fn(), isSubmitting: false, isSuccess: false });

    expect(screen.queryByLabelText('If other, please indicate')).not.toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: /What will your status be/ }));
    // Base UI opens the select popup on the next animation frame, so the
    // options appear asynchronously after the click.
    await user.click(await screen.findByRole('option', { name: 'Other' }));

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

    renderForm({ formDef: familyForm, onSubmit, isSubmitting: false, isSuccess: false });

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

    renderForm({ formDef: guestForm, onSubmit: vi.fn(), isSubmitting: false, isSuccess: false });

    expect(screen.getByText('No guests added.')).toBeInTheDocument();
  });

  it('moves focus to the first invalid field and shows a summary when validation fails', () => {
    const onSubmit = vi.fn();
    renderForm({ formDef: addressForm, onSubmit, isSubmitting: false, isSuccess: false });

    fireEvent.click(screen.getByRole('button', { name: /submit form/i }));
    expect(onSubmit).not.toHaveBeenCalled();

    // Street address is the first required field in DOM order.
    expect(screen.getByLabelText(/Street address/)).toHaveFocus();

    // A visible, announced summary sits next to the submit button — on a long
    // form the inline errors can all be above the fold.
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('3 answers need your attention');

    // The summary tracks the remaining problems as the appointee fixes them.
    fireEvent.change(screen.getByLabelText(/Street address/), {
      target: { value: 'Via di Vincigliata 26' },
    });
    expect(screen.getByRole('alert')).toHaveTextContent('2 answers need your attention');
  });

  it('focuses the first radio input when a required radio group fails validation', () => {
    // aria-invalid lands on the (unfocusable) fieldset for radio groups, so
    // focus must descend to the first radio inside it.
    const radioForm: FormDef = {
      id: 'renderer-radio-focus-test',
      title: 'Renderer Radio Focus Test',
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
          ],
        },
      ],
    };

    renderForm({ formDef: radioForm, onSubmit: vi.fn(), isSubmitting: false, isSuccess: false });

    fireEvent.click(screen.getByRole('button', { name: /submit form/i }));

    expect(screen.getByLabelText('Independent Scholar')).toHaveFocus();
  });

  it('warns before unload only while there is unsaved input', () => {
    function dispatchBeforeUnload(): Event {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event;
    }

    const { updateProps } = renderForm({
      formDef: addressForm,
      onSubmit: vi.fn(),
      isSubmitting: false,
      isSuccess: false,
    });

    // Untouched form: leaving must not prompt.
    expect(dispatchBeforeUnload().defaultPrevented).toBe(false);

    fireEvent.change(screen.getByLabelText(/Street address/), {
      target: { value: 'Via di Vincigliata 26' },
    });
    expect(dispatchBeforeUnload().defaultPrevented).toBe(true);

    // Clearing the only typed value releases the guard again.
    fireEvent.change(screen.getByLabelText(/Street address/), { target: { value: '' } });
    expect(dispatchBeforeUnload().defaultPrevented).toBe(false);

    fireEvent.change(screen.getByLabelText(/Street address/), {
      target: { value: 'Via di Vincigliata 26' },
    });
    expect(dispatchBeforeUnload().defaultPrevented).toBe(true);

    // A successful submit releases it too, so the confirmation screen does not
    // trap the appointee behind a leave prompt.
    updateProps({ isSuccess: true });
    expect(dispatchBeforeUnload().defaultPrevented).toBe(false);
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

    renderForm({ formDef: familyForm, onSubmit, isSubmitting: false, isSuccess: false });

    fireEvent.click(screen.getByRole('button', { name: 'Add child' }));
    fireEvent.change(screen.getByLabelText(/^Full name/), {
      target: { value: 'Giulia Bianchi' },
    });
    fireEvent.click(screen.getByRole('button', { name: /submit form/i }));

    expect(screen.getAllByText('This field is required')).toHaveLength(2);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('PublicFormRenderer — client-side navigation guard', () => {
  // beforeunload does not fire on React Router transitions, so the renderer
  // pairs it with a useBlocker-driven confirmation dialog.

  it('lets an untouched form navigate away without a prompt', async () => {
    renderForm({ formDef: addressForm, onSubmit: vi.fn(), isSubmitting: false, isSuccess: false });

    await userEvent.setup().click(screen.getByRole('link', { name: 'go-elsewhere' }));

    expect(await screen.findByRole('heading', { name: 'Away page' })).toBeInTheDocument();
    expect(screen.queryByText('Leave this form?')).not.toBeInTheDocument();
  });

  it('blocks navigation with unsaved input and keeps the answers on "stay"', async () => {
    const user = userEvent.setup();
    renderForm({ formDef: addressForm, onSubmit: vi.fn(), isSubmitting: false, isSuccess: false });

    fireEvent.change(screen.getByLabelText(/Street address/), {
      target: { value: 'Via di Vincigliata 26' },
    });

    await user.click(screen.getByRole('link', { name: 'go-elsewhere' }));

    // Navigation is intercepted: the confirmation dialog owns the decision.
    expect(await screen.findByText('Leave this form?')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Away page' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Stay on this page' }));

    await waitFor(() =>
      expect(screen.queryByText('Leave this form?')).not.toBeInTheDocument()
    );
    // Still on the form, with the typed value intact.
    expect(screen.queryByRole('heading', { name: 'Away page' })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Street address/)).toHaveValue('Via di Vincigliata 26');
  });

  it('proceeds with the navigation on "leave"', async () => {
    const user = userEvent.setup();
    renderForm({ formDef: addressForm, onSubmit: vi.fn(), isSubmitting: false, isSuccess: false });

    fireEvent.change(screen.getByLabelText(/Street address/), {
      target: { value: 'Via di Vincigliata 26' },
    });

    await user.click(screen.getByRole('link', { name: 'go-elsewhere' }));
    expect(await screen.findByText('Leave this form?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Leave page' }));

    expect(await screen.findByRole('heading', { name: 'Away page' })).toBeInTheDocument();
  });

  it('does not block navigation after a successful submit', async () => {
    const user = userEvent.setup();
    const { updateProps } = renderForm({
      formDef: addressForm,
      onSubmit: vi.fn(),
      isSubmitting: false,
      isSuccess: false,
    });

    fireEvent.change(screen.getByLabelText(/Street address/), {
      target: { value: 'Via di Vincigliata 26' },
    });

    // Submit succeeded: the input is saved, so leaving loses nothing.
    updateProps({ isSuccess: true });

    await user.click(screen.getByRole('link', { name: 'go-elsewhere' }));

    expect(await screen.findByRole('heading', { name: 'Away page' })).toBeInTheDocument();
    expect(screen.queryByText('Leave this form?')).not.toBeInTheDocument();
  });
});
