from fastapi import APIRouter, Depends, HTTPException
from ..services.firestore_client import get_firestore
from ..middleware.auth import verify_token
from .players import save_player_stats

router = APIRouter(prefix='/competitive-matches', tags=['competitive-matches'])


@router.post('/save', dependencies=[Depends(verify_token)])
def save_competitive_match(body: dict):
    try:
        if 'id' not in body:
            raise HTTPException(status_code=400, detail='id required')
        db = get_firestore()
        db.collection('competitive_matches').document(body['id']).set(body)
        affected = list(body.get('team1', [])) + list(body.get('team2', []))
        save_player_stats(affected, db)
        return {'status': 'ok', 'id': body['id']}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        raise HTTPException(status_code=500, detail=f'{e}\n{traceback.format_exc()}')


@router.delete('/{match_id}', dependencies=[Depends(verify_token)])
def delete_competitive_match(match_id: str):
    try:
        db = get_firestore()
        doc = db.collection('competitive_matches').document(match_id).get()
        d = doc.to_dict() if doc.exists else {}
        db.collection('competitive_matches').document(match_id).delete()
        affected = list(d.get('team1', [])) + list(d.get('team2', []))
        save_player_stats(affected, db)
        return {'status': 'ok'}
    except Exception as e:
        import traceback
        raise HTTPException(status_code=500, detail=f'{e}\n{traceback.format_exc()}')
