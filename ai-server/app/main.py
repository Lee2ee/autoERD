import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from app.routers import analyze

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Kiwi 모델 사전 로딩
    from app.services.nlp_service import get_kiwi
    try:
        get_kiwi()
        logging.getLogger(__name__).info("Kiwi loaded successfully")
    except Exception as e:
        logging.getLogger(__name__).warning(f"Kiwi load failed: {e}")
    yield


app = FastAPI(
    title="AutoERD AI Server",
    description="규칙 기반 + AI 보조 하이브리드 NLP 서비스",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analyze.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
