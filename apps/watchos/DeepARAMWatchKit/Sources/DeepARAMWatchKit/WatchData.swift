import Foundation

/// Everything the watch shows, in the shape of the site's /data/watch.json.
public struct WatchData: Codable, Equatable, Sendable {
    /// Live patch, like "16.20".
    public var patch: String?
    public var chefsSpecial: ChefsSpecial?
    public var champions: [Champion]

    public init(patch: String? = nil, chefsSpecial: ChefsSpecial? = nil, champions: [Champion] = []) {
        self.patch = patch
        self.chefsSpecial = chefsSpecial
        self.champions = champions
    }

    public func champion(_ id: String) -> Champion? {
        champions.first { $0.id == id }
    }

    /// Champions whose name starts with or contains the search text, best matches first.
    public func search(_ text: String) -> [Champion] {
        let q = text.trimmingCharacters(in: .whitespaces).folding(options: [.caseInsensitive, .diacriticInsensitive], locale: nil)
        guard !q.isEmpty else { return champions }
        let key = { (c: Champion) in c.name.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: nil) }
        let starts = champions.filter { key($0).hasPrefix(q) }
        let contains = champions.filter { !key($0).hasPrefix(q) && key($0).contains(q) }
        return starts + contains
    }
}

/// One champion's quick reference: what to max, what to buy, which augments to take.
public struct Champion: Codable, Equatable, Identifiable, Hashable, Sendable {
    /// The site's champion id, like "MissFortune". Also names the icon (/icons/champions/<id>.webp).
    public var id: String
    public var name: String
    /// Live-patch tier, like "S". Missing when the champion has too few games.
    public var tier: String?
    public var winRate: Double?
    /// Skill max order, like ["Q", "E", "W"].
    public var skills: [String]
    /// Boots first, then the build that wins most.
    public var items: [String]
    /// Top augments by rarity, best first.
    public var augments: Augments

    public init(id: String, name: String, tier: String? = nil, winRate: Double? = nil, skills: [String] = [], items: [String] = [], augments: Augments = Augments()) {
        self.id = id
        self.name = name
        self.tier = tier
        self.winRate = winRate
        self.skills = skills
        self.items = items
        self.augments = augments
    }

    public var iconURL: URL { WatchFeed.url("/icons/champions/\(id).webp") }
}

public struct Augments: Codable, Equatable, Hashable, Sendable {
    public var prismatic: [String]
    public var gold: [String]
    public var silver: [String]

    public init(prismatic: [String] = [], gold: [String] = [], silver: [String] = []) {
        self.prismatic = prismatic
        self.gold = gold
        self.silver = silver
    }

    public var isEmpty: Bool { prismatic.isEmpty && gold.isEmpty && silver.isEmpty }

    /// Rarity name and its augments, highest rarity first, skipping empty ones.
    public var byRarity: [(rarity: String, names: [String])] {
        [("Prismatic", prismatic), ("Gold", gold), ("Silver", silver)].filter { !$0.1.isEmpty }
    }
}

/// The Lab's one unusual build of the day.
public struct ChefsSpecial: Codable, Equatable, Sendable {
    public var title: String
    /// Champion id, like "Janna".
    public var champion: String
    public var name: String
    /// The Lab's verdict, like "Secretly strong".
    public var tier: String?
    public var play: String?
    public var items: [String]
    public var augments: [Augment]

    public struct Augment: Codable, Equatable, Hashable, Sendable {
        public var name: String
        public var rarity: String

        public init(name: String, rarity: String) {
            self.name = name
            self.rarity = rarity
        }
    }

    public init(title: String, champion: String, name: String, tier: String? = nil, play: String? = nil, items: [String] = [], augments: [Augment] = []) {
        self.title = title
        self.champion = champion
        self.name = name
        self.tier = tier
        self.play = play
        self.items = items
        self.augments = augments
    }

    public var iconURL: URL { WatchFeed.url("/icons/champions/\(champion).webp") }
}

// MARK: - Older source

/// The site's /data/what-to-build.json, which the watch reads when /data/watch.json is not there.
/// Item and augment ids are looked up in its own name tables.
struct WhatToBuild: Decodable {
    struct Pick: Decodable { var items: [Int] }
    struct Champ: Decodable {
        var id: String
        var name: String
        var best: Pick?
        var popular: Pick?
        var boots: Pick?
        var skills: [String]
        var augs: [String: [Int]]
    }
    var champions: [Champ]
    /// Item id -> [name, icon].
    var items: [String: [String]]
    /// Augment id -> name.
    var augs: [String: String]

    /// Same picks as the champion page's quick reference: boots, then the build that wins most.
    func watchChampions() -> [Champion] {
        champions.map { c in
            let ids = (c.boots?.items ?? []) + ((c.best ?? c.popular)?.items ?? [])
            var seen = Set<Int>()
            let names = ids.filter { seen.insert($0).inserted }.compactMap { items[String($0)]?.first }
            let picks = { (r: String) in (c.augs[r] ?? []).compactMap { augs[String($0)] } }
            return Champion(id: c.id, name: c.name, skills: c.skills, items: names,
                            augments: Augments(prismatic: picks("prismatic"), gold: picks("gold"), silver: picks("silver")))
        }
    }
}
