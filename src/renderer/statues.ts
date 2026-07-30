/**
 * Marble statue SVGs — the Codex spine goddesses and the module trophy roster.
 *
 * All are self-contained inline SVG (no external assets — the CSP is self-only),
 * share one `viewBox="0 0 140 262"`, a `url(#mb)` marble gradient, and gold
 * `#e6c063` accents. Kept in their own module so both the Codex (app.ts) and the
 * Trophy Case (trophyCase.ts) can draw from one source without a cycle.
 */

export const MARBLE_DEFS = `<defs><linearGradient id="mb" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#fbfcfe"/><stop offset="0.55" stop-color="#e2ddce"/>
  <stop offset="1" stop-color="#b3ab95"/></linearGradient></defs>`;

/** Athena — helmet crest, spear, round shield. */
export const STATUE_ATHENA = `<svg viewBox="0 0 140 262" class="statue">${MARBLE_DEFS}
  <rect x="38" y="234" width="64" height="20" rx="2" fill="url(#mb)" stroke="#8a5a13"/>
  <rect x="32" y="226" width="76" height="9" rx="2" fill="url(#mb)" stroke="#8a5a13" stroke-width="0.7"/>
  <line x1="103" y1="26" x2="103" y2="228" stroke="#cfc7b0" stroke-width="2.6"/>
  <path d="M103 18 l -4 9 h 8 z" fill="#e6c063"/>
  <path d="M70 70 C 55 72 50 92 49 110 L 43 226 L 97 226 L 91 110 C 90 92 85 72 70 70 Z" fill="url(#mb)" stroke="#b3ab95"/>
  <g stroke="#b3ab95" fill="none" opacity="0.5"><path d="M60 100 L 55 222"/><path d="M70 102 L 70 224"/><path d="M80 100 L 85 222"/></g>
  <path d="M52 90 C 42 96 40 122 44 142 C 46 150 52 150 54 142 C 52 122 55 104 60 96 Z" fill="url(#mb)" stroke="#b3ab95" stroke-width="0.7"/>
  <circle cx="40" cy="150" r="17" fill="url(#mb)" stroke="#8a5a13" stroke-width="1.4"/>
  <circle cx="40" cy="150" r="8" fill="none" stroke="#8a5a13"/>
  <path d="M88 90 C 98 96 100 120 96 138 C 94 146 89 145 88 138 C 90 120 86 104 80 96 Z" fill="url(#mb)" stroke="#b3ab95" stroke-width="0.7"/>
  <rect x="64" y="58" width="12" height="14" fill="url(#mb)"/>
  <circle cx="70" cy="48" r="14" fill="url(#mb)" stroke="#b3ab95"/>
  <path d="M58 41 C 60 27 80 27 82 41 C 78 35 62 35 58 41 Z" fill="#e6c063" stroke="#8a5a13" stroke-width="0.5"/>
  <path d="M70 25 C 74 21 84 23 88 31" fill="none" stroke="#e6c063" stroke-width="3"/>
</svg>`;

/** A scholar's bust on a fluted column. */
export const STATUE_BUST = `<svg viewBox="0 0 140 262" class="statue">${MARBLE_DEFS}
  <rect x="44" y="236" width="52" height="16" rx="2" fill="url(#mb)" stroke="#8a5a13"/>
  <rect x="52" y="120" width="36" height="116" fill="url(#mb)" stroke="#b3ab95"/>
  <g stroke="#b3ab95" fill="none" opacity="0.45"><line x1="60" y1="126" x2="60" y2="232"/><line x1="70" y1="126" x2="70" y2="232"/><line x1="80" y1="126" x2="80" y2="232"/></g>
  <rect x="46" y="110" width="48" height="11" rx="1.5" fill="url(#mb)" stroke="#b3ab95"/>
  <path d="M48 110 C 50 88 90 88 92 110 Z" fill="url(#mb)" stroke="#b3ab95"/>
  <rect x="63" y="74" width="14" height="16" fill="url(#mb)"/>
  <circle cx="70" cy="62" r="15" fill="url(#mb)" stroke="#b3ab95"/>
  <path d="M55 60 C 58 48 64 46 70 50 C 76 46 82 48 85 60" fill="none" stroke="#e6c063" stroke-width="2.4"/>
  <path d="M57 56 l -4 -3 M63 51 l -3 -4 M83 56 l 4 -3 M77 51 l 3 -4" stroke="#e6c063" stroke-width="1.6"/>
</svg>`;

