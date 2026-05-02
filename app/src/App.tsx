import { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { auth } from './firebase';
import type { Tournament, TournamentSummary, Player, PlayerRatingEntry, CompetitiveMatch } from './types';
import {
  subscribeTournamentSummaries, subscribeTournament, fetchTournaments,
  saveTournament, deleteTournament, computeTournamentSummary,
  subscribePlayers,
  subscribeBaselineRatings, subscribeAlgoSetting, saveAlgoSetting,
  subscribeTopRankers, saveTopRankers,
  triggerBaselineRatingsRecompute,
  subscribeCompetitiveMatches,
  type RatingAlgo,
} from './store';
import TournamentView from './components/TournamentView';
import './index.css';

const TournamentSetup = lazy(() => import('./components/TournamentSetup'));
const PlayersScreen = lazy(() => import('./components/PlayersScreen'));
const PlayerStatsScreen = lazy(() => import('./components/PlayerStatsScreen'));
const RatingsScreen = lazy(() => import('./components/RatingsScreen'));
const CompetitiveGamesScreen = lazy(() => import('./components/CompetitiveGamesScreen'));
const AdminLogin = lazy(() => import('./components/AdminLogin'));

type NavView = { type: 'home' } | { type: 'tournament'; id: string } | { type: 'competitive' } | { type: 'players' } | { type: 'ratings' };

type View =
  | { type: 'home' }
  | { type: 'new' }
  | { type: 'tournament'; id: string }
  | { type: 'competitive' }
  | { type: 'players' }
  | { type: 'playerStats'; name: string; back: NavView }
  | { type: 'ratings' };

function TournamentCard({ t, onClick }: { t: TournamentSummary; onClick: () => void }) {
  const { status, matchCount, completedCount, completedGames, levelCount, level1Groups } = t;
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl border p-5 cursor-pointer hover:shadow-sm transition-all ${
        status === 'in-progress' ? 'border-blue-300 hover:border-blue-400' : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-lg font-semibold text-gray-900 truncate">{t.name}</h2>
            {status === 'in-progress' && (
              <span className="shrink-0 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Live</span>
            )}
            {status === 'completed' && (
              <span className="shrink-0 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Done</span>
            )}
            {status === 'completed' && (
              <span className="shrink-0 text-gray-400 text-sm" title="Locked">🔒</span>
            )}
          </div>
          <p className="text-sm text-gray-500">
            {levelCount > 1 ? `${levelCount} levels` : `${level1Groups} group${level1Groups !== 1 ? 's' : ''}`} &middot;{' '}
            {t.format === 'sets'
              ? `Best of ${t.setCount ?? 3} Set${(t.setCount ?? 3) !== 1 ? 's' : ''}`
              : `${t.setCount ?? 2} Game${(t.setCount ?? 2) !== 1 ? 's' : ''}`} &middot;{' '}
            {t.date ? new Date(t.date + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : new Date(t.createdAt).toLocaleDateString()}
          </p>
          {matchCount > 0 && (
            <p className="text-xs text-gray-400 mt-1">
              {completedCount} / {matchCount} matches · {completedGames} games played
            </p>
          )}
        </div>
        <span className="text-gray-400 text-xl ml-4">&rsaquo;</span>
      </div>
    </div>
  );
}

export default function App() {
  // Lightweight summaries — home screen only
  const [summaries, setSummaries] = useState<TournamentSummary[]>([]);
  const [summariesLoaded, setSummariesLoaded] = useState(false);

  // Single full tournament — subscribed only while viewing a tournament
  const [currentTournament, setCurrentTournament] = useState<Tournament | null>(null);

  const [players, setPlayers] = useState<Player[]>([]);
  const [competitiveMatches, setCompetitiveMatches] = useState<CompetitiveMatch[]>([]);
  const [baselineRatings, setBaselineRatings] = useState<PlayerRatingEntry[]>([]);
  const [algo, setAlgo] = useState<RatingAlgo>('rc');
  const [topRankers, setTopRankers] = useState<number>(10);
  const [view, setView] = useState<View>({ type: 'home' });
  const [user, setUser] = useState<User | null>(null);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const hasAutoNavigated = useRef(false);

  const isAdmin = !!user;

  const topPlayerNames = useMemo(
    () => new Set(
      baselineRatings
        .filter(r => r.type === 'combined' && r.algo === algo)
        .sort((a, b) => (b.won !== a.won ? b.won - a.won : b.rating - a.rating))
        .slice(0, topRankers)
        .map(r => r.name)
    ),
    [baselineRatings, algo, topRankers],
  );

  // Auth
  useEffect(() => {
    return onAuthStateChanged(auth, u => setUser(u));
  }, []);

  // Lightweight summaries subscription (home screen)
  useEffect(() => {
    return subscribeTournamentSummaries(list => {
      setSummaries(list);
      setSummariesLoaded(true);
      if (!hasAutoNavigated.current && list.length > 0) {
        hasAutoNavigated.current = true;
        const inProgress = list.find(s => s.status === 'in-progress');
        if (inProgress) setView({ type: 'tournament', id: inProgress.id });
      }
    });
  }, []);

  // Fallback: if tournament_summaries is empty, fetch full tournaments and show them.
  // If admin, also write summaries to Firestore for future loads.
  useEffect(() => {
    if (!summariesLoaded || summaries.length > 0) return;
    fetchTournaments().then(list => {
      if (list.length === 0) return;
      setSummaries(list.map(computeTournamentSummary));
      if (isAdmin) list.forEach(t => saveTournament(t));
    });
  }, [summariesLoaded, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  // Other subscriptions
  useEffect(() => {
    const unsubPlayers = subscribePlayers(setPlayers);
    const unsubCompetitive = subscribeCompetitiveMatches(setCompetitiveMatches);
    const unsubRatings = subscribeBaselineRatings(setBaselineRatings);
    const unsubAlgo = subscribeAlgoSetting(setAlgo);
    const unsubTopRankers = subscribeTopRankers(setTopRankers);
    return () => {
      unsubPlayers();
      unsubCompetitive();
      unsubRatings();
      unsubAlgo();
      unsubTopRankers();
    };
  }, []);

  // Single-tournament subscription — active only while in tournament view
  const tournamentId = view.type === 'tournament' ? view.id : null;
  useEffect(() => {
    if (!tournamentId) {
      setCurrentTournament(null);
      return;
    }
    return subscribeTournament(tournamentId, setCurrentTournament);
  }, [tournamentId]);

  async function getToken(): Promise<string> {
    return (await user?.getIdToken()) ?? '';
  }

  async function handleCreate(t: Tournament) {
    setCurrentTournament(t); // optimistic — subscription will confirm
    await saveTournament(t);
    setView({ type: 'tournament', id: t.id });
  }

  async function handleUpdate(t: Tournament) {
    setCurrentTournament(t); // optimistic
    await saveTournament(t);
  }

  async function handleDelete(id: string) {
    await deleteTournament(id);
    setView({ type: 'home' });
  }

  async function handleAlgoChange(newAlgo: RatingAlgo) {
    await saveAlgoSetting(newAlgo);
  }

  async function handleTopRankersChange(n: number) {
    await saveTopRankers(n);
  }

  async function handleRecompute() {
    const token = await getToken();
    if (token) await triggerBaselineRatingsRecompute(token);
  }

  if (view.type === 'new') {
    return (
      <Suspense fallback={null}><TournamentSetup
        seq={summaries.length + 1}
        players={players}
        onCreate={handleCreate}
        onCancel={() => setView({ type: 'home' })}
      /></Suspense>
    );
  }

  if (view.type === 'players') {
    return (
      <Suspense fallback={null}>
        <PlayersScreen
          players={players}
          isAdmin={isAdmin}
          topPlayerNames={topPlayerNames}
          ratings={baselineRatings}
          algo={algo}
          onBack={() => setView({ type: 'home' })}
          getToken={getToken}
          onPlayerClick={name => {
            setView({ type: 'playerStats', name, back: { type: 'players' } });
          }}
        />
      </Suspense>
    );
  }

  if (view.type === 'playerStats') {
    return (
      <Suspense fallback={null}>
        <PlayerStatsScreen
          playerName={view.name}
          ratings={baselineRatings}
          algo={algo}
          onBack={() => setView(view.back)}
        />
      </Suspense>
    );
  }

  if (view.type === 'competitive') {
    return (
      <Suspense fallback={null}>
        <CompetitiveGamesScreen
          matches={competitiveMatches}
          players={players}
          isAdmin={isAdmin}
          ratings={baselineRatings}
          algo={algo}
          onBack={() => setView({ type: 'home' })}
          onDataChange={handleRecompute}
        />
      </Suspense>
    );
  }

  if (view.type === 'ratings') {
    return (
      <Suspense fallback={null}>
        <RatingsScreen
          ratings={baselineRatings}
          competitiveMatches={competitiveMatches}
          algo={algo}
          topRankers={topRankers}
          isAdmin={isAdmin}
          onBack={() => setView({ type: 'home' })}
          onAlgoChange={handleAlgoChange}
          onTopRankersChange={handleTopRankersChange}
          onRecompute={handleRecompute}
          onPlayerClick={name => {
            setView({ type: 'playerStats', name, back: { type: 'ratings' } });
          }}
        />
      </Suspense>
    );
  }

  if (view.type === 'tournament') {
    if (!currentTournament) return null;
    const t = currentTournament;
    return (
      <TournamentView
        tournament={t}
        players={players}
        isAdmin={isAdmin}
        ratings={baselineRatings}
        algo={algo}
        onUpdate={handleUpdate}
        onDelete={() => handleDelete(t.id)}
        onBack={() => setView({ type: 'home' })}
        onRequestAdmin={() => setShowAdminLogin(true)}
        onPlayerClick={name => {
          setView({ type: 'playerStats', name, back: { type: 'tournament', id: t.id } });
        }}
      />
    );
  }

  const inProgress = summaries.filter(s => s.status === 'in-progress');
  const history = summaries.filter(s => s.status !== 'in-progress');

  return (
    <div className="min-h-screen bg-gray-50">
      {showAdminLogin && (
        <Suspense fallback={null}>
          <AdminLogin
            onSuccess={() => setShowAdminLogin(false)}
            onCancel={() => setShowAdminLogin(false)}
          />
        </Suspense>
      )}

      {/* Banner */}
      <div className="relative w-full h-48 sm:h-64 overflow-hidden">
        <picture>
          <source srcSet="/banner.webp" type="image/webp" />
          <img
            src="/banner.jpg"
            alt="Mountain House TT Club"
            className="w-full h-full object-cover object-center"
          />
        </picture>
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-5 flex items-end justify-between">
          <h1 className="text-2xl sm:text-3xl font-bold text-white drop-shadow">🏓 Mountain House TT Club</h1>
          {isAdmin && (
            <button
              onClick={() => signOut(auth)}
              className="text-xs bg-white/20 text-white border border-white/30 px-3 py-1.5 rounded-lg backdrop-blur hover:bg-white/30 transition-colors"
            >
              Admin ✓ · Exit
            </button>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-end gap-2 mb-8">
          <div className="flex gap-2">
            {!isAdmin && (
              <button
                onClick={() => setShowAdminLogin(true)}
                className="bg-white border border-gray-200 text-gray-500 px-4 py-2.5 rounded-lg font-medium hover:border-gray-300 transition-colors text-sm"
              >
                🔑 Admin
              </button>
            )}
            <button
              onClick={() => setView({ type: 'ratings' })}
              className="bg-white border border-gray-200 text-gray-700 px-4 py-2.5 rounded-lg font-medium hover:border-gray-300 transition-colors text-sm"
            >
              Rankings
            </button>
            <button
              onClick={() => setView({ type: 'players' })}
              className="bg-white border border-gray-200 text-gray-700 px-4 py-2.5 rounded-lg font-medium hover:border-gray-300 transition-colors text-sm"
            >
              Players {players.length > 0 && <span className="text-gray-400">({players.length})</span>}
            </button>
            {isAdmin && (
              <button
                onClick={() => setView({ type: 'new' })}
                className="bg-blue-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                + New
              </button>
            )}
          </div>
        </div>

        <div className="space-y-8">
          {/* Competitive Games */}
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Competitive Play</h2>
            <div
              onClick={() => setView({ type: 'competitive' })}
              className="bg-white rounded-xl border border-purple-200 hover:border-purple-400 p-5 cursor-pointer hover:shadow-sm transition-all"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-lg font-semibold text-gray-900">Competitive Matches</h2>
                    <span className="shrink-0 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">Live</span>
                  </div>
                  <p className="text-sm text-gray-500">
                    {competitiveMatches.length === 0
                      ? 'No matches recorded yet'
                      : `${competitiveMatches.length} match${competitiveMatches.length !== 1 ? 'es' : ''} recorded · singles & doubles`}
                  </p>
                </div>
                <span className="text-gray-400 text-xl ml-4">&rsaquo;</span>
              </div>
            </div>
          </section>

          {/* Tournaments */}
          {summaries.length === 0 ? (
            isAdmin ? (
              <div className="text-center py-12 text-gray-400">
                <p className="text-xl">No tournaments yet</p>
                <p className="mt-2 text-sm">Create your first tournament to get started</p>
              </div>
            ) : null
          ) : (
            <>
              {inProgress.length > 0 && (
                <section>
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Tournaments · In Progress</h2>
                  <div className="grid gap-3">
                    {inProgress.map(s => (
                      <TournamentCard key={s.id} t={s} onClick={() => setView({ type: 'tournament', id: s.id })} />
                    ))}
                  </div>
                </section>
              )}
              {history.length > 0 && (
                <section>
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Tournaments · History</h2>
                  <div className="grid gap-3">
                    {history.map(s => (
                      <TournamentCard key={s.id} t={s} onClick={() => setView({ type: 'tournament', id: s.id })} />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        <p className="text-center text-xs text-gray-300 py-6">v{__APP_VERSION__}</p>
        </div>
      </div>
    </div>
  );
}
