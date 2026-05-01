import { useState, useEffect, useRef, useMemo } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { auth } from './firebase';
import type { Tournament, Player, PlayerRatingEntry, CompetitiveMatch } from './types';
import {
  subscribeTournaments, saveTournament, deleteTournament,
  subscribePlayers,
  subscribeBaselineRatings, subscribeAlgoSetting, saveAlgoSetting,
  subscribeTopRankers, saveTopRankers,
  triggerBaselineRatingsRecompute,
  subscribeCompetitiveMatches,
  type RatingAlgo,
} from './store';
import { buildCombined } from './rankings';
import TournamentSetup from './components/TournamentSetup';
import TournamentView from './components/TournamentView';
import PlayersScreen from './components/PlayersScreen';
import PlayerStatsScreen from './components/PlayerStatsScreen';
import RatingsScreen from './components/RatingsScreen';
import CompetitiveGamesScreen from './components/CompetitiveGamesScreen';
import AdminLogin from './components/AdminLogin';
import './index.css';

type NavView = { type: 'home' } | { type: 'tournament'; id: string } | { type: 'competitive' } | { type: 'players' } | { type: 'ratings' };

type View =
  | { type: 'home' }
  | { type: 'new' }
  | { type: 'tournament'; id: string }
  | { type: 'competitive' }
  | { type: 'players' }
  | { type: 'playerStats'; name: string; back: NavView }
  | { type: 'ratings' };

function getTournamentStatus(t: Tournament): 'not-started' | 'in-progress' | 'completed' {
  const allMatches = t.levels.flatMap(l => l.groups.flatMap(g => g.matches));
  if (allMatches.length === 0) return 'not-started';
  const completedCount = allMatches.filter(m => m.completed).length;
  if (completedCount === 0) return 'not-started';
  if (completedCount === allMatches.length) return 'completed';
  return 'in-progress';
}

function TournamentCard({ t, onClick }: { t: Tournament; onClick: () => void }) {
  const status = getTournamentStatus(t);
  const allMatches = t.levels.flatMap(l => l.groups.flatMap(g => g.matches));
  const completedCount = allMatches.filter(m => m.completed).length;
  const completedGames = allMatches.filter(m => m.completed).flatMap(m => m.games).length;
  const levelCount = t.levels.length;
  const level1Groups = t.levels[0]?.groups.length ?? 0;

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
          {allMatches.length > 0 && (
            <p className="text-xs text-gray-400 mt-1">
              {completedCount} / {allMatches.length} matches · {completedGames} games played
            </p>
          )}
        </div>
        <span className="text-gray-400 text-xl ml-4">&rsaquo;</span>
      </div>
    </div>
  );
}

