import { BoolQuestion } from './BoolQuestion';
import { PerPrayerQuestion } from './PerPrayerQuestion';
import { SingleChoiceQuestion } from './SingleChoiceQuestion';
import { MultiChoiceQuestion } from './MultiChoiceQuestion';
import { CounterQuestion } from './CounterQuestion';
import { RatingQuestion } from './RatingQuestion';
import { TextQuestion } from './TextQuestion';

export const RENDERERS = Object.freeze({
  bool: BoolQuestion,
  per_prayer: PerPrayerQuestion,
  single_choice: SingleChoiceQuestion,
  multi_choice: MultiChoiceQuestion,
  counter: CounterQuestion,
  rating: RatingQuestion,
  text: TextQuestion,
});

export {
  BoolQuestion,
  PerPrayerQuestion,
  SingleChoiceQuestion,
  MultiChoiceQuestion,
  CounterQuestion,
  RatingQuestion,
  TextQuestion,
};
export { QuestionCard } from './QuestionCard';
