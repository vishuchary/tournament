import {
  collection, doc, setDoc, deleteDoc,
  onSnapshot, query, orderBy, getDocs, getDoc,
} from 'firebase/firestore';
import { db, auth } from './firebase';
import type { Tournament, TournamentSummary, TournamentLevel, Group, Match, Player, PlayerRatingEntry, CompetitiveMatch } from './types';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'https://backend-five-gules-97.vercel.app';

// ---------------------------------------------------------------------------
// Firestore helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Backend API helpers
// ---------------------------------------------------------------------------

async function getAuthToken(): Promise<string> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Not authenticated');
  return token;
}

async function backendPost(path: string, body: unknown): Promise<void> {
  const token = await getAuthToken();
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Backend error ${res.status}: ${text}`);
  }
}

async function backendDelete(path: string): Promise<void> {
  const token = await getAuthToken();
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Backend error ${res.status}: ${text}`);
  }
}

// ---------------------------------------------------------------------------
// Backend API calls (admin-only)
// ---------------------------------------------------------------------------

export async function triggerBaselineRatingsRecompute(token: string): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const res = await fetch(`${BACKEND_URL}/ratings/recompute`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`Backend error ${res.status}: ${text}`);
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('Recompute timed out (>45s) — backend may be overloaded');
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

export interface PlayerStatsBucket {
  matchesPlayed: number;
  matchWins: number;
  gameWins: number;
  gameLosses: number;
  pointsFor: number;
  pointsAgainst: number;
}

export interface PlayerStats {
  name: string;
  overall: PlayerStatsBucket;
  singles: PlayerStatsBucket;
  doubles: PlayerStatsBucket;
  tournaments: { id: string; name: string; date?: string; matchType?: string; result: 'winner' | 'runner-up' | null }[];
  tournamentPerf: { id: string; name: string; date?: string; gameWins: number; gameLosses: number }[];
}

export async function fetchRatingHistory(
  name: string,
  algo: RatingAlgo,
): Promise<{ date: string; rating: number }[]> {
  const sanitized = name.replace(/[.#$[\]/]/g, '_');
  const snap = await getDoc(doc(db, 'rating_history', `${sanitized}_${algo}`));
  if (!snap.exists()) return [];
  const snapshots = (snap.data().snapshots ?? {}) as Record<string, number>;
  return Object.entries(snapshots)
    .map(([date, rating]) => ({ date, rating }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function subscribePlayerStats(
  name: string,
  callback: (stats: PlayerStats | null) => void,
): () => void {
  return onSnapshot(doc(db, 'player_stats', name), snap => {
    callback(snap.exists() ? (snap.data() as PlayerStats) : null);
  });
}

export async function renamePlayer(oldName: string, newName: string, token: string): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/ratings/rename-player`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ oldName, newName }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Rename failed ${res.status}: ${text}`);
  }
}

// ---------------------------------------------------------------------------
// Tournaments
// ---------------------------------------------------------------------------

export function computeTournamentSummary(t: Tournament): TournamentSummary {
  const allMatches = t.levels.flatMap(l => l.groups.flatMap(g => g.matches));
  const completedMatches = allMatches.filter(m => m.completed);
  const completedCount = completedMatches.length;
  const completedGames = completedMatches.flatMap(m => m.games).length;
  let status: TournamentSummary['status'];
  if (allMatches.length === 0 || completedCount === 0) status = 'not-started';
  else if (completedCount === allMatches.length) status = 'completed';
  else status = 'in-progress';
  return {
    id: t.id,
    name: t.name,
    date: t.date,
    format: t.format,
    setCount: t.setCount,
    matchType: t.matchType,
    status,
    matchCount: allMatches.length,
    completedCount,
    completedGames,
    levelCount: t.levels.length,
    level1Groups: t.levels[0]?.groups.length ?? 0,
    createdAt: t.createdAt,
  };
}

// Real-time subscription to all summaries (lightweight — home screen)
export function subscribeTournamentSummaries(callback: (summaries: TournamentSummary[]) => void): () => void {
  const q = query(collection(db, 'tournament_summaries'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, snapshot => {
    callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as TournamentSummary)));
  });
}

