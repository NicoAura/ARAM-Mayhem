// A DeepScore badge: the 0-100 rating in a ring that fills and shifts colour with the score (red at the
// bottom, through green at average, to violet at the top). Hovering, focusing or tapping it shows how
// DeepScore works (lib/deepscore.ts). `static` drops the button, for use inside a link.

export default function DeepScore({ value, help, static: still }: { value: number; help?: string; static?: boolean }) {
  const style = { "--ds": value } as React.CSSProperties;
  if (still || !help) {
    return (
      <span className="deepscore" style={style} aria-label={`DeepScore ${value}`}>
        {value}
      </span>
    );
  }
  return (
    <button type="button" className="deepscore" style={style} data-tip={help} aria-label={`DeepScore ${value}`} aria-description={help}>
      {value}
    </button>
  );
}
