import math
import re
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from ..services.firestore_client import get_firestore
from ..services.ratings_engine import compute_rc_ratings, compute_glicko2_ratings
from ..models.tournament import RatingGame, Game, PlayerRatingEntry, Tournament
from ..middleware.auth import verify_token

router = APIRouter(prefix='/ratings', tags=['ratings'])


def _sanitize(name: str) -> str:
    return re.sub(r'[.#$\[\]/]', '_', name)


def _to_list(val) -> list:
    """Convert Firestore map-stored-as-dict or actual list to a list."""
    if not val:
        return []
    if isinstance(val, list):
        return val
    return list(val.values())


def _normalize_tournament(t_data: dict, t_id: str) -> dict:
    """
    Firestore data recovered from RTDB may use the old 'groups' top-level key
    instead of 'levels', and arrays may be stored as dicts with numeric string
    keys. Normalize to the expected shape before Pydantic parsing.
    """
    def norm_games(games):
        return [{'team1Score': g.get('team1Score', 0), 'team2Score': g.get('team2Score', 0)}
                for g in _to_list(games)]

    def norm_matches(matches):
        return [
            {**m, 'games': norm_games(m.get('games', []))}
            for m in _to_list(matches)
        ]

    def norm_teams(teams):
        return [
            {**t, 'players': _to_list(t.get('players', []))}
            for t in _to_list(teams)
        ]

    def norm_groups(groups):
        return [
            {**g, 'teams': norm_teams(g.get('teams', [])), 'matches': norm_matches(g.get('matches', []))}
            for g in _to_list(groups)
        ]

    if 'groups' in t_data and 'levels' not in t_data:
        # Old format: groups are at the top level, no levels array
        levels = [{
            'id': t_id + '_l1',
            'name': 'Level 1',
            'groups': norm_groups(t_data['groups']),
        }]
    else:
        levels = [
            {**lev, 'groups': norm_groups(lev.get('groups', []))}
            for lev in _to_list(t_data.get('levels', []))
        ]

    return {**t_data, 'id': t_id, 'levels': levels}


def _game_winner(s1: int, s2: int) -> int | None:
    if s1 >= 11 and s1 - s2 >= 2:
        return 1
    if s2 >= 11 and s2 - s1 >= 2:
        return 2
    return None


def _match_winner(games: list[Game], set_count: int) -> int | None:
    t1, t2 = 0, 0
    for g in games:
        w = _game_winner(g.team1Score, g.team2Score)
        if w == 1:
            t1 += 1
        elif w == 2:
            t2 += 1
    needed = math.ceil(set_count / 2)
    if t1 >= needed:
        return 1
    if t2 >= needed:
        return 2
    if len(games) >= set_count and t1 != t2:
        return 1 if t1 > t2 else 2
    return None


def _tournament_matches_as_games(db) -> list[RatingGame]:
    result = []
    idx = 0
    for t_doc in db.collection('tournaments').stream():
        t_data = t_doc.to_dict()
        try:
            t = Tournament(**_normalize_tournament(t_data, t_doc.id))
        except Exception:
            continue
        gtype = t.matchType or 'singles'
        for level in t.levels:
            for group in level.groups:
                team_map = {team.id: team.players for team in group.teams}
                for match in group.matches:
                    if not match.completed:
                        continue
                    team1_players = team_map.get(match.team1Id, [])
                    team2_players = team_map.get(match.team2Id, [])
                    if not team1_players or not team2_players:
                        continue
                    for game in match.games:
                        gw = _game_winner(game.team1Score, game.team2Score)
                        if gw is None:
                            continue
                        result.append(RatingGame(
                            id=f't_{t.id}_{match.id}_{idx}',
                            type=gtype,
                            team1=team1_players,
                            team2=team2_players,
                            games=[game],
                            winner=gw,
                            setCount=1,
                            date=t.date or '',
                            createdAt=t.createdAt + idx,
                        ))
                        idx += 1
    return result


