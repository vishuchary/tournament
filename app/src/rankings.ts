import type { Group, Match, MatchFormat, Team, TeamStats, Tournament } from './types';

function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const base = parts.length > 1 ? parts[parts.length - 1] : parts[0];
  return base.slice(0, 8);
}

export function teamDisplayName(team: Team): string {
  const players = team.players.filter(Boolean);
  if (players.length === 0) return team.name;
  return players.map(shortName).join('_');
}

export interface PlayerRanking {
  name: string;
  points: number;        // total score
  participationPts: number; // +2 per level played
  gameWinPts: number;   // +2 per game won
  bonusPts: number;     // +2 winner, +1 runner-up per tournament
  gameWins: number;     // raw game win count
  matchesPlayed: number;
}

function gameWinner(s1: number, s2: number): 'team1' | 'team2' | null {
  if (s1 >= 11 && s1 - s2 >= 2) return 'team1';
  if (s2 >= 11 && s2 - s1 >= 2) return 'team2';
  return null;
}

function getMatchResult(match: Match, teamId: string, format: MatchFormat) {
  const isTeam1 = match.team1Id === teamId;
  let setsWon = 0, setsLost = 0, gameWins = 0, gameLosses = 0;
  let pointsFor = 0, pointsAgainst = 0;

  for (const game of match.games) {
    const myScore = isTeam1 ? game.team1Score : game.team2Score;
    const oppScore = isTeam1 ? game.team2Score : game.team1Score;
    pointsFor += myScore;
    pointsAgainst += oppScore;
    const w = gameWinner(game.team1Score, game.team2Score);
    const iWon = isTeam1 ? w === 'team1' : w === 'team2';
    const iLost = isTeam1 ? w === 'team2' : w === 'team1';
    if (iWon) { setsWon++; gameWins++; }
    else if (iLost) { setsLost++; gameLosses++; }
  }

  // Match win: sets format = more sets; games format = more game wins
  const matchWon = format === 'sets'
    ? setsWon > setsLost
    : gameWins > gameLosses;

  return { matchWon, setsWon, setsLost, gameWins, gameLosses, pointsFor, pointsAgainst };
}

export function computeStandings(group: Group, format: MatchFormat): TeamStats[] {
  const statsMap = new Map<string, TeamStats>();

  for (const team of group.teams) {
    statsMap.set(team.id, {
      team,
      matchesPlayed: 0,
      matchWins: 0,
      matchLosses: 0,
      setWins: 0,
      setLosses: 0,
      gameWins: 0,
      gameLosses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDiff: 0,
      rank: 0,
    });
  }

  for (const match of group.matches) {
    if (!match.completed) continue;

    for (const teamId of [match.team1Id, match.team2Id]) {
      const s = statsMap.get(teamId);
      if (!s) continue;
      const r = getMatchResult(match, teamId, format);
      s.matchesPlayed++;
      if (r.matchWon) s.matchWins++; else s.matchLosses++;
      s.setWins += r.setsWon;
      s.setLosses += r.setsLost;
      s.gameWins += r.gameWins;
      s.gameLosses += r.gameLosses;
      s.pointsFor += r.pointsFor;
      s.pointsAgainst += r.pointsAgainst;
      s.pointDiff = s.pointsFor - s.pointsAgainst;
    }
  }

  const standings = Array.from(statsMap.values());

  standings.sort((a, b) => {
    // Sets format: rank by match wins. Games format: rank by total game wins.
    const primary = format === 'sets'
      ? b.matchWins - a.matchWins
      : b.gameWins - a.gameWins;
    if (primary !== 0) return primary;
    return b.pointDiff - a.pointDiff;
  });

  standings.forEach((s, i) => { s.rank = i + 1; });
  return standings;
}

export function computeCrossGroupRankings(groups: Group[], format: MatchFormat): TeamStats[] {
  const all = groups.flatMap(g => computeStandings(g, format));
  all.sort((a, b) => {
    if (format === 'sets') {
      if (b.matchWins !== a.matchWins) return b.matchWins - a.matchWins;
      if (b.setWins !== a.setWins) return b.setWins - a.setWins;
    } else {
      if (b.gameWins !== a.gameWins) return b.gameWins - a.gameWins;
    }
    return b.pointDiff - a.pointDiff;
  });
  all.forEach((s, i) => { s.rank = i + 1; });
  return all;
}

