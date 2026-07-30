import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PinInput } from '@/components/ui/PinInput';

/** The real thing is controlled, so the test has to hold the value for it. */
function Harness({ onValue }) {
  const [value, setValue] = useState('');
  return (
    <PinInput
      value={value}
      length={4}
      onChange={(next) => {
        setValue(next);
        onValue?.(next);
      }}
    />
  );
}

const boxes = () => screen.getAllByRole('textbox');

describe('PinInput entry order', () => {
  it('sends a digit typed into a far box to the first blank one', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(boxes()[2], '7');

    expect(boxes()[0]).toHaveValue('7');
    expect(boxes()[2]).toHaveValue('');
  });

  it('fills left to right without leaving holes', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);

    await user.type(boxes()[0], '1');
    await user.type(boxes()[3], '2');
    await user.type(boxes()[3], '3');

    expect(boxes().map((b) => b.value)).toEqual(['1', '2', '3', '']);
    expect(onValue).toHaveBeenLastCalledWith('123');
  });

  it('keeps boxes past the next one out of the tab order', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(boxes()[0]).toHaveAttribute('tabindex', '0');
    expect(boxes()[1]).toHaveAttribute('tabindex', '-1');

    await user.type(boxes()[0], '9');

    expect(boxes()[1]).toHaveAttribute('tabindex', '0');
    expect(boxes()[2]).toHaveAttribute('tabindex', '-1');
  });

  it('still lets a digit already entered be corrected in place', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(boxes()[0], '1');
    await user.type(boxes()[1], '2');
    await user.type(boxes()[0], '9');

    expect(boxes().map((b) => b.value)).toEqual(['9', '2', '', '']);
  });

  it('accepts the whole code pasted at once', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);

    boxes()[0].focus();
    await user.paste('4821');

    expect(onValue).toHaveBeenLastCalledWith('4821');
  });
});
