-- Curriculum columns for vocab_words. Allowed values: lib/vocabTaxonomy.ts
-- part_of_speech: single TEXT (noun, verb, adjective, …)
-- grammar, writing, semantic: TEXT[] of snake_case tags
--
-- If you already created grammar/writing/semantic as plain TEXT, the app still reads them;
-- to switch to TEXT[] in Postgres, alter the column type in the SQL Editor when ready.

ALTER TABLE vocab_words ADD COLUMN IF NOT EXISTS word_family TEXT;
ALTER TABLE vocab_words ADD COLUMN IF NOT EXISTS part_of_speech TEXT;
ALTER TABLE vocab_words ADD COLUMN IF NOT EXISTS grammar TEXT[];
ALTER TABLE vocab_words ADD COLUMN IF NOT EXISTS writing TEXT[];
ALTER TABLE vocab_words ADD COLUMN IF NOT EXISTS semantic TEXT[];