export function computePlayerRankings(tournaments: Tournament[]): PlayerRanking[] {
  const map = new Map<string, PlayerRanking>();

  function get(name: string): PlayerRanking {
    if (!map.has(name)) map.set(name, {
      name, points: 0, participationPts: 0, gameWinPts: 0, bonusPts: 0,
      gameWins: 0, matchesPlayed: 0,
    });
    return map.get(name)!;
  }

  for (const t of tournaments) {
    // 1. Level participation: +2 per level per player
    for (const level of t.levels) {
      const levelPlayers = new Set<string>();
      for (const group of level.groups) {
        for (const team of group.teams) {
          for (const name of team.players) {
            if (name) levelPlayers.add(name);
          }
        }
      }
      for (const name of levelPlayers) {
        const s = get(name);
        s.participationPts += 2;
        s.points += 2;
      }
    }

    // 2. Game wins: +2 per individual game won
    for (const level of t.levels) {
      for (const group of level.groups) {
        const teamMap = new Map(group.teams.map(tm => [tm.id, tm]));
        for (const match of group.matches) {
          if (!match.completed || match.games.length === 0) continue;

          const inMatch = new Set<string>();
          const team1 = teamMap.get(match.team1Id);
          const team2 = teamMap.get(match.team2Id);
          for (const name of [...(team1?.players ?? []), ...(team2?.players ?? [])]) {
            if (name && !inMatch.has(name)) { inMatch.add(name); get(name).matchesPlayed++; }
          }

          for (const game of match.games) {
            const w = gameWinner(game.team1Score, game.team2Score);
            if (!w) continue;
            const winTeam = teamMap.get(w === 'team1' ? match.team1Id : match.team2Id);
            for (const name of (winTeam?.players ?? [])) {
              if (!name) continue;
              const s = get(name);
              s.gameWins++;
              s.gameWinPts += 2;
              s.points += 2;
            }
          }
        }
      }
    }

    // 3. Tournament winner (+2) and runner-up (+1) — based on last level
    const lastLevel = t.levels[t.levels.length - 1];
    if (!lastLevel) continue;
    const lastMatches = lastLevel.groups.flatMap(g => g.matches);
    if (lastMatches.length === 0 || !lastMatches.every(m => m.completed)) continue;

    let winnerTeamId: string | null = null;
    let runnerUpTeamId: string | null = null;

    const isFinals = lastLevel.groups.length === 1 && lastLevel.groups[0].teams.length === 2;
    if (isFinals) {
      const finalMatch = lastLevel.groups[0].matches[0];
      if (finalMatch?.completed) {
        let t1wins = 0, t2wins = 0, pointDiff = 0;
        for (const g of finalMatch.games) {
          const w = gameWinner(g.team1Score, g.team2Score);
          if (w === 'team1') t1wins++;
          else if (w === 'team2') t2wins++;
          pointDiff += g.team1Score - g.team2Score;
        }
        let team1Wins: boolean;
        if (t1wins !== t2wins) team1Wins = t1wins > t2wins;
        else if (pointDiff !== 0) team1Wins = pointDiff > 0;
        else continue;
        winnerTeamId = team1Wins ? finalMatch.team1Id : finalMatch.team2Id;
        runnerUpTeamId = team1Wins ? finalMatch.team2Id : finalMatch.team1Id;
      }
    } else {
      const standings = computeCrossGroupRankings(lastLevel.groups, t.format);
      winnerTeamId = standings[0]?.team.id ?? null;
      runnerUpTeamId = standings[1]?.team.id ?? null;
    }

    const allTeams = lastLevel.groups.flatMap(g => g.teams);
    const winnerTeam = allTeams.find(tm => tm.id === winnerTeamId);
    const runnerUpTeam = allTeams.find(tm => tm.id === runnerUpTeamId);

    for (const name of (winnerTeam?.players ?? [])) {
      if (!name) continue;
      const s = get(name);
      s.bonusPts += 2;
      s.points += 2;
    }
    for (const name of (runnerUpTeam?.players ?? [])) {
      if (!name) continue;
      const s = get(name);
      s.bonusPts += 1;
      s.points += 1;
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    b.points !== a.points ? b.points - a.points : b.gameWins - a.gameWins
  );
}

export function generateMatches(teams: Team[]): { team1Id: string; team2Id: string }[] {
  const pairs: { team1Id: string; team2Id: string }[] = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      pairs.push({ team1Id: teams[i].id, team2Id: teams[j].id });
    }
  }
  return pairs;
}
