import { useState, useEffect, useRef } from 'react';
import type { Tournament, Player } from './types';
import { subscribeTournaments, saveTournament, deleteTournament, subscribePlayers, saveRankings, subscribeRankings } from './store';
import { computePlayerRankings, type PlayerRanking } from './rankings';
import TournamentSetup from './components/TournamentSetup';
import TournamentView from './components/TournamentView';
import PlayersScreen from './components/PlayersScreen';
import RankingsScreen from './components/RankingsScreen';
import AdminLogin from './components/AdminLogin';
import ImportCSV from './components/ImportCSV';
import './index.css';

type View =
  | { type: 'home' }
  | { type: 'new' }
  | { type: 'import' }
  | { type: 'tournament'; id: string }
  | { type: 'players' }
  | { type: 'rankings' };

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
              {completedCount} / {allMatches.length} matches played
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
  const [rankings, setRankings] = useState<PlayerRanking[]>([]);
  const [view, setView] = useState<View>({ type: 'home' });
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const hasAutoNavigated = useRef(false);
  const hasInitRankings = useRef(false);

  useEffect(() => {
    const unsubscribeTournaments = subscribeTournaments((list) => {
      setTournaments(list);
      if (!hasAutoNavigated.current && list.length > 0) {
        hasAutoNavigated.current = true;
        const inProgress = list.find(t => getTournamentStatus(t) === 'in-progress');
        if (inProgress) setView({ type: 'tournament', id: inProgress.id });
      }
      // Backfill rankings on first load (covers existing data + seed script tournaments)
      if (!hasInitRankings.current && list.length > 0) {
        hasInitRankings.current = true;
        saveRankings(computePlayerRankings(list));
      }
    });
    const unsubscribePlayers = subscribePlayers(setPlayers);
    const unsubscribeRankings = subscribeRankings(setRankings);
    return () => {
      unsubscribeTournaments();
      unsubscribePlayers();
      unsubscribeRankings();
    };
  }, []);

  function recomputeRankings(updatedTournaments: Tournament[]) {
    saveRankings(computePlayerRankings(updatedTournaments));
  }

  function handleCreate(t: Tournament) {
    const updated = [t, ...tournaments];
    setTournaments(updated);
    saveTournament(t);
    recomputeRankings(updated);
    setView({ type: 'tournament', id: t.id });
  }

  function handleUpdate(t: Tournament) {
    const updated = tournaments.map(x => x.id === t.id ? t : x);
    setTournaments(updated);
    saveTournament(t);
    recomputeRankings(updated);
  }

  function handleDelete(id: string) {
    deleteTournament(id);
    recomputeRankings(tournaments.filter(t => t.id !== id));
    setView({ type: 'home' });
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

  if (view.type === 'import') {
    return (
      <ImportCSV
        seq={tournaments.length + 1}
        onCreate={handleCreate}
        onCancel={() => setView({ type: 'home' })}
      />
    );
  }

  if (view.type === 'players') {
    return <PlayersScreen players={players} isAdmin={isAdmin} onBack={() => setView({ type: 'home' })} />;
  }

  if (view.type === 'rankings') {
    return <RankingsScreen rankings={rankings} isAdmin={isAdmin} onBack={() => setView({ type: 'home' })} onRecompute={() => recomputeRankings(tournaments)} />;
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
      />
    );
  }

  const inProgress = tournaments.filter(t => getTournamentStatus(t) === 'in-progress');
  const history = tournaments.filter(t => getTournamentStatus(t) !== 'in-progress');

  return (
    <div className="min-h-screen bg-gray-50">
      {showAdminLogin && (
        <AdminLogin
          onSuccess={() => { setIsAdmin(true); setShowAdminLogin(false); }}
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
              onClick={() => setIsAdmin(false)}
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
              onClick={() => setView({ type: 'rankings' })}
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
                  onClick={() => setView({ type: 'import' })}
                  className="bg-white border border-gray-200 text-gray-700 px-4 py-2.5 rounded-lg font-medium hover:border-gray-300 transition-colors text-sm"
                >
                  Import CSV
                </button>
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

        {tournaments.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <div className="text-6xl mb-4">🏓</div>
            <p className="text-xl">No tournaments yet</p>
            <p className="mt-2">{isAdmin ? 'Create your first tournament to get started' : 'Login as admin to create tournaments'}</p>
          </div>
        ) : (
          <div className="space-y-8">
            {inProgress.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">In Progress</h2>
                <div className="grid gap-3">
                  {inProgress.map(t => (
                    <TournamentCard key={t.id} t={t} onClick={() => setView({ type: 'tournament', id: t.id })} />
                  ))}
                </div>
              </section>
            )}
            {history.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">History</h2>
                <div className="grid gap-3">
                  {history.map(t => (
                    <TournamentCard key={t.id} t={t} onClick={() => setView({ type: 'tournament', id: t.id })} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
