from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers import rankings, tournaments
from .services.firestore_client import get_firestore
import os

app = FastAPI(title='MHTT Tournament API', version='1.0.0')

allowed_origins = os.getenv('ALLOWED_ORIGINS', 'https://mhttclub.hublabs.us').split(',')

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

app.include_router(rankings.router)
app.include_router(tournaments.router)


@app.get('/health')
def health():
    return {'status': 'ok'}
