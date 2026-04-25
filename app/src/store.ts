import { ref, set, remove, onValue, off } from 'firebase/database';
import { db } from './firebase';
import type { Tournament, TournamentLevel, Group, Match, Player } from './types';
import type { PlayerRanking } from './rankings';

// Firebase drops empty arrays and converts arrays to objects with numeric keys.
// This normalises them back to proper JS arrays on read.
function toArray<T>(val: unknown): T[] {
  if (!val) return [];
  if (Array.isArray(val)) return val as T[];
  return Object.values(val as object) as T[];
}

function normalizeGroup(g: any): Group {
  return {
    ...g,
    teams: toArray(g.teams).map((t: any) => ({
      ...t,
      players: toArray<string>(t.players),
    })),
    matches: toArray<Match>(g.matches).map((m: any) => ({
      ...m,
      games: toArray(m.games),
    })),
  };
}

function normalizeTournament(raw: any): Tournament {
  // Old format: groups stored directly on tournament (before multi-level support)
  if (raw.groups && !raw.levels) {
    return {
      id: raw.id,
      name: raw.name,
      format: raw.format,
      matchType: raw.matchType,
      createdAt: raw.createdAt,
      levels: [{
        id: raw.id + '_l1',
        name: 'Level 1',
        groups: toArray<Group>(raw.groups).map(normalizeGroup),
      }],
    };
  }

  return {
    ...raw,
    levels: toArray<TournamentLevel>(raw.levels).map((level: any) => ({
      ...level,
      groups: toArray<Group>(level.groups).map(normalizeGroup),
    })),
  };
}

export function subscribeTournaments(callback: (tournaments: Tournament[]) => void): () => void {
  const tournamentsRef = ref(db, 'tournaments');
  const listener = onValue(tournamentsRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) { callback([]); return; }
    const list = (Object.values(data) as Tournament[]).map(normalizeTournament);
    list.sort((a, b) => b.createdAt - a.createdAt);
    callback(list);
  });
  return () => off(tournamentsRef, 'value', listener);
}

export function saveTournament(t: Tournament): Promise<void> {
  return set(ref(db, `tournaments/${t.id}`), t)
    .catch(err => console.error('Firebase save failed:', err));
}

export function deleteTournament(id: string): Promise<void> {
  return remove(ref(db, `tournaments/${id}`))
    .catch(err => console.error('Firebase delete failed:', err));
}

export function subscribePlayers(callback: (players: Player[]) => void): () => void {
  const playersRef = ref(db, 'players');
  const listener = onValue(playersRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) { callback([]); return; }
    const list = Object.values(data) as Player[];
    list.sort((a, b) => a.name.localeCompare(b.name));
    callback(list);
  });
  return () => off(playersRef, 'value', listener);
}

export function savePlayer(p: Player): Promise<void> {
  return set(ref(db, `players/${p.id}`), p)
    .catch(err => console.error('Firebase save player failed:', err));
}

export function deletePlayer(id: string): Promise<void> {
  return remove(ref(db, `players/${id}`))
    .catch(err => console.error('Firebase delete player failed:', err));
}

function sanitizeKey(name: string): string {
  return name.replace(/[.#$[\]/]/g, '_');
}

export function saveRankings(rankings: PlayerRanking[]): Promise<void> {
  const obj = Object.fromEntries(rankings.map(r => [sanitizeKey(r.name), r]));
  return set(ref(db, 'rankings'), obj)
    .catch(err => console.error('Firebase save rankings failed:', err));
}

export function subscribeRankings(callback: (rankings: PlayerRanking[]) => void): () => void {
  const rankingsRef = ref(db, 'rankings');
  const listener = onValue(rankingsRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) { callback([]); return; }
    const list = Object.values(data) as PlayerRanking[];
    list.sort((a, b) => b.points !== a.points ? b.points - a.points : b.gameWins - a.gameWins);
    callback(list);
  });
  return () => off(rankingsRef, 'value', listener);
}
