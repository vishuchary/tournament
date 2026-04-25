import { useRef, useState } from 'react';
import type { Tournament, TournamentLevel, Group, Team, Match, Game } from '../types';

interface Props {
  seq: number;
  onCreate: (t: Tournament) => void;
  onCancel: () => void;
}

function uid() { return Math.random().toString(36).slice(2, 10); }

interface ParseResult {
  teams: Team[];
  matches: Match[];
  gameCount: number;
  isDoubles: boolean;
  errors: string[];
}

function parseCSV(text: string): ParseResult {
  const lines = text.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) {
    return { teams: [], matches: [], gameCount: 0, isDoubles: false, errors: ['Need at least a header row and one data row'] };
  }

  const header = lines[0].split(',').map(h => h.trim());

  const p1Idx = header.findIndex(h => /^player\s*1$/i.test(h));
  const p2Idx = header.findIndex(h => /^player\s*2$/i.test(h));
  const o1Idx = header.findIndex(h => /^opponent\s*1$/i.test(h));
  const o2Idx = header.findIndex(h => /^opponent\s*2$/i.test(h));

  const gameIndices: number[] = [];
  header.forEach((h, i) => {
    if (/game\s*\d+\s*score/i.test(h)) gameIndices.push(i);
  });

  const errors: string[] = [];
  if (p1Idx === -1) errors.push('Missing "Player 1" column');
  if (o1Idx === -1) errors.push('Missing "Opponent 1" column');
  if (gameIndices.length === 0) errors.push('No "Game N Score" columns found (e.g. "Game 1 Score")');
  if (errors.length > 0) return { teams: [], matches: [], gameCount: 0, isDoubles: false, errors };

  // Doubles if both Player 2 and Opponent 2 columns exist AND have non-empty values in data rows
  const hasP2Data = p2Idx !== -1 && lines.slice(1).some(l => l.split(',')[p2Idx]?.trim());
  const hasO2Data = o2Idx !== -1 && lines.slice(1).some(l => l.split(',')[o2Idx]?.trim());
  const isDoubles = hasP2Data && hasO2Data;
  const gameCount = gameIndices.length;

  const teamMap = new Map<string, Team>();

  function getTeam(p1: string, p2?: string): Team {
    const players = [p1, ...(p2 ? [p2] : [])];
    const key = [...players].sort().join('|');
    if (!teamMap.has(key)) {
      teamMap.set(key, {
        id: uid(),
        name: players.join('_'),
        type: isDoubles ? 'doubles' : 'singles',
        players,
      });
    }
    return teamMap.get(key)!;
  }

  const matches: Match[] = [];
  const rowErrors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim());
    const p1 = cols[p1Idx] ?? '';
    const p2 = (isDoubles && p2Idx !== -1) ? (cols[p2Idx] ?? '') : '';
    const o1 = cols[o1Idx] ?? '';
    const o2 = (isDoubles && o2Idx !== -1) ? (cols[o2Idx] ?? '') : '';

    if (!p1 || !o1) {
      rowErrors.push(`Row ${i + 1}: missing player names — skipped`);
      continue;
    }

    const team1 = getTeam(p1, p2 || undefined);
    const team2 = getTeam(o1, o2 || undefined);

    const games: Game[] = gameIndices.map(gi => {
      const scoreStr = cols[gi] ?? '0-0';
      const [a, b] = scoreStr.split('-').map(n => parseInt(n) || 0);
      return { team1Score: a, team2Score: b };
    });

    matches.push({ id: uid(), team1Id: team1.id, team2Id: team2.id, games, completed: true });
  }

  return { teams: Array.from(teamMap.values()), matches, gameCount, isDoubles, errors: rowErrors };
}

