# Spelling Fox Quest

Vocabulary and spelling app for students: daily quests, word bank, spelling snake game, and spelling bee (voice).

## Run locally

**Prerequisites:** Node.js 18+

1. Clone the repo and install dependencies:
   ```bash
   npm install
   ```
2. Copy env example and add your secrets:
   ```bash
   cp .env.example .env.local
   ```
   Edit `.env.local` and set at least:
   - `VITE_SUPABASE_URL` – your Supabase project URL  
   - `VITE_SUPABASE_ANON_KEY` – your Supabase anon/publishable key  
   - `GEMINI_API_KEY` – for AI word generation (optional: `CLAUDE_API_KEY` if using Claude)
3. Start the dev server:
   ```bash
   npm run dev
   ```
   Open the URL shown (e.g. http://localhost:3000).

## Deploy to Netlify

1. **Push to GitHub**
   - Create a new repo on GitHub, then:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/TIMOVIS/spellingfox.git
   git branch -M main
   git push -u origin main
   ```

2. **Connect and build on Netlify**
   - Log in at [netlify.com](https://netlify.com) → **Add new site** → **Import an existing project** → **GitHub** → choose the `spelling-fox` repo.
   - Build settings (usually auto-detected from `netlify.toml`):
     - **Build command:** `npm run build`
     - **Publish directory:** `dist`
   - Click **Deploy site** (first deploy may fail until env vars are set).

3. **Add environment variables**
   - In Netlify: **Site settings** → **Environment variables** → **Add a variable** / **Import from .env**.
   - Add (and mark **sensitive** if you want them hidden in the UI):

   | Variable | Required | Description |
   |----------|----------|-------------|
   | `VITE_SUPABASE_URL` | Yes | Supabase project URL (e.g. `https://xxxx.supabase.co`) |
   | `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anon/publishable key |
   | `GEMINI_API_KEY` | For AI features | Gemini API key for word generation |
   | `CLAUDE_API_KEY` | Optional | Claude API key if using Claude |

   - Trigger a new deploy: **Deploys** → **Trigger deploy** → **Clear cache and deploy site**.

After the deploy finishes, your app will be available at the Netlify URL. All secrets stay in Netlify; nothing is committed to the repo.
