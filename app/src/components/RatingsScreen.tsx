import { useState, useMemo, useEffect } from 'react';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { auth } from '../firebase';
import type { PlayerRatingEntry, CompetitiveMatch } from '../types';
import type { RatingAlgo } from '../store';
import { computeStreaks, type PlayerStreak } from '../rankings';

function confidenceLabel(uncertainty: number): { text: string; color: string } {
  if (uncertainty < 80)  return { text: 'Established', color: 'text-green-600 bg-green-50' };
  if (uncertainty < 150) return { text: 'Provisional', color: 'text-yellow-600 bg-yellow-50' };
  return { text: 'Unrated', color: 'text-gray-400 bg-gray-100' };
}

function TrendBadge({ r, algo }: { r: { rating: number; prevRating?: number }; algo: RatingAlgo }) {
  if (r.prevRating === undefined) return null;
  const delta = r.rating - r.prevRating;
  if (Math.abs(delta) < 0.01) return null;
  const up = delta > 0;
  const label = algo === 'rc' ? delta.toFixed(3) : Math.round(delta).toString();
  return (
    <span className={`text-xs font-medium tabular-nums ${up ? 'text-green-600' : 'text-red-500'}`}>
      {up ? '▲' : '▼'} {up ? '+' : ''}{label}
    </span>
  );
}

