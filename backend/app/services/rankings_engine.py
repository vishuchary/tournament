from ..models.tournament import Tournament, Group, Match, Team, PlayerRanking


def game_winner(s1: int, s2: int) -> str | None:
    if s1 >= 11 and s1 - s2 >= 2:
        return 'team1'
    if s2 >= 11 and s2 - s1 >= 2:
        return 'team2'
    return None


def compute_standings(group: Group, fmt: str) -> list[dict]:
    stats: dict[str, dict] = {}
    for team in group.teams:
        stats[team.id] = {
            'team': team,
            'matchWins': 0, 'matchLosses': 0,
            'setWins': 0, 'setLosses': 0,
            'gameWins': 0, 'gameLosses': 0,
            'pointsFor': 0, 'pointsAgainst': 0,
            'pointDiff': 0,
        }

    for match in group.matches:
        if not match.completed:
            continue
        for team_id in [match.team1Id, match.team2Id]:
            s = stats.get(team_id)
            if not s:
                continue
            is_team1 = match.team1Id == team_id
            sets_won = sets_lost = gw = gl = pts_for = pts_against = 0
            for game in match.games:
                my = game.team1Score if is_team1 else game.team2Score
                opp = game.team2Score if is_team1 else game.team1Score
                pts_for += my
                pts_against += opp
                w = game_winner(game.team1Score, game.team2Score)
                i_won = (w == 'team1') if is_team1 else (w == 'team2')
                i_lost = (w == 'team2') if is_team1 else (w == 'team1')
                if i_won:
                    sets_won += 1
                    gw += 1
                elif i_lost:
                    sets_lost += 1
                    gl += 1
            match_won = (sets_won > sets_lost) if fmt == 'sets' else (gw > gl)
            if match_won:
                s['matchWins'] += 1
            else:
                s['matchLosses'] += 1
            s['setWins'] += sets_won
            s['setLosses'] += sets_lost
            s['gameWins'] += gw
            s['gameLosses'] += gl
            s['pointsFor'] += pts_for
            s['pointsAgainst'] += pts_against
            s['pointDiff'] = s['pointsFor'] - s['pointsAgainst']

    result = list(stats.values())
    if fmt == 'sets':
        result.sort(key=lambda x: (-x['matchWins'], -x['pointDiff']))
    else:
        result.sort(key=lambda x: (-x['gameWins'], -x['pointDiff']))
    for i, s in enumerate(result):
        s['rank'] = i + 1
    return result


def compute_cross_group_rankings(groups: list[Group], fmt: str) -> list[dict]:
    all_stats = [s for g in groups for s in compute_standings(g, fmt)]
    if fmt == 'sets':
        all_stats.sort(key=lambda x: (-x['matchWins'], -x['setWins'], -x['pointDiff']))
    else:
        all_stats.sort(key=lambda x: (-x['gameWins'], -x['pointDiff']))
    for i, s in enumerate(all_stats):
        s['rank'] = i + 1
    return all_stats


def compute_player_rankings(tournaments: list[Tournament]) -> list[PlayerRanking]:
    rankings: dict[str, PlayerRanking] = {}

    def get(name: str) -> PlayerRanking:
        if name not in rankings:
            rankings[name] = PlayerRanking(name=name)
        return rankings[name]

    for t in tournaments:
        # 1. Level participation: +2 per level per player
        for level in t.levels:
            level_players: set[str] = set()
            for group in level.groups:
                for team in group.teams:
                    for name in team.players:
                        if name:
                            level_players.add(name)
            for name in level_players:
                s = get(name)
                s.participationPts += 2
                s.points += 2

        # 2. Game wins: +2 per individual game won
        for level in t.levels:
            for group in level.groups:
                team_map = {tm.id: tm for tm in group.teams}
                for match in group.matches:
                    if not match.completed or not match.games:
                        continue
                    team1 = team_map.get(match.team1Id)
                    team2 = team_map.get(match.team2Id)
                    in_match: set[str] = set()
                    for name in (team1.players if team1 else []) + (team2.players if team2 else []):
                        if name and name not in in_match:
                            in_match.add(name)
                            get(name).matchesPlayed += 1
                    for game in match.games:
                        w = game_winner(game.team1Score, game.team2Score)
                        if not w:
                            continue
                        win_team_id = match.team1Id if w == 'team1' else match.team2Id
                        win_team = team_map.get(win_team_id)
                        for name in (win_team.players if win_team else []):
                            if not name:
                                continue
                            s = get(name)
                            s.gameWins += 1
                            s.gameWinPts += 2
                            s.points += 2

        # 3. Winner (+2) and runner-up (+1) — based on last level
        if not t.levels:
            continue
        last_level = t.levels[-1]
        last_matches = [m for g in last_level.groups for m in g.matches]
        if not last_matches or not all(m.completed for m in last_matches):
            continue

        winner_team_id = runner_up_team_id = None
        is_finals = len(last_level.groups) == 1 and len(last_level.groups[0].teams) == 2
        if is_finals:
            final_match = last_level.groups[0].matches[0] if last_level.groups[0].matches else None
            if final_match and final_match.completed:
                t1wins = t2wins = point_diff = 0
                for g in final_match.games:
                    w = game_winner(g.team1Score, g.team2Score)
                    if w == 'team1':
                        t1wins += 1
                    elif w == 'team2':
                        t2wins += 1
                    point_diff += g.team1Score - g.team2Score
                if t1wins != t2wins:
                    team1_wins = t1wins > t2wins
                elif point_diff != 0:
                    team1_wins = point_diff > 0
                else:
                    continue
                winner_team_id = final_match.team1Id if team1_wins else final_match.team2Id
                runner_up_team_id = final_match.team2Id if team1_wins else final_match.team1Id
        else:
            standings = compute_cross_group_rankings(last_level.groups, t.format)
            winner_team_id = standings[0]['team'].id if standings else None
            runner_up_team_id = standings[1]['team'].id if len(standings) > 1 else None

        all_teams = [tm for g in last_level.groups for tm in g.teams]
        winner_team = next((tm for tm in all_teams if tm.id == winner_team_id), None)
        runner_up_team = next((tm for tm in all_teams if tm.id == runner_up_team_id), None)

        for name in (winner_team.players if winner_team else []):
            if name:
                s = get(name)
                s.bonusPts += 2
                s.points += 2

        for name in (runner_up_team.players if runner_up_team else []):
            if name:
                s = get(name)
                s.bonusPts += 1
                s.points += 1

    return sorted(rankings.values(), key=lambda r: (-r.points, -r.gameWins))