/** A draped muse, contrapposto, holding a lyre. */
export const STATUE_MUSE = `<svg viewBox="0 0 140 262" class="statue">${MARBLE_DEFS}
  <rect x="38" y="236" width="64" height="18" rx="2" fill="url(#mb)" stroke="#8a5a13"/>
  <path d="M68 72 C 54 74 52 94 54 112 L 44 236 L 92 236 L 86 150 C 88 120 84 92 78 78 Z" fill="url(#mb)" stroke="#b3ab95"/>
  <g stroke="#b3ab95" fill="none" opacity="0.5"><path d="M60 108 L 52 232"/><path d="M70 110 L 68 234"/><path d="M80 120 L 84 232"/></g>
  <path d="M78 82 C 90 88 96 110 92 128 C 90 136 85 135 84 128 C 86 112 80 96 74 90 Z" fill="url(#mb)" stroke="#b3ab95" stroke-width="0.7"/>
  <path d="M40 116 a 16 20 0 1 0 0.1 0 Z" fill="none" stroke="#e6c063" stroke-width="2"/>
  <g stroke="#e6c063" stroke-width="1.3"><line x1="33" y1="104" x2="33" y2="132"/><line x1="40" y1="101" x2="40" y2="135"/><line x1="47" y1="104" x2="47" y2="132"/></g>
  <rect x="63" y="60" width="12" height="14" fill="url(#mb)"/>
  <circle cx="69" cy="50" r="13" fill="url(#mb)" stroke="#b3ab95"/>
  <path d="M56 46 C 60 36 78 36 82 46" fill="none" stroke="#e6c063" stroke-width="2.2"/>
</svg>`;

/** Poseidon — bearded, robed, three-pronged trident. */
export const STATUE_POSEIDON = `<svg viewBox="0 0 140 262" class="statue">${MARBLE_DEFS}
  <rect x="38" y="234" width="64" height="20" rx="2" fill="url(#mb)" stroke="#8a5a13"/>
  <line x1="36" y1="20" x2="36" y2="230" stroke="#cfc7b0" stroke-width="2.6"/>
  <path d="M28 26 v-10 M36 22 v-14 M44 26 v-10 M28 16 h16" fill="none" stroke="#e6c063" stroke-width="2.4"/>
  <path d="M70 72 C 55 74 51 94 52 112 L 44 234 L 96 234 L 88 112 C 89 94 85 74 70 72 Z" fill="url(#mb)" stroke="#b3ab95"/>
  <g stroke="#b3ab95" fill="none" opacity="0.5"><path d="M60 104 L 54 230"/><path d="M70 106 L 70 232"/><path d="M80 104 L 86 230"/></g>
  <path d="M86 88 C 98 94 102 118 98 138 C 96 146 91 145 90 138 C 92 118 84 98 78 92 Z" fill="url(#mb)" stroke="#b3ab95" stroke-width="0.7"/>
  <rect x="64" y="58" width="12" height="15" fill="url(#mb)"/>
  <circle cx="70" cy="47" r="14" fill="url(#mb)" stroke="#b3ab95"/>
  <path d="M58 54 C 60 68 80 68 82 54 C 80 62 60 62 58 54 Z" fill="url(#mb)" stroke="#b3ab95" stroke-width="0.6"/>
  <path d="M56 40 C 60 30 80 30 84 40" fill="none" stroke="#b3ab95" stroke-width="2"/>
</svg>`;

