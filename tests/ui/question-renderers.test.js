import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  BoolQuestion,
  PerPrayerQuestion,
  SingleChoiceQuestion,
  MultiChoiceQuestion,
  CounterQuestion,
  RatingQuestion,
  TextQuestion,
} from '@/components/questions';

const boolQ = { id: 'q1', title: 'صلاة الوتر', type: 'bool', config: {}, points: 5 };
const prayerQ = {
  id: 'q2',
  title: 'تكبيرة الإحرام',
  type: 'per_prayer',
  config: { prayers: ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'], points_per_prayer: 2 },
  points: 0,
};
const singleQ = {
  id: 'q3',
  title: 'الذهاب للمسجد',
  type: 'single_choice',
  config: {
    options: [
      { id: 'walk', label: 'مشياً', points: 5 },
      { id: 'ride', label: 'بسيارة', points: 3 },
    ],
  },
  points: 0,
};
const multiQ = {
  id: 'q4',
  title: 'الأذكار',
  type: 'multi_choice',
  config: {
    options: [
      { id: 'a', label: 'أ', points: 3 },
      { id: 'b', label: 'ب', points: 4 },
    ],
  },
  points: 0,
};
const counterQ = {
  id: 'q5',
  title: 'كم صفحة قرأت؟',
  type: 'counter',
  config: { points_per_unit: 1, max: 3 },
  points: 0,
};
const ratingQ = {
  id: 'q6',
  title: 'تقييم الخشوع',
  type: 'rating',
  config: { max: 5, points_per_star: 1 },
  points: 0,
};
const textQ = {
  id: 'q7',
  title: 'ملاحظاتك',
  type: 'text',
  config: { max_length: 20 },
  points: 0,
};

describe('BoolQuestion', () => {
  it('reports true when checked', async () => {
    const onChange = vi.fn();
    render(<BoolQuestion question={boolQ} value={false} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText('صلاة الوتر'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('does not fire when disabled', async () => {
    const onChange = vi.fn();
    render(<BoolQuestion question={boolQ} value={false} onChange={onChange} disabled />);
    await userEvent.click(screen.getByLabelText('صلاة الوتر'));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('PerPrayerQuestion', () => {
  it('emits a prayer map', async () => {
    const onChange = vi.fn();
    render(<PerPrayerQuestion question={prayerQ} value={{}} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText('الفجر'));
    expect(onChange).toHaveBeenCalledWith({ fajr: true });
  });

  it('renders only the configured prayers', () => {
    render(
      <PerPrayerQuestion
        question={{ ...prayerQ, config: { prayers: ['fajr', 'isha'], points_per_prayer: 2 } }}
        value={{}}
        onChange={() => {}}
      />,
    );
    expect(screen.getByLabelText('الفجر')).toBeInTheDocument();
    expect(screen.queryByLabelText('العصر')).not.toBeInTheDocument();
  });
});

describe('SingleChoiceQuestion', () => {
  it('emits the selected option id', async () => {
    const onChange = vi.fn();
    render(<SingleChoiceQuestion question={singleQ} value={null} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText('مشياً'));
    expect(onChange).toHaveBeenCalledWith('walk');
  });
});

describe('MultiChoiceQuestion', () => {
  it('adds an option that is toggled on', async () => {
    const onChange = vi.fn();
    render(<MultiChoiceQuestion question={multiQ} value={['a']} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText('ب'));
    expect(onChange).toHaveBeenCalledWith(['a', 'b']);
  });

  it('removes an option that is toggled off', async () => {
    const onChange = vi.fn();
    render(<MultiChoiceQuestion question={multiQ} value={['a', 'b']} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText('أ'));
    expect(onChange).toHaveBeenCalledWith(['b']);
  });
});

describe('CounterQuestion', () => {
  it('increments and stops at the configured max', async () => {
    const onChange = vi.fn();
    render(<CounterQuestion question={counterQ} value={3} onChange={onChange} />);
    const plus = screen.getByLabelText('زيادة كم صفحة قرأت؟');
    expect(plus).toBeDisabled();
  });

  it('decrements and stops at zero', async () => {
    const onChange = vi.fn();
    render(<CounterQuestion question={counterQ} value={0} onChange={onChange} />);
    expect(screen.getByLabelText('إنقاص كم صفحة قرأت؟')).toBeDisabled();
  });

  it('emits a number on increment', async () => {
    const onChange = vi.fn();
    render(<CounterQuestion question={counterQ} value={1} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText('زيادة كم صفحة قرأت؟'));
    expect(onChange).toHaveBeenCalledWith(2);
  });
});

describe('RatingQuestion', () => {
  it('emits the chosen star count', async () => {
    const onChange = vi.fn();
    render(<RatingQuestion question={ratingQ} value={0} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText('4 من 5'));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('is keyboard operable', async () => {
    const onChange = vi.fn();
    render(<RatingQuestion question={ratingQ} value={2} onChange={onChange} />);
    const group = screen.getByRole('radiogroup');
    group.focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(onChange).toHaveBeenCalledWith(3);
  });
});

describe('TextQuestion', () => {
  it('emits the typed string and enforces max length', async () => {
    const onChange = vi.fn();
    render(<TextQuestion question={textQ} value="" onChange={onChange} />);
    const box = screen.getByLabelText('ملاحظاتك');
    expect(box).toHaveAttribute('maxlength', '20');
    await userEvent.type(box, 'ن');
    expect(onChange).toHaveBeenCalledWith('ن');
  });
});
