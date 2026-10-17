"use client";

import { SERVERS } from "@/lib/account";

// Riot ID as Name # Tag plus a region, shared by the header account lookup and My Stats.
// `riotId` stays one "Name#TAG" string for the caller; pasting a whole Riot ID into Name splits it.
// Field names (riot-name, riot-tag, region) and autocomplete="username" on Name let password managers fill it.
export default function RiotIdFields({
  riotId,
  onRiotId,
  platform,
  onPlatform,
  autoFocus,
}: {
  riotId: string;
  onRiotId: (v: string) => void;
  platform: string;
  onPlatform: (v: string) => void;
  autoFocus?: boolean;
}) {
  const i = riotId.indexOf("#");
  const name = i < 0 ? riotId : riotId.slice(0, i);
  const tag = i < 0 ? "" : riotId.slice(i + 1);
  const set = (n: string, t: string) => onRiotId(`${n}#${t}`);

  return (
    <div className="riot-fields">
      <label className="riot-name">
        <span>Riot ID</span>
        <span className="riot-id-row">
          <input
            name="riot-name"
            value={name}
            onChange={(e) => {
              const v = e.target.value;
              if (v.includes("#")) {
                const [n, ...t] = v.split("#");
                set(n, t.join("").replace(/\s/g, ""));
              } else set(v, tag);
            }}
            placeholder="Name"
            autoComplete="username"
            spellCheck={false}
            autoFocus={autoFocus}
            required
            maxLength={16}
          />
          <span className="riot-hash" aria-hidden="true">
            #
          </span>
          <input
            name="riot-tag"
            aria-label="Tag"
            value={tag}
            onChange={(e) => set(name, e.target.value.replace(/[#\s]/g, ""))}
            placeholder="NA1"
            autoComplete="off"
            spellCheck={false}
            required
            minLength={2}
            maxLength={5}
          />
        </span>
      </label>
      <label className="riot-region">
        <span>Region</span>
        <select name="region" value={platform} onChange={(e) => onPlatform(e.target.value)}>
          {SERVERS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
