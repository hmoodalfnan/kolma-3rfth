import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NumberInput } from '@/components/ui/Field';

function Harness({ onValue, ...props }) {
  const [value, setValue] = useState('');
  return (
    <NumberInput
      aria-label="النقاط"
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        onValue?.(e.target.value);
      }}
      {...props}
    />
  );
}

const field = () => screen.getByLabelText('النقاط');

describe('NumberInput', () => {
  it('accepts Arabic-Indic digits and stores them as Western ones', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);

    await user.type(field(), '٤٨٢');

    expect(onValue).toHaveBeenLastCalledWith('482');
    expect(field()).toHaveValue('482');
  });

  it('accepts Extended Arabic-Indic digits too', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(field(), '۵۰');

    expect(field()).toHaveValue('50');
  });

  it('is not a number field, which rejects those digits before we see them', () => {
    render(<Harness />);
    expect(field()).toHaveAttribute('type', 'text');
  });

  it('drops stray letters and symbols', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(field(), '1a2ب3');

    expect(field()).toHaveValue('123');
  });

  it('keeps a minus only where deductions are allowed', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Harness signed />);
    await user.type(field(), '-٥');
    expect(field()).toHaveValue('-5');
    unmount();

    render(<Harness />);
    await user.type(field(), '-٥');
    expect(field()).toHaveValue('5');
  });

  it('keeps a decimal point unless the field is whole numbers only', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Harness />);
    await user.type(field(), '2.5');
    expect(field()).toHaveValue('2.5');
    unmount();

    render(<Harness decimal={false} />);
    await user.type(field(), '2.5');
    expect(field()).toHaveValue('25');
  });
});