function StreakBadge({ streak, won, lost }: { streak: PlayerStreak | undefined; won: number; lost: number }) {
  if (streak) {
    const isWin = streak.type === 'win';
    return (
      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${isWin ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
        {isWin ? '🔥' : '❄️'} {streak.count} {isWin ? 'W' : 'L'} streak
      </span>
    );
  }
  const total = won + lost;
  if (total < 5) return null;
  const rate = won / total;
  if (rate >= 0.60) return <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-green-100 text-green-700">🔥</span>;
  return null;
}

function RatingsTab({
  ratings, type, algo, topRankers, streaks, onPlayerClick,
}: {
  ratings: PlayerRatingEntry[]; type: 'singles' | 'doubles'; algo: RatingAlgo; topRankers: number;
  streaks: Map<string, PlayerStreak>; onPlayerClick?: (name: string) => void;
}) {
  const filtered = useMemo(
    () => ratings.filter(r => r.type === type && r.algo === algo).sort((a, b) => {
      if (b.won !== a.won) return b.won - a.won;
      return b.rating - a.rating;
    }).slice(0, topRankers),
    [ratings, type, algo, topRankers],
  );

  const MEDAL: Record<number, string> = { 1: '👑', 2: '🥈', 3: '🥉' };
  const maxRating = filtered[0]?.rating ?? 1500;
  const minBase = algo === 'rc' ? 1000 : 1200;

  if (filtered.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p className="text-4xl mb-2">🏓</p>
        <p>No {type} ratings yet</p>
        <p className="text-sm mt-1">Ratings are computed from all competitive games and tournaments</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {filtered.map((r, i) => {
        const rank = i + 1;
        const isPodium = rank <= 3;
        const confidence = confidenceLabel(r.uncertainty);
        const winRate = (r.won + r.lost) > 0 ? Math.round((r.won / (r.won + r.lost)) * 100) : 0;
        const pct = Math.max(10, ((r.rating - minBase) / (maxRating - minBase || 1)) * 100);
        const uncertLabel = algo === 'rc' ? '±SD' : '±RD';
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
                <p
                  className={`font-semibold text-gray-900 text-sm truncate ${onPlayerClick ? 'cursor-pointer hover:text-blue-600 hover:underline' : ''}`}
                  onClick={() => onPlayerClick?.(r.name)}
                >{r.name}</p>
                <div className="flex items-center gap-1.5 shrink-0">
                  <TrendBadge r={r} algo={algo} />
                  <div className="text-right">
                    <span className="font-bold text-lg text-gray-900">{algo === 'rc' ? r.rating.toFixed(3) : Math.round(r.rating)}</span>
                    <span className="text-xs text-gray-400 ml-1">{uncertLabel} {algo === 'rc' ? r.uncertainty.toFixed(3) : Math.round(r.uncertainty)}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${confidence.color}`}>{confidence.text}</span>
                <span className="text-xs text-gray-400">{r.won}W · {r.lost}L · {winRate}%</span>
                <StreakBadge streak={streaks.get(r.name)} won={r.won} lost={r.lost} />
                {algo === 'glicko2' && r.volatility !== undefined && (
                  <span className="text-xs text-gray-400">σ {r.volatility.toFixed(3)}</span>
                )}
              </div>
              <div className="mt-1.5 h-1 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${r.uncertainty > 150 ? 'bg-gray-300' : 'bg-blue-500'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </div>
        );
      })}
      <p className="text-xs text-center text-gray-400 pt-2 pb-2">
        {algo === 'rc' ? 'Ratings Central · ±SD = uncertainty' : 'Glicko-2 · ±RD = uncertainty · σ = volatility'} · Based on tournament matches · 🔥 = 60%+ win rate
      </p>
    </div>
  );
}

function CombinedTab({
  ratings, algo, topRankers, streaks, onPlayerClick,
}: {
  ratings: PlayerRatingEntry[]; algo: RatingAlgo; topRankers: number;
  streaks: Map<string, PlayerStreak>; onPlayerClick?: (name: string) => void;
}) {
  const combined = useMemo(
    () => ratings
      .filter(r => r.type === 'combined' && r.algo === algo)
      .sort((a, b) => (b.won !== a.won ? b.won - a.won : b.rating - a.rating))
      .slice(0, topRankers),
    [ratings, algo, topRankers],
  );

  const MEDAL: Record<number, string> = { 1: '👑', 2: '🥈', 3: '🥉' };
  const maxRating = combined[0]?.rating ?? 1500;
  const minBase = algo === 'rc' ? 1000 : 1200;

  if (combined.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p className="text-4xl mb-2">🏓</p>
        <p>No ratings yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {combined.map((r, i) => {
        const rank = i + 1;
        const isPodium = rank <= 3;
        const confidence = confidenceLabel(r.uncertainty);
        const winRate = (r.won + r.lost) > 0 ? Math.round((r.won / (r.won + r.lost)) * 100) : 0;
        const pct = Math.max(10, ((r.rating - minBase) / (maxRating - minBase || 1)) * 100);
        const badges = [r.hasSingles && 'S', r.hasDoubles && 'D'].filter(Boolean).join('+');
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
                <p
                  className={`font-semibold text-gray-900 text-sm truncate ${onPlayerClick ? 'cursor-pointer hover:text-blue-600 hover:underline' : ''}`}
                  onClick={() => onPlayerClick?.(r.name)}
                >{r.name}</p>
                <div className="flex items-center gap-1.5 shrink-0">
                  <TrendBadge r={r} algo={algo} />
                  <div className="text-right">
                    <span className="font-bold text-lg text-gray-900">{algo === 'rc' ? r.rating.toFixed(1) : Math.round(r.rating)}</span>
                    <span className="text-xs text-gray-400 ml-1">{badges}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${confidence.color}`}>{confidence.text}</span>
                <span className="text-xs text-gray-400">{r.won}W · {r.lost}L · {winRate}%</span>
                <StreakBadge streak={streaks.get(r.name)} won={r.won} lost={r.lost} />
              </div>
              <div className="mt-1.5 h-1 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${r.uncertainty > 150 ? 'bg-gray-300' : 'bg-purple-500'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </div>
        );
      })}
      <p className="text-xs text-center text-gray-400 pt-2 pb-2">
        Combined · weighted average of singles + doubles · S = singles only · D = doubles only · S+D = both · 🔥 = 60%+ win rate
      </p>
    </div>
  );
}

interface Props {
  ratings: PlayerRatingEntry[];
  competitiveMatches: CompetitiveMatch[];
  algo: RatingAlgo;
  topRankers: number;
  isAdmin: boolean;
  onBack: () => void;
  onAlgoChange: (algo: RatingAlgo) => void;
  onTopRankersChange: (n: number) => void;
  onRecompute: () => Promise<void>;
  onPlayerClick?: (name: string) => void;
}