export default function ImportCSV({ seq, onCreate, onCancel }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [csvText, setCsvText] = useState('');
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [name, setName] = useState(`Tournament_${seq}`);
  const [date, setDate] = useState(today);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleParse(text?: string) {
    const t = text ?? csvText;
    if (t.trim()) setParsed(parseCSV(t));
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      setCsvText(text);
      setParsed(null);
      handleParse(text);
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function handleCreate() {
    if (!parsed || parsed.teams.length < 2) return;

    const group: Group = {
      id: uid(),
      name: 'Group A',
      teams: parsed.teams,
      matches: parsed.matches,
    };
    const level: TournamentLevel = { id: uid(), name: 'Level 1', groups: [group] };
    const t: Tournament = {
      id: uid(),
      name: name.trim() || `Tournament_${seq}`,
      format: 'games',
      setCount: parsed.gameCount,
      matchType: parsed.isDoubles ? 'doubles' : 'singles',
      levels: [level],
      createdAt: Date.now(),
      date,
    };
    onCreate(t);
  }

  const fatalErrors = parsed?.errors.filter(e => !e.includes('skipped')) ?? [];
  const canCreate = parsed !== null && parsed.teams.length >= 2 && fatalErrors.length === 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={onCancel} className="text-gray-500 hover:text-gray-700 font-medium">← Back</button>
        <h1 className="text-lg font-bold text-gray-900">Import Tournament from CSV</h1>
      </div>

      <div className="max-w-2xl mx-auto p-6 space-y-6">

        {/* Format hint */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
          <p className="font-semibold mb-1">Expected CSV columns</p>
          <code className="text-xs block bg-white/60 rounded px-2 py-1 mt-1 overflow-x-auto whitespace-nowrap">
            Player 1, Player 2, Game 1 Score, Game 2 Score, …, Opponent 1, Opponent 2
          </code>
          <p className="mt-2 text-xs text-blue-700">
            Omit "Player 2" / "Opponent 2" for singles. Score format: <code>11-9</code> (team1-team2).
            All matches are imported as completed.
          </p>
        </div>

        {/* Input area */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">Paste CSV or upload file</label>
            <button
              onClick={() => fileRef.current?.click()}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              Upload .csv
            </button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
          </div>
          <textarea
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono outline-none focus:border-blue-400 h-52 resize-y"
            placeholder={`Player 1,Player 2,Game 1 Score,Game 2 Score,Opponent 1,Opponent 2\nChandu,Pradeep,11-9,11-9,Chary,Partha`}
            value={csvText}
            onChange={e => { setCsvText(e.target.value); setParsed(null); }}
          />
          <button
            onClick={() => handleParse()}
            disabled={!csvText.trim()}
            className="mt-2 px-5 py-2.5 bg-gray-800 text-white rounded-xl text-sm font-medium hover:bg-gray-900 disabled:opacity-40 transition-colors"
          >
            Parse CSV
          </button>
        </div>

        {/* Results */}
        {parsed && (
          <div className="space-y-4">

            {/* Errors */}
            {parsed.errors.length > 0 && (
              <div className={`border rounded-xl p-4 space-y-1 ${fatalErrors.length > 0 ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200'}`}>
                <p className={`text-sm font-semibold ${fatalErrors.length > 0 ? 'text-red-700' : 'text-yellow-700'}`}>
                  {fatalErrors.length > 0 ? 'Parse errors' : 'Warnings'}
                </p>
                {parsed.errors.map((e, i) => (
                  <p key={i} className={`text-sm ${fatalErrors.length > 0 ? 'text-red-700' : 'text-yellow-700'}`}>{e}</p>
                ))}
              </div>
            )}

            {/* Success summary */}
            {parsed.teams.length >= 2 && (
              <>
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800">
                  <p className="font-semibold mb-0.5">Parsed successfully</p>
                  <p>
                    {parsed.teams.length} teams &middot; {parsed.matches.length} matches &middot;{' '}
                    {parsed.gameCount} game{parsed.gameCount !== 1 ? 's' : ''} per match &middot;{' '}
                    {parsed.isDoubles ? 'Doubles' : 'Singles'}
                  </p>
                </div>

                {/* Teams list */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Teams detected</p>
                  <div className="flex flex-wrap gap-2">
                    {parsed.teams.map(t => (
                      <span key={t.id} className="bg-white border border-gray-200 rounded-lg px-2.5 py-1 text-sm text-gray-700">
                        {t.players.join(' / ')}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Tournament meta */}
                <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tournament name</label>
                    <input
                      type="text"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400"
                      value={name}
                      onChange={e => setName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                    <input
                      type="date"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400"
                      value={date}
                      onChange={e => setDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Format (auto-detected)</label>
                    <p className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5">
                      {parsed.gameCount} Game{parsed.gameCount !== 1 ? 's' : ''} &middot;{' '}
                      {parsed.isDoubles ? 'Doubles' : 'Singles'}
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleCreate}
                  disabled={!canCreate}
                  className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-semibold text-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
                >
                  Create Tournament
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