/** Hermes — "Messenger of the Wire" (Foundation). Winged cap, caduceus. */
export const STATUE_HERMES = `<svg viewBox="0 0 140 262" class="statue">${MARBLE_DEFS}
  <rect x="38" y="234" width="64" height="20" rx="2" fill="url(#mb)" stroke="#8a5a13"/>
  <line x1="106" y1="30" x2="106" y2="230" stroke="#cfc7b0" stroke-width="2.6"/>
  <circle cx="106" cy="24" r="2.8" fill="#e6c063"/>
  <path d="M101 30 C 94 24 89 25 87 31 M111 30 C 118 24 123 25 125 31" fill="none" stroke="#e6c063" stroke-width="1.7"/>
  <path d="M100 54 C 114 47 98 38 106 31 M112 54 C 98 47 114 38 106 31" fill="none" stroke="#e6c063" stroke-width="1.6"/>
  <path d="M70 72 C 57 74 53 93 52 110 L 46 234 L 94 234 L 88 110 C 87 93 83 74 70 72 Z" fill="url(#mb)" stroke="#b3ab95"/>
  <g stroke="#b3ab95" fill="none" opacity="0.5"><path d="M61 102 L 55 230"/><path d="M70 104 L 70 232"/><path d="M79 102 L 85 230"/></g>
  <path d="M56 78 C 46 90 44 120 48 140 C 50 148 55 147 56 140 C 54 118 56 96 62 84 Z" fill="url(#mb)" stroke="#b3ab95" stroke-width="0.7"/>
  <path d="M84 88 C 94 96 98 116 96 132 C 94 140 89 139 88 132 C 90 114 84 100 78 94 Z" fill="url(#mb)" stroke="#b3ab95" stroke-width="0.7"/>
  <rect x="64" y="58" width="12" height="14" fill="url(#mb)"/>
  <circle cx="70" cy="48" r="14" fill="url(#mb)" stroke="#b3ab95"/>
  <path d="M56 44 C 59 32 81 32 84 44" fill="none" stroke="#e6c063" stroke-width="2.4"/>
  <path d="M56 42 C 49 36 43 36 41 42 C 46 43 51 44 56 46 Z" fill="#e6c063"/>
  <path d="M84 42 C 91 36 97 36 99 42 C 94 43 89 44 84 46 Z" fill="#e6c063"/>
</svg>`;

/** Apollo — "Light of the Interface" (React). Sun rays, lyre. */
export const STATUE_APOLLO = `<svg viewBox="0 0 140 262" class="statue">${MARBLE_DEFS}
  <rect x="38" y="234" width="64" height="20" rx="2" fill="url(#mb)" stroke="#8a5a13"/>
  <g stroke="#e6c063" stroke-width="1.8" fill="none"><line x1="70" y1="26" x2="70" y2="14"/><line x1="54" y1="32" x2="46" y2="24"/><line x1="86" y1="32" x2="94" y2="24"/><line x1="48" y1="46" x2="37" y2="43"/><line x1="92" y1="46" x2="103" y2="43"/></g>
  <path d="M70 72 C 56 74 52 94 53 112 L 45 234 L 95 234 L 87 112 C 88 94 84 74 70 72 Z" fill="url(#mb)" stroke="#b3ab95"/>
  <g stroke="#b3ab95" fill="none" opacity="0.5"><path d="M60 104 L 53 230"/><path d="M70 106 L 70 232"/><path d="M80 104 L 87 230"/></g>
  <path d="M54 88 C 44 96 42 118 46 136 C 48 144 53 143 54 136 C 52 118 55 102 60 94 Z" fill="url(#mb)" stroke="#b3ab95" stroke-width="0.7"/>
  <path d="M40 128 a 15 19 0 1 0 0.1 0 Z" fill="none" stroke="#e6c063" stroke-width="2"/>
  <g stroke="#e6c063" stroke-width="1.3"><line x1="34" y1="117" x2="34" y2="143"/><line x1="40" y1="114" x2="40" y2="146"/><line x1="46" y1="117" x2="46" y2="143"/></g>
  <path d="M86 90 C 96 96 100 118 96 136 C 94 144 89 143 88 136 C 90 118 84 102 78 96 Z" fill="url(#mb)" stroke="#b3ab95" stroke-width="0.7"/>
  <rect x="64" y="58" width="12" height="14" fill="url(#mb)"/>
  <circle cx="70" cy="48" r="14" fill="url(#mb)" stroke="#b3ab95"/>
  <path d="M56 45 C 59 34 81 34 84 45" fill="none" stroke="#e6c063" stroke-width="2.2"/>
</svg>`;

