# PaperGuide AI Deployment Checklist

Use this checklist to deploy the GitHub repository at [github.com/Pejjj/paper-guide-ai](https://github.com/Pejjj/paper-guide-ai). Replace every value written as `<...>` with your own value. Do not paste secrets into source files, screenshots, issues, or commits.

## Before you start

- [ ] You can sign in to [Supabase](https://supabase.com), [Render](https://render.com), and [Vercel](https://vercel.com).
- [ ] You can access the GitHub repository `Pejjj/paper-guide-ai` from Render and Vercel.
- [ ] You have an OpenAI API key with billing enabled. Keep it server-side only.
- [ ] The repository contains no real `.env` files or secrets. Use `backend/.env.example` and `frontend/.env.example` only as references.

## 1. Create the Supabase project

- [ ] Sign in to [Supabase](https://supabase.com/dashboard).
- [ ] Click **New project**.
- [ ] Select or create an organization.
- [ ] Enter a project name such as `paper-guide-ai`.
- [ ] Generate a strong database password and save it in a password manager. It is not used by the app's current environment variables.
- [ ] Select the region closest to the expected users.
- [ ] Click **Create new project** and wait until provisioning finishes.
- [ ] Open **Authentication → Providers** and enable **Anonymous Sign-Ins**. The MVP automatically creates an anonymous authenticated session when a user first opens a data-backed page.
- [ ] Open **Authentication → URL Configuration**. For now, leave the local site URL in place; after Vercel deployment, set **Site URL** to `https://<YOUR-VERCEL-DOMAIN>` and add that same origin to the allowed redirect URLs.

## 2. Run `supabase/schema.sql`

- [ ] In the Supabase dashboard, open **SQL Editor**.
- [ ] Click **New query**.
- [ ] In GitHub, open [`supabase/schema.sql`](https://github.com/Pejjj/paper-guide-ai/blob/main/supabase/schema.sql), click **Raw**, and copy the complete file.
- [ ] Paste the SQL into the Supabase query editor.
- [ ] Click **Run** and confirm the query completes without an error.
- [ ] Open **Table Editor** and verify these tables exist:
  - [ ] `documents`
  - [ ] `document_pages`
  - [ ] `reading_routes`
  - [ ] `podcast_scripts`
  - [ ] `notes`
  - [ ] `audio_generations`
- [ ] In **Database → Tables**, verify Row Level Security is enabled for all six tables.

The SQL is safe to rerun: it uses `if not exists`, replaces its triggers/policies, and keeps the storage buckets private.

## 3. Create and verify private storage buckets

The schema creates both required private buckets. Verify them rather than creating duplicate buckets.

- [ ] Open **Storage** in Supabase.
- [ ] Confirm a bucket named exactly `pdfs` exists.
- [ ] Open the `pdfs` bucket settings and confirm **Public bucket** is disabled.
- [ ] Confirm a bucket named exactly `audio` exists and **Public bucket** is disabled. This second bucket is required for TTS output.

If `pdfs` was not created by the SQL:

- [ ] Click **New bucket**.
- [ ] Enter `pdfs` as the bucket name.
- [ ] Leave **Public bucket** disabled.
- [ ] Click **Create bucket**.

If `audio` was not created, repeat those steps with the exact name `audio`. Do not add public read policies. The backend uses the service role and returns one-hour signed URLs.

## 4. Get the Supabase URL and keys

- [ ] Open **Project Settings → API** in Supabase.
- [ ] Copy **Project URL**. It looks like `https://<PROJECT-REF>.supabase.co`. This becomes `SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL`.
- [ ] Copy the client-safe **anon/public JWT key** (sometimes shown under **Legacy API keys** as `anon`). This becomes `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- [ ] Reveal and copy the server-only **service_role JWT key** (sometimes shown under **Legacy API keys** as `service_role`). This becomes `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] Store the service-role key in a password manager. Never place it in Vercel frontend variables, any `NEXT_PUBLIC_*` variable, or GitHub.

Keep these placeholders handy without committing their real values:

```dotenv
SUPABASE_URL=https://<PROJECT-REF>.supabase.co
NEXT_PUBLIC_SUPABASE_URL=https://<PROJECT-REF>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<SUPABASE-ANON-KEY>
SUPABASE_SERVICE_ROLE_KEY=<SUPABASE-SERVICE-ROLE-KEY>
```

## 5. Prepare Render backend environment variables

Create the following environment variables in Render. Values inside angle brackets are placeholders.

| Key | Value |
| --- | --- |
| `OPENAI_API_KEY` | `<OPENAI-API-KEY>` |
| `OPENAI_MODEL` | `gpt-4o-mini` |
| `OPENAI_TTS_MODEL` | `tts-1` |
| `OPENAI_TTS_VOICE` | `alloy` |
| `SUPABASE_URL` | `https://<PROJECT-REF>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | `<SUPABASE-SERVICE-ROLE-KEY>` |
| `SUPABASE_PDF_BUCKET` | `pdfs` |
| `SUPABASE_AUDIO_BUCKET` | `audio` |
| `FRONTEND_URL` | `http://localhost:3000` initially; replace after Vercel deployment |
| `ADDITIONAL_CORS_ORIGINS` | Leave blank initially; replace after Vercel deployment |
| `MAX_UPLOAD_MB` | `25` |

- [ ] Confirm neither the OpenAI key nor service-role key has a `NEXT_PUBLIC_` prefix.
- [ ] Do not include quotation marks around Render environment-variable values.

## 6. Deploy the backend to Render

Use a normal Render Web Service; this is the least ambiguous monorepo setup.

- [ ] Sign in to [Render](https://dashboard.render.com).
- [ ] Click **New + → Web Service**.
- [ ] Connect GitHub if prompted, then select `Pejjj/paper-guide-ai`.
- [ ] Configure the service:
  - **Name:** `paper-guide-ai-api` (or another unique name)
  - **Region:** the region closest to the Supabase project
  - **Branch:** `main`
  - **Root Directory:** `backend`
  - **Runtime:** `Python 3`
  - **Build Command:** `pip install -r requirements.txt`
  - **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
  - **Health Check Path:** `/health`
- [ ] Add every variable from section 5 under **Environment**.
- [ ] Click **Create Web Service**.
- [ ] Watch the first deploy log and confirm the service reaches **Live**.
- [ ] Copy the Render origin, for example `https://paper-guide-ai-api.onrender.com`. Do not add a trailing slash when using it as `NEXT_PUBLIC_API_URL`.
- [ ] Open `https://<YOUR-RENDER-DOMAIN>/health` and confirm the JSON response is `{"status":"ok"}`.

## 7. Prepare Vercel frontend environment variables

Create these variables in Vercel for **Production**, **Preview**, and **Development** unless you intentionally use different projects:

| Key | Value |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `https://<YOUR-RENDER-DOMAIN>` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<PROJECT-REF>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `<SUPABASE-ANON-KEY>` |

- [ ] Confirm `NEXT_PUBLIC_API_URL` has no trailing slash.
- [ ] Confirm the anon key—not the service-role key—is used in Vercel.
- [ ] Do not add `OPENAI_API_KEY` or `SUPABASE_SERVICE_ROLE_KEY` to Vercel.

## 8. Deploy the frontend to Vercel

- [ ] Sign in to [Vercel](https://vercel.com/new).
- [ ] Click **Add New → Project** and import `Pejjj/paper-guide-ai`.
- [ ] Configure the project:
  - **Framework Preset:** `Next.js`
  - **Root Directory:** `frontend`
  - **Build Command:** use the detected default (`next build`)
  - **Output Directory:** leave the detected default
- [ ] Add the three variables from section 7.
- [ ] Click **Deploy** and wait for the production deployment to finish.
- [ ] Copy the production origin, for example `https://paper-guide-ai.vercel.app`.
- [ ] Return to Supabase **Authentication → URL Configuration**:
  - Set **Site URL** to the Vercel origin.
  - Add the Vercel origin to allowed redirect URLs.
- [ ] Return to Render **Environment**:
  - Set `FRONTEND_URL` to the exact Vercel origin.
  - Set `ADDITIONAL_CORS_ORIGINS` to the exact Vercel origin. Add other origins as a comma-separated list only if needed.
- [ ] Save the Render variables and trigger **Manual Deploy → Deploy latest commit** so the backend restarts with the production CORS configuration.
- [ ] Redeploy Vercel whenever any `NEXT_PUBLIC_*` value changes; those values are embedded during the frontend build.

## 9. End-to-end production tests

Use a small, text-based PDF that contains obvious headings and at least one figure/table reference. Avoid scanned/image-only PDFs for the first test because the MVP does not include OCR.

### Health endpoint

- [ ] Open `https://<YOUR-RENDER-DOMAIN>/health` in a private browser window.
- [ ] Confirm HTTP `200` and exactly `{"status":"ok"}`.

### Login/session

The MVP uses automatic anonymous Supabase authentication; it does not yet show a username/password form.

- [ ] Open the Vercel site in a private/incognito window.
- [ ] Click **Open your reading desk**.
- [ ] Confirm the dashboard opens without a `401 Sign in is required` error.
- [ ] In Supabase, open **Authentication → Users** and confirm a new user appears with an anonymous identity.
- [ ] Refresh the dashboard and confirm the same browser session can still load the document list.

### PDF upload

- [ ] On the dashboard, click **Choose PDF** and select a valid PDF under 25 MB.
- [ ] Confirm the upload finishes and the document appears under **Reading desk** with status `ready` and a page count.
- [ ] In Supabase **Storage → pdfs**, confirm the object path begins with the authenticated user's UUID.
- [ ] In **Table Editor**, confirm matching rows exist in `documents` and `document_pages`.

### PDF display

- [ ] Click the uploaded document.
- [ ] Confirm the PDF renders in the left panel.
- [ ] Test next page, previous page, zoom in, and zoom out.
- [ ] Confirm the storage bucket remains private; the PDF should load through a time-limited signed URL, not a public bucket URL.

### Reading route generation

- [ ] Open the **Reading Route** tab and click **Generate Reading Route**.
- [ ] Confirm the result contains an overall goal and prioritized `Must read`, `Skim`, or `Optional` sections.
- [ ] Confirm page numbers and tables/figures refer only to content visible in the PDF; uncertain locations should be shown as unknown rather than invented.
- [ ] In Supabase, confirm a row was added to `reading_routes`.

### Podcast script generation

- [ ] Open the **Podcast** tab and click **Generate Podcast Script**.
- [ ] Confirm an episode title, duration, and readable tutor script appear.
- [ ] Confirm page directions and claims are grounded in the uploaded document.
- [ ] In Supabase, confirm a row was added to `podcast_scripts`.

### TTS audio

- [ ] With the podcast script visible, click **Generate Audio**.
- [ ] Wait for the audio player to appear, then play at least 10 seconds.
- [ ] In Supabase **Storage → audio**, confirm a private `.mp3` object was created.
- [ ] In **Table Editor**, confirm a matching row exists in `audio_generations`.

### Document Q&A

- [ ] Open **Ask Document**.
- [ ] Ask a question whose answer is clearly stated in the PDF, such as `What is the main conclusion?`
- [ ] Confirm the answer cites one or more pages using `[p. N]` or `[pp. N–N]`.
- [ ] Ask a question not answered by the document.
- [ ] Confirm the app says the answer was not found instead of using outside knowledge.

### Note saving

- [ ] Open **Notes**.
- [ ] Enter a note and an optional valid page number.
- [ ] Click **Save Note**.
- [ ] Confirm the saved note appears with its page number and date.
- [ ] Refresh the document workspace and confirm the note persists.
- [ ] In Supabase, confirm the note exists in `notes` with the correct `user_id` and `document_id`.

### Markdown export

- [ ] In **Notes**, click **Export Notes**.
- [ ] Confirm a `.md` file downloads.
- [ ] Open it in a text editor and verify it includes the document title, note text, page references, and saved dates.
- [ ] Confirm no API keys, service-role keys, signed storage URLs, or extracted full-document text appear in the export.

## Final production checks

- [ ] Render and Vercel both deploy automatically from `main`.
- [ ] Render `FRONTEND_URL` and `ADDITIONAL_CORS_ORIGINS` match the exact Vercel origin, including `https://` and excluding a trailing slash.
- [ ] Supabase anonymous sign-ins are enabled.
- [ ] The `pdfs` and `audio` buckets are private.
- [ ] OpenAI and Supabase service-role keys exist only in Render.
- [ ] Only the Supabase anon key is exposed to the frontend.
- [ ] All ten production tests above pass in a fresh private/incognito browser session.
