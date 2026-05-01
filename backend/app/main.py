from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers import tournaments, baseline
from .services.firestore_client import get_firestore
import os
import time

app = FastAPI(title='MHTT Tournament API', version='1.0.0')

_default_origins = 'https://mhttclub.hublabs.us,https://mhtt-tournament-a3e15.web.app,http://localhost:5173'
allowed_origins = os.getenv('ALLOWED_ORIGINS', _default_origins).split(',')

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
    max_age=0,
)

app.include_router(tournaments.router)
app.include_router(baseline.router)



@app.get('/health')
def health():
    try:
        db = get_firestore()
        db.collection('settings').document('baseline_algo').get()
        return {'status': 'ok', 'firestore': 'ok'}
    except Exception as e:
        return {'status': 'ok', 'firestore': 'error', 'detail': str(e)}


@app.get('/debug/counts')
def debug_counts():
    try:
        db = get_firestore()
        t0 = time.time()
        games = list(db.collection('baseline_games').stream())
        t1 = time.time()
        tournaments_docs = list(db.collection('tournaments').stream())
        t2 = time.time()
        return {
            'baseline_games': len(games),
            'tournaments': len(tournaments_docs),
            'games_ms': int((t1 - t0) * 1000),
            'tournaments_ms': int((t2 - t1) * 1000),
            'total_ms': int((t2 - t0) * 1000),
        }
    except Exception as e:
        return {'error': str(e)}


@app.post('/debug/recompute-dry')
def debug_recompute_dry():
    import traceback
    try:
        from .routers.baseline import _tournament_matches_as_games, _sanitize
        from .services.ratings_engine import compute_rc_ratings, compute_glicko2_ratings
        db = get_firestore()
        t0 = time.time()
        games = _tournament_matches_as_games(db)
        t1 = time.time()
        ratings_rc_s = compute_rc_ratings(games, 'singles')
        t2 = time.time()
        batch = db.batch()
        for gtype in ('singles', 'doubles'):
            for algo in ('rc', 'glicko2'):
                ratings = compute_rc_ratings(games, gtype) if algo == 'rc' else compute_glicko2_ratings(games, gtype)
                for r in ratings:
                    key = _sanitize(r.name) + f'_{gtype}_{algo}'
                    ref = db.collection('baseline_ratings').document(key)
                    data = r.model_dump()
                    data['algo'] = algo
                    data['type'] = gtype
                    batch.set(ref, data)
        batch.commit()
        t3 = time.time()
        return {
            'status': 'ok',
            'tournament_games': len(games),
            'read_ms': int((t1 - t0) * 1000),
            'compute_ms': int((t2 - t1) * 1000),
            'write_ms': int((t3 - t2) * 1000),
            'total_ms': int((t3 - t0) * 1000),
            'ratings_written': len(ratings_rc_s),
        }
    except Exception as e:
        return {'status': 'error', 'detail': str(e), 'trace': traceback.format_exc()}
