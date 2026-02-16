// API key is only used server-side; never exposed in client bundle
process.env.API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY || '';

export const handler = async (event: { httpMethod: string; body: string | null }) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  if (!process.env.GEMINI_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'GEMINI_API_KEY not set on server' }) };
  }

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const body = JSON.parse(event.body || '{}');
    const { action } = body;

    // Dynamic import so process.env.API_KEY is set before geminiService loads
    const gemini = await import('../../geminiService');

    switch (action) {
      case 'wordExplanation': {
        const word = body.word;
        if (!word || typeof word !== 'string') {
          return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing word' }) };
        }
        const result = await gemini.generateWordExplanation(word);
        return { statusCode: 200, headers, body: JSON.stringify(result) };
      }
      case 'dailyList': {
        const yearGroup = body.yearGroup || 'Year 5';
        const result = await gemini.generateDailySpellingList(yearGroup);
        return { statusCode: 200, headers, body: JSON.stringify(result) };
      }
      case 'extractFile': {
        const { base64Data, mimeType } = body;
        if (!base64Data || !mimeType) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing base64Data or mimeType' }) };
        }
        const result = await gemini.extractVocabularyFromFile(base64Data, mimeType);
        return { statusCode: 200, headers, body: JSON.stringify(result) };
      }
      case 'quizQuestions': {
        const words = body.words;
        if (!Array.isArray(words)) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing words array' }) };
        }
        const result = await gemini.generateQuizQuestions(words);
        return { statusCode: 200, headers, body: JSON.stringify(result) };
      }
      default:
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown action' }) };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: message }) };
  }
};
