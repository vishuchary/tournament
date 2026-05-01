from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers import tournaments, ratings
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
app.include_router(ratings.router)



@app.get('/health')
def health():
    try:
        db = get_firestore()
        db.collection('settings').document('algo').get()
        return {'status': 'ok', 'firestore': 'ok'}
    except Exception as e:
        return {'status': 'ok', 'firestore': 'error', 'detail': str(e)}


@app.get('/debug/games')
def debug_games():
    """Show how many tournament and competitive games the backend can actually parse."""
    import traceback
    try:
        from .routers.ratings import _tournament_matches_as_games, _competitive_matches_as_games
        db = get_firestore()
        t_games = _tournament_matches_as_games(db)
        c_games = _competitive_matches_as_games(db)
        all_games = t_games + c_games
        singles = [g for g in all_games if g.type == 'singles']
        doubles = [g for g in all_games if g.type == 'doubles']
        return {
            'tournament_games': len(t_games),
            'competitive_games': len(c_games),
            'total': len(all_games),
            'singles': len(singles),
            'doubles': len(doubles),
            'sample': [{'id': g.id, 'type': g.type, 'winner': g.winner, 'team1': g.team1, 'team2': g.team2} for g in all_games[:5]],
        }
    except Exception as e:
        return {'error': str(e), 'trace': traceback.format_exc()}
