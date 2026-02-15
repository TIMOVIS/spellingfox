# Deployment Guide for Netlify

This guide will help you deploy the Spelling Fox app to Netlify via GitHub.

## Prerequisites

1. A GitHub account
2. A Netlify account (free tier works fine)
3. A Gemini API key

## Step 1: Push to GitHub

1. Initialize git repository (if not already done):
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   ```

2. Create a new repository on GitHub

3. Push your code:
   ```bash
   git remote add origin <your-github-repo-url>
   git branch -M main
   git push -u origin main
   ```

## Step 2: Deploy to Netlify

1. Go to [Netlify](https://www.netlify.com/) and sign in
2. Click "Add new site" → "Import an existing project"
3. Choose "GitHub" and authorize Netlify to access your repositories
4. Select your `spelling-fox` repository
5. Netlify will automatically detect the build settings from `netlify.toml`:
   - **Build command**: `npm install && npm run build`
   - **Publish directory**: `dist`

## Step 3: Configure Environment Variables

1. In your Netlify site dashboard, go to **Site settings** → **Environment variables**
2. Click **Add variable**
3. Add the following variable:
   - **Key**: `GEMINI_API_KEY`
   - **Value**: Your Gemini API key
4. Click **Save**

## Step 4: Deploy

1. Netlify will automatically trigger a build after you save the environment variable
2. You can also manually trigger a deploy from the **Deploys** tab
3. Once the build completes, your site will be live at `https://your-site-name.netlify.app`

## Continuous Deployment

Netlify will automatically deploy whenever you push to your main branch on GitHub. Each pull request will also get a preview deployment.

## Troubleshooting

- If the build fails, check the build logs in the Netlify dashboard
- Make sure `GEMINI_API_KEY` is set correctly in Netlify's environment variables
- Verify that your `package.json` has all required dependencies
