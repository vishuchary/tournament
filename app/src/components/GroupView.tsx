import { useState } from 'react';
import type { Group, Match, MatchFormat, Team, Player } from '../types';
import { computeStandings, teamDisplayName } from '../rankings';
import MatchEntry from './MatchEntry';
import PlayerPicker from './PlayerPicker';

interface Props {
  group: Group;
  allGroups?: Group[];
  format: MatchFormat;
  setCount: number;
  players?: Player[];
  isLocked?: boolean;
  onUpdate: (g: Group) => void;
}

type PickerTarget = { teamId: string; playerIdx: number };

type Tab = 'matches' | 'standings' | 'teams';

function InlineInput({
  value,
  onSave,
  className = '',
}: {
  value: string;
  onSave: (val: string) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function commit() {
    setEditing(false);
    const v = draft.trim() || value;
    setDraft(v);
    if (v !== value) onSave(v);
  }

  if (editing) {
    return (
      <input
        autoFocus
        className={`border-b border-blue-400 outline-none bg-transparent ${className}`}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => e.key === 'Enter' && commit()}
        onFocus={e => e.target.select()}
      />
    );
  }

  return (
    <span
      className={`cursor-pointer hover:text-blue-600 transition-colors ${className}`}
      title="Tap to edit"
      onClick={() => { setDraft(value); setEditing(true); }}
    >
      {value}
    </span>
  );
}

