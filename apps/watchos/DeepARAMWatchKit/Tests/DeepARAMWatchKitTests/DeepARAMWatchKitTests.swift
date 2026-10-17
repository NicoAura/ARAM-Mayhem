import XCTest
@testable import DeepARAMWatchKit

final class DeepARAMWatchKitTests: XCTestCase {
    func testReadsWatchJSON() throws {
        let json = """
        {"patch":"16.20",
         "chefsSpecial":{"title":"The Eye of the Storm","champion":"Janna","name":"Janna","tier":"Secretly strong",
           "play":"Walk in first.","items":["Heartsteel"],"augments":[{"name":"Goliath","rarity":"prismatic"}]},
         "champions":[{"id":"Aatrox","name":"Aatrox","tier":"A","winRate":0.51,"skills":["Q","E","W"],
           "items":["Plated Steelcaps","Sundered Sky"],"augments":{"prismatic":["Goliath"],"gold":[],"silver":["Tank Engine"]}}]}
        """
        let d = try JSONDecoder().decode(WatchData.self, from: Data(json.utf8))
        XCTAssertEqual(d.patch, "16.20")
        XCTAssertEqual(d.chefsSpecial?.name, "Janna")
        XCTAssertEqual(d.champion("Aatrox")?.tier, "A")
        XCTAssertEqual(d.champion("Aatrox")?.augments.byRarity.map(\.rarity), ["Prismatic", "Silver"])
    }

    func testMissingChefsSpecialAndTier() throws {
        let json = #"{"patch":null,"chefsSpecial":null,"champions":[{"id":"Ahri","name":"Ahri","skills":[],"items":[],"augments":{"prismatic":[],"gold":[],"silver":[]}}]}"#
        let d = try JSONDecoder().decode(WatchData.self, from: Data(json.utf8))
        XCTAssertNil(d.chefsSpecial)
        XCTAssertNil(d.champions[0].tier)
        XCTAssertTrue(d.champions[0].augments.isEmpty)
    }

    func testConvertsWhatToBuild() throws {
        // Trimmed from the site's /data/what-to-build.json.
        let json = """
        {"champions":[{"id":"Aatrox","name":"Aatrox","kind":"ad",
          "best":{"items":[126697,2517,3111],"winRate":0.50,"pickRate":0.01},
          "popular":{"items":[126697,3065],"winRate":0.41,"pickRate":0.02},
          "boots":{"items":[3111],"winRate":0.49,"pickRate":0.01},
          "skills":["Q","E","W"],"augs":{"silver":[2157],"gold":[],"prismatic":[2006,9999]}}],
         "items":{"126697":["Opportunity","/i/a.png"],"2517":["Sundered Sky","/i/b.png"],"3111":["Mercury's Treads","/i/c.png"]},
         "augs":{"2157":"Tank Engine","2006":"Goliath"},
         "swaps":{}}
        """
        let w = try JSONDecoder().decode(WhatToBuild.self, from: Data(json.utf8))
        let c = try XCTUnwrap(w.watchChampions().first)
        XCTAssertEqual(c.skills, ["Q", "E", "W"])
        // Boots first, no repeats, unknown ids dropped.
        XCTAssertEqual(c.items, ["Mercury's Treads", "Opportunity", "Sundered Sky"])
        XCTAssertEqual(c.augments, Augments(prismatic: ["Goliath"], gold: [], silver: ["Tank Engine"]))
    }

    func testSearch() {
        let d = WatchData(champions: [
            Champion(id: "Annie", name: "Annie"),
            Champion(id: "Leona", name: "Leona"),
            Champion(id: "Nunu", name: "Nunu & Willump"),
        ])
        XCTAssertEqual(d.search("N").map(\.id), ["Nunu", "Annie", "Leona"])
        XCTAssertEqual(d.search("willump").map(\.id), ["Nunu"])
        XCTAssertEqual(d.search("  ").count, 3)
    }

    func testPatchesFromSitemap() {
        let xml = "<loc>https://deeparam.com/patches/16.9</loc><loc>https://deeparam.com/patches/16.10</loc><loc>https://deeparam.com/patches</loc>"
        XCTAssertEqual(WatchFeed.patches(inSitemap: xml), ["16.10", "16.9"])
    }

    func testSavesAndLoads() throws {
        let file = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString).appendingPathComponent("w.json")
        let feed = WatchFeed(cacheFile: file)
        XCTAssertNil(feed.load())
        let saved = WatchFeed.Saved(data: WatchData(patch: "16.20"), savedAt: Date(timeIntervalSince1970: 1_000))
        feed.save(saved)
        XCTAssertEqual(feed.load(), saved)
    }
}
