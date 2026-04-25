import { useState } from 'react';
import type { Match, Team, MatchFormat, Game } from '../types';
import { teamDisplayName } from '../rankings';

interface Props {
  match: Match;
  team1: Team;
  team2: Team;
  format: MatchFormat;
  setCount: number;
  readOnly?: boolean;
  onSave: (match: Match) => void;
  onCancel: () => void;
}

function gameWinner(s1: number, s2: number): 'team1' | 'team2' | null {
  if (s1 >= 11 && s1 - s2 >= 2) return 'team1';
  if (s2 >= 11 && s2 - s1 >= 2) return 'team2';
  return null;
}

export default function MatchEntry({ match, team1, team2, format, setCount, readOnly = false, onSave, onCancel }: Props) {
  const initialGames: Game[] = Array.from({ length: setCount }, (_, i) => ({
    team1Score: match.games[i]?.team1Score ?? 0,
    team2Score: match.games[i]?.team2Score ?? 0,
  }));
  const [games, setGames] = useState<Game[]>(initialGames);

  function setScore(gameIdx: number, side: 'team1Score' | 'team2Score', val: string) {
    const n = Math.max(0, parseInt(val) || 0);
    setGames(prev => prev.map((g, i) => i !== gameIdx ? g : { ...g, [side]: n }));
  }

  // For sets: a set is "active" only if the winner hasn't been decided yet
  const winsNeeded = Math.ceil(setCount / 2);
  function isActive(rowIdx: number): boolean {
    if (format !== 'sets') return true;
    let t1 = 0, t2 = 0;
    for (let j = 0; j < rowIdx; j++) {
      const w = gameWinner(games[j].team1Score, games[j].team2Score);
      if (w === 'team1') t1++;
      else if (w === 'team2') t2++;
    }
    return t1 < winsNeeded && t2 < winsNeeded;
  }

  function getWinner(): string | null {
    let t1 = 0, t2 = 0;
    for (const g of games) {
      const w = gameWinner(g.team1Score, g.team2Score);
      if (w === 'team1') t1++;
      else if (w === 'team2') t2++;
    }
    if (t1 > t2) return teamDisplayName(team1);
    if (t2 > t1) return teamDisplayName(team2);
    return null;
  }

  function handleSave() {
    let gamesToSave = games;
    if (format === 'sets') {
      // Trim trailing unplayed sets (0-0) beyond the deciding set
      let t1 = 0, t2 = 0;
      const cutAt = games.findIndex(g => {
        const w = gameWinner(g.team1Score, g.team2Score);
        if (w === 'team1') t1++;
        else if (w === 'team2') t2++;
        return t1 >= winsNeeded || t2 >= winsNeeded;
      });
      if (cutAt >= 0) gamesToSave = games.slice(0, cutAt + 1);
    }
    onSave({ ...match, games: gamesToSave, completed: true });
  }

  const winner = getWinner();
  const formatLabel = format === 'sets'
    ? `Best of ${setCount} Set${setCount !== 1 ? 's' : ''}`
    : `${setCount} Game${setCount !== 1 ? 's' : ''}`;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex flex-col justify-end sm:justify-center sm:items-center sm:p-4">
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{readOnly ? 'Match Scores' : 'Enter Scores'}</h2>
            <p className="text-sm text-gray-500">{formatLabel}</p>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-2xl leading-none px-1">×</button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Team name headers */}
          <div className="grid grid-cols-3 gap-2 text-sm font-semibold text-gray-700">
            <div className="text-center truncate">{teamDisplayName(team1)}</div>
            <div />
            <div className="text-center truncate">{teamDisplayName(team2)}</div>
          </div>

          {/* Score rows */}
          {games.map((g, i) => {
            const active = isActive(i);
            const gw = active ? gameWinner(g.team1Score, g.team2Score) : null;
            const t1w = gw === 'team1';
            const t2w = gw === 'team2';
            return (
              <div key={i} className={`grid grid-cols-3 gap-3 items-center transition-opacity ${!active ? 'opacity-30' : ''}`}>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  readOnly={readOnly || !active}
                  className={`text-center border-2 rounded-xl py-3 text-2xl font-bold outline-none transition-colors ${
                    t1w ? 'border-green-400 bg-green-50 text-green-700' : 'border-gray-200 focus:border-blue-400'
                  } ${(readOnly || !active) ? 'cursor-default' : ''}`}
                  value={g.team1Score}
                  onFocus={e => !readOnly && active && e.target.select()}
                  onChange={e => !readOnly && active && setScore(i, 'team1Score', e.target.value)}
                />
                <div className="text-center text-gray-400 text-sm font-medium">
                  {format === 'sets' ? `Set ${i + 1}` : `Game ${i + 1}`}
                </div>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  readOnly={readOnly || !active}
                  className={`text-center border-2 rounded-xl py-3 text-2xl font-bold outline-none transition-colors ${
                    t2w ? 'border-green-400 bg-green-50 text-green-700' : 'border-gray-200 focus:border-blue-400'
                  } ${(readOnly || !active) ? 'cursor-default' : ''}`}
                  value={g.team2Score}
                  onFocus={e => !readOnly && active && e.target.select()}
                  onChange={e => !readOnly && active && setScore(i, 'team2Score', e.target.value)}
                />
              </div>
            );
          })}

          {/* Winner / Tie */}
          {winner && (
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-center text-green-700 font-semibold">
              🏆 {winner} wins
            </div>
          )}
          {!winner && games.some(g => g.team1Score > 0 || g.team2Score > 0) && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-center text-yellow-700 text-sm">
              Tie
            </div>
          )}
        </div>

        {/* Footer */}
        {readOnly ? (
          <div className="p-5 border-t border-gray-100 shrink-0">
            <p className="text-center text-sm text-gray-400">🔒 View only</p>
          </div>
        ) : (
          <div className="p-5 border-t border-gray-100 flex gap-3 shrink-0">
            {match.completed && (
              <button
                onClick={() => onSave({ ...match, games: [], completed: false })}
                className="px-4 py-3 rounded-xl text-sm text-red-400 hover:text-red-600 border border-red-200 hover:border-red-300 transition-colors"
              >
                Clear
              </button>
            )}
            <button
              onClick={handleSave}
              className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-semibold text-lg hover:bg-blue-700 transition-colors"
            >
              Save Score
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
