import { describe, expect, it } from "vitest";
import { cleanHistoryGame } from "@/lib/match-history";

// The owner's saved games (lib/match-history.ts): only the player's own stats survive, nothing else.
const game = {
  gameId: 7123456789,
  gameCreation: 1760000000000,
  gameDuration: 1100,
  queueId: 2400,
  gameVersion: "16.20.715.1234",
  participants: [
    { participantId: 1, teamId: 100, championId: 103, puuid: "me", championName: "Ahri", riotIdGameName: "Nico", riotIdTagline: "NA1",
      stats: { win: true, kills: 12, deaths: 3, assists: 20, totalDamageDealtToChampions: 51000, playerAugment1: 1001, item0: 3089, goldEarned: 99 } },
    { participantId: 2, teamId: 100, championId: 1, puuid: "someone", riotIdGameName: "Other", stats: { kills: 4 } },
  ],
  killMap: [[60, 100, 200, 1, 6]],
  extra: "dropped",
};

describe("cleanHistoryGame", () => {
  it("keeps the player's own stats and only champion and team for the rest", () => {
    const g = cleanHistoryGame(game)!;
    expect(g.gameId).toBe(7123456789);
    const [me, other] = g.participants as Record<string, unknown>[];
    expect(me).toMatchObject({ puuid: "me", championName: "Ahri", riotIdGameName: "Nico" });
    expect((me.stats as Record<string, unknown>).kills).toBe(12);
    expect((me.stats as Record<string, unknown>).goldEarned).toBeUndefined();
    expect(other).toEqual({ participantId: 2, teamId: 100, championId: 1 });
    expect(g.killMap).toEqual([[60, 100, 200, 1, 6]]);
    expect(JSON.stringify(g)).not.toContain("dropped");
  });

  it.each([
    [{ ...game, gameId: 0 }],
    [{ ...game, gameVersion: "<b>" }],
    [{ ...game, participants: game.participants.map((p) => ({ ...p, puuid: "x" })) }],
    [null],
  ])("refuses a game that isn't one of the player's", (g) => expect(cleanHistoryGame(g)).toBeNull());

  it("strips markup from names", () => {
    const g = cleanHistoryGame({ ...game, participants: [{ ...game.participants[0], riotIdGameName: "<img src=x>Nico" }] })!;
    expect((g.participants[0] as Record<string, unknown>).riotIdGameName).toBe("img src=xNico");
  });
});
