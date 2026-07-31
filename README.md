# PaperGuide AI

PaperGuide AI is an MVP guided-reading workspace for research papers, manuals, and dissertation literature review. A reader uploads a private PDF, views it beside an AI guide, creates a prioritized reading route, generates a podcast-style explanation and audio, asks page-grounded questions, and saves or exports notes as Markdown.

## Architecture

- `frontend/`: Next.js App Router, TypeScript, Tailwind CSS, `react-pdf`, and the Supabase browser client.
- `backend/`: FastAPI, PyMuPDF page extraction, OpenAI structured generation/TTS, and the Supabase service client.
- `supabase/schema.sql`: Postgres tables, indexes, row-level security, and private storage buckets.

All OpenAI calls and service-role operations stay in the backend. PDFs and generated audio use private Supabase buckets; the API returns signed URLs that expire after one hour. The frontend sends a Supabase user access token with each private request. For a frictionless MVP, it creates an anonymous Supabase user when no session exists.

## Local setup

### 1. Supabase

1. Create a Supabase project.
2. In **Authentication → Providers**, enable **Anonymous Sign-Ins**. Replace this with email, OAuth, or institutional SSO when desired.
3. Open the SQL editor and run [`supabase/schema.sql`](supabase/schema.sql). This creates the application tables, RLS policies, and private `pdfs` and `audio` buckets.
4. If you prefer the dashboard, manually create private buckets named `pdfs` and `audio` instead. Never make either bucket public.
5. Copy the project URL, anon key, and service-role key. The service-role key belongs only in the backend environment.

### 2. Frontend

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Set these values in `frontend/.env.local`:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Backend

```bash
cd backend
python -m venv .venv
```

Activate the environment:

```bash
# macOS/Linux
source .venv/bin/activate

# Windows PowerShell
.venv\Scripts\Activate.ps1
```

Install and configure:

```bash
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload
```

Required backend variables are `OPENAI_API_KEY`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`. Set `FRONTEND_URL=http://localhost:3000`. Optional settings choose the OpenAI text/TTS models, voice, bucket names, upload limit, and additional comma-separated CORS origins.

Open [http://localhost:3000](http://localhost:3000). The API health check is [http://localhost:8000/health](http://localhost:8000/health), and interactive API docs are at [http://localhost:8000/docs](http://localhost:8000/docs).

## API

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Service health |
| `POST` | `/documents/upload` | Upload, extract, detect, and index a private PDF |
| `GET` | `/documents` | List the current user's documents |
| `GET` | `/documents/{document_id}` | Get document metadata and a signed PDF URL |
| `GET` | `/documents/{document_id}/pages/{page_number}` | Get extracted page text and detections |
| `POST` | `/ai/reading-route` | Generate and save a structured reading route |
| `POST` | `/ai/podcast-script` | Generate and save a podcast tutor script |
| `POST` | `/ai/ask` | Answer only from extracted pages with page citations |
| `POST` | `/ai/text-to-speech` | Generate private MP3 audio and return a signed URL |
| `POST` | `/notes` | Save a note, optionally linked to a page |
| `GET` | `/notes/{document_id}` | List notes for a document |
| `GET` | `/notes/{document_id}/export.md` | Download notes as Markdown |

All routes except `/health` require `Authorization: Bearer <supabase-access-token>`.

## Verification

```bash
cd frontend
npm run lint
npm run build

cd ../backend
python -m compileall .
pytest
```

## Deploy

### Frontend on Vercel

1. Import the GitHub repository into Vercel.
2. Set **Root Directory** to `frontend` (Vercel detects `vercel.json` and Next.js).
3. Add `NEXT_PUBLIC_API_URL` with the Render API URL, plus the Supabase URL and anon key.
4. Deploy, then add the final Vercel origin to the backend's `ADDITIONAL_CORS_ORIGINS`.

### Backend on Render

1. Create a Blueprint from the repository and select `backend/render.yaml`, or create a Python web service with root directory `backend`.
2. Use build command `pip install -r requirements.txt` and start command `uvicorn main:app --host 0.0.0.0 --port $PORT`.
3. Set `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `FRONTEND_URL`. Keep the service-role and OpenAI keys secret.
4. Set `ADDITIONAL_CORS_ORIGINS` for preview or alternate production frontend origins if needed.

### Supabase production configuration

Use the same schema and private bucket setup. Enable the desired auth providers and configure their redirect URLs for the Vercel domain. The backend service role bypasses RLS for processing; every request first validates the user's access token and checks document ownership.

## MVP extraction behavior

PyMuPDF extracts each page separately. Lightweight heuristics flag uppercase, numbered, short title-like, and table-of-contents lines as possible headings, and scan for Table, Figure, Fig., Appendix, Summary, Conclusions, and References. These signals are hints: AI prompts explicitly prohibit inventing page, table, or figure precision. Scanned PDFs without an OCR text layer report the extraction limitation.

## Future features

- Synchronized page scrolling between citations and the viewer
- Table/figure bounding-box highlighting
- Reference chasing and source graphing
- Excel literature review export
- Voice conversation mode
- OCR for scanned documents and multilingual extraction
- Durable email/OAuth accounts, collaboration, and document deletion controls

## Security notes

- Never put `OPENAI_API_KEY` or `SUPABASE_SERVICE_ROLE_KEY` in the frontend or commit `.env` files.
- Keep `pdfs` and `audio` private. Access is through expiring signed URLs.
- RLS protects application rows, and the backend checks ownership before reading document pages, notes, or generated artifacts.
- For production, add rate limits, file malware scanning, retention/deletion policies, audit logging, and stricter content/size controls.

