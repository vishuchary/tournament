import { describe, it, expect } from 'vitest';
import {
  computeStandings,
  computeCrossGroupRankings,
  winProbability,
  computeStreaks,
  teamDisplayName,
} from '../rankings';
import type { Group, Match, Team, PlayerRatingEntry, CompetitiveMatch } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTeam(id: string, players: string[]): Team {
  return { id, name: id, type: 'singles', players };
}

function makeMatch(id: string, t1: string, t2: string, games: [number, number][], completed = true): Match {
  return { id, team1Id: t1, team2Id: t2, completed, games: games.map(([s1, s2]) => ({ team1Score: s1, team2Score: s2 })) };
}

function makeGroup(teams: Team[], matches: Match[]): Group {
  return { id: 'g1', name: 'Group 1', teams, matches };
}

function makeRating(name: string, rating: number, type: 'singles' | 'doubles' | 'combined' = 'singles'): PlayerRatingEntry {
  return { name, rating, uncertainty: 100, won: 10, lost: 5, gamesPlayed: 15, algo: 'rc', type };
}

function makeCompMatch(id: string, team1: string[], team2: string[], winner: 1 | 2, date: string): CompetitiveMatch {
  return { id, type: 'singles', team1, team2, winner, setCount: 3, date, createdAt: 0, games: [{ team1Score: 11, team2Score: 5 }] };
}

// ---------------------------------------------------------------------------
// teamDisplayName
// ---------------------------------------------------------------------------

describe('teamDisplayName', () => {
  it('returns player short names joined by underscore', () => {
    expect(teamDisplayName(makeTeam('t1', ['Alice Johnson', 'Bob Smith']))).toBe('Johnson_Smith');
  });

  it('falls back to team name when no players', () => {
    expect(teamDisplayName({ id: 't1', name: 'Team A', type: 'singles', players: [] })).toBe('Team A');
  });

  it('truncates long names to 8 chars', () => {
    expect(teamDisplayName(makeTeam('t1', ['Bartholomew']))).toBe('Bartholo');
  });
});

// ---------------------------------------------------------------------------
// computeStandings — games format
// ---------------------------------------------------------------------------

