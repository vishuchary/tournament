from fastapi import APIRouter, Query
from typing import Optional
from ..services.firestore_client import get_firestore
from ..models.tournament import Tournament

router = APIRouter(prefix='/tournaments', tags=['tournaments'])


@router.get('', response_model=list[Tournament])
def get_tournaments(
    from_date: Optional[str] = Query(None, alias='from'),
    to_date: Optional[str] = Query(None, alias='to'),
    player: Optional[str] = None,
    format: Optional[str] = None,
    limit: int = Query(50, le=200),
):
    db = get_firestore()
    q = db.collection('tournaments').order_by('createdAt', direction='DESCENDING')

    if format:
        q = q.where('format', '==', format)

    docs = q.limit(limit).stream()
    tournaments = [Tournament(**doc.to_dict()) for doc in docs]

    # Post-fetch filters (Firestore can't query into nested arrays)
    if from_date:
        tournaments = [t for t in tournaments if t.date and t.date >= from_date]
    if to_date:
        tournaments = [t for t in tournaments if t.date and t.date <= to_date]
    if player:
        def has_player(t: Tournament) -> bool:
            for level in t.levels:
                for group in level.groups:
                    for team in group.teams:
                        if player.lower() in [p.lower() for p in team.players]:
                            return True
            return False
        tournaments = [t for t in tournaments if has_player(t)]

    return tournaments


@router.get('/{tournament_id}/stats')
def get_tournament_stats(tournament_id: str):
    db = get_firestore()
    doc = db.collection('tournaments').document(tournament_id).get()
    if not doc.exists:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail='Tournament not found')

    t = Tournament(**doc.to_dict())
    all_matches = [m for level in t.levels for group in level.groups for m in group.matches]
    all_players = {
        name
        for level in t.levels
        for group in level.groups
        for team in group.teams
        for name in team.players
        if name
    }

    return {
        'id': t.id,
        'name': t.name,
        'levelCount': len(t.levels),
        'groupCount': sum(len(level.groups) for level in t.levels),
        'matchCount': len(all_matches),
        'completedMatches': sum(1 for m in all_matches if m.completed),
        'playerCount': len(all_players),
    }
