// Server-side answer judging. The answer keys are imported from the very same data
// files the client renders questions from, so there is a single source of truth.
//
// Question id formats (produced by the client, verified here):
//   lesson:<lessonIndex>:<stepIndex>   choice = option index (number)
//   fish:<fishId>                       choice = fish id chosen from the 4 options
//   word:<wordId>:<mode>                choice = option id, or typed text for spell/speak
import { WILLOW_LESSONS } from '../../../client/dist/lesson-data.js';
import { FISH_BY_ID } from '../../../client/dist/fishing-data.js';
import { LESSONS } from '../../../client/dist/adventure-data.js';
import { matchesAnswer, MODES } from '../../../client/dist/adventure-quiz.js';

export class JudgeError extends Error {}

const MAX_CHOICE_LENGTH = 80;

export function judge(questionId, choice) {
  if (typeof questionId !== 'string' || questionId.length > 120) throw new JudgeError('invalid question id');
  const parts = questionId.split(':');
  const kind = parts[0];
  if (kind === 'lesson') {
    const lesson = WILLOW_LESSONS[Number(parts[1])];
    const step = lesson?.steps[Number(parts[2])];
    if (!lesson || !step || parts.length !== 3) throw new JudgeError('unknown lesson question');
    const index = Number(choice);
    if (!Number.isInteger(index) || index < 0 || index >= step[2].length) throw new JudgeError('invalid lesson choice');
    return { kind, questionId, correct: index === step[3], mode: 'lesson', wordId: `lesson:${parts[1]}:${parts[2]}` };
  }
  if (kind === 'fish') {
    const fish = FISH_BY_ID[parts[1]];
    if (!fish || parts.length !== 2) throw new JudgeError('unknown fish question');
    if (typeof choice !== 'string' || choice.length > MAX_CHOICE_LENGTH || !FISH_BY_ID[choice]) throw new JudgeError('invalid fish choice');
    return { kind, questionId, correct: choice === fish.id, mode: 'meaning', wordId: fish.id, fishId: fish.id };
  }
  if (kind === 'word') {
    const word = LESSONS[parts[1]];
    const mode = parts[2];
    if (!word || !MODES[mode] || parts.length !== 3) throw new JudgeError('unknown word question');
    if (typeof choice !== 'string' || choice.length > MAX_CHOICE_LENGTH) throw new JudgeError('invalid word choice');
    const correct = matchesAnswer({ id: parts[1], mode, word: word.word }, choice);
    return { kind, questionId, correct, mode, wordId: parts[1] };
  }
  throw new JudgeError('unknown question kind');
}

