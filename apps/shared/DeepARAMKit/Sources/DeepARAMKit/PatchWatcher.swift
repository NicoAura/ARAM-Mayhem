import Foundation

/// What the site reports about the current patches.
public struct PatchStatus: Codable, Equatable, Sendable {
    public var livePatch: String?
    public var pbeBuild: String?
    public var pbeUpdated: String?

    public init(livePatch: String? = nil, pbeBuild: String? = nil, pbeUpdated: String? = nil) {
        self.livePatch = livePatch
        self.pbeBuild = pbeBuild
        self.pbeUpdated = pbeUpdated
    }

    /// "16.21.8289811" -> "16.21": PBE build numbers change far more often than anything people notice.
    public var pbePatch: String? {
        guard let pbeBuild else { return nil }
        return pbeBuild.split(separator: ".").prefix(2).joined(separator: ".")
    }
}

public enum PatchChange: Equatable, Sendable {
    case live(String)
    case pbe(String)

    public var title: String {
        switch self {
        case .live(let p): return "Patch \(p) is live"
        case .pbe(let p): return "Patch \(p) is on the PBE"
        }
    }

    public var body: String {
        switch self {
        case .live: return "The tier list and stats now cover the new patch."
        case .pbe: return "See what's changing for ARAM Mayhem on the test server."
        }
    }

    public var url: URL {
        switch self {
        case .live: return Site.url("/tier-list")
        case .pbe: return Site.url("/pbe")
        }
    }
}

/// Checks the site for a new live or PBE patch and remembers what it last saw.
public final class PatchWatcher: @unchecked Sendable {
    private let defaults: UserDefaults
    private let session: URLSession
    private let key = "deeparam.lastPatchStatus"

    public init(defaults: UserDefaults = .standard, session: URLSession = .shared) {
        self.defaults = defaults
        self.session = session
    }

    public var lastSeen: PatchStatus? {
        guard let data = defaults.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(PatchStatus.self, from: data)
    }

    /// Fetches the current status and returns what changed since the last check.
    /// The very first check only records the current patches, so nobody is told about an old one.
    public func check() async throws -> [PatchChange] {
        var request = URLRequest(url: Site.statusURL)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        let (data, response) = try await session.data(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw URLError(.badServerResponse)
        }
        let current = try JSONDecoder().decode(PatchStatus.self, from: data)
        let changes = Self.changes(from: lastSeen, to: current)
        defaults.set(try JSONEncoder().encode(current), forKey: key)
        return changes
    }

    public static func changes(from old: PatchStatus?, to new: PatchStatus) -> [PatchChange] {
        guard let old else { return [] }
        var out: [PatchChange] = []
        if let live = new.livePatch, let was = old.livePatch, live != was, isNewer(live, than: was) {
            out.append(.live(live))
        }
        if let pbe = new.pbePatch, let was = old.pbePatch, pbe != was, isNewer(pbe, than: was) {
            out.append(.pbe(pbe))
        }
        return out
    }

    /// Compares "16.20" style versions number by number.
    public static func isNewer(_ a: String, than b: String) -> Bool {
        let x = a.split(separator: ".").map { Int($0) ?? 0 }
        let y = b.split(separator: ".").map { Int($0) ?? 0 }
        for i in 0..<max(x.count, y.count) {
            let l = i < x.count ? x[i] : 0, r = i < y.count ? y[i] : 0
            if l != r { return l > r }
        }
        return false
    }
}
