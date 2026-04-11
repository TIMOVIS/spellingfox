
import { GoogleGenAI, Type } from "@google/genai";
import { WordEntry, YearGroup } from "./types";
import { WRITING_EXERCISE_TYPES, WRITING_EXERCISE_TYPE_IDS } from "./lib/writingExerciseTypes";
import {
  PART_OF_SPEECH_VALUES,
  GRAMMAR_TAGS,
  WRITING_TAGS,
  SEMANTIC_TAGS,
} from "./lib/vocabTaxonomy";

const apiKey = typeof process !== 'undefined' ? (process.env.API_KEY || '') : '';
// Only create the client when we have a key (SDK throws if key is empty)
let ai: GoogleGenAI | null = apiKey ? new GoogleGenAI({ apiKey }) : null;

/** In production the key is not in the bundle; call the Netlify function instead. */
async function callGeminiServer<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  const res = await fetch(`${base}/.netlify/functions/gemini`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const baseMsg = (err as { error?: string }).error || res.statusText;
    if (res.status === 504 || res.status === 502) {
      throw new Error(
        `${baseMsg} (gateway timeout). The AI step took too long for one request — try again, or select fewer words at once.`
      );
    }
    throw new Error(baseMsg);
  }
  return res.json();
}

/**
 * Generates a full dictionary entry for a single word.
 */
export const generateWordExplanation = async (word: string): Promise<Partial<WordEntry & { etymology?: any; morphology?: any; letterStrings?: string[] }>> => {
  if (!apiKey || !ai) return callGeminiServer('wordExplanation', { word });
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Analyze the word "${word}" for a primary school child in the UK. 
    
    CRITICAL REQUIREMENTS:
    1. Identify the word's ETYMOLOGY (root, origin language, meaning) - e.g., Latin root "Bene" meaning "good"
    2. Identify the word's MORPHOLOGY (prefix, base, suffix) - e.g., prefix "un-", base "happy", suffix "-ness"
    3. Identify LETTER STRINGS (spelling patterns) - e.g., "ough", "ous", "tion", "ious", "cial"
    4. The LEARNING POINT must be based on ONE of these three aspects:
       - If etymology-based: e.g., "Latin root 'Bene' (good)", "Greek root 'Dorm' (sleep)"
       - If morphology-based: e.g., "-ous suffix", "-ness suffix", "un- prefix", "Compound word"
       - If letter-strings-based: e.g., "Words with 'ough'", "Words ending in 'tion'", "Silent letters"
    5. Classify into Year Group (Year 3-6)
    6. Provide an example sentence from or in the style of famous children's literature (e.g., Roald Dahl, J.K. Rowling, C.S. Lewis)
    7. Include at least 2 clear antonyms
    8. The DEFINITION must be written so that a 9–10 year old (Year 5) can easily understand it: short sentences, simple everyday words, and no technical grammar terms.
    9. CURRICULUM TAXONOMY (exact snake_case ids only — our database rejects anything else):
       - partOfSpeech: exactly ONE of: ${PART_OF_SPEECH_VALUES.join(", ")}
       - grammarTags: 0–4 ids from: ${GRAMMAR_TAGS.join(", ")}
       - writingTags: 0–4 ids from: ${WRITING_TAGS.join(", ")}
       - semanticTags: 0–3 ids from: ${SEMANTIC_TAGS.join(", ")}
       Choose only tags that genuinely apply; use empty arrays where none fit.
    
    The learning point should be specific and curriculum-focused, relating directly to etymology, morphology, or letter strings.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          word: { type: Type.STRING },
          definition: { type: Type.STRING },
          root: { type: Type.STRING, description: 'Latin or Greek root (e.g., "Bene (Good)")' },
          origin: { type: Type.STRING, description: 'Origin language (e.g., "Latin", "Greek", "Old English")' },
          etymology: { 
            type: Type.OBJECT, 
            description: 'Detailed etymology information',
            properties: {
              root: { type: Type.STRING },
              language: { type: Type.STRING },
              meaning: { type: Type.STRING }
            }
          },
          morphology: {
            type: Type.OBJECT,
            description: 'Word structure (prefix, base, suffix)',
            properties: {
              prefix: { type: Type.STRING },
              base: { type: Type.STRING },
              suffix: { type: Type.STRING }
            }
          },
          letterStrings: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Spelling patterns/letter strings (e.g., ["ough", "ous", "tion"])'
          },
          synonyms: { type: Type.ARRAY, items: { type: Type.STRING } },
          antonyms: { type: Type.ARRAY, items: { type: Type.STRING } },
          example: { type: Type.STRING, description: "A sentence from or in the style of children's literature." },
          yearGroup: { type: Type.STRING, enum: ["Year 3", "Year 4", "Year 5", "Year 6"] },
          learningPoint: { 
            type: Type.STRING,
            description: 'Must relate to etymology (e.g., "Latin root Bene"), morphology (e.g., "-ous suffix"), or letter strings (e.g., "Words with ough")'
          },
          partOfSpeech: {
            type: Type.STRING,
            enum: [...PART_OF_SPEECH_VALUES],
            description: 'Primary part of speech (snake_case id)',
          },
          grammarTags: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '0–4 grammar taxonomy ids from the prompt list only',
          },
          writingTags: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '0–4 writing taxonomy ids from the prompt list only',
          },
          semanticTags: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '0–3 semantic taxonomy ids from the prompt list only',
          },
        },
        required: ["word", "definition", "synonyms", "antonyms", "example", "yearGroup", "learningPoint", "etymology", "morphology", "letterStrings", "partOfSpeech", "grammarTags", "writingTags", "semanticTags"]
      }
    }
  });

  return JSON.parse(response.text || "{}");
};

