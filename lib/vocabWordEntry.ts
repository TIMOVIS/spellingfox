import type { WordEntry } from '../types';
import type { VocabWord } from './supabase';
import {
  GRAMMAR_TAGS,
  SEMANTIC_TAGS,
  WRITING_TAGS,
  parsePartOfSpeechFromDb,
  parseTagArrayFromDb,
} from './vocabTaxonomy';

/** Maps a Supabase row to app WordEntry, enforcing taxonomy rules when reading. */
export function vocabWordToWordEntry(vocabWord: VocabWord): WordEntry {
  return {
    id: vocabWord.id,
    word: vocabWord.word,
    definition: vocabWord.definition,
    root: vocabWord.root,
    origin: vocabWord.origin,
    wordFamily: vocabWord.word_family || undefined,
    partOfSpeech: parsePartOfSpeechFromDb(vocabWord.part_of_speech),
    grammar: parseTagArrayFromDb(vocabWord.grammar, GRAMMAR_TAGS),
    writing: parseTagArrayFromDb(vocabWord.writing, WRITING_TAGS),
    semantic: parseTagArrayFromDb(vocabWord.semantic, SEMANTIC_TAGS),
    synonyms: vocabWord.synonyms || [],
    antonyms: vocabWord.antonyms || [],
    example: vocabWord.example,
    yearGroup: vocabWord.year_group,
    learningPoint: vocabWord.learning_point,
  };
}
