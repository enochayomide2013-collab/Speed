import React from 'react';
import { Camera, ChevronLeft, ChevronRight, Eye, LogOut, Video } from 'lucide-react';
import { SPEEDSTARS } from '../shared/gameData';
import type { ControlBindings } from '../shared/types';
import type { HudSnapshot } from '../engine/RaceManager';

interface SpectatorHudProps {
  hud: HudSnapshot;
  bindings: ControlBindings;
  onPrevTarget: () => void;
  onNextTarget: () => void;
  onSetCamMode: (mode: 'follow' | 'free') => void;
  onLeaveSpectate: () => void;
}

function formatKey(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

function ordinal(n: number): string {
  const s = ['TH', 'ST', 'ND', 'RD'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.floor((sec * 100) % 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

export const SpectatorHud: React.FC<SpectatorHudProps> = ({
  hud,
  bindings,
  onPrevTarget,
  onNextTarget,
  onSetCamMode,
  onLeaveSpectate,
}) => {
  const spec = hud.spectating;
  const starDef = SPEEDSTARS.find((s) => s.id === spec.targetSpeedstarId);

  return (
    <div className="pointer-events-none fixed inset-0 z-30 flex flex-col justify-between p-4 md:p-6 select-none">
      {/* Top Broadcast Bar */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="bg-[#0B111E]/92 border border-cyan-400/35 rounded-xl px-4 py-2.5 flex items-center gap-3">
          <Eye className="w-4 h-4 text-cyan-400" />
          <div>
            <div className="text-[11px] font-bold tracking-wider uppercase text-cyan-300">
              {spec.liveRoom ? `LIVE RACE BROADCAST · ROOM ${spec.roomCode}` : 'SPECTATOR CAM'}
            </div>
            <div className="text-xs text-slate-300">
              {hud.modeObjectiveText} · Elapsed{' '}
              <span className="font-mono-tabular text-white">{formatTime(hud.raceTimeSec)}</span>
            </div>
          </div>
        </div>

        {/* Camera & Target Switcher Controls */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-[#0B111E]/92 border border-white/15 rounded-lg p-1 gap-1">
            <button
              onClick={() => onSetCamMode('follow')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                spec.cameraMode === 'follow'
                  ? 'bg-cyan-500 text-slate-950'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Video className="w-3.5 h-3.5" />
              <span>Follow Racer</span>
            </button>
            <button
              onClick={() => onSetCamMode('free')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                spec.cameraMode === 'free'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Free Camera</span>
            </button>
          </div>

          {spec.cameraMode === 'follow' && (
            <div className="flex items-center bg-[#0B111E]/92 border border-white/15 rounded-lg p-1 gap-1">
              <button
                onClick={onPrevTarget}
                className="p-1.5 rounded hover:bg-slate-800 text-slate-200"
                title="Previous Racer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 text-xs font-semibold text-white max-w-[140px] truncate">
                {spec.targetName}
              </span>
              <button
                onClick={onNextTarget}
                className="p-1.5 rounded hover:bg-slate-800 text-slate-200"
                title="Next Racer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          <button
            onClick={onLeaveSpectate}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-rose-500/20 border border-rose-400/40 hover:bg-rose-500/30 text-xs font-semibold text-rose-200"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Leave Spectate</span>
          </button>
        </div>
      </div>

      {/* Middle Right Compact Live Standings */}
      <div className="hidden md:flex justify-end">
        <div className="bg-[#0B111E]/90 border border-white/10 rounded-xl p-3 w-64 space-y-1.5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Live Race Standings
          </div>
          {hud.standings.slice(0, 6).map((s, idx) => (
            <div
              key={s.id}
              className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs ${
                s.name === spec.targetName && spec.cameraMode === 'follow'
                  ? 'bg-cyan-500/20 border border-cyan-400/40 text-white font-semibold'
                  : 'bg-slate-900/60 text-slate-300'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono-tabular text-amber-400 w-5">#{idx + 1}</span>
                <span className="truncate">{s.name}</span>
              </div>
              <span className="font-mono-tabular text-[11px] text-slate-400">
                {s.finished ? 'FIN' : `${Math.round(Math.min(100, s.progress * 100))}%`}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Spectated Player Telemetry or Free Camera Controls */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        {spec.cameraMode === 'free' ? (
          <div className="bg-[#0B111E]/92 border border-amber-400/35 rounded-xl px-4 py-3 text-xs text-slate-200 space-y-1">
            <div className="font-bold text-amber-300">Free Camera Controls</div>
            <div>
              <strong className="text-white">
                {formatKey(bindings.forward)}/{formatKey(bindings.backward)}/{formatKey(bindings.steerLeft)}/{formatKey(bindings.steerRight)}
              </strong>{' '}
              Fly · <strong className="text-white">{formatKey(bindings.jump)}</strong> Ascend ·{' '}
              <strong className="text-white">{formatKey(bindings.slide)}</strong> Descend ·{' '}
              <strong className="text-white">Click + Drag</strong> Look Around
            </div>
          </div>
        ) : (
          <div className="bg-[#0B111E]/92 border border-white/12 rounded-xl px-5 py-3.5 min-w-[290px] flex items-center justify-between gap-6">
            <div>
              <div className="text-[11px] text-slate-400 uppercase tracking-wider">Spectating Competitor</div>
              <div className="flex items-baseline gap-2.5 mt-0.5">
                <span className="font-display text-2xl font-bold text-amber-400 font-mono-tabular">
                  {ordinal(spec.targetPlacement)}
                </span>
                <span className="text-base font-bold text-white">{spec.targetName}</span>
              </div>
              <div className="text-xs text-cyan-300 mt-0.5">
                {starDef?.name ?? spec.targetSpeedstarId} ·{' '}
                {Math.round(Math.min(100, spec.targetProgress * 100))}% Course Progress
              </div>
            </div>

            <div className="text-right">
              <div className="font-display text-2xl font-bold text-white font-mono-tabular">
                {spec.targetSpeedKmh} <span className="text-xs font-normal text-slate-400">KM/H</span>
              </div>
              <div
                className={`text-[11px] font-bold mt-1 ${
                  spec.targetTurbo ? 'text-amber-400' : 'text-slate-400'
                }`}
              >
                {spec.targetTurbo ? 'TURBO ENGAGED' : 'STANDARD PACE'}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
