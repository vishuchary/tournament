import { useEffect, useRef } from 'react';
import type { RatingAlgo } from '../store';

interface Props {
  playerName: string;
  rank: number;
  rating: number;
  won: number;
  lost: number;
  algo: RatingAlgo;
  onClose: () => void;
}

const W = 480;
const H = 260;

function drawCard(canvas: HTMLCanvasElement, { playerName, rank, rating, won, lost, algo }: Omit<Props, 'onClose'>) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  canvas.width = W;
  canvas.height = H;

  // Background
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0f172a');
  bg.addColorStop(1, '#1a2f50');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Left accent bar
  ctx.fillStyle = '#3b82f6';
  ctx.fillRect(0, 0, 5, H);

  // Top-right rank badge
  const medal = rank === 1 ? '1st' : rank === 2 ? '2nd' : rank === 3 ? '3rd' : `#${rank}`;
  ctx.fillStyle = rank === 1 ? '#fbbf24' : rank === 2 ? '#94a3b8' : rank === 3 ? '#fb923c' : '#3b82f6';
  ctx.beginPath();
  ctx.roundRect(W - 80, 16, 64, 28, 14);
  ctx.fill();
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(medal, W - 48, 35);

  // Club name
  ctx.textAlign = 'left';
  ctx.fillStyle = '#64748b';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText('Mountain House TT Club', 22, 36);

  // Player name
  const nameFontSize = playerName.length > 14 ? 36 : 44;
  ctx.font = `bold ${nameFontSize}px system-ui, sans-serif`;
  ctx.fillStyle = '#f1f5f9';
  ctx.fillText(playerName, 22, 110);

  // Divider line
  ctx.strokeStyle = '#1e3a5f';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(22, 126);
  ctx.lineTo(W - 22, 126);
  ctx.stroke();

  // Rating block (left)
  const ratingStr = algo === 'rc' ? rating.toFixed(1) : Math.round(rating).toString();
  ctx.font = `bold 48px system-ui, sans-serif`;
  ctx.fillStyle = '#f1f5f9';
  ctx.fillText(ratingStr, 22, 185);

  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = '#3b82f6';
  ctx.fillText(algo === 'rc' ? 'Ratings Central' : 'Glicko-2', 22, 205);

  // W/L block (right)
  const total = won + lost;
  const winRate = total > 0 ? Math.round((won / total) * 100) : 0;
  ctx.textAlign = 'right';
  ctx.font = 'bold 28px system-ui, sans-serif';
  ctx.fillStyle = '#f1f5f9';
  ctx.fillText(`${winRate}%`, W - 22, 178);
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText(`${won}W · ${lost}L`, W - 22, 200);
  ctx.fillText('win rate', W - 22, 216);

  // Bottom URL
  ctx.textAlign = 'left';
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = '#334155';
  ctx.fillText('mhttclub.hublabs.us', 22, H - 12);

  // Bottom right: Combined ranking label
  ctx.textAlign = 'right';
  ctx.fillStyle = '#334155';
  ctx.fillText('Combined Ranking', W - 22, H - 12);
}

export default function ShareCard({ playerName, rank, rating, won, lost, algo, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      drawCard(canvasRef.current, { playerName, rank, rating, won, lost, algo });
    }
  }, [playerName, rank, rating, won, lost, algo]);

  async function handleShare() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(async blob => {
      if (!blob) return;
      const file = new File([blob], `${playerName}-ranking.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: `${playerName} · MHTT Rankings` });
          return;
        } catch {
          // user cancelled or share failed — fall through to download
        }
      }
      // Fallback: download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${playerName}-ranking.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="flex flex-col items-center gap-4" onClick={e => e.stopPropagation()}>
        <canvas
          ref={canvasRef}
          className="rounded-2xl shadow-2xl max-w-full"
          style={{ maxWidth: '100%', height: 'auto' }}
        />
        <div className="flex gap-3">
          <button
            onClick={handleShare}
            className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-medium text-sm hover:bg-blue-700 transition-colors"
          >
            Share / Download
          </button>
          <button
            onClick={onClose}
            className="bg-white/10 text-white px-6 py-2.5 rounded-xl font-medium text-sm hover:bg-white/20 transition-colors"
          >
            Close
          </button>
        </div>
        <p className="text-white/40 text-xs">Tap outside to close</p>
      </div>
    </div>
  );
}
