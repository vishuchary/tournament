import { useState, useMemo, useEffect } from 'react';
import type { PlayerRatingEntry } from '../types';
import type { RatingAlgo } from '../store';

function confidenceLabel(uncertainty: number): { text: string; color: string } {
  if (uncertainty < 80)  return { text: 'Established', color: 'text-green-600 bg-green-50' };
  if (uncertainty < 150) return { text: 'Provisional', color: 'text-yellow-600 bg-yellow-50' };
  return { text: 'Unrated', color: 'text-gray-400 bg-gray-100' };
}

function RatingsTab({
  ratings, type, algo, onPlayerClick,
}: {
  ratings: PlayerRatingEntry[]; type: 'singles' | 'doubles'; algo: RatingAlgo; onPlayerClick?: (name: string) => void;
}) {
  const filtered = useMemo(
    () => ratings.filter(r => r.type === type && r.algo === algo).sort((a, b) => {
      if (b.won !== a.won) return b.won - a.won;
      return b.rating - a.rating;
    }),
    [ratings, type, algo],
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
                <div className="text-right shrink-0">
                  <span className="font-bold text-lg text-gray-900">{algo === 'rc' ? r.rating.toFixed(3) : Math.round(r.rating)}</span>
                  <span className="text-xs text-gray-400 ml-1">{uncertLabel} {algo === 'rc' ? r.uncertainty.toFixed(3) : Math.round(r.uncertainty)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${confidence.color}`}>{confidence.text}</span>
                <span className="text-xs text-gray-400">{r.won}W · {r.lost}L · {winRate}%</span>
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
        {algo === 'rc' ? 'Ratings Central · ±SD = uncertainty' : 'Glicko-2 · ±RD = uncertainty · σ = volatility'} · Based on tournament matches
      </p>
    </div>
  );
}

interface Props {
  ratings: PlayerRatingEntry[];
  algo: RatingAlgo;
  isAdmin: boolean;
  onBack: () => void;
  onAlgoChange: (algo: RatingAlgo) => void;
  onRecompute: () => Promise<void>;
  onPlayerClick?: (name: string) => void;
}

export default function RatingsScreen({ ratings, algo, isAdmin, onBack, onAlgoChange, onRecompute, onPlayerClick }: Props) {
  const [tab, setTab] = useState<'singles' | 'doubles'>('singles');
  const [recomputing, setRecomputing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

        {/* Algo toggle — admin only */}
        {isAdmin ? (
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg mb-4">
            <button onClick={() => onAlgoChange('rc')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${algo === 'rc' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              Ratings Central
            </button>
            <button onClick={() => onAlgoChange('glicko2')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${algo === 'glicko2' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              Glicko-2
            </button>
          </div>
        ) : (
          <p className="text-xs text-gray-400 mb-4 text-right">{algo === 'rc' ? 'Ratings Central' : 'Glicko-2'}</p>
        )}

        {/* Singles / Doubles tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg mb-5">
          {(['singles', 'doubles'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <RatingsTab ratings={ratings} type={tab} algo={algo} onPlayerClick={onPlayerClick} />
      </div>
    </div>
  );
}
