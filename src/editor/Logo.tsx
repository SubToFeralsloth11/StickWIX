/** The StickWIX sticker logo. */
export function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect x="6" y="6" width="52" height="52" rx="14" fill="#ff7a59" stroke="#f4efe6" strokeWidth="3" transform="rotate(-6 32 32)" />
      <path d="M18 42l9-18 6 12 4-6 8 12" stroke="#15131c" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="44" cy="22" r="4.5" fill="#ffd166" stroke="#15131c" strokeWidth="2.5" />
    </svg>
  );
}
