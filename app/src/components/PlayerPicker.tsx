import { useState } from 'react';
import type { Player } from '../types';

interface Props {
  players: Player[];
  current: string;
  usedNames?: Set<string>;
  onSelect: (name: string) => void;
  onCancel: () => void;
}

export default function PlayerPicker({ players, current, usedNames, onSelect, onCancel }: Props) {
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const filtered = players
    .filter(p => p.name === current || !usedNames?.has(p.name))
    .filter(p => p.name.toLowerCase().includes(q));
  const exactMatch = players.some(p => p.name.toLowerCase() === q);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex flex-col justify-end sm:justify-center sm:items-center sm:p-4">
      <div className="bg-white w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl shadow-xl flex flex-col max-h-[80vh]">

        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <h2 className="text-lg font-bold text-gray-900">Select Player</h2>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="px-5 pb-3 shrink-0">
          <input
            autoFocus
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-400"
            placeholder="Search or type a name…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>

        <div className="overflow-y-auto flex-1 px-3 pb-3">
          {filtered.length === 0 && !query && (
            <p className="text-center text-gray-400 text-sm py-6">No players yet. Type a name below.</p>
          )}

          {filtered.map(p => (
            <button
              key={p.id}
              onClick={() => onSelect(p.name)}
              className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-colors mb-1 ${
                p.name === current
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'hover:bg-gray-50 text-gray-800'
              }`}
            >
              {p.name}
              {p.name === current && <span className="float-right text-blue-400">✓</span>}
            </button>
          ))}

          {query && !exactMatch && (
            <button
              onClick={() => onSelect(query.trim())}
              className="w-full text-left px-4 py-3 rounded-xl text-sm text-blue-600 hover:bg-blue-50 transition-colors mt-1 border border-dashed border-blue-200"
            >
              Use "<span className="font-medium">{query.trim()}</span>"
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
