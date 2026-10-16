// The DeepARAM logo, Augment Hex: a Prismatic augment frame around a spark. Same drawing as src/app/icon.svg.
export default function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <linearGradient id="brand-prismatic" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9fe7ff" />
          <stop offset="0.4" stopColor="#c9b8ff" />
          <stop offset="0.7" stopColor="#ffb8e0" />
          <stop offset="1" stopColor="#ffe2a3" />
        </linearGradient>
      </defs>
      <path d="M60 4l49 28v56l-49 28-49-28V32z" fill="url(#brand-prismatic)" />
      <path d="M60 18l37 21v42l-37 21-37-21V39z" fill="var(--mark-core)" />
      <path d="M60 38l6 16 16 6-16 6-6 16-6-16-16-6 16-6z" fill="url(#brand-prismatic)" />
    </svg>
  );
}
