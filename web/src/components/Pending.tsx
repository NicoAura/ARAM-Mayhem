import { REPO_URL } from "@/lib/sections";

// Shown when a tab's data isn't in the repo yet because its pull request hasn't merged.
export default function Pending({ pr, children }: { pr: number; children: React.ReactNode }) {
  return (
    <div className="placeholder">
      <span className="status-dot" />
      <span>
        {children}{" "}
        <a className="inline-link" href={`${REPO_URL}/pull/${pr}`}>
          PR #{pr}
        </a>
      </span>
    </div>
  );
}
