import React, { useMemo, useState } from 'react';
import { Check, Lock, MapPin, Users } from 'lucide-react';
import { MAPS, type MapDef } from '../shared/gameData';
import { SPEEDSTARS, type SpeedstarDef, type SpeedstarRarity } from '../shared/rosterData';
import type { PlayerProfile } from '../shared/types';

const RARITY_STYLES: Record<SpeedstarRarity, { text: string; bg: string; border: string }> = {
  Common: { text: 'text-emerald-300', bg: 'bg-emerald-500/15', border: 'border-emerald-400/35' },
  Rare: { text: 'text-sky-300', bg: 'bg-sky-500/15', border: 'border-sky-400/35' },
  Epic: { text: 'text-violet-300', bg: 'bg-violet-500/15', border: 'border-violet-400/35' },
  Legendary: { text: 'text-amber-300', bg: 'bg-amber-500/15', border: 'border-amber-400/40' },
};

const RARITY_OPTIONS: Array<'All' | SpeedstarRarity> = ['All', 'Common', 'Rare', 'Epic', 'Legendary'];

interface RosterPanelProps {
  profile: PlayerProfile;
  onSelectSpeedstar: (id: string) => void;
  onUnlockSpeedstar: (id: string) => Promise<void>;
  onPreviewSpeedstar: (id: string) => void;
  onClose: () => void;
}

