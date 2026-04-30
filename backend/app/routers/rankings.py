from fastapi import APIRouter, Depends
from ..services.firestore_client import get_firestore
from ..services.rankings_engine import compute_player_rankings
from ..models.tournament import Tournament, PlayerRanking
from ..middleware.auth import verify_token
import re

router = APIRouter(prefix='/rankings', tags=['rankings'])


def sanitize_key(name: str) -> str:
    return re.sub(r'[.#$\[\]/]', '_', name)


@router.get('', response_model=list[PlayerRanking])
def get_rankings():
    db = get_firestore()
    docs = db.collection('rankings').order_by('points', direction='DESCENDING').stream()
    return [PlayerRanking(**doc.to_dict()) for doc in docs]


@router.post('/recompute', response_model=dict, dependencies=[Depends(verify_token)])
def recompute_rankings():
    db = get_firestore()
    tournament_docs = db.collection('tournaments').stream()
    tournaments = [Tournament(**doc.to_dict()) for doc in tournament_docs]
    rankings = compute_player_rankings(tournaments)

    batch = db.batch()
    for r in rankings:
        ref = db.collection('rankings').document(sanitize_key(r.name))
        batch.set(ref, r.model_dump())
    batch.commit()

    return {'count': len(rankings), 'message': 'Rankings recomputed successfully'}
