
import { GoogleGenAI, Type } from "@google/genai";
import { WordEntry, YearGroup } from "./types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });

/**
 * Generates a full dictionary entry for a single word.
 */
export const generateWordExplanation = async (word: string): Promise<Partial<WordEntry & { etymology?: any; morphology?: any; letterStrings?: string[] }>> => {
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
          }
        },
        required: ["word", "definition", "synonyms", "antonyms", "example", "yearGroup", "learningPoint", "etymology", "morphology", "letterStrings"]
      }
    }
  });

  return JSON.parse(response.text || "{}");
};

/**
 * Generates a themed list of 5 spelling words for a daily quest.
 */
export const generateDailySpellingList = async (yearGroup: YearGroup = 'Year 5'): Promise<WordEntry[]> => {
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
    5. Full dictionary data including literary examples.`,
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
  // Check if API key is configured
  if (!process.env.API_KEY || process.env.API_KEY === "") {
    throw new Error("API key is not configured. Please set GEMINI_API_KEY in your .env.local file and restart the dev server.");
  }

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
          5. Definition, synonyms, antonyms, and an example sentence from well-known children's books (ages 7-12).`
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

export const generateQuizQuestions = async (words: string[]) => {
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