export default function App() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
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
    () => new Set(buildCombined(baselineRatings, algo).slice(0, topRankers).map(r => r.name)),
    [baselineRatings, algo, topRankers],
  );

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, u => setUser(u));
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    const unsubscribeTournaments = subscribeTournaments((list) => {
      setTournaments(list);
      if (!hasAutoNavigated.current && list.length > 0) {
        hasAutoNavigated.current = true;
        const inProgress = list.find(t => getTournamentStatus(t) === 'in-progress');
        if (inProgress) setView({ type: 'tournament', id: inProgress.id });
      }
    });
    const unsubscribePlayers = subscribePlayers(setPlayers);
    const unsubscribeCompetitive = subscribeCompetitiveMatches(setCompetitiveMatches);
    const unsubscribeBaselineRatings = subscribeBaselineRatings(setBaselineRatings);
    const unsubscribeAlgo = subscribeAlgoSetting(setAlgo);
    const unsubscribeTopRankers = subscribeTopRankers(setTopRankers);
    return () => {
      unsubscribeTournaments();
      unsubscribePlayers();
      unsubscribeCompetitive();
      unsubscribeBaselineRatings();
      unsubscribeAlgo();
      unsubscribeTopRankers();
    };
  }, []);

  async function getToken(): Promise<string> {
    return (await user?.getIdToken()) ?? '';
  }

  async function handleCreate(t: Tournament) {
    setTournaments(prev => [t, ...prev]);
    await saveTournament(t);
    setView({ type: 'tournament', id: t.id });
  }

  async function handleUpdate(t: Tournament) {
    setTournaments(prev => prev.map(x => x.id === t.id ? t : x));
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
      <TournamentSetup
        seq={tournaments.length + 1}
        players={players}
        onCreate={handleCreate}
        onCancel={() => setView({ type: 'home' })}
      />
    );
  }


  if (view.type === 'players') {
    return <PlayersScreen players={players} isAdmin={isAdmin} topPlayerNames={topPlayerNames} onBack={() => setView({ type: 'home' })} getToken={getToken} onPlayerClick={name => setView({ type: 'playerStats', name, back: { type: 'players' } })} />;
  }

  if (view.type === 'playerStats') {
    return (
      <PlayerStatsScreen
        playerName={view.name}
        tournaments={tournaments}
        competitiveMatches={competitiveMatches}
        ratings={baselineRatings}
        algo={algo}
        onBack={() => setView(view.back)}
      />
    );
  }

  if (view.type === 'competitive') {
    return (
      <CompetitiveGamesScreen
        matches={competitiveMatches}
        players={players}
        isAdmin={isAdmin}
        onBack={() => setView({ type: 'home' })}
        onDataChange={handleRecompute}
      />
    );
  }

  if (view.type === 'ratings') {
    return (
      <RatingsScreen
        ratings={baselineRatings}
        algo={algo}
        topRankers={topRankers}
        isAdmin={isAdmin}
        onBack={() => setView({ type: 'home' })}
        onAlgoChange={handleAlgoChange}
        onTopRankersChange={handleTopRankersChange}
        onRecompute={handleRecompute}
        onPlayerClick={name => setView({ type: 'playerStats', name, back: { type: 'ratings' } })}
      />
    );
  }

  if (view.type === 'tournament') {
    const t = tournaments.find(x => x.id === view.id);
    if (!t) return null;
    return (
      <TournamentView
        tournament={t}
        players={players}
        isAdmin={isAdmin}
        onUpdate={handleUpdate}
        onDelete={() => handleDelete(t.id)}
        onBack={() => setView({ type: 'home' })}
        onRequestAdmin={() => setShowAdminLogin(true)}
        onPlayerClick={name => setView({ type: 'playerStats', name, back: { type: 'tournament', id: t.id } })}
      />
    );
  }

  const inProgress = tournaments.filter(t => getTournamentStatus(t) === 'in-progress');
  const history = tournaments.filter(t => getTournamentStatus(t) !== 'in-progress');

  return (
    <div className="min-h-screen bg-gray-50">
      {showAdminLogin && (
        <AdminLogin
          onSuccess={() => setShowAdminLogin(false)}
          onCancel={() => setShowAdminLogin(false)}
        />
      )}

      {/* Banner */}
      <div className="relative w-full h-48 sm:h-64 overflow-hidden">
        <img
          src="/banner.jpg"
          alt="Mountain House TT Club"
          className="w-full h-full object-cover object-center"
        />
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
              <>
                <button
                  onClick={() => setView({ type: 'new' })}
                  className="bg-blue-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors"
                >
                  + New
                </button>
              </>
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
          {tournaments.length === 0 && inProgress.length === 0 ? (
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
                    {inProgress.map(t => (
                      <TournamentCard key={t.id} t={t} onClick={() => setView({ type: 'tournament', id: t.id })} />
                    ))}
                  </div>
                </section>
              )}
              {history.length > 0 && (
                <section>
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Tournaments · History</h2>
                  <div className="grid gap-3">
                    {history.map(t => (
                      <TournamentCard key={t.id} t={t} onClick={() => setView({ type: 'tournament', id: t.id })} />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