/** Hephaestus — "Master of the Forge" (Next.js). Hammer, anvil. */
export const STATUE_HEPHAESTUS = `<svg viewBox="0 0 140 262" class="statue">${MARBLE_DEFS}
  <rect x="38" y="234" width="64" height="20" rx="2" fill="url(#mb)" stroke="#8a5a13"/>
  <rect x="40" y="210" width="26" height="6" rx="1.5" fill="url(#mb)" stroke="#8a5a13" stroke-width="0.8"/>
  <rect x="47" y="216" width="12" height="10" fill="url(#mb)" stroke="#b3ab95" stroke-width="0.7"/>
  <rect x="44" y="226" width="18" height="8" rx="1" fill="url(#mb)" stroke="#b3ab95" stroke-width="0.7"/>
  <line x1="97" y1="130" x2="114" y2="68" stroke="#cfc7b0" stroke-width="2.6"/>
  <rect x="102" y="52" width="25" height="12" rx="2" fill="url(#mb)" stroke="#8a5a13"/>
  <path d="M78 74 C 62 76 57 96 57 114 L 50 234 L 100 234 L 96 114 C 96 96 92 76 78 74 Z" fill="url(#mb)" stroke="#b3ab95"/>
  <g stroke="#b3ab95" fill="none" opacity="0.5"><path d="M67 106 L 59 230"/><path d="M78 108 L 76 232"/><path d="M88 106 L 92 230"/></g>
  <path d="M92 92 C 100 84 104 74 106 66 C 108 60 102 57 99 62 C 96 72 92 80 86 88 Z" fill="url(#mb)" stroke="#b3ab95" stroke-width="0.7"/>
  <rect x="72" y="60" width="12" height="15" fill="url(#mb)"/>
  <circle cx="78" cy="49" r="14" fill="url(#mb)" stroke="#b3ab95"/>
  <path d="M66 55 C 68 68 88 68 90 55 C 87 62 69 62 66 55 Z" fill="url(#mb)" stroke="#b3ab95" stroke-width="0.6"/>
  <path d="M64 43 C 68 33 88 33 92 43" fill="none" stroke="#b3ab95" stroke-width="2"/>
</svg>`;

/** Aphrodite — "Beauty & Form" (Tailwind / CSS). Scallop shell. */
export const STATUE_APHRODITE = `<svg viewBox="0 0 140 262" class="statue">${MARBLE_DEFS}
  <rect x="38" y="234" width="64" height="20" rx="2" fill="url(#mb)" stroke="#8a5a13"/>
  <path d="M30 234 A 40 40 0 0 1 110 234 Z" fill="url(#mb)" stroke="#e6c063" stroke-width="1.4"/>
  <g stroke="#e6c063" fill="none" opacity="0.75"><line x1="70" y1="232" x2="70" y2="196"/><line x1="70" y1="232" x2="52" y2="202"/><line x1="70" y1="232" x2="88" y2="202"/><line x1="70" y1="232" x2="38" y2="216"/><line x1="70" y1="232" x2="102" y2="216"/></g>
  <path d="M69 74 C 56 76 54 96 56 114 L 48 234 L 90 234 L 85 152 C 87 122 82 94 78 80 Z" fill="url(#mb)" stroke="#b3ab95"/>
  <g stroke="#b3ab95" fill="none" opacity="0.5"><path d="M62 110 L 55 230"/><path d="M70 112 L 68 232"/><path d="M78 120 L 82 230"/></g>
  <path d="M78 84 C 90 90 94 112 91 128 C 89 136 84 135 83 128 C 85 112 80 96 74 90 Z" fill="url(#mb)" stroke="#b3ab95" stroke-width="0.7"/>
  <path d="M56 88 C 48 96 46 116 49 132 C 51 140 56 139 57 132 C 55 114 57 100 62 92 Z" fill="url(#mb)" stroke="#b3ab95" stroke-width="0.7"/>
  <rect x="63" y="60" width="12" height="15" fill="url(#mb)"/>
  <circle cx="69" cy="50" r="13" fill="url(#mb)" stroke="#b3ab95"/>
  <path d="M58 42 C 52 50 52 62 56 72 M80 42 C 86 50 86 62 82 72" fill="none" stroke="#b3ab95" stroke-width="1.6"/>
  <path d="M56 46 C 60 36 78 36 82 46" fill="none" stroke="#e6c063" stroke-width="2.2"/>
</svg>`;