// Real-time subscription to a single full tournament (tournament view)
export function subscribeTournament(id: string, callback: (t: Tournament | null) => void): () => void {
  return onSnapshot(doc(db, 'tournaments', id), snap => {
    if (!snap.exists()) { callback(null); return; }
    callback(normalizeTournament({ id: snap.id, ...snap.data() }));
  });
}

// One-time fetch of all full tournaments (player stats, migration)
export async function fetchTournaments(): Promise<Tournament[]> {
  const q = query(collection(db, 'tournaments'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => normalizeTournament({ id: d.id, ...d.data() }));
}

export function saveTournament(t: Tournament): Promise<void> {
  return backendPost('/tournaments/save', t)
    .catch(err => console.error('Save tournament failed:', err));
}

export function deleteTournament(id: string): Promise<void> {
  return backendDelete(`/tournaments/${id}`)
    .catch(err => console.error('Delete tournament failed:', err));
}

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

export function subscribePlayers(callback: (players: Player[]) => void): () => void {
  const q = query(collection(db, 'players'), orderBy('name'));
  return onSnapshot(q, snapshot => {
    const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Player));
    callback(list);
  });
}

export function savePlayer(p: Player): Promise<void> {
  return setDoc(doc(db, 'players', p.id), p)
    .catch(err => console.error('Firestore save player failed:', err));
}

export function deletePlayer(id: string): Promise<void> {
  return deleteDoc(doc(db, 'players', id))
    .catch(err => console.error('Firestore delete player failed:', err));
}

// ---------------------------------------------------------------------------
// Competitive matches
// ---------------------------------------------------------------------------

export function subscribeCompetitiveMatches(callback: (matches: CompetitiveMatch[]) => void): () => void {
  const q = query(collection(db, 'competitive_matches'), orderBy('createdAt', 'desc'));
  const unsub = onSnapshot(q,
    snapshot => callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as CompetitiveMatch))),
    () => {
      // orderBy query failed (likely missing index or field) — fall back to unordered
      const unsub2 = onSnapshot(collection(db, 'competitive_matches'),
        snapshot => callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as CompetitiveMatch))),
      );
      return unsub2;
    },
  );
  return unsub;
}

export function saveCompetitiveMatch(m: CompetitiveMatch): Promise<void> {
  return backendPost('/competitive-matches/save', m)
    .catch(err => console.error('Save competitive match failed:', err));
}

export function deleteCompetitiveMatch(id: string): Promise<void> {
  return backendDelete(`/competitive-matches/${id}`)
    .catch(err => console.error('Delete competitive match failed:', err));
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Ratings (written by backend Python, read here)
// ---------------------------------------------------------------------------

export function subscribeBaselineRatings(
  callback: (ratings: PlayerRatingEntry[]) => void,
): () => void {
  return onSnapshot(collection(db, 'ratings'), snapshot => {
    callback(snapshot.docs.map(d => d.data() as PlayerRatingEntry));
  });
}

// ---------------------------------------------------------------------------
// Algorithm setting — admin writes, all read
// ---------------------------------------------------------------------------

export type RatingAlgo = 'rc' | 'glicko2';

export function subscribeAlgoSetting(callback: (algo: RatingAlgo) => void): () => void {
  return onSnapshot(doc(db, 'settings', 'algo'), snap => {
    const data = snap.data();
    callback((data?.algo as RatingAlgo) ?? 'rc');
  });
}

export function saveAlgoSetting(algo: RatingAlgo): Promise<void> {
  return setDoc(doc(db, 'settings', 'algo'), { algo }, { merge: true })
    .catch(err => console.error('Firestore save algo setting failed:', err));
}

export function subscribeTopRankers(callback: (n: number) => void): () => void {
  return onSnapshot(doc(db, 'settings', 'algo'), snap => {
    const data = snap.data();
    callback(typeof data?.topRankers === 'number' ? data.topRankers : 10);
  });
}

export function saveTopRankers(n: number): Promise<void> {
  return setDoc(doc(db, 'settings', 'algo'), { topRankers: n }, { merge: true })
    .catch(err => console.error('Firestore save topRankers failed:', err));
}
