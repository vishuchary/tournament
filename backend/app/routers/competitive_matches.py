from fastapi import APIRouter, Depends, HTTPException
from ..services.firestore_client import get_firestore
from ..middleware.auth import verify_token

router = APIRouter(prefix='/competitive-matches', tags=['competitive-matches'])


@router.post('/save', dependencies=[Depends(verify_token)])
def save_competitive_match(body: dict):
    try:
        if 'id' not in body:
            raise HTTPException(status_code=400, detail='id required')
        db = get_firestore()
        db.collection('competitive_matches').document(body['id']).set(body)
        return {'status': 'ok', 'id': body['id']}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        raise HTTPException(status_code=500, detail=f'{e}\n{traceback.format_exc()}')


@router.delete('/{match_id}', dependencies=[Depends(verify_token)])
def delete_competitive_match(match_id: str):
    db = get_firestore()
    db.collection('competitive_matches').document(match_id).delete()
    return {'status': 'ok'}