export default function GroupView({ group, allGroups, format, setCount, players = [], isLocked = false, onUpdate }: Props) {
  const [tab, setTab] = useState<Tab>('matches');
  const [editMatch, setEditMatch] = useState<Match | null>(null);
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);

  const standings = computeStandings(group, format);
  const teamMap = Object.fromEntries(group.teams.map(t => [t.id, t]));

  function handleMatchSave(match: Match) {
    onUpdate({
      ...group,
      matches: group.matches.map(m => m.id === match.id ? match : m),
    });
    setEditMatch(null);
  }

  function updateTeam(updatedTeam: Team) {
    onUpdate({
      ...group,
      teams: group.teams.map(t => t.id === updatedTeam.id ? updatedTeam : t),
    });
  }

  function updateTeamName(team: Team, name: string) {
    updateTeam({ ...team, name });
  }

  function updatePlayerName(team: Team, idx: number, name: string) {
    const players = [...team.players];
    players[idx] = name;
    updateTeam({ ...team, players });
  }

  const completedCount = group.matches.filter(m => m.completed).length;
  const tabs: Tab[] = ['matches', 'standings', 'teams'];

  const pickerCurrentValue = pickerTarget
    ? group.teams.find(t => t.id === pickerTarget.teamId)?.players[pickerTarget.playerIdx] ?? ''
    : '';
  // Exclude players used anywhere in the level (all groups), except the current slot
  const pickerUsedNames = pickerTarget
    ? new Set(
        (allGroups ?? [group]).flatMap(grp =>
          grp.teams.flatMap(t =>
            t.players.filter((_, pi) =>
              !(grp.id === group.id && t.id === pickerTarget.teamId && pi === pickerTarget.playerIdx)
            )
          )
        )
      )
    : new Set<string>();

  return (
    <div>
      {pickerTarget && (
        <PlayerPicker
          players={players}
          current={pickerCurrentValue}
          usedNames={pickerUsedNames}
          onSelect={name => {
            const team = group.teams.find(t => t.id === pickerTarget.teamId);
            if (team) updatePlayerName(team, pickerTarget.playerIdx, name);
            setPickerTarget(null);
          }}
          onCancel={() => setPickerTarget(null)}
        />
      )}
      {editMatch && (
        <MatchEntry
          match={editMatch}
          team1={teamMap[editMatch.team1Id]}
          team2={teamMap[editMatch.team2Id]}
          format={format}
          setCount={setCount}
          readOnly={isLocked}
          onSave={handleMatchSave}
          onCancel={() => setEditMatch(null)}
        />
      )}

      {/* Progress */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="flex justify-between text-sm text-gray-600 mb-1">
          <span>Matches completed</span>
          <span>{completedCount} / {group.matches.length}</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div
            className="bg-blue-500 h-2 rounded-full transition-all"
            style={{ width: `${group.matches.length ? (completedCount / group.matches.length) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {tabs.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors capitalize ${
              tab === t
                ? 'bg-gray-900 text-white'
                : 'bg-white border border-gray-200 text-gray-700 hover:border-gray-400'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Matches tab */}
      {tab === 'matches' && (
        <div className="space-y-2">
          {group.matches.map(match => {
            const t1 = teamMap[match.team1Id];
            const t2 = teamMap[match.team2Id];
            return (
              <div
                key={match.id}
                className={`bg-white rounded-xl border p-4 cursor-pointer hover:shadow-sm transition-all ${
                  match.completed ? 'border-green-200' : 'border-gray-200'
                }`}
                onClick={() => setEditMatch(match)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    <span className="font-medium text-gray-900 flex-1 text-right">{t1 ? teamDisplayName(t1) : ''}</span>
                    {match.completed ? (
                      <div className="text-center min-w-[100px]">
                        <div className="text-sm font-mono text-gray-700">
                          {match.games.map((g, i) => (
                            <span key={i} className="mx-1">{g.team1Score}-{g.team2Score}</span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <span className="text-gray-300 text-xl font-light min-w-[100px] text-center">vs</span>
                    )}
                    <span className="font-medium text-gray-900 flex-1">{t2 ? teamDisplayName(t2) : ''}</span>
                  </div>
                  <div className="ml-4">
                    {match.completed
                      ? <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">Done</span>
                      : <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">Pending</span>
                    }
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Standings tab */}
      {tab === 'standings' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left text-gray-500 font-medium w-8">#</th>
                <th className="px-4 py-3 text-left text-gray-500 font-medium">Team</th>
                <th className="px-4 py-3 text-center text-gray-500 font-medium">{format === 'sets' ? 'MP' : 'GP'}</th>
                {format === 'sets' ? (
                  <>
                    <th className="px-4 py-3 text-center text-gray-500 font-medium">W</th>
                    <th className="px-4 py-3 text-center text-gray-500 font-medium">L</th>
                    <th className="px-4 py-3 text-center text-gray-500 font-medium">Sets W-L</th>
                  </>
                ) : (
                  <>
                    <th className="px-4 py-3 text-center text-gray-500 font-medium">GW</th>
                    <th className="px-4 py-3 text-center text-gray-500 font-medium">GL</th>
                  </>
                )}
                <th className="px-4 py-3 text-center text-gray-500 font-medium">Pts +/-</th>
                <th className="px-4 py-3 text-center text-gray-500 font-medium">Diff</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {standings.map((s, i) => (
                <tr key={s.team.id} className={i === 0 ? 'bg-yellow-50' : ''}>
                  <td className="px-4 py-3 text-center">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{teamDisplayName(s.team)}</div>
                    {s.team.players.length > 0 && (
                      <div className="text-xs text-gray-400">{s.team.players.join(' / ')}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600">{format === 'sets' ? s.matchesPlayed : s.gameWins + s.gameLosses}</td>
                  {format === 'sets' ? (
                    <>
                      <td className="px-4 py-3 text-center font-medium text-green-600">{s.matchWins}</td>
                      <td className="px-4 py-3 text-center text-red-400">{s.matchLosses}</td>
                      <td className="px-4 py-3 text-center text-gray-600">{s.setWins}-{s.setLosses}</td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 text-center font-medium text-green-600">{s.gameWins}</td>
                      <td className="px-4 py-3 text-center text-red-400">{s.gameLosses}</td>
                    </>
                  )}
                  <td className="px-4 py-3 text-center text-gray-600">{s.pointsFor}-{s.pointsAgainst}</td>
                  <td className={`px-4 py-3 text-center font-medium ${s.pointDiff > 0 ? 'text-green-600' : s.pointDiff < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                    {s.pointDiff > 0 ? '+' : ''}{s.pointDiff}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Teams tab */}
      {tab === 'teams' && (
        <div className="space-y-2">
          {group.teams.map((team, i) => (
            <div key={team.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start gap-3">
                <span className="text-xs text-gray-400 mt-1 w-5 shrink-0">{i + 1}</span>
                <div className="flex-1 space-y-1">
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Team name</p>
                    {isLocked ? (
                      <span className="text-sm font-semibold text-gray-900">{teamDisplayName(team)}</span>
                    ) : <InlineInput
                      value={team.name}
                      onSave={name => updateTeamName(team, name)}
                      className="text-sm font-semibold text-gray-900 w-full"
                    />}
                  </div>
                  {team.players.map((player, pi) => (
                    <div key={pi}>
                      <p className="text-xs text-gray-400 mb-0.5">
                        {team.players.length > 1 ? `Player ${pi + 1}` : 'Player'}
                      </p>
                      {isLocked ? (
                        <span className="text-sm text-gray-700">{player}</span>
                      ) : (
                        <button
                          onClick={() => setPickerTarget({ teamId: team.id, playerIdx: pi })}
                          className="text-sm text-blue-600 hover:text-blue-800 text-left truncate w-full"
                        >
                          {player || <span className="text-gray-400">Select player…</span>}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
          <p className="text-xs text-center text-gray-400 pt-1">Tap any name to edit</p>
        </div>
      )}
    </div>
  );
}
