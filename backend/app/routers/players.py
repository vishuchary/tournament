import time
from fastapi import APIRouter, HTTPException
from ..services.firestore_client import get_firestore

router = APIRouter(prefix='/players', tags=['players'])


def _to_list(val) -> list:
    if not val:
        return []
    if isinstance(val, list):
        return val
    if isinstance(val, dict):
        return list(val.values())
    return list(val)


def _game_winner(s1: int, s2: int):
    if s1 >= 11 and s1 - s2 >= 2:
        return 'team1'
    if s2 >= 11 and s2 - s1 >= 2:
        return 'team2'
    return None


def _blank():
    return {'matchesPlayed': 0, 'matchWins': 0, 'gameWins': 0, 'gameLosses': 0, 'pointsFor': 0, 'pointsAgainst': 0}


def _cross_group_rank(groups: list, fmt: str) -> list[dict]:
    all_entries = []
    for group in groups:
        standings = _to_list(group.get('standings', []))
        if standings:
            all_entries.extend(standings)
        else:
            teams = {t['id']: t for t in _to_list(group.get('teams', []))}
            stats: dict[str, dict] = {tid: {'teamId': tid, 'matchWins': 0, 'setWins': 0,
                                             'gameWins': 0, 'pointDiff': 0} for tid in teams}
            for match in _to_list(group.get('matches', [])):
                if not match.get('completed'):
                    continue
                for tid in [match.get('team1Id'), match.get('team2Id')]:
                    if tid not in stats:
                        continue
                    is_t1 = tid == match.get('team1Id')
                    gw = gl = pf = pa = 0
                    for g in _to_list(match.get('games', [])):
                        my = g.get('team1Score', 0) if is_t1 else g.get('team2Score', 0)
                        opp = g.get('team2Score', 0) if is_t1 else g.get('team1Score', 0)
                        pf += my; pa += opp
                        w = _game_winner(g.get('team1Score', 0), g.get('team2Score', 0))
                        if (w == 'team1' and is_t1) or (w == 'team2' and not is_t1):
                            gw += 1
                        elif w:
                            gl += 1
                    stats[tid]['gameWins'] += gw
                    stats[tid]['setWins'] += gw
                    if gw > gl:
                        stats[tid]['matchWins'] += 1
                    stats[tid]['pointDiff'] += pf - pa
            all_entries.extend(stats.values())

    if fmt == 'sets':
        all_entries.sort(key=lambda x: (-x.get('matchWins', 0), -x.get('setWins', 0), -x.get('pointDiff', 0)))
    else:
        all_entries.sort(key=lambda x: (-x.get('gameWins', 0), -x.get('pointDiff', 0)))
    return all_entries


