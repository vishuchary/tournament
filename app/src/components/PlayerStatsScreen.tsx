import { computePlayerStats, type PlayerStats } from '../rankings';
import type { Tournament } from '../types';

interface Props {
  playerName: string;
  tournaments: Tournament[];
  onBack: () => void;
}

function pct(wins: number, total: number) {
  if (total === 0) return '—';
  return `${Math.round((wins / total) * 100)}%`;
}

function StatBox({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      <p className="text-xs text-gray-500 mt-1 font-medium uppercase tracking-wide">{label}</p>
    </div>
  );
}

function BucketSection({ label, b }: { label: string; b: PlayerStats['overall'] }) {
  if (b.matchesPlayed === 0) return null;
  const winRate = pct(b.matchWins, b.matchesPlayed);
  const gwRate = pct(b.gameWins, b.gameWins + b.gameLosses);
  const pointDiff = b.pointsFor - b.pointsAgainst;

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">{label}</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatBox label="Matches" value={b.matchesPlayed} sub={`${b.matchWins}W · ${b.matchesPlayed - b.matchWins}L`} />
        <StatBox label="Win Rate" value={winRate} />
        <StatBox label="Games" value={`${b.gameWins}W · ${b.gameLosses}L`} sub={`${gwRate} game win rate`} />
        <StatBox label="Pt Diff" value={pointDiff > 0 ? `+${pointDiff}` : pointDiff} sub={`${b.pointsFor} for · ${b.pointsAgainst} against`} />
      </div>
    </div>
  );
}

export default function PlayerStatsScreen({ playerName, tournaments, onBack }: Props) {
  const stats = computePlayerStats(playerName, tournaments);
  const hasSingles = stats.singles.matchesPlayed > 0;
  const hasDoubles = stats.doubles.matchesPlayed > 0;
  const hasBoth = hasSingles && hasDoubles;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-xl mx-auto p-4">

        <div className="flex items-center gap-3 mb-6">
          <button onClick={onBack} className="text-gray-500 hover:text-gray-700 text-sm shrink-0">← Back</button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{playerName}</h1>
            <p className="text-xs text-gray-400">{stats.overall.matchesPlayed} matches across {stats.tournaments.length} tournament{stats.tournaments.length !== 1 ? 's' : ''}</p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Overall — only show if they played both types */}
          {hasBoth && <BucketSection label="Overall" b={stats.overall} />}

          {hasSingles && <BucketSection label={hasBoth ? 'Singles' : 'Singles'} b={stats.singles} />}
          {hasDoubles && <BucketSection label={hasBoth ? 'Doubles' : 'Doubles'} b={stats.doubles} />}

          {stats.overall.matchesPlayed === 0 && (
            <div className="text-center py-12 text-gray-400">
              <div className="text-4xl mb-2">🏓</div>
              <p>No match data yet</p>
            </div>
          )}

          {/* Tournament history */}
          {stats.tournaments.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Tournament History</h3>
              <div className="space-y-2">
                {stats.tournaments.map(t => (
                  <div key={t.id} className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{t.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {t.date ? new Date(t.date + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : ''}
                        {t.matchType && ` · ${t.matchType}`}
                      </p>
                    </div>
                    {t.result === 'winner' && (
                      <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full font-semibold">👑 Winner</span>
                    )}
                    {t.result === 'runner-up' && (
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full font-semibold">🥈 Runner-up</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
