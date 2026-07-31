# PaperGuide AI Cloud Setup Commands

This is the copy-paste deployment runbook for [Pejjj/paper-guide-ai](https://github.com/Pejjj/paper-guide-ai). Complete it in order: Supabase, Render, Vercel, then post-deploy testing.

Replace every `<PLACEHOLDER>` before using a command. Never paste real keys into this file, GitHub, an issue, a screenshot, or chat. Store secrets only in the relevant provider's environment-variable screen.

## Values to collect

Keep these values temporarily in a password manager or other private location:

```text
SUPABASE_URL=https://<PROJECT-REF>.supabase.co
SUPABASE_ANON_KEY=<SUPABASE-PUBLISHABLE-OR-LEGACY-ANON-KEY>
SUPABASE_SERVICE_ROLE_KEY=<SUPABASE-SECRET-OR-LEGACY-SERVICE-ROLE-KEY>
OPENAI_API_KEY=<OPENAI-API-KEY>
RENDER_URL=https://<RENDER-SERVICE>.onrender.com
VERCEL_URL=https://<VERCEL-PROJECT>.vercel.app
```

The names `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` describe how this repository uses the keys. In the current Supabase dashboard, use a **Publishable key** for the frontend and a **Secret key** for the backend. Legacy `anon` and `service_role` JWT keys also work. Never expose a Secret or `service_role` key to the frontend.

## 1. Supabase

Official references: [API keys](https://supabase.com/docs/guides/getting-started/api-keys) and [anonymous sign-ins](https://supabase.com/docs/guides/auth/auth-anonymous).

### Create the project

1. Open [Supabase Dashboard](https://supabase.com/dashboard) and sign in.
2. Click **New project**.
3. Select or create an organization.
4. Use `paper-guide-ai` for the project name.
5. Generate a strong database password and save it privately.
6. Select a region near the expected users, then click **Create new project**.
7. Wait until the project status is healthy.

### Enable the app's login method

The current frontend does not show an email/password form. It calls `supabase.auth.signInAnonymously()` automatically when it needs an authenticated API session.

1. Open **Authentication > Providers**.
2. Enable **Anonymous Sign-Ins** and save.
3. For production, consider enabling CAPTCHA/Turnstile and reviewing anonymous-user rate limits before sharing the app publicly.

### Run `supabase/schema.sql`

1. Open **SQL Editor** in Supabase.
2. Click **New query**.
3. Open the repository's [`supabase/schema.sql`](https://github.com/Pejjj/paper-guide-ai/blob/main/supabase/schema.sql).
4. Click **Raw**, select all of the SQL, and copy it.
5. Paste the complete SQL into the Supabase editor.
6. Click **Run**.
7. Confirm the result contains no error.
8. Open **Table Editor** and verify these tables exist:

```text
documents
document_pages
reading_routes
podcast_scripts
notes
audio_generations
```

9. Verify Row Level Security is enabled for all six tables.

The schema can be rerun. It creates/updates the tables, policies, triggers, and the private `pdfs` and `audio` buckets.

### Create or verify the private `pdfs` bucket

1. Open **Storage**.
2. Confirm a bucket named exactly `pdfs` exists. The SQL normally creates it.
3. Open its settings and verify **Public bucket** is disabled.
4. If it does not exist, click **New bucket**, enter `pdfs`, leave **Public bucket** disabled, and click **Create bucket**.
5. Also verify a private bucket named exactly `audio` exists. TTS will fail without it. If necessary, create it using the same steps.

Do not make either bucket public. The backend uploads with its server key and returns one-hour signed URLs.

### Copy the URL and keys

1. Open the project's **Connect** dialog or **Project Settings > API Keys**.
2. Copy the **Project URL**. Use it for both `SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL`.
3. Copy the **Publishable key** for `NEXT_PUBLIC_SUPABASE_ANON_KEY`. If using legacy keys, copy `anon`.
4. Create/reveal and copy a backend **Secret key** for `SUPABASE_SERVICE_ROLE_KEY`. If using legacy keys, copy `service_role`.
5. Put the Secret/`service_role` value only in Render. Do not put it in Vercel.

Your private value map should now look like this:

```dotenv
SUPABASE_URL=https://<PROJECT-REF>.supabase.co
SUPABASE_ANON_KEY=<SUPABASE-PUBLISHABLE-OR-LEGACY-ANON-KEY>
SUPABASE_SERVICE_ROLE_KEY=<SUPABASE-SECRET-OR-LEGACY-SERVICE-ROLE-KEY>
```

## 2. Render backend

Official references: [deploy a web service](https://render.com/docs/web-services), [monorepo root directories](https://render.com/docs/monorepo-support), and [environment variables](https://render.com/docs/configure-environment-variables).

### Create the web service

1. Open [Render Dashboard](https://dashboard.render.com).
2. Click **New + > Web Service**.
3. Connect the GitHub account that can access `Pejjj/paper-guide-ai`.
4. Select the `Pejjj/paper-guide-ai` repository.
5. Enter these settings exactly:

```text
Name: paper-guide-ai-api
Branch: main
Root Directory: backend
Runtime/Language: Python 3
Build Command: pip install -r requirements.txt
Start Command: uvicorn main:app --host 0.0.0.0 --port $PORT
Health Check Path: /health
```

The build and start commands are relative to `backend`. Do not prefix them with `cd backend` when the Root Directory is already `backend`.

### Add Render environment variables

Open **Environment**, click **Add Environment Variable** for each row, and use these exact names:

```dotenv
PYTHON_VERSION=3.12.7
OPENAI_API_KEY=<OPENAI-API-KEY>
OPENAI_MODEL=gpt-4o-mini
OPENAI_TTS_MODEL=tts-1
OPENAI_TTS_VOICE=alloy
SUPABASE_URL=https://<PROJECT-REF>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<SUPABASE-SECRET-OR-LEGACY-SERVICE-ROLE-KEY>
SUPABASE_PDF_BUCKET=pdfs
SUPABASE_AUDIO_BUCKET=audio
FRONTEND_URL=http://localhost:3000
ADDITIONAL_CORS_ORIGINS=
MAX_UPLOAD_MB=25
```

Notes:

- Paste the values without surrounding quotes.
- `OPENAI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are secrets and belong only in Render.
- Leave `ADDITIONAL_CORS_ORIGINS` empty until Vercel gives you a production URL.
- The backend does **not** read a variable named `ALLOWED_ORIGINS`. Its allowed-origin settings are `FRONTEND_URL` and `ADDITIONAL_CORS_ORIGINS`.

### Deploy and test the backend

1. Click **Create Web Service**.
2. Watch the deploy log until Render reports **Live**.
3. Copy the service URL, without a trailing slash.
4. Replace the placeholder and run:

```powershell
curl.exe -i "https://<RENDER-SERVICE>.onrender.com/health"
```

Expected result:

```text
HTTP/1.1 200 (or HTTP/2 200)
...
{"status":"ok"}
```

Also open this in a browser:

```text
https://<RENDER-SERVICE>.onrender.com/docs
```

The OpenAPI page should list the document, AI, and note endpoints.

## 3. Vercel frontend

Official reference: [Vercel monorepo deployment](https://vercel.com/docs/monorepos).

### Import and configure the project

1. Open [Vercel New Project](https://vercel.com/new).
2. Find `Pejjj/paper-guide-ai` and click **Import**.
3. Click **Edit** next to **Root Directory** and select `frontend`.
4. Confirm **Framework Preset** is `Next.js`.
5. Leave the detected build command as `next build` (the repository script is `npm run build`).
6. Leave the output directory at the Next.js default.

### Add Vercel environment variables

Add these exact names for **Production**, **Preview**, and **Development**:

```dotenv
NEXT_PUBLIC_API_URL=https://<RENDER-SERVICE>.onrender.com
NEXT_PUBLIC_SUPABASE_URL=https://<PROJECT-REF>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<SUPABASE-PUBLISHABLE-OR-LEGACY-ANON-KEY>
```

Checks before deploying:

- `NEXT_PUBLIC_API_URL` has no trailing slash.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` contains the Publishable or legacy `anon` key.
- Vercel does not contain `OPENAI_API_KEY`.
- Vercel does not contain `SUPABASE_SERVICE_ROLE_KEY`.

### Deploy

1. Click **Deploy**.
2. Wait for the Next.js build to succeed.
3. Open the production deployment.
4. Copy the stable production URL, such as `https://<VERCEL-PROJECT>.vercel.app`, without a trailing slash.

If you change a `NEXT_PUBLIC_*` variable later, trigger a new Vercel deployment because those values are embedded during the build.

## 4. Post-deploy configuration and tests

### Update Render allowed origins with the Vercel URL

The requested `ALLOWED_ORIGINS` setting is implemented in this repository as the two variables below. Do not create an unused `ALLOWED_ORIGINS` variable.

1. Open the Render web service.
2. Open **Environment**.
3. Replace both values with the exact Vercel origin, including `https://` and excluding a trailing slash:

```dotenv
FRONTEND_URL=https://<VERCEL-PROJECT>.vercel.app
ADDITIONAL_CORS_ORIGINS=https://<VERCEL-PROJECT>.vercel.app
```

4. Choose **Save, rebuild, and deploy** or save and then select **Manual Deploy > Deploy latest commit**.
5. Wait until the backend is **Live** again.

Optional CORS preflight check:

```powershell
curl.exe -i -X OPTIONS "https://<RENDER-SERVICE>.onrender.com/documents" -H "Origin: https://<VERCEL-PROJECT>.vercel.app" -H "Access-Control-Request-Method: GET" -H "Access-Control-Request-Headers: authorization"
```

The response should include:

```text
access-control-allow-origin: https://<VERCEL-PROJECT>.vercel.app
```

### Update Supabase authentication URLs

1. Open **Supabase > Authentication > URL Configuration**.
2. Set **Site URL** to:

```text
https://<VERCEL-PROJECT>.vercel.app
```

3. Add the same URL to the allowed redirect URLs and save.

### End-to-end test sequence

Use a fresh private/incognito browser window and a small text-based PDF under 25 MB. The MVP does not OCR scanned/image-only PDFs.

1. **Health:** open `https://<RENDER-SERVICE>.onrender.com/health` and confirm `{"status":"ok"}`.
2. **Login:** open the Vercel site, click **Open your reading desk**, and confirm there is no `401`. In **Supabase > Authentication > Users**, confirm an anonymous user appears. This automatic anonymous session is the current login flow.
3. **PDF upload:** click **Choose PDF**, upload the test PDF, and confirm it appears with status `ready` and a page count. Verify a private object appears under **Supabase > Storage > pdfs**.
4. **PDF display:** open the document and confirm the PDF renders. Test page navigation and zoom. Refresh once if the one-hour signed URL has expired.
5. **Reading route:** click **Generate Reading Route**. Confirm a prioritized route appears and a row is added to `reading_routes`.
6. **Podcast script:** open **Podcast**, click **Generate Podcast Script**, and confirm the episode title and script appear. Verify a row in `podcast_scripts`.
7. **TTS:** click **Generate Audio**, wait for the player, and play the audio. Verify a private `.mp3` under **Storage > audio** and a row in `audio_generations`.
8. **Q&A:** open **Ask Document**, ask a question answered by the PDF, and confirm the response cites pages. Ask an unsupported question and confirm the response says it was not found.
9. **Note save:** open **Notes**, enter a note and optional page number, click **Save Note**, refresh, and confirm the note remains. Verify the row in `notes`.
10. **Markdown export:** click **Export Notes**, open the downloaded `.md`, and confirm it contains the document title, note text, page reference, and date without any secrets or signed URLs.

## 5. Debugging

### Browser reports a CORS error

1. Confirm the failing request goes to the Render URL set in `NEXT_PUBLIC_API_URL`.
2. In Render, set both values to the exact Vercel origin without a trailing slash:

```dotenv
FRONTEND_URL=https://<VERCEL-PROJECT>.vercel.app
ADDITIONAL_CORS_ORIGINS=https://<VERCEL-PROJECT>.vercel.app
```

3. Redeploy Render. Environment changes do not affect the running process until it restarts.
4. Run the CORS preflight command from the post-deploy section.
5. If testing a Vercel preview URL, add it to `ADDITIONAL_CORS_ORIGINS`. Multiple origins must be comma-separated with no quote characters:

```dotenv
ADDITIONAL_CORS_ORIGINS=https://<PRODUCTION>.vercel.app,https://<PREVIEW>.vercel.app
```

### Supabase authentication fails or the API returns `401`

1. Confirm **Anonymous Sign-Ins** is enabled in Supabase.
2. Confirm Vercel has the correct `NEXT_PUBLIC_SUPABASE_URL` and Publishable/legacy `anon` key.
3. Redeploy Vercel after changing either variable.
4. Clear site data for the Vercel domain or retry in a new incognito window.
5. Open **Supabase > Authentication > Users** and verify an anonymous user was created.
6. In browser developer tools, inspect the failed Render request. It should include `Authorization: Bearer <REDACTED>`; never copy the token into chat or documentation.
7. If anonymous creation is rate-limited, wait for the limit window or review Auth rate-limit settings and CAPTCHA protection.

### A private PDF uploads but does not display

1. Confirm `pdfs` exists and **Public bucket** is disabled.
2. Confirm Render has `SUPABASE_PDF_BUCKET=pdfs` and a valid backend Secret/`service_role` key.
3. In Supabase Storage, confirm the file exists under `<USER-ID>/<DOCUMENT-ID>/<FILENAME>`.
4. In the `documents` table, confirm `storage_path` matches that object path and `status` is `ready`.
5. Refresh the document page to request a new one-hour signed URL.
6. Inspect the browser Network panel. A `401`/`404` from `/documents/<ID>` points to auth/ownership; a storage `400`/`404` points to the bucket/path; a CORS message points to the origin settings.

### OpenAI calls report a missing key or return `503`

1. In Render **Environment**, confirm the exact variable exists:

```dotenv
OPENAI_API_KEY=<OPENAI-API-KEY>
```

2. Confirm there are no quotes, spaces, or placeholder brackets in the real Render value.
3. Confirm the OpenAI project has billing/credits and permission to use the configured models.
4. Save and redeploy Render.
5. Never add the OpenAI key to Vercel or a `NEXT_PUBLIC_*` variable.

### Render build fails

1. Confirm **Root Directory** is `backend`.
2. Confirm these commands are exact and do not include `cd backend`:

```text
Build Command: pip install -r requirements.txt
Start Command: uvicorn main:app --host 0.0.0.0 --port $PORT
```

3. Confirm `PYTHON_VERSION=3.12.7`.
4. Open the first red line in the Render build log. A missing `requirements.txt` usually means the root directory is wrong; an import error usually means dependency installation failed; `main` import errors usually mean the start command or root directory is wrong.
5. Select **Manual Deploy > Clear build cache & deploy** after correcting the settings.
6. Recheck `https://<RENDER-SERVICE>.onrender.com/health` after the deploy reaches **Live**.

### Vercel build fails

1. Confirm **Root Directory** is `frontend` and **Framework Preset** is `Next.js`.
2. Confirm Vercel detects the repository's package manager/lockfile and runs the `build` script from `frontend/package.json`.
3. Confirm all three frontend variables exist in the environment being deployed:

```dotenv
NEXT_PUBLIC_API_URL=https://<RENDER-SERVICE>.onrender.com
NEXT_PUBLIC_SUPABASE_URL=https://<PROJECT-REF>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<SUPABASE-PUBLISHABLE-OR-LEGACY-ANON-KEY>
```

4. Open the first actual error in the Vercel build log rather than the final generic failure line.
5. If variables were changed, redeploy; a previous build does not receive new `NEXT_PUBLIC_*` values automatically.
6. If the build cache is stale, redeploy with **Use existing Build Cache** disabled.

## Final security check

Before sharing the deployment, confirm:

```text
[ ] pdfs is private
[ ] audio is private
[ ] Anonymous Sign-Ins is enabled
[ ] OPENAI_API_KEY exists only in Render
[ ] SUPABASE_SERVICE_ROLE_KEY exists only in Render
[ ] Vercel contains only the Supabase Publishable/anon key
[ ] Render allowed origins match the exact Vercel URL
[ ] No real .env file or secret was committed
```
