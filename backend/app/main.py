from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers import tournaments, ratings, competitive_matches, players
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
app.include_router(competitive_matches.router)
app.include_router(players.router)


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
    import traceback
    try:
        from .routers.ratings import _tournament_matches_as_games, _competitive_matches_as_games, _normalize_tournament, _match_winner, _to_list
        from .models.tournament import Tournament
        import math
        db = get_firestore()

        # Per-tournament parse diagnostics
        tournament_summary = []
        skipped_matches = []
        for t_doc in db.collection('tournaments').stream():
            t_data = t_doc.to_dict()
            entry = {'id': t_doc.id, 'name': t_data.get('name', '?'), 'status': 'ok', 'matches_found': 0, 'matches_completed': 0, 'error': None}
            try:
                t = Tournament(**_normalize_tournament(t_data, t_doc.id))
                t_set_count = t.setCount or 3
                for level in t.levels:
                    level_set_count = level.setCount or t_set_count
                    for group in level.groups:
                        team_map = {team.id: team.players for team in group.teams}
                        for match in group.matches:
                            entry['matches_found'] += 1
                            if match.completed:
                                entry['matches_completed'] += 1
                                team1_players = team_map.get(match.team1Id, [])
                                team2_players = team_map.get(match.team2Id, [])
                                winner = _match_winner(match.games, level_set_count)
                                if winner is None or not team1_players or not team2_players:
                                    scores = [(g.team1Score, g.team2Score) for g in match.games]
                                    skipped_matches.append({
                                        'match_id': match.id,
                                        'team1': team1_players,
                                        'team2': team2_players,
                                        'scores': scores,
                                        'setCount': level_set_count,
                                        'reason': 'no_winner' if winner is None else 'missing_players',
                                    })
            except Exception as ex:
                entry['status'] = 'parse_error'
                entry['error'] = str(ex)
            tournament_summary.append(entry)

        t_games = _tournament_matches_as_games(db)
        c_games = _competitive_matches_as_games(db)
        all_games = t_games + c_games

        # Per-player win/loss tally
        player_stats: dict = {}
        for g in all_games:
            for name in g.team1:
                ps = player_stats.setdefault(name, {'played': 0, 'won': 0, 'lost': 0})
                ps['played'] += 1
                if g.winner == 1:
                    ps['won'] += 1
                else:
                    ps['lost'] += 1
            for name in g.team2:
                ps = player_stats.setdefault(name, {'played': 0, 'won': 0, 'lost': 0})
                ps['played'] += 1
                if g.winner == 2:
                    ps['won'] += 1
                else:
                    ps['lost'] += 1

        sorted_stats = sorted(player_stats.items(), key=lambda x: -x[1]['played'])
        return {
            'tournament_games': len(t_games),
            'competitive_games': len(c_games),
            'total': len(all_games),
            'tournaments': tournament_summary,
            'skipped_matches': skipped_matches,
            'player_stats': {k: v for k, v in sorted_stats},
            'all_games': [{'id': g.id, 'type': g.type, 'winner': g.winner, 'team1': g.team1, 'team2': g.team2} for g in all_games],
        }
    except Exception as e:
        return {'error': str(e), 'trace': traceback.format_exc()}