function AlgoConfirmModal({ targetAlgo, onConfirm, onCancel }: {
  targetAlgo: RatingAlgo;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const label = targetAlgo === 'rc' ? 'Ratings Central' : 'Glicko-2';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user?.email) { setError('Not authenticated'); return; }
    setLoading(true);
    setError(null);
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
      onConfirm();
    } catch {
      setError('Wrong password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-base font-bold text-gray-900 mb-1">Switch to {label}?</h2>
        <p className="text-sm text-gray-500 mb-4">Enter your admin password to confirm.</p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            autoFocus
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-400"
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onCancel}
              className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading || !password}
              className="flex-1 py-2 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-40">
              {loading ? 'Checking…' : 'Confirm'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function RatingsScreen({ ratings, competitiveMatches, algo, topRankers, isAdmin, onBack, onAlgoChange, onTopRankersChange, onRecompute, onPlayerClick }: Props) {
  const streaks = useMemo(() => computeStreaks(competitiveMatches), [competitiveMatches]);
  const [tab, setTab] = useState<'singles' | 'doubles' | 'combined'>('combined');
  const [recomputing, setRecomputing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAlgo, setPendingAlgo] = useState<RatingAlgo | null>(null);

  useEffect(() => {
    if (isAdmin && ratings.length === 0) {
      handleRecompute();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  async function handleRecompute() {
    setRecomputing(true);
    setError(null);
    try {
      await onRecompute();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Recompute failed — check backend connection');
    } finally {
      setRecomputing(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-xl mx-auto p-4">

        <div className="flex items-center gap-3 mb-4">
          <button onClick={onBack} className="text-gray-500 hover:text-gray-700 text-sm shrink-0">← Back</button>
          <h1 className="text-xl font-bold text-gray-900">Rankings</h1>
          {isAdmin && (
            <button
              onClick={handleRecompute}
              disabled={recomputing}
              className="ml-auto text-xs bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-40"
            >
              {recomputing ? 'Computing…' : '⟳ Recompute'}
            </button>
          )}
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 rounded-xl break-all">{error}</div>
        )}

        {pendingAlgo && (
          <AlgoConfirmModal
            targetAlgo={pendingAlgo}
            onConfirm={() => { onAlgoChange(pendingAlgo); setPendingAlgo(null); }}
            onCancel={() => setPendingAlgo(null)}
          />
        )}

        {/* Algo toggle + top rankers — admin only */}
        {isAdmin ? (
          <div className="space-y-2 mb-4">
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
              <button onClick={() => algo !== 'rc' && setPendingAlgo('rc')}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${algo === 'rc' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                Ratings Central
              </button>
              <button onClick={() => algo !== 'glicko2' && setPendingAlgo('glicko2')}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${algo === 'glicko2' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                Glicko-2
              </button>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 shrink-0">Show top</label>
              <input
                type="number"
                min={1}
                max={100}
                value={topRankers}
                onChange={e => {
                  const n = parseInt(e.target.value, 10);
                  if (!isNaN(n) && n >= 1) onTopRankersChange(n);
                }}
                className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-xs text-center outline-none focus:border-blue-400"
              />
              <label className="text-xs text-gray-500">rankers</label>
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-400 mb-4 text-right">{algo === 'rc' ? 'Ratings Central' : 'Glicko-2'} · Top {topRankers}</p>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg mb-5">
          {(['combined', 'singles', 'doubles'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {tab === 'combined'
          ? <CombinedTab ratings={ratings} algo={algo} topRankers={topRankers} streaks={streaks} onPlayerClick={onPlayerClick} />
          : <RatingsTab ratings={ratings} type={tab} algo={algo} topRankers={topRankers} streaks={streaks} onPlayerClick={onPlayerClick} />
        }
        {isAdmin && ratings.length > 0 && !ratings.some(r => r.prevRating !== undefined) && (
          <p className="text-xs text-center text-gray-400 mt-3">Hit Recompute to enable ▲▼ rating trends</p>
        )}
      </div>
    </div>
  );
}
