import { useState, useMemo } from 'react';
import type { Player, BaselineGame, BaselineRanking, Game } from '../types';
import { saveBaselineGame, deleteBaselineGame } from '../store';

function nanoid() {
  return Math.random().toString(36).slice(2, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function gameWinner(s1: number, s2: number): 1 | 2 | null {
  if (s1 >= 11 && s1 - s2 >= 2) return 1;
  if (s2 >= 11 && s2 - s1 >= 2) return 2;
  return null;
}

function matchWinner(games: Game[], setCount: number): 1 | 2 | null {
  let t1 = 0, t2 = 0;
  for (const g of games) {
    const w = gameWinner(g.team1Score, g.team2Score);
    if (w === 1) t1++;
    else if (w === 2) t2++;
  }
  const needed = Math.ceil(setCount / 2);
  if (t1 >= needed) return 1;
  if (t2 >= needed) return 2;
  if (games.length >= setCount && t1 !== t2) return t1 > t2 ? 1 : 2;
  return null;
}

function computeBaselineRankings(games: BaselineGame[], type: 'singles' | 'doubles'): BaselineRanking[] {
  const map = new Map<string, BaselineRanking>();
  function get(name: string): BaselineRanking {
    if (!map.has(name)) map.set(name, { name, type, played: 0, wins: 0, losses: 0, points: 0 });
    return map.get(name)!;
  }
  for (const g of games) {
    if (g.type !== type) continue;
    const winners = g.winner === 1 ? g.team1 : g.team2;
    const losers  = g.winner === 1 ? g.team2 : g.team1;
    [...g.team1, ...g.team2].forEach(n => { get(n).played++; });
    winners.forEach(n => { const r = get(n); r.wins++; r.points += 2; });
    losers.forEach(n => { get(n).losses++; });
  }
  return Array.from(map.values()).sort((a, b) =>
    b.points !== a.points ? b.points - a.points : b.wins - a.wins
  );
}

type Tab = 'matches' | 'singles' | 'doubles';

interface Props {
  games: BaselineGame[];
  players: Player[];
  isAdmin: boolean;
  onBack: () => void;
}

function PlayerPicker({ label, selected, players, exclude, onChange }: {
  label: string; selected: string; players: Player[]; exclude: string[]; onChange: (v: string) => void;
}) {
  return (
    <div className="flex-1">
      <label className="text-xs text-gray-500 font-medium">{label}</label>
      <select
        value={selected}
        onChange={e => onChange(e.target.value)}
        className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">Pick player</option>
        {players.filter(p => !exclude.includes(p.name)).map(p => (
          <option key={p.id} value={p.name}>{p.name}</option>
        ))}
      </select>
    </div>
  );
}

function ScoreEntry({ games, setCount, team1Label, team2Label, onChange }: {
  games: Game[]; setCount: number; team1Label: string; team2Label: string;
  onChange: (games: Game[]) => void;
}) {
  const winsNeeded = Math.ceil(setCount / 2);

  function isActive(idx: number): boolean {
    let t1 = 0, t2 = 0;
    for (let j = 0; j < idx; j++) {
      const w = gameWinner(games[j].team1Score, games[j].team2Score);
      if (w === 1) t1++; else if (w === 2) t2++;
    }
    return t1 < winsNeeded && t2 < winsNeeded;
  }

  function setScore(idx: number, side: 'team1Score' | 'team2Score', val: string) {
    const n = Math.max(0, parseInt(val) || 0);
    onChange(games.map((g, i) => i !== idx ? g : { ...g, [side]: n }));
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-xs font-semibold text-gray-500 text-center">
        <div className="truncate">{team1Label}</div>
        <div />
        <div className="truncate">{team2Label}</div>
      </div>
      {games.map((g, i) => {
        const active = isActive(i);
        const gw = active ? gameWinner(g.team1Score, g.team2Score) : null;
        return (
          <div key={i} className={`grid grid-cols-3 gap-3 items-center transition-opacity ${!active ? 'opacity-30' : ''}`}>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              disabled={!active}
              className={`text-center border-2 rounded-xl py-3 text-2xl font-bold outline-none transition-colors w-full ${
                gw === 1 ? 'border-green-400 bg-green-50 text-green-700' : 'border-gray-200 focus:border-blue-400'
              }`}
              value={g.team1Score}
              onFocus={e => e.target.select()}
              onChange={e => setScore(i, 'team1Score', e.target.value)}
            />
            <div className="text-center text-gray-400 text-xs font-medium">Game {i + 1}</div>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              disabled={!active}
              className={`text-center border-2 rounded-xl py-3 text-2xl font-bold outline-none transition-colors w-full ${
                gw === 2 ? 'border-green-400 bg-green-50 text-green-700' : 'border-gray-200 focus:border-blue-400'
              }`}
              value={g.team2Score}
              onFocus={e => e.target.select()}
              onChange={e => setScore(i, 'team2Score', e.target.value)}
            />
          </div>
        );
      })}
    </div>
  );
}

function RankingsTab({ games, type }: { games: BaselineGame[]; type: 'singles' | 'doubles' }) {
  const rankings = computeBaselineRankings(games, type);
  const maxPts = rankings[0]?.points ?? 1;
  const MEDAL: Record<number, string> = { 1: '👑', 2: '🥈', 3: '🥉' };

  if (rankings.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p className="text-4xl mb-2">🏓</p>
        <p>No {type} games recorded yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rankings.map((r, i) => {
        const rank = i + 1;
        const pct = maxPts > 0 ? Math.max(4, (r.points / maxPts) * 100) : 0;
        const winRate = r.played > 0 ? Math.round((r.wins / r.played) * 100) : 0;
        const isPodium = rank <= 3;
        return (
          <div
            key={r.name}
            className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${
              isPodium
                ? rank === 1 ? 'border-yellow-300 bg-yellow-50'
                  : rank === 2 ? 'border-gray-300 bg-gray-50'
                  : 'border-orange-200 bg-orange-50'
                : 'border-gray-200 bg-white'
            }`}
          >
            <span className="text-sm font-bold text-gray-400 w-6 shrink-0 text-center">{MEDAL[rank] ?? rank}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-gray-900 text-sm truncate">{r.name}</p>
                <span className="font-bold text-sm shrink-0 text-gray-800">{r.points} pts</span>
              </div>
              <span className="text-xs text-gray-400">{r.wins}W · {r.losses}L · {winRate}% win rate</span>
              <div className="mt-1.5 h-1 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-400 rounded-full" style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>
        );
      })}
      <p className="text-xs text-center text-gray-400 pt-2">Win = +2 pts · Loss = 0 pts</p>
    </div>
  );
}

export default function BaselineScreen({ games, players, isAdmin, onBack }: Props) {
  const [tab, setTab] = useState<Tab>('matches');
  const [showForm, setShowForm] = useState(false);
  const [matchType, setMatchType] = useState<'singles' | 'doubles'>('singles');
  const [setCount, setSetCount] = useState(3);
  const [t1p1, setT1p1] = useState('');
  const [t1p2, setT1p2] = useState('');
  const [t2p1, setT2p1] = useState('');
  const [t2p2, setT2p2] = useState('');
  const [scoreGames, setScoreGames] = useState<Game[]>([]);
  const [saving, setSaving] = useState(false);

  const team1 = matchType === 'singles' ? [t1p1].filter(Boolean) : [t1p1, t1p2].filter(Boolean);
  const team2 = matchType === 'singles' ? [t2p1].filter(Boolean) : [t2p1, t2p2].filter(Boolean);
  const needed = matchType === 'singles' ? 1 : 2;
  const playersReady = team1.length === needed && team2.length === needed;

  // Re-initialize score rows when setCount changes
  function initGames(count: number) {
    setScoreGames(Array.from({ length: count }, () => ({ team1Score: 0, team2Score: 0 })));
  }

  const winner = playersReady && scoreGames.length > 0 ? matchWinner(scoreGames, setCount) : null;
  const formValid = playersReady && winner !== null;

  function resetForm() {
    setT1p1(''); setT1p2(''); setT2p1(''); setT2p2('');
    setScoreGames([]); setShowForm(false);
  }

  async function handleSave() {
    if (!formValid || winner === null) return;
    setSaving(true);
    const game: BaselineGame = {
      id: nanoid(),
      type: matchType,
      team1, team2,
      games: scoreGames,
      winner,
      setCount,
      date: today(),
      createdAt: Date.now(),
    };
    await saveBaselineGame(game);
    setSaving(false);
    resetForm();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this game?')) return;
    await deleteBaselineGame(id);
  }

  const sortedGames = useMemo(() => [...games].sort((a, b) => b.createdAt - a.createdAt), [games]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'matches', label: 'Matches' },
    { id: 'singles', label: 'Singles' },
    { id: 'doubles', label: 'Doubles' },
  ];

  const team1Label = team1.length > 0 ? team1.join(' & ') : 'Team 1';
  const team2Label = team2.length > 0 ? team2.join(' & ') : 'Team 2';

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-xl mx-auto p-4">

        <div className="flex items-center gap-3 mb-4">
          <button onClick={onBack} className="text-gray-500 hover:text-gray-700 text-sm shrink-0">← Back</button>
          <h1 className="text-xl font-bold text-gray-900">Baseline Games</h1>
          {isAdmin && (
            <button
              onClick={() => { setShowForm(v => !v); if (!showForm) initGames(setCount); }}
              className="ml-auto bg-blue-600 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
            >
              {showForm ? 'Cancel' : '+ Add Match'}
            </button>
          )}
        </div>

        {/* Quick entry form */}
        {showForm && isAdmin && (
          <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-5 space-y-4">

            {/* Type + games count */}
            <div className="flex gap-2">
              {(['singles', 'doubles'] as const).map(t => (
                <button key={t} onClick={() => { setMatchType(t); setT1p2(''); setT2p2(''); }}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${matchType === t ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
              <select
                value={setCount}
                onChange={e => { const v = Number(e.target.value); setSetCount(v); initGames(v); }}
                className="border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none"
              >
                <option value={1}>1 game</option>
                <option value={2}>2 games</option>
                <option value={3}>Best of 3</option>
                <option value={5}>Best of 5</option>
              </select>
            </div>

            {/* Player pickers */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Team 1</p>
              <div className="flex gap-2">
                <PlayerPicker label="Player 1" selected={t1p1} players={players} exclude={[t1p2, t2p1, t2p2].filter(Boolean)} onChange={setT1p1} />
                {matchType === 'doubles' && (
                  <PlayerPicker label="Player 2" selected={t1p2} players={players} exclude={[t1p1, t2p1, t2p2].filter(Boolean)} onChange={setT1p2} />
                )}
              </div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Team 2</p>
              <div className="flex gap-2">
                <PlayerPicker label="Player 1" selected={t2p1} players={players} exclude={[t1p1, t1p2, t2p2].filter(Boolean)} onChange={setT2p1} />
                {matchType === 'doubles' && (
                  <PlayerPicker label="Player 2" selected={t2p2} players={players} exclude={[t1p1, t1p2, t2p1].filter(Boolean)} onChange={setT2p2} />
                )}
              </div>
            </div>

            {/* Score entry — only shown when players are picked */}
            {playersReady && scoreGames.length > 0 && (
              <div className="space-y-3 pt-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Scores</p>
                <ScoreEntry
                  games={scoreGames}
                  setCount={setCount}
                  team1Label={team1Label}
                  team2Label={team2Label}
                  onChange={setScoreGames}
                />
                {winner !== null && (
                  <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 text-center text-green-700 text-sm font-semibold">
                    🏆 {winner === 1 ? team1Label : team2Label} wins
                  </div>
                )}
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={!formValid || saving}
              className="w-full py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save Match'}
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg mb-5">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Matches tab */}
        {tab === 'matches' && (
          <div className="space-y-2">
            {sortedGames.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <p className="text-4xl mb-2">🏓</p>
                <p>No baseline games yet</p>
                {isAdmin && <p className="text-sm mt-1">Tap "+ Add Match" to record a game</p>}
              </div>
            ) : sortedGames.map(g => {
              const winnerTeam = g.winner === 1 ? g.team1 : g.team2;
              const loserTeam  = g.winner === 1 ? g.team2 : g.team1;
              const t1wins = g.games?.filter(x => gameWinner(x.team1Score, x.team2Score) === 1).length ?? 0;
              const t2wins = g.games?.filter(x => gameWinner(x.team1Score, x.team2Score) === 2).length ?? 0;
              const scoreStr = g.winner === 1 ? `${t1wins}-${t2wins}` : `${t2wins}-${t1wins}`;
              return (
                <div key={g.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900">{winnerTeam.join(' & ')}</span>
                        <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">Won {scoreStr}</span>
                        <span className="text-sm text-gray-400">vs</span>
                        <span className="text-sm text-gray-600">{loserTeam.join(' & ')}</span>
                      </div>
                      {g.games && g.games.length > 0 && (
                        <p className="text-xs text-gray-400 mt-1">
                          {g.games.map(x => `${x.team1Score}-${x.team2Score}`).join(', ')}
                        </p>
                      )}
                      <p className="text-xs text-gray-400 mt-0.5">
                        {g.type} · {new Date(g.date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                    {isAdmin && (
                      <button onClick={() => handleDelete(g.id)} className="text-gray-300 hover:text-red-400 text-lg shrink-0 transition-colors">×</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'singles' && <RankingsTab games={games} type="singles" />}
        {tab === 'doubles' && <RankingsTab games={games} type="doubles" />}
      </div>
    </div>
  );
}
