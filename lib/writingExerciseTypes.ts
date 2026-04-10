/** Writing exercise kinds teachers can generate from selected vocabulary (UK primary). */

export type WritingExerciseTypeId =
  | 'choose_best_word'
  | 'replace_weak_word'
  | 'add_useful_detail'
  | 'build_sentence_in_layers'
  | 'combine_two_sentences'
  | 'choose_best_joining_word'
  | 'cut_the_ramble'
  | 'show_not_tell';

export interface WritingExerciseTypeMeta {
  id: WritingExerciseTypeId;
  /** Short label in the UI */
  label: string;
  /** Hint for the model */
  description: string;
}

export const WRITING_EXERCISE_TYPES: WritingExerciseTypeMeta[] = [
  {
    id: 'choose_best_word',
    label: 'Choose the best word',
    description:
      'A short context where the pupil picks the strongest or most precise word from options (include distractors). At least one option should be a target vocabulary word when it fits.',
  },
  {
    id: 'replace_weak_word',
    label: 'Replace the weak word',
    description:
      'A sentence with a vague or weak word (e.g. nice, said, went); pupil replaces it with a stronger choice, ideally using or echoing target vocabulary.',
  },
  {
    id: 'add_useful_detail',
    label: 'Add one useful detail',
    description:
      'A plain sentence; pupil adds one concrete or sensory detail. Optionally anchor with a target word in the base sentence.',
  },
  {
    id: 'build_sentence_in_layers',
    label: 'Build sentence in layers',
    description:
      'Scaffold: first a simple kernel (who + did what), then add where/when, then add one vivid detail. Use or prepare for target words.',
  },
  {
    id: 'combine_two_sentences',
    label: 'Combine two sentences',
    description:
      'Two short related sentences; pupil combines them with appropriate punctuation and/or a joining word.',
  },
  {
    id: 'choose_best_joining_word',
    label: 'Choose the best joining word',
    description:
      'Two clauses or sentences with a gap; multiple-choice conjunctions/connectives (because, although, while, etc.).',
  },
  {
    id: 'cut_the_ramble',
    label: 'Cut the ramble',
    description:
      'A slightly wordy child-level paragraph; pupil rewrites in fewer words keeping the main meaning.',
  },
  {
    id: 'show_not_tell',
    label: 'Show-not-tell',
    description:
      'A "telling" sentence about emotion or quality; pupil rewrites to show through action, dialogue, or concrete detail.',
  },
];

export const WRITING_EXERCISE_TYPE_IDS = WRITING_EXERCISE_TYPES.map(t => t.id);

export function getWritingExerciseMeta(id: string): WritingExerciseTypeMeta | undefined {
  return WRITING_EXERCISE_TYPES.find(t => t.id === id);
}
