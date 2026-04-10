/**
 * Canonical vocabulary taxonomy for vocab_words (part_of_speech + tag arrays).
 * Values must match Supabase: part_of_speech TEXT; grammar, writing, semantic TEXT[].
 */

export const PART_OF_SPEECH_VALUES = [
  'noun',
  'verb',
  'adjective',
  'adverb',
  'pronoun',
  'conjunction',
  'preposition',
  'determiner',
  'interjection',
] as const;

export type PartOfSpeech = (typeof PART_OF_SPEECH_VALUES)[number];

export const GRAMMAR_TAGS = [
  'irregular_plural',
  'irregular_past_tense',
  'regular_past_tense',
  'comparative',
  'superlative',
  'coordinating_conjunction',
  'subordinating_conjunction',
  'causal_connective',
  'contrast_connective',
  'time_connective',
  'addition_connective',
  'abstract_noun',
  'concrete_noun',
  'collective_noun',
  'homophone',
  'commonly_confused',
] as const;

export const WRITING_TAGS = [
  'weak_word',
  'precise_verb',
  'vivid_adjective',
  'formal_word',
  'informal_word',
  'high_value_11_plus',
  'sentence_combining',
  'descriptive_writing',
  'narrative_writing',
  'dialogue_useful',
  'character_description',
  'atmosphere_description',
] as const;

export const SEMANTIC_TAGS = [
  'movement_word',
  'speech_word',
  'thinking_word',
  'feeling_word',
  'character_word',
  'atmosphere_word',
  'sound_word',
  'weather_word',
  'light_word',
  'school_word',
  'time_word',
  'conflict_word',
] as const;

export function humanizeCurriculumLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** Accept only allowed part of speech; normalise to lowercase snake style. */
export function parsePartOfSpeechFromDb(value: unknown): PartOfSpeech | undefined {
  if (value == null || typeof value !== 'string') return undefined;
  const v = value.trim().toLowerCase();
  return (PART_OF_SPEECH_VALUES as readonly string[]).includes(v) ? (v as PartOfSpeech) : undefined;
}

export function normalizePartOfSpeechForSave(value: string | undefined | null): string | null {
  const parsed = parsePartOfSpeechFromDb(value ?? '');
  return parsed ?? null;
}

/**
 * Normalise DB value (TEXT[], legacy TEXT, or Postgres array literal) to allowed tags only, deduped.
 */
export function parseTagArrayFromDb(value: unknown, allowed: readonly string[]): string[] {
  const allowedSet = new Set(allowed);
  const raw: string[] = [];

  if (value == null) return [];

  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string' && item.trim()) raw.push(item.trim());
    }
  } else if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return [];
    if (s.startsWith('{') && s.endsWith('}')) {
      const inner = s.slice(1, -1);
      if (inner.length === 0) return [];
      for (const part of inner.split(',')) {
        const t = part.trim().replace(/^"|"$/g, '').replace(/^'|'$/g, '');
        if (t) raw.push(t);
      }
    } else if (s.startsWith('[')) {
      try {
        const parsed = JSON.parse(s) as unknown;
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (typeof item === 'string' && item.trim()) raw.push(item.trim());
          }
        }
      } catch {
        raw.push(s);
      }
    } else if (s.includes(',')) {
      s.split(',').forEach(p => {
        const t = p.trim();
        if (t) raw.push(t);
      });
    } else {
      raw.push(s);
    }
  }

  const out: string[] = [];
  for (const t of raw) {
    if (allowedSet.has(t) && !out.includes(t)) out.push(t);
  }
  return out;
}

/** Prepare array for Supabase update: only allowed tags, stable order (canonical list order). */
export function normalizeTagArrayForSave(
  tags: string[] | undefined | null,
  allowed: readonly string[]
): string[] {
  const allowedSet = new Set(allowed);
  const picked = new Set<string>();
  for (const t of tags || []) {
    if (typeof t === 'string') {
      const x = t.trim();
      if (allowedSet.has(x)) picked.add(x);
    }
  }
  return allowed.filter(t => picked.has(t));
}

export function tagsPresentInWordBank(
  wordBank: { grammar?: string[]; writing?: string[]; semantic?: string[] }[],
  field: 'grammar' | 'writing' | 'semantic',
  canonicalOrder: readonly string[]
): string[] {
  const present = new Set<string>();
  for (const w of wordBank) {
    const arr = w[field];
    if (arr) for (const t of arr) present.add(t);
  }
  return canonicalOrder.filter(t => present.has(t));
}
