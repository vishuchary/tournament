from fastapi import APIRouter, Query, Depends, HTTPException
from typing import Optional
from ..services.firestore_client import get_firestore
from ..models.tournament import Tournament, StandingEntry
from ..middleware.auth import verify_token
from .players import save_player_stats

router = APIRouter(prefix='/tournaments', tags=['tournaments'])


def _game_winner(s1: int, s2: int) -> Optional[str]:
    if s1 >= 11 and s1 - s2 >= 2:
        return 'team1'
    if s2 >= 11 and s2 - s1 >= 2:
        return 'team2'
    return None


def _compute_standings(group, fmt: str) -> list[StandingEntry]:
    stats: dict[str, StandingEntry] = {t.id: StandingEntry(teamId=t.id) for t in group.teams}
    for match in group.matches:
        if not match.completed:
            continue
        for team_id in [match.team1Id, match.team2Id]:
            s = stats.get(team_id)
            if not s:
                continue
            is_t1 = team_id == match.team1Id
            set_w = set_l = gw = gl = pf = pa = 0
            for g in match.games:
                my = g.team1Score if is_t1 else g.team2Score
                opp = g.team2Score if is_t1 else g.team1Score
                pf += my; pa += opp
                w = _game_winner(g.team1Score, g.team2Score)
                i_won = (w == 'team1') if is_t1 else (w == 'team2')
                i_lost = (w == 'team2') if is_t1 else (w == 'team1')
                if i_won:  set_w += 1; gw += 1
                elif i_lost: set_l += 1; gl += 1
            match_won = gw > gl if fmt != 'sets' else set_w > set_l
            s.matchesPlayed += 1
            if match_won: s.matchWins += 1
            else: s.matchLosses += 1
            s.setWins += set_w; s.setLosses += set_l
            s.gameWins += gw; s.gameLosses += gl
            s.pointsFor += pf; s.pointsAgainst += pa
            s.pointDiff = s.pointsFor - s.pointsAgainst

    ordered = sorted(
        stats.values(),
        key=lambda x: (-x.matchWins if fmt == 'sets' else -x.gameWins, -x.pointDiff),
    )
    for i, s in enumerate(ordered):
        s.rank = i + 1
    return ordered


def _compute_tournament_summary(t: Tournament) -> dict:
    all_matches = [m for level in t.levels for g in level.groups for m in g.matches]
    completed = [m for m in all_matches if m.completed]
    if not all_matches or not completed:
        status = 'not-started'
    elif len(completed) == len(all_matches):
        status = 'completed'
    else:
        status = 'in-progress'
    return {
        'id': t.id, 'name': t.name, 'date': t.date, 'format': t.format,
        'setCount': t.setCount, 'matchType': t.matchType, 'status': status,
        'matchCount': len(all_matches), 'completedCount': len(completed),
        'completedGames': sum(len(m.games) for m in completed),
        'levelCount': len(t.levels),
        'level1Groups': len(t.levels[0].groups) if t.levels else 0,
        'createdAt': t.createdAt,
    }


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


@router.post('/save', dependencies=[Depends(verify_token)])
def save_tournament(body: dict):
    try:
        t = Tournament(**_normalize_tournament_dict(body))
        # Compute standings for every group
        for level in t.levels:
            for group in level.groups:
                group.standings = _compute_standings(group, t.format)
        summary = _compute_tournament_summary(t)
        db = get_firestore()
        batch = db.batch()
        batch.set(db.collection('tournaments').document(t.id), t.model_dump())
        batch.set(db.collection('tournament_summaries').document(t.id), summary)
        batch.commit()
        affected = list({
            name
            for level in t.levels
            for group in level.groups
            for team in group.teams
            for name in team.players
            if name
        })
        save_player_stats(affected, db)
        return {'status': 'ok', 'id': t.id}
    except Exception as e:
        import traceback
        raise HTTPException(status_code=500, detail=f'{e}\n{traceback.format_exc()}')


@router.delete('/{tournament_id}', dependencies=[Depends(verify_token)])
def delete_tournament(tournament_id: str):
    db = get_firestore()
    affected: set[str] = set()
    doc = db.collection('tournaments').document(tournament_id).get()
    if doc.exists:
        try:
            t = Tournament(**_normalize_tournament_dict(doc.to_dict()))
            affected = {
                name
                for level in t.levels
                for group in level.groups
                for team in group.teams
                for name in team.players
                if name
            }
        except Exception:
            pass
    batch = db.batch()
    batch.delete(db.collection('tournaments').document(tournament_id))
    batch.delete(db.collection('tournament_summaries').document(tournament_id))
    batch.commit()
    save_player_stats(list(affected), db)
    return {'status': 'ok'}


def _to_list(val) -> list:
    if not val:
        return []
    if isinstance(val, list):
        return val
    if isinstance(val, dict):
        return list(val.values())
    return list(val)


def _normalize_tournament_dict(raw: dict) -> dict:
    raw = dict(raw)
    # Legacy: top-level groups → single level
    if 'groups' in raw and 'levels' not in raw:
        raw['levels'] = [{'id': raw['id'] + '_l1', 'name': 'Level 1', 'groups': _to_list(raw.pop('groups'))}]
    levels = []
    for lv in _to_list(raw.get('levels', [])):
        lv = dict(lv)
        groups = []
        for gr in _to_list(lv.get('groups', [])):
            gr = dict(gr)
            teams = [dict(t) | {'players': _to_list(t.get('players', []))} for t in _to_list(gr.get('teams', []))]
            matches = []
            for m in _to_list(gr.get('matches', [])):
                m = dict(m)
                m['games'] = _to_list(m.get('games', []))
                matches.append(m)
            gr['teams'] = teams
            gr['matches'] = matches
            gr.pop('standings', None)  # strip old standings; backend recomputes
            groups.append(gr)
        lv['groups'] = groups
        levels.append(lv)
    raw['levels'] = levels
    return raw
