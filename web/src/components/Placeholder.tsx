export default function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="placeholder">
      <span className="status-dot" />
      {children}
    </div>
  );
}
