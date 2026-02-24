-- Enable Realtime for tables that affect student view when teacher assigns words.
-- Students subscribe to these changes so their daily quest and word bank update without refocusing.

-- Daily quest: when teacher pins/unpins or bulk-assigns, student sees updates immediately
ALTER PUBLICATION supabase_realtime ADD TABLE vocab_daily_quests;

-- Words: when teacher adds a new word (e.g. Quick Add), student's word bank updates
ALTER PUBLICATION supabase_realtime ADD TABLE vocab_words;
