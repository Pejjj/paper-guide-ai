from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routes import ai, debug, documents, notes

settings = get_settings()

app = FastAPI(
    title="PaperGuide AI API",
    version="0.1.0",
    description="Private PDF processing and grounded AI tutoring API.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(documents.router)
app.include_router(ai.router)
app.include_router(notes.router)
app.include_router(debug.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
