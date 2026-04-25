import type { PlayerRanking } from '../rankings';

interface Props {
  rankings: PlayerRanking[];
  isAdmin?: boolean;
  onBack: () => void;
  onRecompute?: () => void;
}

const PODIUM_STYLE: Record<number, { border: string; bg: string; badge: string; pts: string; bar: string; icon: string }> = {
  1: { border: 'border-yellow-400', bg: 'bg-gradient-to-r from-yellow-50 to-amber-50', badge: 'bg-yellow-400 text-white', pts: 'text-yellow-600', bar: 'bg-yellow-400', icon: '👑' },
  2: { border: 'border-gray-300',   bg: 'bg-gradient-to-r from-gray-50 to-slate-50',   badge: 'bg-gray-400 text-white',   pts: 'text-gray-600',   bar: 'bg-gray-400',   icon: '🥈' },
  3: { border: 'border-orange-300', bg: 'bg-gradient-to-r from-orange-50 to-amber-50', badge: 'bg-orange-400 text-white', pts: 'text-orange-600', bar: 'bg-orange-400', icon: '🥉' },
};

interface RankedPlayer { r: PlayerRanking; rank: number }

function assignRanks(rankings: PlayerRanking[]): RankedPlayer[] {
  return rankings.map((r) => {
    const rank = rankings.findIndex(x => x.points === r.points) + 1;
    return { r, rank };
  });
}

function ScoreBreakdown({ r }: { r: PlayerRanking }) {
  return (
    <div className="flex gap-1.5 mt-1 flex-wrap">
      {r.participationPts > 0 && (
        <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-md text-xs font-medium">P +{r.participationPts}</span>
      )}
      {r.gameWinPts > 0 && (
        <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded-md text-xs font-medium">G +{r.gameWinPts}</span>
      )}
      {r.bonusPts > 0 && (
        <span className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-md text-xs font-medium">B +{r.bonusPts}</span>
      )}
      <span className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-md text-xs">{r.gameWins}G · {r.matchesPlayed}MP</span>
    </div>
  );
}

function PodiumCard({ r, rank, maxPts, isAdmin }: { r: PlayerRanking; rank: number; maxPts: number; isAdmin?: boolean }) {
  const s = PODIUM_STYLE[rank];
  const pct = maxPts > 0 ? Math.max(4, (r.points / maxPts) * 100) : 0;

  return (
    <div className={`rounded-2xl border-2 ${s.border} ${s.bg} p-4 shadow-sm`}>
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-full ${s.badge} flex items-center justify-center font-bold text-sm shrink-0`}>
          {s.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="font-bold text-gray-900 text-base truncate">{r.name}</p>
            <span className={`font-extrabold text-xl shrink-0 ${s.pts}`}>{r.points} pts</span>
          </div>
          {isAdmin && <ScoreBreakdown r={r} />}
          <div className="mt-2 h-1.5 bg-black/10 rounded-full overflow-hidden">
            <div className={`h-full ${s.bar} rounded-full transition-all`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function RowCard({ r, rank, maxPts, isAdmin }: { r: PlayerRanking; rank: number; maxPts: number; isAdmin?: boolean }) {
  const pct = maxPts > 0 ? Math.max(2, (r.points / maxPts) * 100) : 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3">
      <span className="text-sm font-bold text-gray-400 w-6 shrink-0 text-center">{rank}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold text-gray-900 text-sm truncate">{r.name}</p>
          <span className="font-bold text-sm shrink-0 text-gray-800">{r.points} pts</span>
        </div>
        {isAdmin && <ScoreBreakdown r={r} />}
        <div className="mt-1.5 h-1 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-blue-400 rounded-full" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

const PUBLIC_LIMIT = Number(import.meta.env.VITE_PUBLIC_RANKINGS_LIMIT ?? 5);

export default function RankingsScreen({ rankings, isAdmin, onBack, onRecompute }: Props) {
  const ranked = assignRanks(rankings);

  // Non-admins see only players whose rank is within the public limit
  const visible = isAdmin ? ranked : ranked.filter(({ rank }) => rank <= PUBLIC_LIMIT);
  const hiddenCount = ranked.length - visible.length;

  const podium = visible.filter(({ rank }) => rank <= 3);
  const rest = visible.filter(({ rank }) => rank > 3);
  const maxPts = rankings[0]?.points ?? 1;

  const podiumRanks = [1, 2, 3] as const;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-xl mx-auto p-4">

        <div className="flex items-center gap-3 mb-1">
          <button onClick={onBack} className="text-gray-500 hover:text-gray-700 text-sm shrink-0">← Back</button>
          <h1 className="text-xl font-bold text-gray-900">Player Rankings</h1>
          {isAdmin && onRecompute && (
            <button
              onClick={onRecompute}
              className="ml-auto text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-2.5 py-1 rounded-lg transition-colors"
              title="Recompute rankings from all tournament data"
            >
              ↻ Recompute
            </button>
          )}
        </div>
        <p className="text-xs text-gray-400 mb-6 ml-10">
          Same score = same rank · next rank skips accordingly
        </p>

        {rankings.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-5xl mb-3">🏓</div>
            <p className="font-medium">No rankings yet</p>
            <p className="text-sm mt-1">Rankings appear once matches are played</p>
          </div>
        ) : (
          <>
            {/* Podium: ranks 1–3, grouped by rank with same styling for ties */}
            <div className="space-y-2 mb-5">
              {podiumRanks.map(rank => {
                const group = podium.filter(p => p.rank === rank);
                if (group.length === 0) return null;
                return (
                  <div key={rank}>
                    {group.length > 1 && (
                      <p className="text-xs text-gray-400 font-medium mb-1 ml-1">
                        {rank === 1 ? '🏅' : rank === 2 ? '🥈' : '🥉'} Tied — Rank {rank}
                      </p>
                    )}
                    <div className="space-y-2">
                      {group.map(({ r }) => (
                        <PodiumCard key={r.name} r={r} rank={rank} maxPts={maxPts} isAdmin={isAdmin} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {rest.length > 0 && (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">All Players</span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>
                <div className="space-y-2">
                  {rest.map(({ r, rank }) => (
                    <RowCard key={r.name} r={r} rank={rank} maxPts={maxPts} isAdmin={isAdmin} />
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {!isAdmin && hiddenCount > 0 && (
          <p className="text-xs text-center text-gray-400 mt-6">
            +{hiddenCount} more player{hiddenCount !== 1 ? 's' : ''} · login as admin to see all
          </p>
        )}
        {isAdmin && (
          <p className="text-xs text-center text-gray-400 mt-6">
            P = participation · G = game wins · B = winner/runner-up bonus
          </p>
        )}
      </div>
    </div>
  );
}
