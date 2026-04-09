import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SearchableCombobox } from '@/components/shared/SearchableCombobox';

const options = [
  { value: 'role-1', label: 'staff-IT' },
  { value: 'role-2', label: 'fellows' },
  { value: 'role-3', label: 'fellows-admin' },
];

describe('SearchableCombobox', () => {
  it('renders with placeholder when no value selected', () => {
    render(
      <SearchableCombobox
        options={options}
        value=""
        onSelect={vi.fn()}
        placeholder="Select role"
      />
    );
    expect(screen.getByText('Select role')).toBeInTheDocument();
  });

  it('shows selected option label when value matches', () => {
    render(
      <SearchableCombobox
        options={options}
        value="role-1"
        onSelect={vi.fn()}
        placeholder="Select role"
      />
    );
    expect(screen.getByText('staff-IT')).toBeInTheDocument();
  });

  it('opens popover and shows options on click', async () => {
    render(
      <SearchableCombobox
        options={options}
        value=""
        onSelect={vi.fn()}
        placeholder="Select role"
      />
    );
    fireEvent.click(screen.getByRole('combobox'));
    expect(screen.getByText('staff-IT')).toBeInTheDocument();
    expect(screen.getByText('fellows')).toBeInTheDocument();
    expect(screen.getByText('fellows-admin')).toBeInTheDocument();
  });

  it('calls onSelect when an option is clicked', () => {
    const onSelect = vi.fn();
    render(
      <SearchableCombobox
        options={options}
        value=""
        onSelect={onSelect}
        placeholder="Select role"
      />
    );
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByText('fellows'));
    expect(onSelect).toHaveBeenCalledWith('role-2', 'fellows');
  });

  it('shows "Create new" option when allowCreate and no exact match', () => {
    render(
      <SearchableCombobox
        options={options}
        value=""
        onSelect={vi.fn()}
        onCreateNew={vi.fn()}
        placeholder="Select group"
        allowCreate
      />
    );
    fireEvent.click(screen.getByRole('combobox'));
    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.change(input, { target: { value: 'new-group' } });
    expect(screen.getByText(/Create new/)).toBeInTheDocument();
  });

  it('calls onCreateNew (not onSelect) when Create new is selected', () => {
    const onSelect = vi.fn();
    const onCreateNew = vi.fn();
    render(
      <SearchableCombobox
        options={options}
        value=""
        onSelect={onSelect}
        onCreateNew={onCreateNew}
        placeholder="Select group"
        allowCreate
      />
    );
    fireEvent.click(screen.getByRole('combobox'));
    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.change(input, { target: { value: 'brand-new' } });
    fireEvent.click(screen.getByText(/Create new/));
    expect(onCreateNew).toHaveBeenCalledWith('brand-new');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('does not show Create new when typed value matches an existing option', () => {
    render(
      <SearchableCombobox
        options={options}
        value=""
        onSelect={vi.fn()}
        onCreateNew={vi.fn()}
        placeholder="Select group"
        allowCreate
      />
    );
    fireEvent.click(screen.getByRole('combobox'));
    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.change(input, { target: { value: 'staff-IT' } });
    expect(screen.queryByText(/Create new/)).not.toBeInTheDocument();
  });

  it('calls onClear when clear button is clicked', () => {
    const onClear = vi.fn();
    render(
      <SearchableCombobox
        options={options}
        value="role-1"
        onSelect={vi.fn()}
        onClear={onClear}
        placeholder="Select role"
      />
    );
    const clearBtn = screen.getByLabelText('Clear selection');
    fireEvent.click(clearBtn);
    expect(onClear).toHaveBeenCalled();
  });

  it('shows displayValue when value does not match any option', () => {
    render(
      <SearchableCombobox
        options={options}
        value=""
        displayValue="new-custom-group"
        onSelect={vi.fn()}
        onClear={vi.fn()}
        placeholder="Select group"
      />
    );
    expect(screen.getByText('new-custom-group')).toBeInTheDocument();
    expect(screen.getByLabelText('Clear selection')).toBeInTheDocument();
  });

  it('strips disallowed characters from search input', () => {
    render(
      <SearchableCombobox
        options={options}
        value=""
        onSelect={vi.fn()}
        placeholder="Select group"
        disallowChars=" "
      />
    );
    fireEvent.click(screen.getByRole('combobox'));
    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.change(input, { target: { value: 'staff it' } });
    expect((input as HTMLInputElement).value).toBe('staffit');
  });

  it('allows all characters when disallowChars is not set', () => {
    render(
      <SearchableCombobox
        options={options}
        value=""
        onSelect={vi.fn()}
        placeholder="Select role"
      />
    );
    fireEvent.click(screen.getByRole('combobox'));
    const input = screen.getByPlaceholderText(/search/i);
    fireEvent.change(input, { target: { value: 'staff IT' } });
    expect((input as HTMLInputElement).value).toBe('staff IT');
  });
});
