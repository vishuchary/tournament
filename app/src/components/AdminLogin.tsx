import { useState } from 'react';

interface Props {
  onSuccess: () => void;
  onCancel: () => void;
}

export default function AdminLogin({ onSuccess, onCancel }: Props) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  function submit(value: string) {
    const target = (import.meta.env.VITE_ADMIN_PIN as string | undefined) || '1234';
    if (value === target) {
      onSuccess();
    } else {
      setError(true);
      setPin('');
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex flex-col justify-end sm:justify-center sm:items-center sm:p-4">
      <div className="bg-white w-full sm:max-w-xs sm:rounded-2xl rounded-t-2xl shadow-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">Admin Login</h2>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <label className="block text-sm font-medium text-gray-700 mb-1">Admin PIN</label>
        <input
          autoFocus
          type="password"
          inputMode="numeric"
          maxLength={20}
          className={`w-full border rounded-xl px-3 py-3 text-lg text-center tracking-widest outline-none transition-colors ${
            error ? 'border-red-400 focus:border-red-400' : 'border-gray-200 focus:border-blue-400'
          }`}
          placeholder="••••"
          value={pin}
          onChange={e => { setPin(e.target.value); setError(false); }}
          onKeyDown={e => e.key === 'Enter' && submit(pin)}
        />
        {error && <p className="text-red-500 text-sm mt-1.5 text-center">Incorrect PIN</p>}

        <button
          onClick={() => submit(pin)}
          disabled={!pin}
          className="w-full mt-4 bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-40 transition-colors"
        >
          Enter Admin Mode
        </button>
      </div>
    </div>
  );
}
