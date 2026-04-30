import re
from fastapi import APIRouter, Depends
from ..services.firestore_client import get_firestore
from ..services.ratings_engine import compute_rc_ratings, compute_glicko2_ratings
from ..models.tournament import BaselineGame, PlayerRatingEntry
from ..middleware.auth import verify_token

router = APIRouter(prefix='/baseline', tags=['baseline'])


def _sanitize(name: str) -> str:
    return re.sub(r'[.#$\[\]/]', '_', name)


@router.post('/ratings/recompute', response_model=dict, dependencies=[Depends(verify_token)])
def recompute_baseline_ratings():
    db = get_firestore()
    docs = db.collection('baseline_games').stream()
    games = [BaselineGame(**doc.to_dict()) for doc in docs]

    batch = db.batch()
    for gtype in ('singles', 'doubles'):
        for algo in ('rc', 'glicko2'):
            ratings: list[PlayerRatingEntry] = (
                compute_rc_ratings(games, gtype) if algo == 'rc'
                else compute_glicko2_ratings(games, gtype)
            )
            for r in ratings:
                key = _sanitize(r.name) + f'_{gtype}_{algo}'
                ref = db.collection('baseline_ratings').document(key)
                data = r.model_dump()
                data['algo'] = algo
                data['type'] = gtype
                batch.set(ref, data)
    batch.commit()

    return {'status': 'ok', 'games': len(games)}
