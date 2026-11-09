interface NostradamusLogoProps {
  className?: string;
}

/**
 * Nautical Mariner's Compass Rose (Kompas Pelaut ala Nostradamus)
 * Authentic 8-Point Maritime Wind Rose with N-E-S-W Cardinal Points & Azimuth Bezel
 * (Strictly zero eye shapes — pure navigational compass geometry)
 */
export function NostradamusLogo({ className = 'w-11 h-11' }: NostradamusLogoProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Kompas Pelaut Nostradamus Quant"
    >
      <defs>
        <linearGradient id="marinerBrass" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FDE68A" />
          <stop offset="45%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#B45309" />
        </linearGradient>
        <linearGradient id="marinerOcean" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#0369A1" />
          <stop offset="100%" stopColor="#38BDF8" />
        </linearGradient>
        <radialGradient id="marinerDial" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#1E293B" />
          <stop offset="100%" stopColor="#090C10" />
        </radialGradient>
      </defs>

      {/* Outer Brass Mariner's Compass Housing */}
      <circle
        cx="32"
        cy="32"
        r="30"
        fill="url(#marinerDial)"
        stroke="url(#marinerBrass)"
        strokeWidth="2.2"
      />

      {/* Nautical Degree Scale Ring */}
      <circle
        cx="32"
        cy="32"
        r="26"
        stroke="#F59E0B"
        strokeWidth="0.9"
        strokeDasharray="1.5 2.5"
        strokeOpacity="0.75"
      />

      {/* Inner Compass Gimbal Ring */}
      <circle
        cx="32"
        cy="32"
        r="18"
        stroke="#38BDF8"
        strokeWidth="0.85"
        strokeOpacity="0.45"
      />

      {/* Crosshair Navigation Grid */}
      <line x1="32" y1="6" x2="32" y2="58" stroke="#F59E0B" strokeWidth="0.6" strokeOpacity="0.4" />
      <line x1="6" y1="32" x2="58" y2="32" stroke="#F59E0B" strokeWidth="0.6" strokeOpacity="0.4" />

      {/* Intercardinal 4-Point Wind Rose Star (NE, SE, SW, NW) */}
      <polygon
        points="32,25 46,18 39,32 46,46 32,39 18,46 25,32 18,18"
        fill="url(#marinerOcean)"
        fillOpacity="0.35"
        stroke="#38BDF8"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />

      {/* Primary 4-Point Mariner's Compass Needles (North, East, South, West) */}
      {/* NORTH (Utara - Penunjuk Masa Depan) */}
      <polygon points="32,8 36.5,27 32,24.5" fill="#FDE68A" />
      <polygon points="32,8 27.5,27 32,24.5" fill="#D97706" />

      {/* SOUTH (Selatan) */}
      <polygon points="32,56 36.5,37 32,39.5" fill="#38BDF8" />
      <polygon points="32,56 27.5,37 32,39.5" fill="#0284C7" />

      {/* EAST (Timur) */}
      <polygon points="56,32 37,27.5 39.5,32" fill="#FBBF24" />
      <polygon points="56,32 37,36.5 39.5,32" fill="#B45309" />

      {/* WEST (Barat) */}
      <polygon points="8,32 27,27.5 24.5,32" fill="#FBBF24" />
      <polygon points="8,32 27,36.5 24.5,32" fill="#B45309" />

      {/* Cardinal Direction Letters (N, E, S, W) */}
      <text
        x="32"
        y="6.8"
        textAnchor="middle"
        fill="#FDE68A"
        fontSize="5.2"
        fontWeight="bold"
        fontFamily="monospace"
      >
        N
      </text>
      <text
        x="32"
        y="61.2"
        textAnchor="middle"
        fill="#38BDF8"
        fontSize="4.8"
        fontWeight="bold"
        fontFamily="monospace"
      >
        S
      </text>
      <text
        x="59.5"
        y="33.6"
        textAnchor="middle"
        fill="#FBBF24"
        fontSize="4.8"
        fontWeight="bold"
        fontFamily="monospace"
      >
        E
      </text>
      <text
        x="4.5"
        y="33.6"
        textAnchor="middle"
        fill="#FBBF24"
        fontSize="4.8"
        fontWeight="bold"
        fontFamily="monospace"
      >
        W
      </text>

      {/* Central Brass Cap & Emerald Pivot */}
      <circle
        cx="32"
        cy="32"
        r="4.8"
        fill="#090C10"
        stroke="url(#marinerBrass)"
        strokeWidth="1.6"
      />
      <circle cx="32" cy="32" r="2" fill="#10B981" />
    </svg>
  );
}