/**
 * Generates a themed list of 5 spelling words for a daily quest.
 */
export const generateDailySpellingList = async (yearGroup: YearGroup = 'Year 5'): Promise<WordEntry[]> => {
  if (!apiKey || !ai) return callGeminiServer('dailyList', { yearGroup });
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Generate a themed set of 5 challenging spelling words for ${yearGroup} UK students. 
    The theme should be a specific curriculum point based on ETYMOLOGY, MORPHOLOGY, or LETTER STRINGS:
    - Etymology themes: e.g., "Latin root 'Bene' (good)", "Greek root 'Dorm' (sleep)"
    - Morphology themes: e.g., "Suffixes -ous/-ious", "Words with un- prefix", "Compound words"
    - Letter strings themes: e.g., "Words with 'ough'", "Words ending in 'tion'", "Silent letters"
    
    For each word, provide:
    1. Etymology information (root, origin language, meaning)
    2. Morphology information (prefix, base, suffix if applicable)
    3. Letter strings (spelling patterns like "ough", "ous", "tion")
    4. Learning point that relates to the theme (etymology, morphology, or letter strings)
    5. Full dictionary data including literary examples.
    6. The DEFINITION for each word must be written so that a 9–10 year old can easily understand it: short sentences, simple everyday words, and no technical grammar terms.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            word: { type: Type.STRING },
            definition: { type: Type.STRING },
            root: { type: Type.STRING },
            origin: { type: Type.STRING },
            synonyms: { type: Type.ARRAY, items: { type: Type.STRING } },
            antonyms: { type: Type.ARRAY, items: { type: Type.STRING } },
            example: { type: Type.STRING },
            yearGroup: { type: Type.STRING, enum: ["Year 3", "Year 4", "Year 5", "Year 6"] },
            learningPoint: { type: Type.STRING }
          },
          required: ["word", "definition", "synonyms", "antonyms", "example", "yearGroup", "learningPoint"]
        }
      }
    }
  });

  const words = JSON.parse(response.text || "[]");
  return words.map((w: any) => ({ ...w, id: Math.random().toString(36).substr(2, 9) }));
};

/**
 * Extracts vocabulary from files with literary context and antonyms.
 */
