import { WordEntry, YearGroup } from "./types";

const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || process.env.API_KEY || "";
// Use proxy endpoint in development to avoid CORS issues
const CLAUDE_API_URL = import.meta.env.DEV 
  ? '/api/claude' 
  : 'https://api.anthropic.com/v1/messages';

// Helper function to call Claude API directly
async function callClaudeAPI(userContent: string | any[], maxTokens: number = 2000) {
  // Convert content to proper format
  let content: any[];
  if (typeof userContent === 'string') {
    content = [{ type: 'text', text: userContent }];
  } else if (Array.isArray(userContent)) {
    content = userContent;
  } else {
    content = [{ type: 'text', text: String(userContent) }];
  }

  // Prepare headers - API key is handled by proxy in dev mode
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  // Only add API key header if not using proxy (production)
  if (!import.meta.env.DEV) {
    const apiKey = CLAUDE_API_KEY || "";
    if (!apiKey || apiKey === "") {
      throw new Error("CLAUDE_API_KEY is not configured. Please set it in your .env.local file and restart the dev server.");
    }
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
  }

  try {
    console.log('[ClaudeService] Making request to:', CLAUDE_API_URL);
    console.log('[ClaudeService] Using proxy:', import.meta.env.DEV);
    
    const response = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: maxTokens,
        messages: [{
          role: 'user',
          content: content
        }]
      })
    });

    console.log('[ClaudeService] Response status:', response.status);

    if (!response.ok) {
      let errorMessage = `API request failed with status ${response.status}`;
      let errorData: any = null;
      try {
        errorData = await response.json();
        errorMessage = errorData.error?.message || errorData.error?.type || errorMessage;
        console.error('[ClaudeService] Error response:', errorData);
      } catch (e) {
        // If response is not JSON, use status text
        errorMessage = response.statusText || errorMessage;
        console.error('[ClaudeService] Non-JSON error response');
      }
      
      // Provide more specific error messages
      if (response.status === 401) {
        throw new Error("Invalid API key. Please check your CLAUDE_API_KEY in .env.local and restart the dev server.");
      } else if (response.status === 403) {
        throw new Error("API key does not have permission to access Claude API");
      } else if (response.status === 429) {
        throw new Error("Rate limit exceeded. Please try again later");
      } else if (response.status === 404) {
        throw new Error("API endpoint not found. Please check your proxy configuration.");
      } else {
        throw new Error(errorMessage);
      }
    }

    const data = await response.json();
    console.log('[ClaudeService] Request successful');
    return data;
  } catch (error: any) {
    console.error('[ClaudeService] Fetch error:', error);
    // Handle network/CORS errors
    if (error.name === 'TypeError' && (error.message.includes('fetch') || error.message.includes('Failed to fetch'))) {
      throw new Error("Failed to connect to Claude API. Please check: 1) Is the dev server running? 2) Did you restart after adding CLAUDE_API_KEY? 3) Check the browser console and terminal for errors.");
    }
    // Re-throw other errors
    throw error;
  }
}

/**
 * Generates a full dictionary entry for a single word.
 */
export const generateWordExplanation = async (word: string): Promise<Partial<WordEntry>> => {
  const prompt = `Explain the word "${word}" for a primary school child in the UK. 
    Classify it into a Year Group (Year 3-6) and identify its curriculum learning point.
    CRITICAL: Provide an example sentence that is either a direct quote or written in the style of famous children's literature (e.g., Roald Dahl, J.K. Rowling, C.S. Lewis). Mention the book/style if possible. 
    Include at least 2 clear antonyms.
    
    Return your response as a JSON object with the following structure:
    {
      "word": "string",
      "definition": "string",
      "root": "string (Latin or Greek root)",
      "origin": "string",
      "synonyms": ["string"],
      "antonyms": ["string"],
      "example": "string (sentence from or in the style of children's literature)",
      "yearGroup": "Year 3" | "Year 4" | "Year 5" | "Year 6",
      "learningPoint": "string"
    }`;
  
  const response = await callClaudeAPI(prompt, 2000);

  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude API');
  }

  // Extract JSON from the response (Claude may wrap it in markdown code blocks)
  let jsonText = content.text.trim();
  if (jsonText.startsWith('```json')) {
    jsonText = jsonText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
  } else if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```\n?/, '').replace(/\n?```$/, '');
  }

  return JSON.parse(jsonText);
};

/**
 * Generates a themed list of 5 spelling words for a daily quest.
 */
