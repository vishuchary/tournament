import { useState, useMemo, useRef } from 'react';
import type { CompetitiveMatch, Player, Game, PlayerRatingEntry } from '../types';
import { saveCompetitiveMatch, deleteCompetitiveMatch, type RatingAlgo } from '../store';
import { winProbability } from '../rankings';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(d: string): string {
  if (!d) return 'Unknown date';
  return new Date(d + 'T12:00:00').toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

function gameWinner(s1: number, s2: number): 1 | 2 | null {
  if (s1 >= 11 && s1 - s2 >= 2) return 1;
  if (s2 >= 11 && s2 - s1 >= 2) return 2;
  return null;
}

function computeMatchWinner(games: { t1: number; t2: number }[]): 1 | 2 {
  let t1 = 0, t2 = 0;
  for (const g of games) {
    const w = gameWinner(g.t1, g.t2);
    if (w === 1) t1++;
    else if (w === 2) t2++;
  }
  return t1 >= t2 ? 1 : 2;
}

function groupByDate(matches: CompetitiveMatch[]): [string, CompetitiveMatch[]][] {
  const map = new Map<string, CompetitiveMatch[]>();
  for (const m of matches) {
    const key = m.date || '';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(m);
  }
  return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}

function uid(): string {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
}

// ---------------------------------------------------------------------------
// PlayerPicker
// ---------------------------------------------------------------------------
function PlayerPicker({
  value, onChange, players, exclude, placeholder,
}: {
  value: string; onChange: (v: string) => void;
  players: Player[]; exclude: string[]; placeholder: string;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="flex-1 min-w-0 text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
    >
      <option value="">{placeholder}</option>
      {players.map(p => (
        <option key={p.id} value={p.name} disabled={exclude.includes(p.name) && p.name !== value}>
          {p.name}
        </option>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------------------
// MatchCard
// ---------------------------------------------------------------------------
function MatchCard({
  match, filterPlayer, isAdmin, onFilter, onDelete, onDateChange,
}: {
  match: CompetitiveMatch;
  filterPlayer: string | null;
  isAdmin: boolean;
  onFilter: (name: string) => void;
  onDelete: (id: string) => void;
  onDateChange: (id: string, date: string) => void;
}) {
  const [editingDate, setEditingDate] = useState(false);
  const dateRef = useRef<HTMLInputElement>(null);
  const playerWon = filterPlayer
    ? (match.team1.includes(filterPlayer) ? match.winner === 1 : match.winner === 2)
    : null;

  return (
    <div className={`bg-white rounded-xl border px-4 py-3 ${
      playerWon === true ? 'border-green-200 bg-green-50/30' :
      playerWon === false ? 'border-red-100 bg-red-50/20' :
      'border-gray-200'
    }`}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
              match.type === 'singles' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
            }`}>{match.type === 'singles' ? 'Singles' : 'Doubles'}</span>
            {playerWon !== null && (
              <span className={`text-xs font-semibold ${playerWon ? 'text-green-600' : 'text-red-500'}`}>
                {playerWon ? 'Won' : 'Lost'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap text-sm">
            <span className={match.winner === 1 ? 'font-semibold text-gray-900' : 'text-gray-500'}>
              {match.team1.map((name, i) => (
                <button
                  key={name}
                  onClick={() => onFilter(name)}
                  className={`hover:text-blue-600 hover:underline ${name === filterPlayer ? 'text-blue-600 underline' : ''}`}
                >
                  {name}{i < match.team1.length - 1 ? ' + ' : ''}
                </button>
              ))}
            </span>
            <span className="text-gray-400 text-xs">vs</span>
            <span className={match.winner === 2 ? 'font-semibold text-gray-900' : 'text-gray-500'}>
              {match.team2.map((name, i) => (
                <button
                  key={name}
                  onClick={() => onFilter(name)}
                  className={`hover:text-blue-600 hover:underline ${name === filterPlayer ? 'text-blue-600 underline' : ''}`}
                >
                  {name}{i < match.team2.length - 1 ? ' + ' : ''}
                </button>
              ))}
            </span>
          </div>
          <div className="flex items-center justify-between mt-1.5 gap-2 flex-wrap">
            <div className="flex gap-2 flex-wrap">
              {match.games.map((g, i) => {
                const w = gameWinner(g.team1Score, g.team2Score);
                return (
                  <span key={i} className="text-xs text-gray-400">
                    <span className={w === 1 ? 'text-gray-800 font-medium' : ''}>{g.team1Score}</span>
                    <span className="mx-0.5">–</span>
                    <span className={w === 2 ? 'text-gray-800 font-medium' : ''}>{g.team2Score}</span>
                  </span>
                );
              })}
            </div>
            {isAdmin && (
              editingDate ? (
                <input
                  ref={dateRef}
                  type="date"
                  defaultValue={match.date}
                  autoFocus
                  onBlur={e => {
                    if (e.target.value && e.target.value !== match.date) onDateChange(match.id, e.target.value);
                    setEditingDate(false);
                  }}
                  onChange={e => {
                    if (e.target.value && e.target.value !== match.date) {
                      onDateChange(match.id, e.target.value);
                      setEditingDate(false);
                    }
                  }}
                  className="text-xs border border-blue-300 rounded-lg px-2 py-1 outline-none focus:border-blue-500"
                />
              ) : (
                <button
                  onClick={() => setEditingDate(true)}
                  className="text-xs text-gray-400 hover:text-blue-500 hover:underline transition-colors"
                >
                  {match.date} ✏️
                </button>
              )
            )}
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={() => onDelete(match.id)}
            className="text-gray-300 hover:text-red-400 transition-colors text-xl leading-none shrink-0 mt-0.5"
            title="Delete match"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add Match Form
// ---------------------------------------------------------------------------
interface FormState {
  type: 'singles' | 'doubles';
  team1: [string, string];
  team2: [string, string];
  date: string;
  setCount: number;
  games: { t1: string; t2: string }[];
}

function makeGames(n: number): { t1: string; t2: string }[] {
  return Array.from({ length: n }, () => ({ t1: '', t2: '' }));
}

const DEFAULT_FORM: FormState = {
  type: 'singles',
  team1: ['', ''],
  team2: ['', ''],
  date: today(),
  setCount: 3,
  games: makeGames(3),
};

function AddMatchForm({
  players, ratings, algo, onSave, onCancel,
}: {
  players: Player[];
  ratings: PlayerRatingEntry[];
  algo: RatingAlgo;
  onSave: (m: CompetitiveMatch) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const numPlayers = form.type === 'singles' ? 1 : 2;
  const allSelected = [...form.team1.slice(0, numPlayers), ...form.team2.slice(0, numPlayers)].filter(Boolean);

  const t1Players = form.team1.slice(0, numPlayers).filter(Boolean);
  const t2Players = form.team2.slice(0, numPlayers).filter(Boolean);
  const pred = t1Players.length === numPlayers && t2Players.length === numPlayers
    ? winProbability(t1Players, t2Players, ratings, form.type, algo)
    : null;

  function setType(type: 'singles' | 'doubles') {
    setForm(f => ({ ...f, type, team1: ['', ''], team2: ['', ''] }));
  }

  function setSetCount(n: number) {
    setForm(f => ({
      ...f, setCount: n,
      games: Array.from({ length: n }, (_, i) => f.games[i] ?? { t1: '', t2: '' }),
    }));
  }

  function updateGame(i: number, field: 't1' | 't2', v: string) {
    setForm(f => ({ ...f, games: f.games.map((g, j) => j === i ? { ...g, [field]: v } : g) }));
  }

  async function handleSave() {
    const t1 = form.team1.slice(0, numPlayers).filter(Boolean);
    const t2 = form.team2.slice(0, numPlayers).filter(Boolean);
    if (t1.length < numPlayers) return setError('Select all Team 1 players');
    if (t2.length < numPlayers) return setError('Select all Team 2 players');

    const validGames: Game[] = form.games
      .map(g => ({ team1Score: parseInt(g.t1), team2Score: parseInt(g.t2) }))
      .filter(g => !isNaN(g.team1Score) && !isNaN(g.team2Score));

    if (validGames.length === 0) return setError('Enter at least one game score');

    const rawWinner = computeMatchWinner(form.games.map(g => ({
      t1: parseInt(g.t1) || 0, t2: parseInt(g.t2) || 0,
    })));

    const match: CompetitiveMatch = {
      id: uid(),
      type: form.type,
      team1: t1,
      team2: t2,
      games: validGames,
      winner: rawWinner,
      setCount: form.setCount,
      date: form.date,
      createdAt: Date.now(),
    };

    setSaving(true);
    setError('');
    try {
      await onSave(match);
    } catch {
      setError('Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-blue-200 p-4 mb-4 space-y-3">
      {/* Type */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
        {(['singles', 'doubles'] as const).map(t => (
          <button key={t} onClick={() => setType(t)}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
              form.type === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Players */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 w-14 shrink-0">Team 1</span>
          <PlayerPicker value={form.team1[0]} onChange={v => setForm(f => ({ ...f, team1: [v, f.team1[1]] }))}
            players={players} exclude={allSelected.filter(n => n !== form.team1[0])} placeholder="Player A" />
          {form.type === 'doubles' && (
            <PlayerPicker value={form.team1[1]} onChange={v => setForm(f => ({ ...f, team1: [f.team1[0], v] }))}
              players={players} exclude={allSelected.filter(n => n !== form.team1[1])} placeholder="Player B" />
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 w-14 shrink-0">Team 2</span>
          <PlayerPicker value={form.team2[0]} onChange={v => setForm(f => ({ ...f, team2: [v, f.team2[1]] }))}
            players={players} exclude={allSelected.filter(n => n !== form.team2[0])} placeholder="Player C" />
          {form.type === 'doubles' && (
            <PlayerPicker value={form.team2[1]} onChange={v => setForm(f => ({ ...f, team2: [f.team2[0], v] }))}
              players={players} exclude={allSelected.filter(n => n !== form.team2[1])} placeholder="Player D" />
          )}
        </div>
      </div>

      {/* Prediction */}
      {pred && (
        <div className="flex flex-col gap-1 px-1">
          <div className="flex w-full h-2 rounded-full overflow-hidden">
            <div className="bg-blue-400 h-full transition-all" style={{ width: `${pred.p1 * 100}%` }} />
            <div className="bg-orange-300 h-full flex-1" />
          </div>
          <div className="flex justify-between text-xs text-gray-400">
            <span className="text-blue-500 font-medium">{Math.round(pred.p1 * 100)}% likely</span>
            <span className="text-gray-400">predicted win</span>
            <span className="text-orange-400 font-medium">{Math.round(pred.p2 * 100)}% likely</span>
          </div>
        </div>
      )}

      {/* Date + sets */}
      <div className="flex gap-2">
        <input type="date" value={form.date}
          onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
          className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5" />
        <select value={form.setCount} onChange={e => setSetCount(parseInt(e.target.value))}
          className="text-sm border border-gray-200 rounded-lg px-2 py-1.5">
          {[1, 2, 3, 5].map(n => <option key={n} value={n}>{n} game{n > 1 ? 's' : ''}</option>)}
        </select>
      </div>

      {/* Game scores */}
      <div className="space-y-1.5">
        {form.games.map((g, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-14 shrink-0 text-right">Game {i + 1}</span>
            <input type="number" min={0} max={99} value={g.t1}
              onChange={e => updateGame(i, 't1', e.target.value)}
              className="w-16 text-sm border border-gray-200 rounded-lg px-2 py-1.5 text-center" placeholder="0" />
            <span className="text-gray-400">–</span>
            <input type="number" min={0} max={99} value={g.t2}
              onChange={e => updateGame(i, 't2', e.target.value)}
              className="w-16 text-sm border border-gray-200 rounded-lg px-2 py-1.5 text-center" placeholder="0" />
          </div>
        ))}
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex gap-2">
        <button onClick={onCancel}
          className="flex-1 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
          Cancel
        </button>
        <button onClick={handleSave} disabled={saving}
          className="flex-1 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
          {saving ? 'Saving…' : 'Save Match'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
interface Props {
  matches: CompetitiveMatch[];
  players: Player[];
  isAdmin: boolean;
  ratings: PlayerRatingEntry[];
  algo: RatingAlgo;
  onBack: () => void;
  onDataChange: () => void;
}

export default function CompetitiveGamesScreen({ matches, players, isAdmin, ratings, algo, onBack, onDataChange }: Props) {
  const [filterPlayer, setFilterPlayer] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const filtered = useMemo(() =>
    filterPlayer
      ? matches.filter(m => [...m.team1, ...m.team2].includes(filterPlayer))
      : matches,
    [matches, filterPlayer],
  );

  const playerStats = useMemo(() => {
    if (!filterPlayer) return null;
    let wins = 0, losses = 0;
    for (const m of filtered) {
      const onT1 = m.team1.includes(filterPlayer);
      if (onT1 ? m.winner === 1 : m.winner === 2) wins++; else losses++;
    }
    return { wins, losses };
  }, [filtered, filterPlayer]);

  const grouped = useMemo(() => groupByDate(filtered), [filtered]);

  function handleFilter(name: string) {
    setFilterPlayer(prev => prev === name ? null : name);
    setShowAdd(false);
  }

  async function handleSave(match: CompetitiveMatch) {
    await saveCompetitiveMatch(match);
    onDataChange();
    setShowAdd(false);
  }

  async function handleDelete(id: string) {
    await deleteCompetitiveMatch(id);
    onDataChange();
  }

  async function handleDateChange(id: string, date: string) {
    const match = matches.find(m => m.id === id);
    if (!match) return;
    await saveCompetitiveMatch({ ...match, date });
    onDataChange();
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-xl mx-auto p-4">

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <button onClick={onBack} className="text-gray-500 hover:text-gray-700 text-sm shrink-0">← Back</button>
          <h1 className="text-xl font-bold text-gray-900 flex-1">Competitive Games</h1>
          <span className="text-xs text-gray-400 shrink-0">{matches.length} match{matches.length !== 1 ? 'es' : ''}</span>
          {isAdmin && (
            <button
              onClick={() => { setShowAdd(s => !s); setFilterPlayer(null); }}
              className={`text-xs px-3 py-1.5 rounded-lg transition-colors shrink-0 ${
                showAdd
                  ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {showAdd ? 'Cancel' : '+ Add Match'}
            </button>
          )}
        </div>

        {/* Player filter bar */}
        {filterPlayer && (
          <div className="flex items-center gap-3 mb-4 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-blue-900">{filterPlayer}</p>
              {playerStats && (
                <p className="text-xs text-blue-600">
                  {playerStats.wins}W · {playerStats.losses}L · {filtered.length} match{filtered.length !== 1 ? 'es' : ''}
                </p>
              )}
            </div>
            <button onClick={() => setFilterPlayer(null)}
              className="text-blue-400 hover:text-blue-700 text-xs font-medium shrink-0">
              ✕ Clear filter
            </button>
          </div>
        )}

        {/* Add form */}
        {showAdd && (
          <AddMatchForm
            players={players}
            ratings={ratings}
            algo={algo}
            onSave={handleSave}
            onCancel={() => setShowAdd(false)}
          />
        )}

        {/* Match list */}
        {grouped.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-4xl mb-2">🏓</p>
            <p className="text-base">
              {filterPlayer ? `No matches recorded for ${filterPlayer}` : 'No competitive matches yet'}
            </p>
            {isAdmin && !showAdd && !filterPlayer && (
              <p className="text-sm mt-1">Tap "+ Add Match" to record a game</p>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            {grouped.map(([date, dayMatches]) => (
              <div key={date}>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  {formatDate(date)}
                </p>
                <div className="space-y-2">
                  {dayMatches.map(m => (
                    <MatchCard
                      key={m.id}
                      match={m}
                      filterPlayer={filterPlayer}
                      isAdmin={isAdmin}
                      onFilter={handleFilter}
                      onDelete={handleDelete}
                      onDateChange={handleDateChange}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
