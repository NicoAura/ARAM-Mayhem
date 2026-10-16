// Shown when a tab's content isn't ready yet. `pr` and the children say which work it waits on,
// for whoever reads the code; visitors just see "Coming soon."
export default function Pending(_props: { pr: number; children: React.ReactNode }) {
  void _props;
  return (
    <div className="placeholder">
      <span className="status-dot" />
      <span>Coming soon.</span>
    </div>
  );
}
