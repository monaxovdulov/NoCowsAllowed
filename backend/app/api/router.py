from fastapi import APIRouter

from app.api.scores import router as scores_router

api_router = APIRouter(prefix="/api")
api_router.include_router(scores_router, tags=["scores"])
