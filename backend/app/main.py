from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers import tournaments, baseline
from .services.firestore_client import get_firestore
import os

app = FastAPI(title='MHTT Tournament API', version='1.0.0')

_default_origins = 'https://mhttclub.hublabs.us,https://mhtt-tournament-a3e15.web.app,http://localhost:5173'
allowed_origins = os.getenv('ALLOWED_ORIGINS', _default_origins).split(',')

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

app.include_router(tournaments.router)
app.include_router(baseline.router)


@app.get('/health')
def health():
    return {'status': 'ok'}