/** Chronos — "Keeper of History" (Git · CI). Hourglass, scythe. */
export const STATUE_CHRONOS = `<svg viewBox="0 0 140 262" class="statue">${MARBLE_DEFS}
  <rect x="38" y="234" width="64" height="20" rx="2" fill="url(#mb)" stroke="#8a5a13"/>
  <line x1="106" y1="30" x2="106" y2="230" stroke="#cfc7b0" stroke-width="2.6"/>
  <path d="M106 30 C 92 20 72 22 62 32 C 76 27 94 30 106 38 Z" fill="#e6c063" stroke="#8a5a13" stroke-width="0.5"/>
  <path d="M70 72 C 56 74 52 94 53 112 L 44 234 L 96 234 L 88 112 C 89 94 84 74 70 72 Z" fill="url(#mb)" stroke="#b3ab95"/>
  <g stroke="#b3ab95" fill="none" opacity="0.5"><path d="M60 104 L 53 230"/><path d="M70 106 L 70 232"/><path d="M80 104 L 87 230"/></g>
  <path d="M54 86 C 44 94 42 118 46 138 C 48 146 53 145 54 138 C 52 118 55 100 60 92 Z" fill="url(#mb)" stroke="#b3ab95" stroke-width="0.7"/>
  <g stroke="#e6c063" stroke-width="1.6" fill="none"><path d="M36 128 h16 M36 156 h16"/><path d="M37 130 C 37 142 51 142 51 154 M51 130 C 51 142 37 142 37 154"/></g>
  <circle cx="44" cy="150" r="1.8" fill="#e6c063"/>
  <path d="M86 90 C 96 96 100 118 96 136 C 94 144 89 143 88 136 C 90 118 84 102 78 96 Z" fill="url(#mb)" stroke="#b3ab95" stroke-width="0.7"/>
  <rect x="64" y="58" width="12" height="15" fill="url(#mb)"/>
  <circle cx="70" cy="47" r="14" fill="url(#mb)" stroke="#b3ab95"/>
  <path d="M58 53 C 59 72 81 72 82 53 C 79 64 61 64 58 53 Z" fill="url(#mb)" stroke="#b3ab95" stroke-width="0.6"/>
  <path d="M54 44 C 54 30 86 30 86 44 C 80 36 60 36 54 44 Z" fill="url(#mb)" stroke="#b3ab95" stroke-width="0.8"/>
</svg>`;

/** Zeus — "King of the Pantheon" (the Herculean trophy). Thunderbolt. */
export const STATUE_ZEUS = `<svg viewBox="0 0 140 262" class="statue">${MARBLE_DEFS}
  <rect x="38" y="234" width="64" height="20" rx="2" fill="url(#mb)" stroke="#8a5a13"/>
  <path d="M104 22 L 111 42 L 103 39 L 113 62 L 100 51 L 107 70" fill="none" stroke="#e6c063" stroke-width="2.6"/>
  <path d="M70 72 C 55 74 51 94 52 112 L 42 234 L 98 234 L 88 112 C 89 94 85 74 70 72 Z" fill="url(#mb)" stroke="#b3ab95"/>
  <g stroke="#b3ab95" fill="none" opacity="0.5"><path d="M60 104 L 52 230"/><path d="M70 106 L 70 232"/><path d="M80 104 L 88 230"/></g>
  <path d="M84 86 C 94 78 100 70 103 62 C 105 56 99 53 96 58 C 92 68 88 76 80 84 Z" fill="url(#mb)" stroke="#b3ab95" stroke-width="0.7"/>
  <path d="M52 88 C 42 96 40 120 44 140 C 46 148 52 148 54 140 C 52 120 55 102 60 94 Z" fill="url(#mb)" stroke="#b3ab95" stroke-width="0.7"/>
  <rect x="64" y="58" width="12" height="15" fill="url(#mb)"/>
  <circle cx="70" cy="47" r="14" fill="url(#mb)" stroke="#b3ab95"/>
  <path d="M57 53 C 58 72 82 72 83 53 C 80 64 60 64 57 53 Z" fill="url(#mb)" stroke="#b3ab95" stroke-width="0.6"/>
  <path d="M55 41 C 59 30 81 30 85 41" fill="none" stroke="#b3ab95" stroke-width="2"/>
  <path d="M56 38 C 62 32 78 32 84 38" fill="none" stroke="#e6c063" stroke-width="2"/>
</svg>`;

/* Boss-fight combatant portraits (circular medallions, not marble statues). */