def _compute_player_stats(name: str, t_docs: list, c_docs: list) -> dict:
    """Compute stats for a player from pre-loaded tournament and competitive match data."""
    stats = {
        'name': name,
        'overall': _blank(),
        'singles': _blank(),
        'doubles': _blank(),
        'tournaments': [],
        'tournamentPerf': [],
    }

    for t_doc in t_docs:
        t = t_doc.to_dict() if hasattr(t_doc, 'to_dict') else t_doc
        if not t:
            continue
        t_id = t_doc.id if hasattr(t_doc, 'id') else t.get('id', '')
        t_name = t.get('name', '')
        t_date = t.get('date')
        t_fmt = t.get('format', 'games')
        t_match_type = t.get('matchType')
        levels = _to_list(t.get('levels', []))

        appeared = False
        result = None
        tgw = tgl = 0

        for level in levels:
            for group in _to_list(level.get('groups', [])):
                team_map = {tm['id']: tm for tm in _to_list(group.get('teams', []))}
                for match in _to_list(group.get('matches', [])):
                    if not match.get('completed'):
                        continue
                    t1 = team_map.get(match.get('team1Id', ''))
                    t2 = team_map.get(match.get('team2Id', ''))
                    my_team = next((tm for tm in [t1, t2] if tm and name in _to_list(tm.get('players', []))), None)
                    if not my_team:
                        continue
                    appeared = True
                    is_t1 = my_team['id'] == match.get('team1Id')
                    mtype = 'singles' if my_team.get('type') == 'singles' else (t_match_type or 'doubles')
                    bucket = stats['singles'] if mtype == 'singles' else stats['doubles']
                    gw = gl = 0
                    for g in _to_list(match.get('games', [])):
                        s1 = g.get('team1Score', 0)
                        s2 = g.get('team2Score', 0)
                        my = s1 if is_t1 else s2
                        opp = s2 if is_t1 else s1
                        w = _game_winner(s1, s2)
                        i_won = (w == 'team1') if is_t1 else (w == 'team2')
                        bucket['pointsFor'] += my
                        bucket['pointsAgainst'] += opp
                        stats['overall']['pointsFor'] += my
                        stats['overall']['pointsAgainst'] += opp
                        if i_won:
                            gw += 1
                            bucket['gameWins'] += 1
                            stats['overall']['gameWins'] += 1
                        elif w:
                            gl += 1
                            bucket['gameLosses'] += 1
                            stats['overall']['gameLosses'] += 1
                    match_won = gw > gl
                    bucket['matchesPlayed'] += 1
                    stats['overall']['matchesPlayed'] += 1
                    if match_won:
                        bucket['matchWins'] += 1
                        stats['overall']['matchWins'] += 1
                    tgw += gw
                    tgl += gl

        if levels:
            last = levels[-1]
            last_groups = _to_list(last.get('groups', []))
            all_teams = [tm for g in last_groups for tm in _to_list(g.get('teams', []))]
            is_finals = len(last_groups) == 1 and len(_to_list(last_groups[0].get('teams', []))) == 2
            winner_id = runner_id = None

            if is_finals:
                matches = _to_list(last_groups[0].get('matches', []))
                fm = matches[0] if matches else None
                if fm and fm.get('completed'):
                    t1w = t2w = pd = 0
                    for g in _to_list(fm.get('games', [])):
                        w = _game_winner(g.get('team1Score', 0), g.get('team2Score', 0))
                        if w == 'team1': t1w += 1
                        elif w == 'team2': t2w += 1
                        pd += g.get('team1Score', 0) - g.get('team2Score', 0)
                    t1_wins = t1w > t2w if t1w != t2w else pd > 0
                    winner_id = fm.get('team1Id') if t1_wins else fm.get('team2Id')
                    runner_id = fm.get('team2Id') if t1_wins else fm.get('team1Id')
            elif last_groups:
                ranked = _cross_group_rank(last_groups, t_fmt)
                if ranked:
                    team_map_last = {tm['id']: tm for g in last_groups for tm in _to_list(g.get('teams', []))}
                    for entry in ranked:
                        tid = entry.get('teamId') or entry.get('id')
                        if tid and tid in team_map_last:
                            if winner_id is None:
                                winner_id = tid
                            elif runner_id is None:
                                runner_id = tid
                                break

            winner_team = next((tm for tm in all_teams if tm.get('id') == winner_id), None)
            runner_team = next((tm for tm in all_teams if tm.get('id') == runner_id), None)
            if winner_team and name in _to_list(winner_team.get('players', [])):
                result = 'winner'
            elif runner_team and name in _to_list(runner_team.get('players', [])):
                result = 'runner-up'

        if appeared:
            stats['tournaments'].append({'id': t_id, 'name': t_name, 'date': t_date,
                                          'matchType': t_match_type, 'result': result})
            stats['tournamentPerf'].append({'id': t_id, 'name': t_name, 'date': t_date,
                                            'gameWins': tgw, 'gameLosses': tgl})

    for m_doc in c_docs:
        m = m_doc.to_dict() if hasattr(m_doc, 'to_dict') else m_doc
        if not m:
            continue
        team1 = _to_list(m.get('team1', []))
        team2 = _to_list(m.get('team2', []))
        is_t1 = name in team1
        is_t2 = name in team2
        if not is_t1 and not is_t2:
            continue
        mtype = m.get('type', 'singles')
        bucket = stats['singles'] if mtype == 'singles' else stats['doubles']
        match_won = (m.get('winner') == 1 and is_t1) or (m.get('winner') == 2 and is_t2)
        bucket['matchesPlayed'] += 1
        stats['overall']['matchesPlayed'] += 1
        if match_won:
            bucket['matchWins'] += 1
            stats['overall']['matchWins'] += 1
        for g in _to_list(m.get('games', [])):
            s1 = g.get('team1Score', 0)
            s2 = g.get('team2Score', 0)
            my = s1 if is_t1 else s2
            opp = s2 if is_t1 else s1
            w = _game_winner(s1, s2)
            i_won = (w == 'team1') if is_t1 else (w == 'team2')
            bucket['pointsFor'] += my
            bucket['pointsAgainst'] += opp
            stats['overall']['pointsFor'] += my
            stats['overall']['pointsAgainst'] += opp
            if i_won:
                bucket['gameWins'] += 1
                stats['overall']['gameWins'] += 1
            elif w:
                bucket['gameLosses'] += 1
                stats['overall']['gameLosses'] += 1

    stats['tournamentPerf'].sort(key=lambda x: x.get('date') or '')
    return stats


def save_player_stats(names: list[str], db) -> None:
    """Compute and save stats for the given players. Loads Firestore data once for all."""
    names = list({n for n in names if n})
    if not names:
        return
    t_docs = list(db.collection('tournaments').stream())
    c_docs = list(db.collection('competitive_matches').stream())
    batch = db.batch()
    ts = int(time.time())
    for name in names:
        stats = _compute_player_stats(name, t_docs, c_docs)
        stats['updatedAt'] = ts
        batch.set(db.collection('player_stats').document(name), stats)
    batch.commit()


@router.get('/{name}/stats')
def get_player_stats(name: str):
    try:
        db = get_firestore()
        cached = db.collection('player_stats').document(name).get()
        if cached.exists:
            return cached.to_dict()
        # Fallback: compute and cache
        t_docs = list(db.collection('tournaments').stream())
        c_docs = list(db.collection('competitive_matches').stream())
        stats = _compute_player_stats(name, t_docs, c_docs)
        db.collection('player_stats').document(name).set(stats)
        return stats
    except Exception as e:
        import traceback
        raise HTTPException(status_code=500, detail=f'{e}\n{traceback.format_exc()}')
