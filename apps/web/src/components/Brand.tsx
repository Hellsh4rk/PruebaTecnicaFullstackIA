import { ReactNode } from 'react';

export function TokaMark() {
  return (
    <div className="leading-none text-ink">
      <p className="text-[1.7rem] font-extrabold tracking-[0.16em]">TOKA</p>
      <p className="mt-1 text-[11px] font-semibold tracking-[0.12em] text-ink/70">55 1000 1000</p>
    </div>
  );
}

export function PageHero({
  title,
  lede,
  children,
}: {
  title: string;
  lede?: string;
  children?: ReactNode;
}) {
  return (
    <section className="hero-navy text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-6 px-4 py-10 md:px-6 md:py-12">
        <div className="max-w-2xl">
          <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">{title}</h1>
          {lede && <p className="mt-3 max-w-xl text-sm leading-6 text-white/75 md:text-base">{lede}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}

export function PageFrame({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">{children}</div>;
}

export function Ecosystem() {
  return (
    <svg viewBox="0 0 560 480" className="mx-auto w-full max-w-xl" role="img" aria-label="Ecosistema de la consola Toka">
      <defs>
        <radialGradient id="toka-glow" cx="50%" cy="48%" r="46%">
          <stop offset="0%" stopColor="#7ae7ff" stopOpacity="0.55" />
          <stop offset="42%" stopColor="#2f7bff" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#2f7bff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="toka-screen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#16357a" />
          <stop offset="100%" stopColor="#0a1c44" />
        </linearGradient>
      </defs>
      <ellipse cx="286" cy="232" rx="188" ry="156" fill="url(#toka-glow)" />
      <circle cx="286" cy="228" r="168" fill="none" stroke="rgba(255,255,255,0.16)" strokeDasharray="2 8" />
      <circle cx="286" cy="228" r="112" fill="none" stroke="rgba(140,210,255,0.35)" />
      <g fill="none" stroke="rgba(186,224,255,0.55)" strokeWidth="1.2">
        <path d="M286 92v48" />
        <path d="M134 150c40 20 70 38 92 58" />
        <path d="M438 150c-40 20-70 38-92 58" />
        <path d="M148 328c40-14 68-26 88-38" />
        <path d="M424 334c-42-16-70-28-92-40" />
        <path d="M286 382v-28" />
      </g>
      <g>
        <rect x="220" y="118" width="132" height="248" rx="26" fill="#07111f" />
        <rect x="228" y="132" width="116" height="214" rx="16" fill="url(#toka-screen)" />
        <text x="286" y="162" textAnchor="middle" fill="#ffffff" fontSize="13" fontFamily="Manrope, sans-serif">Hola</text>
        <text x="286" y="178" textAnchor="middle" fill="rgba(255,255,255,0.65)" fontSize="9" fontFamily="Manrope, sans-serif">Consola Toka</text>
        {[0, 1, 2].map((row) =>
          [0, 1, 2].map((col) => (
            <rect
              key={`${row}-${col}`}
              x={242 + col * 34}
              y={194 + row * 34}
              width="26"
              height="26"
              rx="7"
              fill={['#49d6ff', '#7aa2ff', '#ffffff', '#1d6fe5', '#d7e6ff', '#49d6ff', '#ffffff', '#8eb6ff', '#1d6fe5'][row * 3 + col]}
              opacity={row === 1 && col === 1 ? 1 : 0.92}
            />
          )),
        )}
        <rect x="268" y="328" width="36" height="5" rx="2.5" fill="rgba(255,255,255,0.55)" />
      </g>
      <Node x={286} y={58} label="Auditoría" icon="doc" labelAbove />
      <Node x={104} y={150} label="Usuarios" icon="people" />
      <Node x={468} y={150} label="Roles" icon="key" />
      <Node x={118} y={332} label="Asistente" icon="spark" />
      <Node x={456} y={338} label="Sesiones" icon="people" />
      <Node x={286} y={418} label="Pagos QR" icon="qr" />
    </svg>
  );
}

function Node({
  x,
  y,
  label,
  icon,
  labelAbove = false,
}: {
  x: number;
  y: number;
  label: string;
  icon: 'doc' | 'people' | 'key' | 'spark' | 'qr';
  labelAbove?: boolean;
}) {
  return (
    <g>
      <circle cx={x} cy={y} r="30" fill="rgba(8, 24, 58, 0.55)" stroke="rgba(255,255,255,0.72)" />
      <Icon x={x} y={y} name={icon} />
      <text x={x} y={labelAbove ? y - 40 : y + 46} textAnchor="middle" fill="rgba(255,255,255,0.88)" fontSize="12" fontFamily="Manrope, sans-serif">
        {label}
      </text>
    </g>
  );
}

function Icon({ x, y, name }: { x: number; y: number; name: 'doc' | 'people' | 'key' | 'spark' | 'qr' }) {
  const common = { fill: 'none', stroke: 'white', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (name === 'doc') {
    return (
      <g transform={`translate(${x - 8} ${y - 9})`}>
        <path d="M3 1.5h7l4 4V16.5H3z" {...common} />
        <path d="M10 1.5V6h4.5M6 9.5h6M6 12.5h4" {...common} />
      </g>
    );
  }
  if (name === 'people') {
    return (
      <g transform={`translate(${x - 10} ${y - 8})`}>
        <circle cx="7" cy="4" r="2.2" {...common} />
        <path d="M2.5 14.5c.4-3 2.2-4.4 4.5-4.4s4.1 1.4 4.5 4.4" {...common} />
        <circle cx="14" cy="5" r="1.7" {...common} />
        <path d="M13 10.2c1.6.3 2.8 1.3 3.2 3.3" {...common} />
      </g>
    );
  }
  if (name === 'key') {
    return (
      <g transform={`translate(${x - 9} ${y - 6})`}>
        <circle cx="4.2" cy="6" r="3" {...common} />
        <path d="M7 6h9M13.2 6v2.6M16 6v2" {...common} />
      </g>
    );
  }
  if (name === 'spark') {
    return (
      <g transform={`translate(${x - 8} ${y - 8})`}>
        <path d="M8 1.2 9.4 6.2 14.4 7.6 9.4 9 8 14 6.6 9 1.6 7.6 6.6 6.2z" {...common} />
      </g>
    );
  }
  return (
    <g transform={`translate(${x - 8} ${y - 8})`}>
      <rect x="1.5" y="1.5" width="13" height="13" rx="1.5" {...common} />
      <path d="M4 4h2.2v2.2H4zM9.8 4H12v2.2H9.8zM4 9.8h2.2V12H4zM8.2 8.2h1.6V9.8M9.8 9.8H12V12M8.2 11.2H9.8" {...common} />
    </g>
  );
}