def _competitive_matches_as_games(db) -> list[RatingGame]:
    result = []
    for doc in db.collection('competitive_matches').stream():
        d = doc.to_dict()
        try:
            team1 = d.get('team1', [])
            team2 = d.get('team2', [])
            date = d.get('date', '')
            created = d.get('createdAt', 0)
            gtype = d.get('type', 'singles')
            for i, g in enumerate(d.get('games', [])):
                game = Game(team1Score=g['team1Score'], team2Score=g['team2Score'])
                gw = _game_winner(game.team1Score, game.team2Score)
                if gw is None:
                    continue
                result.append(RatingGame(
                    id=f'{doc.id}_{i}',
                    type=gtype,
                    team1=team1,
                    team2=team2,
                    games=[game],
                    winner=gw,
                    setCount=1,
                    date=date,
                    createdAt=created + i,
                ))
        except Exception:
            continue
    return result


@router.post('/recompute', response_model=dict, dependencies=[Depends(verify_token)])
def recompute_ratings():
    try:
        db = get_firestore()
        tournament_games = _tournament_matches_as_games(db)
        competitive_games = _competitive_matches_as_games(db)
        games = tournament_games + competitive_games

        # Delete stale entries and any legacy baseline_ratings collection
        batch = db.batch()
        for doc in db.collection('ratings').stream():
            batch.delete(doc.reference)
        for doc in db.collection('baseline_ratings').stream():
            batch.delete(doc.reference)

        for gtype in ('singles', 'doubles'):
            for algo in ('rc', 'glicko2'):
                computed: list[PlayerRatingEntry] = (
                    compute_rc_ratings(games, gtype) if algo == 'rc'
                    else compute_glicko2_ratings(games, gtype)
                )
                for r in computed:
                    key = _sanitize(r.name) + f'_{gtype}_{algo}'
                    ref = db.collection('ratings').document(key)
                    data = r.model_dump()
                    data['algo'] = algo
                    data['type'] = gtype
                    batch.set(ref, data)
        batch.commit()

        return {'status': 'ok', 'tournament_games': len(tournament_games), 'competitive_games': len(competitive_games)}
    except Exception as e:
        import traceback
        raise HTTPException(status_code=500, detail=f'{e}\n{traceback.format_exc()}')


class RenameRequest(BaseModel):
    oldName: str
    newName: str


def _replace_name(obj, old: str, new: str):
    """Recursively replace a player name string anywhere in a Firestore document."""
    if isinstance(obj, dict):
        return {k: _replace_name(v, old, new) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_replace_name(item, old, new) for item in obj]
    if isinstance(obj, str) and obj == old:
        return new
    return obj


@router.post('/rename-player', response_model=dict, dependencies=[Depends(verify_token)])
def rename_player(req: RenameRequest):
    try:
        import traceback
        old, new = req.oldName.strip(), req.newName.strip()
        if not old or not new or old == new:
            raise HTTPException(status_code=400, detail='Invalid names')
        db = get_firestore()
        batch = db.batch()

        # players collection
        for doc in db.collection('players').stream():
            d = doc.to_dict()
            if d.get('name') == old:
                batch.update(doc.reference, {'name': new})

        # tournaments — recursive replacement across all nested structure
        for doc in db.collection('tournaments').stream():
            d = doc.to_dict()
            updated = _replace_name(d, old, new)
            if updated != d:
                batch.set(doc.reference, updated)

        # competitive_matches
        for doc in db.collection('competitive_matches').stream():
            d = doc.to_dict()
            t1 = [new if p == old else p for p in d.get('team1', [])]
            t2 = [new if p == old else p for p in d.get('team2', [])]
            if t1 != d.get('team1') or t2 != d.get('team2'):
                batch.update(doc.reference, {'team1': t1, 'team2': t2})

        # ratings — delete old entries (recompute will regenerate with new name)
        for doc in db.collection('ratings').stream():
            if doc.to_dict().get('name') == old:
                batch.delete(doc.reference)

        batch.commit()
        return {'status': 'ok', 'oldName': old, 'newName': new}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        raise HTTPException(status_code=500, detail=f'{e}\n{traceback.format_exc()}')