/** You — a laurel-crowned hero medallion. */
export const HERO_PORTRAIT = `<svg viewBox="0 0 120 120" aria-hidden="true">
  <circle cx="60" cy="60" r="56" fill="#1b2331" stroke="#e6c063" stroke-width="3"/>
  <path d="M60 40 C 48 40 44 52 44 62 C 44 76 52 86 60 86 C 68 86 76 76 76 62 C 76 52 72 40 60 40 Z" fill="#e9e3d2"/>
  <path d="M50 60 q -6 -3 -6 -10 M70 60 q 6 -3 6 -10" fill="none" stroke="#0d1017" stroke-width="2"/>
  <circle cx="52" cy="60" r="2.4" fill="#0d1017"/><circle cx="68" cy="60" r="2.4" fill="#0d1017"/>
  <path d="M54 74 q 6 5 12 0" fill="none" stroke="#0d1017" stroke-width="2"/>
  <path d="M40 44 C 34 34 44 26 54 30 M80 44 C 86 34 76 26 66 30" fill="none" stroke="#e6c063" stroke-width="3"/>
  <path d="M42 40 l -5 -3 M48 34 l -3 -5 M78 40 l 5 -3 M72 34 l 3 -5" stroke="#e6c063" stroke-width="2.4"/>
</svg>`;

/** Hercules — a fierce bearded head hooded in the Nemean lion pelt. */
export const HERCULES_PORTRAIT = `<svg viewBox="0 0 120 120" aria-hidden="true">
  <circle cx="60" cy="60" r="56" fill="#2a1512" stroke="#e6c063" stroke-width="3"/>
  <path d="M32 52 C 28 30 48 20 60 20 C 72 20 92 30 88 52 C 96 46 98 60 90 64 C 92 74 84 78 80 74 M40 64 C 26 66 30 50 30 50" fill="#caa15a" stroke="#7a5321" stroke-width="2"/>
  <path d="M40 34 l -8 -12 l 14 6 Z M80 34 l 8 -12 l -14 6 Z" fill="#caa15a" stroke="#7a5321" stroke-width="2"/>
  <path d="M46 44 C 44 40 40 40 38 44 M74 44 C 76 40 80 40 82 44" fill="none" stroke="#3a2a12" stroke-width="2.4"/>
  <path d="M56 58 C 52 74 50 84 60 88 C 70 84 68 74 64 58 Z" fill="#e9d9be"/>
  <circle cx="52" cy="54" r="2.6" fill="#2a1512"/><circle cx="68" cy="54" r="2.6" fill="#2a1512"/>
  <path d="M46 84 C 54 96 66 96 74 84 C 66 90 54 90 46 84 Z" fill="#8a6a2e"/>
  <path d="M40 70 q 20 10 40 0" fill="none" stroke="#6b4a1f" stroke-width="2"/>
</svg>`;

/** One trophy definition: the god, a one-line epithet, and the marble art,
 *  plus a short bio and a fun fact about the realm it was earned from. */
export interface TrophyDef {
  god: string;
  epithet: string;
  art: string;
  /** The module this trophy is earned from (display name). */
  realm: string;
  /** Two or three sentences on the god and why they patron this realm. */
  bio: string;
  /** A genuinely interesting fact about the realm's subject. */
  fact: string;
}

/**
 * Trophy roster — keyed by the id stored in `progress.trophies` (a module's
 * nodeId, plus "herculean"). Ordered as they stand in the temple, foundation
 * first, the Herculean crown last. The store stays generic; this is the
 * renderer's presentation map (Progression & Trophies plan, Phase B).
 */