export const RosterPanel: React.FC<RosterPanelProps> = ({
  profile,
  onSelectSpeedstar,
  onUnlockSpeedstar,
  onPreviewSpeedstar,
  onClose,
}) => {
  const [filter, setFilter] = useState<'all' | 'free' | 'unlockable' | 'owned'>('all');
  const [rarityFilter, setRarityFilter] = useState<'All' | SpeedstarRarity>('All');
  const [inspected, setInspected] = useState<SpeedstarDef>(
    () => SPEEDSTARS.find((s) => s.id === profile.loadout.speedstarId) ?? SPEEDSTARS[0]
  );
  const [busy, setBusy] = useState(false);

  const unlocked = useMemo(() => new Set(profile.unlockedIds), [profile.unlockedIds]);
  const list = useMemo(() => {
    return SPEEDSTARS.filter((s) => {
      if (filter === 'free' && s.price !== 0) return false;
      if (filter === 'unlockable' && s.price === 0) return false;
      if (filter === 'owned' && !unlocked.has(s.id)) return false;
      if (rarityFilter !== 'All' && s.rarity !== rarityFilter) return false;
      return true;
    });
  }, [filter, rarityFilter, unlocked]);

  const isOwned = unlocked.has(inspected.id);
  const isStarter = inspected.price === 0;
  const isEquipped = profile.loadout.speedstarId === inspected.id;
  const inspectedRarity = RARITY_STYLES[inspected.rarity];

  const handleInspect = (s: SpeedstarDef) => {
    setInspected(s);
    onPreviewSpeedstar(s.id);
  };

  return (
    <div className="fixed inset-x-4 top-20 bottom-6 z-20 max-w-6xl mx-auto bg-[#0B111E]/95 border border-white/12 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <Users className="w-5 h-5 text-cyan-400" />
          <div>
            <h2 className="font-display text-xl font-bold text-white">30 Speedstars Roster</h2>
            <p className="text-xs text-slate-400">
              12 Common Free Starters · 18 Permanent SC Unlocks (Rare, Epic, Legendary) · Balanced competitive stats
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(
            [
              ['all', 'All 30'],
              ['free', '12 Free'],
              ['unlockable', '18 Unlockable'],
              ['owned', 'Owned'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 ${
                filter === key ? 'bg-cyan-500 text-slate-950 font-semibold' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
          <button
            onClick={onClose}
            className="ml-2 px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 whitespace-nowrap shrink-0"
          >
            Close
          </button>
        </div>
      </div>

      <div className="px-6 py-2.5 border-b border-white/8 bg-[#0D1424] flex items-center gap-2 flex-wrap">
        <span className="text-[11px] uppercase tracking-wider text-slate-400 mr-1">Rarity Tier</span>
        {RARITY_OPTIONS.map((tier) => {
          const active = rarityFilter === tier;
          const style = tier === 'All' ? null : RARITY_STYLES[tier];
          return (
            <button
              key={tier}
              onClick={() => setRarityFilter(tier)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors whitespace-nowrap shrink-0 ${
                active
                  ? style
                    ? `${style.bg} ${style.text} ${style.border}`
                    : 'bg-cyan-500/20 text-cyan-300 border-cyan-400/40'
                  : 'bg-slate-900/70 text-slate-400 border-white/8 hover:text-slate-200'
              }`}
            >
              {tier === 'All' ? 'All Tiers' : tier}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-3">
        {/* Roster Grid */}
        <div className="lg:col-span-2 overflow-y-auto custom-scroll p-5 grid grid-cols-2 sm:grid-cols-3 gap-3 content-start">
          {list.map((s) => {
            const owned = unlocked.has(s.id);
            const selected = inspected.id === s.id;
            const equipped = profile.loadout.speedstarId === s.id;
            const rStyle = RARITY_STYLES[s.rarity];
            return (
              <button
                key={s.id}
                onClick={() => handleInspect(s)}
                className={`text-left p-3 rounded-xl border transition-colors ${
                  selected
                    ? 'bg-cyan-500/15 border-cyan-400/60'
                    : 'bg-[#121A2B] border-white/10 hover:border-white/25'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: s.primaryColor }} />
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${rStyle.bg} ${rStyle.text} ${rStyle.border}`}>
                      {s.rarity}
                    </span>
                  </div>
                  {equipped ? (
                    <span className="text-[11px] font-semibold text-cyan-400 shrink-0">Active</span>
                  ) : s.price === 0 ? (
                    <span className="text-[11px] font-semibold text-emerald-400 shrink-0">Free</span>
                  ) : owned ? (
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 shrink-0">
                      <Check className="w-3 h-3" /> Unlocked
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[11px] font-mono-tabular text-amber-400 shrink-0">
                      <Lock className="w-3 h-3" /> {(s.price / 1000).toFixed(0)}k SC
                    </span>
                  )}
                </div>
                <div className="text-sm font-bold text-white mt-2 truncate">{s.name}</div>
                <div className="text-[11px] text-slate-400 truncate">{s.title}</div>
                <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between text-[10px] font-mono-tabular text-slate-400">
                  <span>SPD {s.stats.speed}</span>
                  <span>ACC {s.stats.acceleration}</span>
                  <span>TRB {s.stats.turbo}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Character Inspector */}
        <div className="border-t lg:border-t-0 lg:border-l border-white/10 p-6 bg-[#0F1627] flex flex-col justify-between overflow-y-auto custom-scroll">
          <div>
            <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${inspectedRarity.bg} ${inspectedRarity.text} ${inspectedRarity.border}`}>
                  {inspected.rarity}
                </span>
                <span className="truncate">{inspected.archetype}</span>
              </div>
              <span className={`font-semibold shrink-0 ${isStarter ? 'text-emerald-400' : 'text-amber-400'}`}>
                {isStarter ? 'Free Starter' : `${inspected.price.toLocaleString()} SC`}
              </span>
            </div>
            <h3 className="font-display text-2xl font-bold text-white mt-1.5">{inspected.name}</h3>
            <div className="text-xs font-medium text-cyan-400">
              {inspected.title} · <span className="capitalize text-slate-300">{inspected.turboVisual.replace('-', ' ')} Turbo</span>
            </div>
            <p className="text-xs text-slate-300 mt-2.5 leading-relaxed">{inspected.personality}</p>

            <div className="mt-3.5 p-2.5 rounded-lg bg-slate-900/80 border border-white/8 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-400">Signature Ability</span>
                <span className="text-[11px] font-semibold text-cyan-300">{inspected.signatureAbilityName}</span>
              </div>
              <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">{inspected.signatureAbilityDescription}</p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5">
              {(
                [
                  ['Speed', inspected.stats.speed],
                  ['Acceleration', inspected.stats.acceleration],
                  ['Agility', inspected.stats.agility],
                  ['Turbo', inspected.stats.turbo],
                  ['Ability', inspected.stats.abilityPower],
                  ['Handling', inspected.stats.handling],
                  ['Air Control', inspected.stats.airControl],
                  ['Momentum', inspected.stats.momentum],
                ] as const
              ).map(([label, val]) => (
                <div key={label}>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-slate-400">{label}</span>
                    <span className="font-mono-tabular text-white font-semibold">{val}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${val}%`, backgroundColor: inspected.primaryColor }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-white/10 space-y-2">
            <p className="text-[11px] text-slate-400 text-center">
              {isStarter
                ? 'Starter Speedstar — switch freely anytime without paying SC.'
                : isOwned
                ? 'Permanently unlocked on your account — equip anytime for free.'
                : `Balance: ${profile.speedCredits.toLocaleString()} SC · Permanent account unlock.`}
            </p>
            {isEquipped ? (
              <div className="w-full py-2.5 rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-center text-xs font-bold text-cyan-300">
                Currently Selected
              </div>
            ) : isOwned ? (
              <button
                onClick={() => onSelectSpeedstar(inspected.id)}
                className="w-full py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition-colors"
              >
                Equip {inspected.name} (Free)
              </button>
            ) : (
              <button
                disabled={busy || profile.speedCredits < inspected.price}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onUnlockSpeedstar(inspected.id);
                    onSelectSpeedstar(inspected.id);
                  } finally {
                    setBusy(false);
                  }
                }}
                className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-45 text-slate-950 text-xs font-bold transition-colors"
              >
                {busy
                  ? 'Unlocking...'
                  : profile.speedCredits < inspected.price
                  ? `Need ${(inspected.price - profile.speedCredits).toLocaleString()} more SC`
                  : `Unlock Permanently for ${inspected.price.toLocaleString()} SC`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

interface MapsPanelProps {
  selectedMapId: string;
  personalBests: Record<string, number>;
  onSelectMap: (mapId: string) => void;
  onClose: () => void;
}

export const MapsPanel: React.FC<MapsPanelProps> = ({
  selectedMapId,
  personalBests,
  onSelectMap,
  onClose,
}) => {
  return (
    <div className="fixed inset-x-4 top-20 bottom-6 z-20 max-w-6xl mx-auto bg-[#0B111E]/95 border border-white/12 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <MapPin className="w-5 h-5 text-cyan-400" />
          <div>
            <h2 className="font-display text-xl font-bold text-white">12 Worlds & Circuits</h2>
            <p className="text-xs text-slate-400">Select a destination map for Solo, AI, or Custom Lobby races</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 whitespace-nowrap shrink-0"
        >
          Close
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scroll p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 content-start">
        {MAPS.map((m: MapDef) => {
          const active = m.id === selectedMapId;
          const pb = personalBests[m.id];
          return (
            <button
              key={m.id}
              onClick={() => {
                onSelectMap(m.id);
                onClose();
              }}
              className={`text-left rounded-xl border p-4 transition-colors flex flex-col justify-between gap-3 ${
                active
                  ? 'bg-cyan-500/15 border-cyan-400/60'
                  : 'bg-[#121A2B] border-white/10 hover:border-white/25'
              }`}
            >
              <div>
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>World {String(m.index).padStart(2, '0')} · {m.difficulty}</span>
                  <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: m.accentColor }} />
                </div>
                <h3 className="font-display text-lg font-bold text-white mt-1">{m.name}</h3>
                <div className="text-xs text-cyan-300">{m.subtitle}</div>
                <p className="text-xs text-slate-300 mt-2 leading-relaxed">{m.description}</p>
              </div>
              <div className="pt-3 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-400">
                <span className="truncate max-w-[180px]">{m.mechanics.slice(0, 2).join(' · ')}</span>
                <span className="font-mono-tabular text-amber-400 shrink-0">
                  {pb ? `PB ${pb.toFixed(2)}s` : 'No PB'}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