export const generateDailySpellingList = async (yearGroup: YearGroup = 'Year 5'): Promise<WordEntry[]> => {
  const prompt = `Generate a themed set of 5 challenging spelling words for ${yearGroup} UK students. 
    The theme should be a specific curriculum point (e.g., "Silent Letters", "Suffixes -ous/-ious", "Words ending in -cial").
    Provide full dictionary data for each word including literary examples.
    
    Return your response as a JSON array with the following structure for each word:
    [
      {
        "word": "string",
        "definition": "string",
        "root": "string",
        "origin": "string",
        "synonyms": ["string"],
        "antonyms": ["string"],
        "example": "string",
        "yearGroup": "Year 3" | "Year 4" | "Year 5" | "Year 6",
        "learningPoint": "string"
      }
    ]`;
  
  const response = await callClaudeAPI(prompt, 3000);

  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude API');
  }

  let jsonText = content.text.trim();
  if (jsonText.startsWith('```json')) {
    jsonText = jsonText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
  } else if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```\n?/, '').replace(/\n?```$/, '');
  }

  const words = JSON.parse(jsonText);
  return words.map((w: any) => ({ ...w, id: Math.random().toString(36).substr(2, 9) }));
};

/**
 * Extracts vocabulary from files with literary context and antonyms.
 */
export const extractVocabularyFromFile = async (base64Data: string, mimeType: string): Promise<WordEntry[]> => {
  if (!base64Data || base64Data.length === 0) {
    throw new Error("File data is empty. Please try uploading the file again.");
  }

  try {
    // Claude supports image inputs, but for PDF/text we'll need to convert or use a different approach
    // For now, we'll handle images and text files
    let content: any[] = [];

    if (mimeType.startsWith('image/')) {
      // For images, use the image content block
      content = [{
        type: 'image',
        source: {
          type: 'base64',
          media_type: mimeType,
          data: base64Data
        }
      }, {
        type: 'text',
        text: "Scan this document for 5 challenging words for Year 3-6 UK students. For each: provide definition, root, antonyms, and an example sentence from well-known children's books (ages 7-12). Return as JSON array."
      }];
    } else {
      // For text/PDF, we need to decode and send as text
      // Note: Claude doesn't directly support PDF, so we'll need to extract text first
      // For now, we'll throw an error for non-image files and suggest text extraction
      if (mimeType === 'text/plain') {
        const textContent = atob(base64Data);
        content = [{
          type: 'text',
          text: `Extract 5 challenging words from this text for Year 3-6 UK students:\n\n${textContent}\n\nFor each word, provide definition, root, antonyms, and an example sentence from well-known children's books (ages 7-12). Return as JSON array.`
        }];
      } else {
        throw new Error("PDF files are not directly supported. Please convert to text or image format first.");
      }
    }

    const response = await callClaudeAPI(content, 3000);

    const responseContent = response.content[0];
    if (responseContent.type !== 'text') {
      throw new Error("No text response from API. The file might be empty or unreadable.");
    }

    let jsonText = responseContent.text.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```\n?/, '').replace(/\n?```$/, '');
    }

    let words;
    try {
      words = JSON.parse(jsonText);
    } catch (parseError) {
      console.error("Failed to parse API response:", jsonText);
      throw new Error("Failed to parse word data from API response.");
    }

    if (!Array.isArray(words) || words.length === 0) {
      throw new Error("No words were extracted from the file.");
    }

    return words.map((w: any) => ({ ...w, id: Math.random().toString(36).substr(2, 9) }));
  } catch (error: any) {
    console.error("extractVocabularyFromFile error:", error);
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
       The other two should cover definition and antonyms.
       Return as JSON array with structure: [{"question": "string", "options": ["string"], "answer": "string", "explanation": "string"}]`
    : `Create a 3-question vocabulary quiz for primary students in the UK using: ${words.join(', ')}. 
       IMPORTANT: At least one question MUST be a spelling task (e.g., "Which of these is the correct spelling?"). 
       Others can be synonym/gap-fill.
       Return as JSON array with structure: [{"question": "string", "options": ["string"], "answer": "string", "explanation": "string"}]`;

  const response = await callClaudeAPI(prompt, 2000);

  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude API');
  }

  let jsonText = content.text.trim();
  if (jsonText.startsWith('```json')) {
    jsonText = jsonText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
  } else if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```\n?/, '').replace(/\n?```$/, '');
  }

  return JSON.parse(jsonText || "[]");
};

/**
 * TTS synthesis for spelling and words.
 * Note: Claude doesn't have built-in TTS, so we'll use the Web Speech API as a fallback.
 */
export const speakText = async (text: string): Promise<boolean> => {
  try {
    // Use Web Speech API as Claude doesn't have TTS
    if ('speechSynthesis' in window) {
      return new Promise((resolve) => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-GB';
        utterance.rate = 0.8; // Slightly slower for clarity
        utterance.pitch = 1;
        utterance.volume = 1;
        
        utterance.onend = () => resolve(true);
        utterance.onerror = () => resolve(false);
        
        window.speechSynthesis.speak(utterance);
      });
    } else {
      console.warn("Speech synthesis not supported in this browser");
      return Promise.resolve(false);
    }
  } catch (error) {
    console.error("Speech synthesis failed:", error);
    return Promise.resolve(false);
  }
};