export const TROPHY: Record<string, TrophyDef> = {
  foundation: {
    god: "Hermes",
    epithet: "Messenger of the Wire",
    art: STATUE_HERMES,
    realm: "Web Foundations",
    bio: "Hermes, the swift messenger of Olympus, carried words between gods and mortals — the original request and response. He patrons the foundations: the protocols, names, and round-trips that move every byte across the wire.",
    fact: "DNS is a global, cached phone book: your browser may ask a chain of servers to turn 'example.com' into an IP, but the answer is remembered (per its TTL) so the next lookup is instant.",
  },
  "pillar-react": {
    god: "Apollo",
    epithet: "Light of the Interface",
    art: STATUE_APOLLO,
    realm: "React & the UI",
    bio: "Apollo, god of light, music, and harmony, brought order and beauty into form. He watches over the interface layer, where scattered state is composed into a single, coherent view the user can see.",
    fact: "React never touches the real DOM directly on every change — it diffs a lightweight virtual tree and applies only the minimal set of real mutations, which is why re-rendering 'everything' can still be cheap.",
  },
  "pillar-nextjs": {
    god: "Hephaestus",
    epithet: "Master of the Forge",
    art: STATUE_HEPHAESTUS,
    realm: "Next.js & Frameworks",
    bio: "Hephaestus, the master smith, built the machinery of the gods at his forge. He rules the framework layer — the build tooling and rendering machinery that shapes raw components into a shipped application.",
    fact: "The same React component can run in three places in Next.js — at build time (static), on the server per request (SSR), or in the browser — and picking which is mostly a data-freshness decision, not a code rewrite.",
  },
  "pillar-node": {
    god: "Poseidon",
    epithet: "Depths of the Engine",
    art: STATUE_POSEIDON,
    realm: "Node.js & the Backend",
    bio: "Poseidon commands the vast deep beneath the surface — unseen, powerful, and always in motion. He governs the backend: the single-threaded engine whose currents (the event loop) carry thousands of requests at once.",
    fact: "Node handles huge concurrency on one JavaScript thread because most requests spend their lives waiting on I/O — the event loop simply fills that waiting with other requests' work.",
  },
  "pillar-databases": {
    god: "Mnemosyne",
    epithet: "Keeper of Memory",
    art: STATUE_MUSE,
    realm: "Databases",
    bio: "Mnemosyne, the Titaness of memory and mother of the Muses, is remembrance itself. She keeps the data layer, where the application's truth is stored, indexed, and recalled long after any single request has ended.",
    fact: "A query that's instant in development can crawl in production for one reason above all: a missing index turns a fast lookup into a full scan of every row, and that cost only shows up at real data volume.",
  },
  "pillar-tailwind": {
    god: "Aphrodite",
    epithet: "Beauty & Form",
    art: STATUE_APHRODITE,
    realm: "CSS & Tailwind",
    bio: "Aphrodite, goddess of beauty and form, gives things their pleasing shape. She presides over styling — the layout, rhythm, and restraint that turn a working page into one people actually want to use.",
    fact: "Utility CSS keeps a large UI consistent by construction: every spacing and colour comes from one small, fixed scale, so the ad-hoc '13px here, #4a90d9 there' values that cause drift simply never get typed.",
  },
  "pillar-git": {
    god: "Chronos",
    epithet: "Keeper of History",
    art: STATUE_CHRONOS,
    realm: "Git & CI",
    bio: "Chronos is time itself — the keeper of every moment that has passed. He guards version control and delivery: the history of every change, and the gates that decide what is allowed to ship.",
    fact: "A Git merge conflict isn't an error — it's Git asking a question. It merges cleanly when changes touch different lines; only overlapping edits need a human to decide which version wins.",
  },
  pediment: {
    god: "Athena",
    epithet: "Wisdom Under Pressure",
    art: STATUE_ATHENA,
    realm: "The Capstone",
    bio: "Athena, goddess of wisdom and strategic war, is clear thinking when it matters most. She crowns the temple as the patron of the interview itself — reasoning aloud, under time, with the whole craft in play.",
    fact: "The strongest interview answer to an open design question isn't a verdict — it's naming the axis the decision turns on, making a call from the requirements, and saying what would change your mind.",
  },
  herculean: {
    god: "Zeus",
    epithet: "King of the Pantheon",
    art: STATUE_ZEUS,
    realm: "The Herculean Trial",
    bio: "Zeus, king of the gods, sits above the whole pantheon — the apex earned only by mastering every domain at once. His trophy is the reward for felling Hercules across the entire craft in a single trial.",
    fact: "Real full-stack skill is mostly localization: a symptom in one layer (a slow page, a 500, stale data) almost always has its cause in another, and the craft is reading the evidence to jump straight to it.",
  },
};

/** Trophy ids in temple order — the Trophy Case grid follows this. */
export const TROPHY_ORDER = [
  "foundation",
  "pillar-react",
  "pillar-nextjs",
  "pillar-node",
  "pillar-databases",
  "pillar-tailwind",
  "pillar-git",
  "pediment",
  "herculean",
];
