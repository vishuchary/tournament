import { useState } from 'react';
import type { Tournament, TournamentLevel, Group, Team, MatchFormat, Player } from '../types';
import { generateMatches, teamDisplayName } from '../rankings';

interface Props {
  seq: number;
  players: Player[];
  onCreate: (t: Tournament) => void;
  onCancel: () => void;
}

function uid() { return Math.random().toString(36).slice(2, 10); }

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function serpentineGroupIndex(teamIdx: number, groupCount: number): number {
  const round = Math.floor(teamIdx / groupCount);
  const pos = teamIdx % groupCount;
  return round % 2 === 0 ? pos : groupCount - 1 - pos;
}

type Step = 'meta' | 'players' | 'groups';
type Mode = 'random' | 'custom';

export default function TournamentSetup({ seq, players, onCreate, onCancel }: Props) {
  const [step, setStep] = useState<Step>('meta');
  const [mode, setMode] = useState<Mode>('random');
  const [name, setName] = useState(`Tournament_${seq}`);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [format, setFormat] = useState<MatchFormat>('sets');
  const [setCount, setSetCount] = useState(3); // sets: odd (1,3,5,7,9); games: any
  const [matchType, setMatchType] = useState<'singles' | 'doubles'>('singles');
  const [selected, setSelected] = useState<string[]>([]);
  const [groupCount, setGroupCount] = useState(1);

  // Step 3 state — populated when entering groups step
  const [teamOrder, setTeamOrder] = useState<string[]>([]);
  const [groupAssignments, setGroupAssignments] = useState<number[]>([]); // groupAssignments[teamIdx] = groupIdx

  function teamsFromOrder(order: string[]): { name: string; players: string[] }[] {
    if (matchType === 'singles') return order.map(p => ({ name: p, players: [p] }));
    const t = [];
    for (let i = 0; i + 1 < order.length; i += 2) {
      const players = [order[i], order[i + 1]];
      t.push({ name: teamDisplayName({ id: '', name: '', type: 'doubles', players }), players });
    }
    return t;
  }

  function initAssignments(order: string[], gc: number): number[] {
    return teamsFromOrder(order).map((_, i) => serpentineGroupIndex(i, gc));
  }

  function getGroupDist() {
    const teams = teamsFromOrder(teamOrder);
    const groups = Array.from({ length: groupCount }, (_, i) => ({
      name: `Group ${String.fromCharCode(65 + i)}`,
      teams: [] as { name: string; players: string[]; teamIdx: number }[],
    }));
    teams.forEach((t, i) => groups[groupAssignments[i] ?? 0].teams.push({ ...t, teamIdx: i }));
    return groups;
  }

  // Step 2 derived
  const previewTeams = teamsFromOrder(selected);
  const hasOddDoubles = matchType === 'doubles' && selected.length % 2 !== 0;
  const canAdvance = previewTeams.length >= 2 && !hasOddDoubles;

  function togglePlayer(playerName: string) {
    setSelected(prev => prev.includes(playerName) ? prev.filter(p => p !== playerName) : [...prev, playerName]);
  }

  function movePlayer(idx: number, dir: -1 | 1) {
    const next = idx + dir;
    if (next < 0 || next >= selected.length) return;
    setSelected(prev => { const a = [...prev]; [a[idx], a[next]] = [a[next], a[idx]]; return a; });
  }

  function enterGroupStep() {
    const order = mode === 'random' ? shuffle([...selected]) : [...selected];
    setTeamOrder(order);
    setGroupAssignments(initAssignments(order, groupCount));
    setStep('groups');
  }

  function reshuffle() {
    const order = shuffle([...selected]);
    setTeamOrder(order);
    setGroupAssignments(initAssignments(order, groupCount));
  }

  function handleGroupCountChange(val: number) {
    const gc = Math.max(1, Math.min(teamsFromOrder(teamOrder).length || previewTeams.length, val));
    setGroupCount(gc);
    setGroupAssignments(initAssignments(teamOrder, gc));
  }

  function moveTeam(teamIdx: number, dir: -1 | 1) {
    setGroupAssignments(prev => {
      const next = [...prev];
      next[teamIdx] = Math.max(0, Math.min(groupCount - 1, next[teamIdx] + dir));
      return next;
    });
  }

  function handleCreate() {
    const builtGroups: Group[] = getGroupDist().map(gd => {
      const teams: Team[] = gd.teams.map(t => ({ id: uid(), name: t.name, type: matchType, players: t.players }));
      const matches = generateMatches(teams).map(p => ({
        id: uid(), team1Id: p.team1Id, team2Id: p.team2Id, games: [], completed: false,
      }));
      return { id: uid(), name: gd.name, teams, matches };
    });
    const level1: TournamentLevel = { id: uid(), name: 'Level 1', groups: builtGroups, setCount };
    onCreate({ id: uid(), name: name.trim() || `Tournament_${seq}`, format, setCount, matchType, levels: [level1], createdAt: Date.now(), date });
  }

  // ── Step 1: Meta ─────────────────────────────────────────────────────────
  if (step === 'meta') {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-xl mx-auto p-4">
          <div className="flex items-center gap-3 mb-5">
            <button onClick={onCancel} className="text-gray-500 hover:text-gray-700 text-sm">← Back</button>
            <h1 className="text-xl font-bold text-gray-900">New Tournament</h1>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tournament Name</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-blue-400"
                value={name} placeholder="e.g. Spring 2025"
                onChange={e => setName(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-blue-400"
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Assignment Mode</label>
              <div className="grid grid-cols-2 gap-3">
                {(['random', 'custom'] as Mode[]).map(m => (
                  <button key={m} onClick={() => setMode(m)}
                    className={`p-3 rounded-lg border-2 text-left transition-colors ${mode === m ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-200'}`}
                  >
                    <div className="font-medium text-gray-900 text-sm">
                      {m === 'random' ? '🔀 Random' : '✏️ Custom'}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {m === 'random' ? 'App shuffles teams & groups' : 'You control team pairing & group placement'}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Match Format</label>
              <div className="grid grid-cols-2 gap-3 mb-3">
                {(['sets', 'games'] as MatchFormat[]).map(f => (
                  <button key={f} onClick={() => { setFormat(f); setSetCount(f === 'sets' ? 3 : 2); }}
                    className={`p-3 rounded-lg border-2 text-left transition-colors ${format === f ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-200'}`}
                  >
                    <div className="font-medium text-gray-900 text-sm">{f === 'sets' ? 'Sets (best of)' : 'Games (play all)'}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{f === 'sets' ? 'Winner = most sets won' : 'Winner = most games won'}</div>
                  </button>
                ))}
              </div>
              {/* Count picker */}
              <div>
                <p className="text-xs text-gray-500 mb-2">
                  {format === 'sets' ? 'Number of sets (odd):' : 'Number of games:'}
                </p>
                <div className="flex gap-2 flex-wrap">
                  {(format === 'sets' ? [1, 3, 5, 7, 9] : [1, 2, 3, 4, 5, 6]).map(n => (
                    <button
                      key={n}
                      onClick={() => setSetCount(n)}
                      className={`w-10 h-10 rounded-lg border-2 font-semibold text-sm transition-colors ${setCount === n ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-700 hover:border-blue-200'}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Match Type</label>
              <div className="grid grid-cols-2 gap-3">
                {(['singles', 'doubles'] as const).map(mt => (
                  <button key={mt} onClick={() => setMatchType(mt)}
                    className={`p-3 rounded-lg border-2 text-left transition-colors ${matchType === mt ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-200'}`}
                  >
                    <div className="font-medium text-gray-900 text-sm capitalize">{mt}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{mt === 'singles' ? '1 player per team' : '2 players per team'}</div>
                  </button>
                ))}
              </div>
            </div>

            <button onClick={() => setStep('players')}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Next: Select Players →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 2: Select Players ───────────────────────────────────────────────
  if (step === 'players') {
    const unselected = players.filter(p => !selected.includes(p.name));

    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-xl mx-auto p-4">
          <div className="flex items-center gap-3 mb-5">
            <button onClick={() => setStep('meta')} className="text-gray-500 hover:text-gray-700 text-sm">← Back</button>
            <h1 className="text-xl font-bold text-gray-900">Select Players</h1>
            <span className="ml-auto text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-lg">
              {mode === 'random' ? '🔀 Random' : '✏️ Custom'}
            </span>
          </div>

          {/* Selected list */}
          {selected.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Selected · {selected.length} player{selected.length !== 1 ? 's' : ''}
                {matchType === 'doubles' && ` → ${previewTeams.length} team${previewTeams.length !== 1 ? 's' : ''}`}
                {hasOddDoubles && <span className="ml-2 text-amber-500">⚠ need even count</span>}
              </p>

              {matchType === 'singles' ? (
                <div className="space-y-1">
                  {selected.map((p, i) => (
                    <div key={p} className="flex items-center gap-2 py-1">
                      <span className="text-xs text-gray-400 w-5 text-center">{i + 1}</span>
                      <span className="flex-1 text-sm text-gray-800">{p}</span>
                      {mode === 'custom' && <>
                        <button onClick={() => movePlayer(i, -1)} disabled={i === 0} className="text-gray-300 hover:text-gray-600 disabled:opacity-20 px-1 text-base leading-none">↑</button>
                        <button onClick={() => movePlayer(i, 1)} disabled={i === selected.length - 1} className="text-gray-300 hover:text-gray-600 disabled:opacity-20 px-1 text-base leading-none">↓</button>
                      </>}
                      <button onClick={() => togglePlayer(p)} className="text-gray-300 hover:text-red-400 px-1 text-xl leading-none">×</button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {Array.from({ length: Math.ceil(selected.length / 2) }, (_, pi) => {
                    const p1 = selected[pi * 2], p2 = selected[pi * 2 + 1];
                    const isPaired = !!p2;
                    return (
                      <div key={pi} className={`rounded-lg p-2.5 ${isPaired ? 'bg-blue-50 border border-blue-100' : 'bg-amber-50 border border-amber-100'}`}>
                        <p className="text-xs font-medium text-gray-500 mb-1.5">
                          Team {pi + 1}{!isPaired && ' — needs a partner'}
                          {mode === 'random' && isPaired && <span className="ml-1 text-gray-400">(randomized)</span>}
                        </p>
                        {[p1, p2].filter(Boolean).map((p, ri) => {
                          const idx = pi * 2 + ri;
                          return (
                            <div key={p} className="flex items-center gap-2 py-0.5">
                              <span className="text-xs text-gray-400 w-5 text-center">{idx + 1}</span>
                              <span className="flex-1 text-sm text-gray-800">{p}</span>
                              {mode === 'custom' && <>
                                <button onClick={() => movePlayer(idx, -1)} disabled={idx === 0} className="text-gray-300 hover:text-gray-600 disabled:opacity-20 px-1 text-base leading-none">↑</button>
                                <button onClick={() => movePlayer(idx, 1)} disabled={idx === selected.length - 1} className="text-gray-300 hover:text-gray-600 disabled:opacity-20 px-1 text-base leading-none">↓</button>
                              </>}
                              <button onClick={() => togglePlayer(p!)} className="text-gray-300 hover:text-red-400 px-1 text-xl leading-none">×</button>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
              {mode === 'random' && (
                <p className="text-xs text-gray-400 mt-3">Teams and groups will be randomized on the next step.</p>
              )}
            </div>
          )}

          {/* Available players */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Available Players</p>
            {players.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">No players yet — add them in the Players screen</p>
            )}
            {players.length > 0 && unselected.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-2">All players selected</p>
            )}
            <div className="space-y-0.5">
              {unselected.map(p => (
                <button key={p.id} onClick={() => togglePlayer(p.name)}
                  className="w-full flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-blue-50 transition-colors text-left"
                >
                  <span className="w-5 h-5 rounded-full border-2 border-gray-200 shrink-0" />
                  <span className="text-sm text-gray-800">{p.name}</span>
                </button>
              ))}
            </div>
          </div>

          <button onClick={enterGroupStep} disabled={!canAdvance}
            className="w-full bg-blue-600 text-white py-3 rounded-xl font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            Next: Set Groups →
          </button>
        </div>
      </div>
    );
  }

  // ── Step 3: Groups ───────────────────────────────────────────────────────
  const groupDist = getGroupDist();
  const totalTeams = teamsFromOrder(teamOrder).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-xl mx-auto p-4">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => setStep('players')} className="text-gray-500 hover:text-gray-700 text-sm">← Back</button>
          <h1 className="text-xl font-bold text-gray-900">Configure Groups</h1>
          {mode === 'random' && (
            <button onClick={reshuffle}
              className="ml-auto text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg font-medium transition-colors"
            >
              🔀 Re-shuffle
            </button>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Number of Groups</label>
          <input
            type="number" min={1} max={totalTeams}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-blue-400"
            value={groupCount}
            onChange={e => handleGroupCountChange(parseInt(e.target.value) || 1)}
          />
          <p className="text-xs text-gray-400 mt-1">
            {totalTeams} team{totalTeams !== 1 ? 's' : ''} · ~{Math.ceil(totalTeams / groupCount)} per group
            {mode === 'custom' && groupCount > 1 && <span> · use ← → to move teams between groups</span>}
          </p>
        </div>

        {/* Groups preview with move controls */}
        <div className="space-y-3 mb-5">
          {groupDist.map((g, gi) => (
            <div key={g.name} className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                {g.name} · {g.teams.length} team{g.teams.length !== 1 ? 's' : ''} · {g.teams.length * (g.teams.length - 1) / 2} match{g.teams.length * (g.teams.length - 1) / 2 !== 1 ? 'es' : ''}
              </p>
              <div className="space-y-1.5">
                {g.teams.length === 0 && <p className="text-xs text-gray-400 italic">No teams yet</p>}
                {g.teams.map(t => (
                  <div key={t.teamIdx} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-gray-800">{t.name}</span>
                      {matchType === 'doubles' && (
                        <span className="text-xs text-gray-400 ml-1.5">({t.players.join(' + ')})</span>
                      )}
                    </div>
                    {groupCount > 1 && (
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => moveTeam(t.teamIdx, -1)}
                          disabled={gi === 0}
                          className="text-xs bg-gray-100 hover:bg-blue-100 hover:text-blue-700 disabled:opacity-20 px-2 py-1 rounded font-medium transition-colors"
                          title={`Move to ${groupDist[gi - 1]?.name}`}
                        >←</button>
                        <button
                          onClick={() => moveTeam(t.teamIdx, 1)}
                          disabled={gi === groupCount - 1}
                          className="text-xs bg-gray-100 hover:bg-blue-100 hover:text-blue-700 disabled:opacity-20 px-2 py-1 rounded font-medium transition-colors"
                          title={`Move to ${groupDist[gi + 1]?.name}`}
                        >→</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <button onClick={handleCreate}
          className="w-full bg-blue-600 text-white py-3 rounded-xl font-medium hover:bg-blue-700 transition-colors"
        >
          Create Tournament
        </button>
      </div>
    </div>
  );
}