export const extractVocabularyFromFile = async (base64Data: string, mimeType: string): Promise<WordEntry[]> => {
  if (!apiKey || !ai) return callGeminiServer('extractFile', { base64Data, mimeType });
  if (!base64Data || base64Data.length === 0) {
    throw new Error("File data is empty. Please try uploading the file again.");
  }

  try {
    // Normalize mimeType for Gemini API
    let normalizedMimeType = mimeType;
    if (mimeType === 'text/plain') {
      normalizedMimeType = 'text/plain';
    } else if (mimeType === 'application/pdf') {
      normalizedMimeType = 'application/pdf';
    } else if (mimeType.startsWith('image/')) {
      // Keep image mime types as is
      normalizedMimeType = mimeType;
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        {
          inlineData: {
            data: base64Data,
            mimeType: normalizedMimeType
          }
        },
        {
          text: `Scan this document for 5 challenging words for Year 3-6 UK students. 
          
          For each word, provide:
          1. Etymology information (root, origin language, meaning)
          2. Morphology information (prefix, base, suffix if applicable)
          3. Letter strings (spelling patterns like "ough", "ous", "tion")
          4. Learning point that relates to etymology, morphology, or letter strings
          5. Definition, synonyms, antonyms, and an example sentence from well-known children's books (ages 7-12).
          6. The DEFINITION must be written so that a 9–10 year old can easily understand it: short sentences, simple everyday words, and no technical grammar terms.`
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              word: { type: Type.STRING },
              definition: { type: Type.STRING },
              root: { type: Type.STRING },
              origin: { type: Type.STRING },
              etymology: { 
                type: Type.OBJECT,
                properties: {
                  root: { type: Type.STRING },
                  language: { type: Type.STRING },
                  meaning: { type: Type.STRING }
                }
              },
              morphology: {
                type: Type.OBJECT,
                properties: {
                  prefix: { type: Type.STRING },
                  base: { type: Type.STRING },
                  suffix: { type: Type.STRING }
                }
              },
              letterStrings: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              synonyms: { type: Type.ARRAY, items: { type: Type.STRING } },
              antonyms: { type: Type.ARRAY, items: { type: Type.STRING } },
              example: { type: Type.STRING },
              yearGroup: { type: Type.STRING, enum: ["Year 3", "Year 4", "Year 5", "Year 6"] },
              learningPoint: { 
                type: Type.STRING,
                description: 'Must relate to etymology, morphology, or letter strings'
              }
            },
            required: ["word", "definition", "synonyms", "antonyms", "example", "yearGroup", "learningPoint", "etymology", "morphology", "letterStrings"]
          }
        }
      }
    });

    if (!response.text) {
      throw new Error("No response from API. The file might be empty or unreadable.");
    }

    let words;
    try {
      words = JSON.parse(response.text);
    } catch (parseError) {
      console.error("Failed to parse API response:", response.text);
      throw new Error("Failed to parse word data from API response.");
    }

    if (!Array.isArray(words) || words.length === 0) {
      throw new Error("No words were extracted from the file.");
    }

    return words.map((w: any) => ({ ...w, id: Math.random().toString(36).substr(2, 9) }));
  } catch (error: any) {
    console.error("extractVocabularyFromFile error:", error);
    // Re-throw with more context
    if (error.message) {
      throw error;
    }
    throw new Error(`Failed to extract words: ${error.toString()}`);
  }
};

export interface GeneratedWritingExerciseItem {
  exerciseType: string;
  /** Vocabulary word this exercise is anchored on (one exercise per word). */
  focusWord?: string;
  title: string;
  studentInstructions: string;
  mainContent: string;
  options: string[];
  answerKey: string;
  teacherNotes: string;
}

const MAX_WORDS_FOR_WRITING_EXERCISES = 12;

/**
 * Fewer exercises per Gemini call so Netlify serverless stays under gateway timeouts (~10s free / ~26s Pro).
 * Multiple chunks run sequentially (extra round-trips in prod, each completes faster).
 */
/** Exported for UI copy; keep in sync with chunking in `generateWritingExercises`. */
export const WRITING_EX_GEN_CHUNK_SIZE = 4;

type WritingExercisePlanRow = {
  word: Pick<WordEntry, "id" | "word" | "definition" | "example" | "yearGroup">;
  typeId: (typeof WRITING_EXERCISE_TYPE_IDS)[number];
};

function buildWritingExercisePlan(
  words: Pick<WordEntry, "id" | "word" | "definition" | "example" | "yearGroup">[],
  ids: string[],
  globalWordOffset: number
): WritingExercisePlanRow[] {
  return words.map((w, i) => ({
    word: w,
    typeId: ids[(globalWordOffset + i) % ids.length] as (typeof WRITING_EXERCISE_TYPE_IDS)[number],
  }));
}

/**
 * Prior worksheet text for this pupil: wordId → exerciseTypeId → snippets from past assignments
 * (so the model can generate new sentences/tasks, not duplicates).
 */
export type PriorWritingExercisesByWordAndType = Record<string, Record<string, string[]>>;

function priorTasksBlurb(
  wordId: string,
  exerciseType: string,
  prior?: PriorWritingExercisesByWordAndType
): string {
  const list = prior?.[wordId]?.[exerciseType];
  if (!list?.length) return '';
  const blocks = list.map((text, j) => `(Earlier task ${j + 1})\n${text.trim()}`).join('\n\n');
  return (
    `\n   ALREADY USED for this pupil (same focus word + same exercise type). Do NOT reuse, paraphrase lightly, or copy these sentences/contexts. Invent fresh settings, new stems, different “weak” words to replace, different distractors, different ramble to cut, etc.:\n\n ${blocks.replace(/\n/g, '\n   ')}`
  );
}

/**
 * One Gemini / serverless call for a small plan (≤ WRITING_EX_GEN_CHUNK_SIZE items in practice when chunked).
 */
