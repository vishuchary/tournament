import math
import re
from fastapi import APIRouter, Depends
from ..services.firestore_client import get_firestore
from ..services.ratings_engine import compute_rc_ratings, compute_glicko2_ratings
from ..models.tournament import BaselineGame, Game, PlayerRatingEntry, Tournament
from ..middleware.auth import verify_token

router = APIRouter(prefix='/baseline', tags=['baseline'])


def _sanitize(name: str) -> str:
    return re.sub(r'[.#$\[\]/]', '_', name)


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


def _tournament_matches_as_games(db) -> list[BaselineGame]:
    result = []
    idx = 0
    for t_doc in db.collection('tournaments').stream():
        t_data = t_doc.to_dict()
        try:
            t = Tournament(**{**t_data, 'id': t_doc.id})
        except Exception:
            continue
        gtype = t.matchType or 'singles'
        t_set_count = t.setCount or 3
        for level in t.levels:
            level_set_count = level.setCount or t_set_count
            for group in level.groups:
                team_map = {team.id: team.players for team in group.teams}
                for match in group.matches:
                    if not match.completed:
                        continue
                    team1_players = team_map.get(match.team1Id, [])
                    team2_players = team_map.get(match.team2Id, [])
                    if not team1_players or not team2_players:
                        continue
                    winner = _match_winner(match.games, level_set_count)
                    if winner is None:
                        continue
                    result.append(BaselineGame(
                        id=f't_{t.id}_{match.id}',
                        type=gtype,
                        team1=team1_players,
                        team2=team2_players,
                        games=match.games,
                        winner=winner,
                        setCount=level_set_count,
                        date=t.date or '',
                        createdAt=t.createdAt + idx,
                    ))
                    idx += 1
    return result


def _competitive_matches_as_games(db) -> list[BaselineGame]:
    result = []
    for doc in db.collection('competitive_matches').stream():
        d = doc.to_dict()
        try:
            result.append(BaselineGame(
                id=doc.id,
                type=d.get('type', 'singles'),
                team1=d.get('team1', []),
                team2=d.get('team2', []),
                games=[Game(team1Score=g['team1Score'], team2Score=g['team2Score']) for g in d.get('games', [])],
                winner=d['winner'],
                setCount=d.get('setCount', 3),
                date=d.get('date', ''),
                createdAt=d.get('createdAt', 0),
            ))
        except Exception:
            continue
    return result


@router.post('/ratings/recompute', response_model=dict, dependencies=[Depends(verify_token)])
def recompute_baseline_ratings():
    try:
        db = get_firestore()
        tournament_games = _tournament_matches_as_games(db)
        competitive_games = _competitive_matches_as_games(db)
        games = tournament_games + competitive_games

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

        return {'status': 'ok', 'tournament_games': len(tournament_games), 'competitive_games': len(competitive_games)}
    except Exception as e:
        import traceback
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=f'{e}\n{traceback.format_exc()}')
