import { useState } from 'react';
import type { Player } from '../types';
import { savePlayer, deletePlayer } from '../store';

interface Props {
  players: Player[];
  isAdmin: boolean;
  onBack: () => void;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

const DEFAULT_PLACE = 'Mountain House';

type PlayerDraft = {
  name: string;
  age: string;
  sex: 'male' | 'female' | '';
  hand: 'right' | 'left' | '';
  place: string;
};

function emptyDraft(): PlayerDraft {
  return { name: '', age: '', sex: 'male', hand: 'right', place: DEFAULT_PLACE };
}

function playerToDraft(p: Player): PlayerDraft {
  return {
    name: p.name,
    age: p.age !== undefined ? String(p.age) : '',
    sex: p.sex ?? '',
    hand: p.hand ?? '',
    place: p.place ?? DEFAULT_PLACE,
  };
}

function draftToPlayer(id: string, d: PlayerDraft): Player {
  const p: Player = { id, name: d.name.trim() || 'Player' };
  if (d.age) p.age = parseInt(d.age);
  if (d.sex) p.sex = d.sex;
  if (d.hand) p.hand = d.hand;
  if (d.place.trim()) p.place = d.place.trim();
  return p;
}

function ToggleGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T | '';
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            value === o.value
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function PlayerForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: PlayerDraft;
  onSave: (d: PlayerDraft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<PlayerDraft>(initial);
  const set = (field: keyof PlayerDraft, value: string) =>
    setDraft(prev => ({ ...prev, [field]: value }));

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex flex-col justify-end sm:justify-center sm:items-center sm:p-4">
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <h2 className="text-lg font-bold text-gray-900">
            {initial.name ? 'Edit Player' : 'Add Player'}
          </h2>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="overflow-y-auto px-5 pb-3 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Name *</label>
            <input
              autoFocus
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400"
              placeholder="Player name"
              value={draft.name}
              onChange={e => set('name', e.target.value)}
              onKeyDown={e => e.key === 'Enter' && draft.name.trim() && onSave(draft)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Age</label>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={120}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400"
                placeholder="–"
                value={draft.age}
                onChange={e => set('age', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Place</label>
              <input
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400"
                placeholder={DEFAULT_PLACE}
                value={draft.place}
                onChange={e => set('place', e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">Sex</label>
            <ToggleGroup
              options={[
                { label: 'Male', value: 'male' },
                { label: 'Female', value: 'female' },
              ]}
              value={draft.sex}
              onChange={v => set('sex', v)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">Handedness</label>
            <ToggleGroup
              options={[
                { label: 'Right-handed', value: 'right' },
                { label: 'Left-handed', value: 'left' },
              ]}
              value={draft.hand}
              onChange={v => set('hand', v)}
            />
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 shrink-0">
          <button
            onClick={() => onSave(draft)}
            disabled={!draft.name.trim()}
            className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            Save Player
          </button>
        </div>
      </div>
    </div>
  );
}

function playerSummary(p: Player): string {
  const parts: string[] = [];
  if (p.age) parts.push(`Age ${p.age}`);
  if (p.sex) parts.push(p.sex.charAt(0).toUpperCase() + p.sex.slice(1));
  if (p.hand) parts.push(p.hand === 'right' ? 'Right-handed' : 'Left-handed');
  if (p.place) parts.push(p.place);
  return parts.join(' · ');
}

export default function PlayersScreen({ players, isAdmin, onBack }: Props) {
  const [formState, setFormState] = useState<
    | { mode: 'add' }
    | { mode: 'edit'; player: Player }
    | null
  >(null);

  function handleSave(draft: PlayerDraft) {
    if (!draft.name.trim()) return;
    const id = formState?.mode === 'edit' ? formState.player.id : uid();
    savePlayer(draftToPlayer(id, draft));
    setFormState(null);
  }

  function handleDelete(id: string) {
    if (confirm('Remove this player?')) deletePlayer(id);
  }

  const initial =
    formState?.mode === 'edit' ? playerToDraft(formState.player) : emptyDraft();

  return (
    <div className="min-h-screen bg-gray-50">
      {formState && (
        <PlayerForm
          initial={initial}
          onSave={handleSave}
          onCancel={() => setFormState(null)}
        />
      )}

      <div className="max-w-xl mx-auto p-4">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="text-gray-500 hover:text-gray-700 text-sm">← Back</button>
            <h1 className="text-xl font-bold text-gray-900">Players</h1>
          </div>
          {isAdmin && (
            <button
              onClick={() => setFormState({ mode: 'add' })}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              + Add Player
            </button>
          )}
        </div>

        {players.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-3">👤</div>
            <p>No players yet</p>
            <p className="text-sm mt-1">Add players to select them when creating tournaments</p>
          </div>
        ) : (
          <div className="space-y-2">
            {players.map(p => (
              <div key={p.id} className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{p.name}</p>
                  {playerSummary(p) && (
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{playerSummary(p)}</p>
                  )}
                </div>
                {isAdmin && (
                  <>
                    <button
                      onClick={() => setFormState({ mode: 'edit', player: p })}
                      className="text-gray-400 hover:text-blue-500 text-sm px-1 shrink-0"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="text-gray-300 hover:text-red-400 text-lg leading-none px-1 shrink-0"
                    >
                      ×
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