async function runSingleWritingExercisePlan(
  plan: WritingExercisePlanRow[],
  ids: string[],
  priorByWordAndType: PriorWritingExercisesByWordAndType | undefined,
  globalWordOffset: number
): Promise<GeneratedWritingExerciseItem[]> {
  if (plan.length === 0) {
    throw new Error("Select at least one word from the word bank.");
  }

  const typeLines = ids
    .map(id => {
      const m = WRITING_EXERCISE_TYPES.find(t => t.id === id);
      return m ? `- ${id}: ${m.description}` : `- ${id}`;
    })
    .join("\n");

  const assignmentBlock = plan
    .map((p, i) => {
      const ex = (p.word.example || "").trim();
      const exShort = ex.length > 140 ? `${ex.slice(0, 137)}…` : ex;
      const defShort =
        (p.word.definition || "").length > 220 ? `${(p.word.definition || "").slice(0, 217)}…` : p.word.definition || "";
      const m = WRITING_EXERCISE_TYPES.find(t => t.id === p.typeId);
      const avoidDup = priorTasksBlurb(p.word.id, p.typeId, priorByWordAndType);
      return (
        `ITEM ${i + 1} — focusWord (must copy exactly into JSON field "focusWord"): "${p.word.word}"\n` +
        `   yearGroup: ${p.word.yearGroup}\n` +
        `   definition (from bank): ${defShort}\n` +
        (exShort ? `   example (from bank): ${exShort}\n` : "") +
        `   exerciseType (must be exactly this string): "${p.typeId}"\n` +
        (m ? `   task style: ${m.label} — ${m.description}` : "") +
        avoidDup
      );
    })
    .join("\n\n");

  const n = plan.length;

  const prompt = `You create printable writing tasks for UK primary school pupils (ages 7–11).

You must output a JSON array of EXACTLY ${n} objects, in order: item 1 = ITEM 1 below, item 2 = ITEM 2, etc.

ASSIGNMENT (one exercise per line — do not merge words, do not skip, do not reorder):
${assignmentBlock}

Reference — all selected exercise types (follow the line above for which type goes with which item):
${typeLines}

Rules:
- Language: British English. Clear, child-friendly instructions.
- Each array item MUST set "focusWord" to the exact focus word string from its ITEM line (same spelling/casing as given).
- Each item's "exerciseType" MUST equal the exerciseType string on its ITEM line exactly.
- If an ITEM includes "ALREADY USED for this pupil", you must produce genuinely new worksheet material: new sentences, new scenario, new distractors—nothing that reads like a minor edit of those earlier tasks.
- Centre the pupil task on that item's focus word (stimulus, gap, rewrite, or choices). For "cut_the_ramble" and "show_not_tell", still weave in the focus word where natural.
- mainContent is what appears on the worksheet (sentences, bullet steps, numbered layers, etc.). Use plain text with line breaks; no markdown headings.
- For multiple-choice style tasks, put the choices in "options" (3–5 strings). For others, use an empty array for options.
- answerKey: short correct answer or model response for the teacher.
- teacherNotes: one line tip for teaching or differentiation.

Return a JSON array only, length ${n}.`;

  if (!apiKey || !ai) {
    return callGeminiServer<GeneratedWritingExerciseItem[]>("writingExercises", {
      words: plan.map(p => p.word),
      exerciseTypeIds: ids,
      globalWordOffset,
      ...(priorByWordAndType && Object.keys(priorByWordAndType).length > 0
        ? { priorByWordAndType }
        : {}),
    });
  }

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            exerciseType: {
              type: Type.STRING,
              enum: [...WRITING_EXERCISE_TYPE_IDS],
            },
            focusWord: {
              type: Type.STRING,
              description: "The vocabulary word this exercise is anchored on (must match the assignment line)",
            },
            title: { type: Type.STRING },
            studentInstructions: { type: Type.STRING },
            mainContent: { type: Type.STRING },
            options: { type: Type.ARRAY, items: { type: Type.STRING } },
            answerKey: { type: Type.STRING },
            teacherNotes: { type: Type.STRING },
          },
          required: [
            "exerciseType",
            "focusWord",
            "title",
            "studentInstructions",
            "mainContent",
            "options",
            "answerKey",
            "teacherNotes",
          ],
        },
      },
    },
  });

  const raw = JSON.parse(response.text || "[]") as GeneratedWritingExerciseItem[];
  if (!Array.isArray(raw)) {
    throw new Error("Invalid response from writing exercise generator.");
  }

  if (raw.length !== plan.length) {
    throw new Error(
      `Expected ${plan.length} exercise(s) (one per word), got ${raw.length}. Try generating again.`
    );
  }

  const normalized: GeneratedWritingExerciseItem[] = [];
  for (let i = 0; i < plan.length; i++) {
    const item = raw[i];
    const expectedType = plan[i].typeId;
    const expectedWord = plan[i].word.word;
    if (!item || item.exerciseType !== expectedType) {
      throw new Error(
        `Exercise ${i + 1} should use type "${expectedType}". Try generating again.`
      );
    }
    const focus = (item.focusWord || "").trim();
    if (focus.toLowerCase() !== expectedWord.toLowerCase()) {
      throw new Error(
        `Exercise ${i + 1} should focus on word "${expectedWord}". Try generating again.`
      );
    }
    normalized.push({
      ...item,
      focusWord: expectedWord,
    });
  }
  return normalized;
}