describe('computeStandings (games format)', () => {
  it('ranks by game wins', () => {
    const teams = [makeTeam('a', ['A']), makeTeam('b', ['B']), makeTeam('c', ['C'])];
    const matches = [
      makeMatch('m1', 'a', 'b', [[11, 5], [11, 6]]),  // a wins 2
      makeMatch('m2', 'a', 'c', [[11, 7], [11, 8]]),  // a wins 2
      makeMatch('m3', 'b', 'c', [[11, 3], [11, 4]]),  // b wins 2
    ];
    const standings = computeStandings(makeGroup(teams, matches), 'games');
    expect(standings[0].team.id).toBe('a'); // 4 game wins
    expect(standings[1].team.id).toBe('b'); // 2 game wins
    expect(standings[2].team.id).toBe('c'); // 0 game wins
  });

  it('uses point diff as tiebreaker', () => {
    const teams = [makeTeam('a', ['A']), makeTeam('b', ['B'])];
    const matches = [makeMatch('m1', 'a', 'b', [[11, 9], [9, 11], [11, 9]])]; // a wins
    const standings = computeStandings(makeGroup(teams, matches), 'games');
    expect(standings[0].team.id).toBe('a');
    expect(standings[0].pointDiff).toBeGreaterThan(0);
  });

  it('counts points for and against correctly', () => {
    const teams = [makeTeam('a', ['A']), makeTeam('b', ['B'])];
    const matches = [makeMatch('m1', 'a', 'b', [[11, 5], [11, 7]])];
    const standings = computeStandings(makeGroup(teams, matches), 'games');
    const a = standings.find(s => s.team.id === 'a')!;
    expect(a.pointsFor).toBe(22);
    expect(a.pointsAgainst).toBe(12);
  });

  it('skips incomplete matches', () => {
    const teams = [makeTeam('a', ['A']), makeTeam('b', ['B'])];
    const matches = [makeMatch('m1', 'a', 'b', [[11, 5]], false)];
    const standings = computeStandings(makeGroup(teams, matches), 'games');
    expect(standings[0].gameWins).toBe(0);
    expect(standings[0].matchesPlayed).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeStandings — sets format
// ---------------------------------------------------------------------------

describe('computeStandings (sets format)', () => {
  it('ranks by match wins in sets format', () => {
    const teams = [makeTeam('a', ['A']), makeTeam('b', ['B']), makeTeam('c', ['C'])];
    const matches = [
      makeMatch('m1', 'a', 'b', [[11, 5], [11, 6]]),  // a wins match
      makeMatch('m2', 'b', 'c', [[11, 4], [11, 3]]),  // b wins match
      makeMatch('m3', 'a', 'c', [[5, 11], [11, 5], [11, 7]]),  // a wins match
    ];
    const standings = computeStandings(makeGroup(teams, matches), 'sets');
    expect(standings[0].team.id).toBe('a'); // 2 match wins
    expect(standings[0].matchWins).toBe(2);
    expect(standings[1].matchWins).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// computeCrossGroupRankings
// ---------------------------------------------------------------------------

describe('computeCrossGroupRankings', () => {
  it('merges and sorts teams from multiple groups', () => {
    const teamsA = [makeTeam('a', ['A']), makeTeam('b', ['B'])];
    const teamsB = [makeTeam('c', ['C']), makeTeam('d', ['D'])];
    const matchesA = [makeMatch('m1', 'a', 'b', [[11, 5], [11, 5]])]; // a: 2gw, b: 0gw
    const matchesB = [makeMatch('m2', 'c', 'd', [[11, 8], [8, 11], [11, 9]])]; // c: 2gw, d: 1gw
    const groups = [
      { ...makeGroup(teamsA, matchesA), id: 'gA' },
      { ...makeGroup(teamsB, matchesB), id: 'gB' },
    ];
    const result = computeCrossGroupRankings(groups, 'games');
    expect(result[0].team.id).toBe('a'); // 2 gw
    expect(result[1].team.id).toBe('c'); // 2 gw, lower pointDiff
    expect(result.map(r => r.rank)).toEqual([1, 2, 3, 4]);
  });

  it('uses pre-computed standings when available', () => {
    const teams = [makeTeam('a', ['A']), makeTeam('b', ['B'])];
    const group: Group = {
      id: 'g1', name: 'G', teams, matches: [],
      standings: [
        { teamId: 'a', matchesPlayed: 1, matchWins: 1, matchLosses: 0, setWins: 2, setLosses: 0, gameWins: 2, gameLosses: 0, pointsFor: 22, pointsAgainst: 10, pointDiff: 12, rank: 1 },
        { teamId: 'b', matchesPlayed: 1, matchWins: 0, matchLosses: 1, setWins: 0, setLosses: 2, gameWins: 0, gameLosses: 2, pointsFor: 10, pointsAgainst: 22, pointDiff: -12, rank: 2 },
      ],
    };
    const result = computeCrossGroupRankings([group], 'games');
    expect(result[0].team.id).toBe('a');
    expect(result[0].gameWins).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// winProbability
// ---------------------------------------------------------------------------

describe('winProbability', () => {
  const ratings: PlayerRatingEntry[] = [
    makeRating('Strong', 1600),
    makeRating('Weak', 1200),
  ];

  it('higher rated player has >50% probability', () => {
    const result = winProbability(['Strong'], ['Weak'], ratings, 'singles', 'rc');
    expect(result).not.toBeNull();
    expect(result!.p1).toBeGreaterThan(0.9);
    expect(result!.p1 + result!.p2).toBeCloseTo(1);
  });

  it('equal ratings give 50/50', () => {
    const r = [makeRating('A', 1500), makeRating('B', 1500)];
    const result = winProbability(['A'], ['B'], r, 'singles', 'rc');
    expect(result!.p1).toBeCloseTo(0.5);
  });

  it('returns null when player not in ratings', () => {
    const result = winProbability(['Unknown'], ['Weak'], ratings, 'singles', 'rc');
    expect(result).toBeNull();
  });

  it('averages ratings for doubles teams', () => {
    const r = [makeRating('A', 1600, 'doubles'), makeRating('B', 1400, 'doubles'), makeRating('C', 1500, 'doubles'), makeRating('D', 1500, 'doubles')];
    const result = winProbability(['A', 'B'], ['C', 'D'], r, 'doubles', 'rc');
    expect(result).not.toBeNull();
    expect(result!.p1).toBeCloseTo(0.5); // avg 1500 vs avg 1500
  });

  it('falls back to all ratings if algo has none', () => {
    const r = [makeRating('A', 1600), makeRating('B', 1200)];
    const result = winProbability(['A'], ['B'], r, 'singles', 'glicko2'); // no glicko2 ratings
    expect(result).not.toBeNull();
    expect(result!.p1).toBeGreaterThan(0.5);
  });
});

// ---------------------------------------------------------------------------
// computeStreaks
// ---------------------------------------------------------------------------

describe('computeStreaks', () => {
  it('detects a win streak', () => {
    const matches: CompetitiveMatch[] = [
      makeCompMatch('m1', ['Alice'], ['Bob'], 1, '2026-01-01'),
      makeCompMatch('m2', ['Alice'], ['Charlie'], 1, '2026-01-02'),
      makeCompMatch('m3', ['Alice'], ['Dave'], 1, '2026-01-03'),
    ];
    const streaks = computeStreaks(matches);
    expect(streaks.get('Alice')).toEqual({ count: 3, type: 'win' });
  });

  it('detects a loss streak', () => {
    const matches: CompetitiveMatch[] = [
      makeCompMatch('m1', ['Alice'], ['Bob'], 2, '2026-01-01'),
      makeCompMatch('m2', ['Alice'], ['Charlie'], 2, '2026-01-02'),
    ];
    const streaks = computeStreaks(matches);
    expect(streaks.get('Alice')).toEqual({ count: 2, type: 'loss' });
  });

  it('resets streak on result change', () => {
    const matches: CompetitiveMatch[] = [
      makeCompMatch('m1', ['Alice'], ['Bob'], 1, '2026-01-01'),
      makeCompMatch('m2', ['Alice'], ['Charlie'], 2, '2026-01-02'),
      makeCompMatch('m3', ['Alice'], ['Dave'], 2, '2026-01-03'),
    ];
    const streaks = computeStreaks(matches);
    expect(streaks.get('Alice')).toEqual({ count: 2, type: 'loss' });
  });

  it('returns empty map for no matches', () => {
    expect(computeStreaks([])).toEqual(new Map());
  });

  it('sorts by date before computing', () => {
    const matches: CompetitiveMatch[] = [
      makeCompMatch('m2', ['Alice'], ['Charlie'], 2, '2026-01-03'),
      makeCompMatch('m1', ['Alice'], ['Bob'], 1, '2026-01-01'),
      makeCompMatch('m3', ['Alice'], ['Dave'], 2, '2026-01-05'),
    ];
    const streaks = computeStreaks(matches);
    // Last two results are losses → streak of 2
    expect(streaks.get('Alice')).toEqual({ count: 2, type: 'loss' });
  });
});
