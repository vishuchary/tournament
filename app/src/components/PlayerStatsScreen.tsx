import { computePlayerStats, type PlayerStats } from '../rankings';
import type { Tournament, CompetitiveMatch, PlayerRatingEntry } from '../types';
import type { RatingAlgo } from '../store';

interface Props {
  playerName: string;
  tournaments: Tournament[];
  competitiveMatches: CompetitiveMatch[];
  ratings: PlayerRatingEntry[];
  algo: RatingAlgo;
  onBack: () => void;
}

function confidenceLabel(uncertainty: number): { text: string; color: string } {
  if (uncertainty < 80)  return { text: 'Established', color: 'text-green-600 bg-green-50' };
  if (uncertainty < 150) return { text: 'Provisional', color: 'text-yellow-600 bg-yellow-50' };
  return { text: 'Unrated', color: 'text-gray-400 bg-gray-100' };
}

function RatingCard({ entry, algo }: { entry: PlayerRatingEntry; algo: RatingAlgo }) {
  const confidence = confidenceLabel(entry.uncertainty);
  const winRate = (entry.won + entry.lost) > 0 ? Math.round((entry.won / (entry.won + entry.lost)) * 100) : 0;
  const uncertLabel = algo === 'rc' ? '±SD' : '±RD';
  const ratingStr = algo === 'rc' ? entry.rating.toFixed(1) : Math.round(entry.rating).toString();
  const uncertStr = algo === 'rc' ? entry.uncertainty.toFixed(1) : Math.round(entry.uncertainty).toString();

  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{entry.type}</span>
        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${confidence.color}`}>{confidence.text}</span>
      </div>
      <div className="flex items-end justify-between">
        <div>
          <span className="text-2xl font-bold text-gray-900">{ratingStr}</span>
          <span className="text-xs text-gray-400 ml-1">{uncertLabel} {uncertStr}</span>
        </div>
        <span className="text-sm text-gray-500">{entry.won}W · {entry.lost}L · {winRate}%</span>
      </div>
    </div>
  );
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
  const gamesPlayed = b.gameWins + b.gameLosses;
  const winRate = pct(b.gameWins, gamesPlayed);
  const pointDiff = b.pointsFor - b.pointsAgainst;

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">{label}</h3>
      <div className="grid grid-cols-3 gap-3">
        <StatBox label="Games" value={gamesPlayed} sub={`${b.gameWins}W · ${b.gameLosses}L`} />
        <StatBox label="Win Rate" value={winRate} />
        <StatBox label="Pt Diff" value={pointDiff > 0 ? `+${pointDiff}` : pointDiff} sub={`${b.pointsFor} for · ${b.pointsAgainst} against`} />
      </div>
    </div>
  );
}

export default function PlayerStatsScreen({ playerName, tournaments, competitiveMatches, ratings, algo, onBack }: Props) {
  const stats = computePlayerStats(playerName, tournaments, competitiveMatches);
  const hasSingles = stats.singles.matchesPlayed > 0;
  const hasDoubles = stats.doubles.matchesPlayed > 0;
  const hasBoth = hasSingles && hasDoubles;

  const playerRatings = ratings.filter(r => r.name === playerName && r.algo === algo);
  const singlesRating = playerRatings.find(r => r.type === 'singles');
  const doublesRating = playerRatings.find(r => r.type === 'doubles');

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-xl mx-auto p-4">

        <div className="flex items-center gap-3 mb-6">
          <button onClick={onBack} className="text-gray-500 hover:text-gray-700 text-sm shrink-0">← Back</button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{playerName}</h1>
            <p className="text-xs text-gray-400">{stats.overall.gameWins + stats.overall.gameLosses} games across {stats.tournaments.length} tournament{stats.tournaments.length !== 1 ? 's' : ''}</p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Ratings */}
          {(singlesRating || doublesRating) && (
            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Rating <span className="normal-case font-normal text-gray-400">({algo === 'rc' ? 'Ratings Central' : 'Glicko-2'})</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {singlesRating && <RatingCard entry={singlesRating} algo={algo} />}
                {doublesRating && <RatingCard entry={doublesRating} algo={algo} />}
              </div>
            </div>
          )}

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

          {/* Performance chart */}
          {stats.tournamentPerf.length > 1 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Win Rate by Tournament</h3>
              <div className="bg-white rounded-xl border border-gray-200 px-4 py-4">
                <div className="flex items-end gap-2 h-20">
                  {stats.tournamentPerf.map(tp => {
                    const total = tp.gameWins + tp.gameLosses;
                    const rate = total > 0 ? tp.gameWins / total : 0;
                    return (
                      <div key={tp.id} className="flex-1 flex flex-col items-center gap-1 group relative">
                        <span className="absolute -top-5 text-xs text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                          {Math.round(rate * 100)}%
                        </span>
                        <div className="w-full rounded-t-sm" style={{
                          height: `${Math.max(rate * 64, 4)}px`,
                          background: rate >= 0.5 ? '#60a5fa' : '#fca5a5',
                        }} />
                        <span className="text-[10px] text-gray-400 truncate w-full text-center">
                          {tp.name.replace(/tournament/i, '').trim().slice(0, 8)}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-400 mt-2 text-center">blue = above 50% · red = below 50%</p>
              </div>
            </div>
          )}

          {/* Head-to-head */}
          {stats.headToHead.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Head-to-Head</h3>
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {stats.headToHead.map((h, i) => {
                  const total = h.gameWins + h.gameLosses;
                  const rate = total > 0 ? h.gameWins / total : 0;
                  return (
                    <div key={h.opponent} className={`px-4 py-3 flex items-center gap-3 ${i > 0 ? 'border-t border-gray-100' : ''}`}>
                      <span className="text-sm text-gray-900 flex-1 font-medium">{h.opponent}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <div className="h-full rounded-full bg-blue-400" style={{ width: `${rate * 100}%` }} />
                        </div>
                        <span className="text-xs tabular-nums text-gray-500 w-14 text-right">
                          {h.gameWins}W · {h.gameLosses}L
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
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