/**
 * Generate teacher-ready writing exercises anchored on selected vocabulary.
 * @param priorByWordAndType Optional past assignment snippets per word + exercise type (avoids duplicate worksheet text for the same pupil).
 * @param globalWordOffset Internal: index of the first word in `words` within the full teacher selection (preserves exercise-type rotation across chunks).
 */
export const generateWritingExercises = async (
  words: Pick<WordEntry, "id" | "word" | "definition" | "example" | "yearGroup">[],
  exerciseTypeIds: string[],
  priorByWordAndType?: PriorWritingExercisesByWordAndType,
  globalWordOffset = 0
): Promise<GeneratedWritingExerciseItem[]> => {
  const trimmedWords = words.slice(0, MAX_WORDS_FOR_WRITING_EXERCISES);
  if (trimmedWords.length === 0) {
    throw new Error("Select at least one word from the word bank.");
  }
  const ids = [...new Set(exerciseTypeIds)].filter(id => WRITING_EXERCISE_TYPE_IDS.includes(id as (typeof WRITING_EXERCISE_TYPE_IDS)[number]));
  if (ids.length === 0) {
    throw new Error("Choose at least one exercise type.");
  }

  const chunk = WRITING_EX_GEN_CHUNK_SIZE;
  if (trimmedWords.length <= chunk) {
    const plan = buildWritingExercisePlan(trimmedWords, ids, globalWordOffset);
    return runSingleWritingExercisePlan(plan, ids, priorByWordAndType, globalWordOffset);
  }

  const merged: GeneratedWritingExerciseItem[] = [];
  for (let i = 0; i < trimmedWords.length; i += chunk) {
    const slice = trimmedWords.slice(i, i + chunk);
    const offset = globalWordOffset + i;
    const plan = buildWritingExercisePlan(slice, ids, offset);
    merged.push(...(await runSingleWritingExercisePlan(plan, ids, priorByWordAndType, offset)));
  }
  return merged;
};

export const generateQuizQuestions = async (words: string[]) => {
  if (!apiKey || !ai) return callGeminiServer('quizQuestions', { words });
  const isSingleWord = words.length === 1;

  const prompt = isSingleWord 
    ? `Create a focused 3-question vocabulary quiz for primary students in the UK about "${words[0]}". 
       IMPORTANT: One question MUST be about identifying the correct spelling of "${words[0]}" from a list of tricky common misspellings. 
       The other two should cover definition and antonyms.`
    : `Create a 3-question vocabulary quiz for primary students in the UK using: ${words.join(', ')}. 
       IMPORTANT: At least one question MUST be a spelling task (e.g., "Which of these is the correct spelling?"). 
       Others can be synonym/gap-fill.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            question: { type: Type.STRING },
            options: { type: Type.ARRAY, items: { type: Type.STRING } },
            answer: { type: Type.STRING },
            explanation: { type: Type.STRING }
          },
          required: ["question", "options", "answer", "explanation"]
        }
      }
    }
  });

  return JSON.parse(response.text || "[]");
};

/**
 * TTS using the browser's Web Speech API (works offline, no API key, no CORS).
 * Use this for student-facing flows (e.g. FlashcardQuest) so voice always works.
 */
export function speakTextWithBrowser(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      resolve();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-GB';
    utterance.rate = 0.85;
    utterance.pitch = 1;
    utterance.volume = 1;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
}

function speakWithBrowserTTS(text: string): Promise<void> {
  return speakTextWithBrowser(text);
}

/**
 * TTS for spelling and words. Uses only the browser Web Speech API (no Gemini TTS).
 * This avoids 400 (TEXT vs AUDIO), 404, and CORS when calling Gemini from the browser.
 */
export const speakText = async (text: string) => {
  const cleanText = text.replace(/^Instruction: Speak this clearly as a teacher would\.\s*/i, '').trim() || text;
  await speakTextWithBrowser(cleanText);
};
