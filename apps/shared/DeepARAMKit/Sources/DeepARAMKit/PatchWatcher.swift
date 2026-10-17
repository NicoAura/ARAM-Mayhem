import Foundation

/// What the site says is current: the live patch and the PBE build (from /data/app-status.json).
public struct SiteStatus: Codable, Equatable, Sendable {
    public var livePatch: String?
    public var pbeBuild: String?
    public var pbeUpdated: String?

    public init(livePatch: String? = nil, pbeBuild: String? = nil, pbeUpdated: String? = nil) {
        self.livePatch = livePatch
        self.pbeBuild = pbeBuild
        self.pbeUpdated = pbeUpdated
    }
}

/// Something new since the last check, worth a notification.
public enum SiteNews: Equatable, Sendable {
    case newPatch(String)
    case newPBE(String)
}

/// Checks the site for a new live patch or PBE build and remembers what the person was last told
/// about. The very first check only records the current state, so nobody gets a notification on install.
public struct PatchWatcher: Sendable {
    public static let patchKey = "deeparam.lastSeenPatch"
    public static let pbeKey = "deeparam.lastSeenPBE"

    public let defaults: UserDefaults
    public let session: URLSession

    public init(defaults: UserDefaults = .standard, session: URLSession = .shared) {
        self.defaults = defaults
        self.session = session
    }

    /// Reads /data/app-status.json; falls back to the newest patch recap in the sitemap.
    public func status() async throws -> SiteStatus {
        if let (data, resp) = try? await session.data(from: Site.url("/data/app-status.json")),
           (resp as? HTTPURLResponse)?.statusCode == 200,
           let s = try? JSONDecoder().decode(SiteStatus.self, from: data), s.livePatch != nil {
            return s
        }
        let (data, _) = try await session.data(from: Site.url("/sitemap.xml"))
        return SiteStatus(livePatch: Self.patches(inSitemap: String(decoding: data, as: UTF8.self)).first)
    }

    public func check() async throws -> [SiteNews] {
        let s = try await status()
        var news: [SiteNews] = []
        if let patch = s.livePatch {
            if let seen = defaults.string(forKey: Self.patchKey), Self.compare(patch, seen) > 0 { news.append(.newPatch(patch)) }
            defaults.set(patch, forKey: Self.patchKey)
        }
        if let build = s.pbeBuild {
            if let seen = defaults.string(forKey: Self.pbeKey), seen != build { news.append(.newPBE(build)) }
            defaults.set(build, forKey: Self.pbeKey)
        }
        return news
    }

    /// "16.20" style patch names found in /patches/<patch> links, newest first.
    public static func patches(inSitemap xml: String) -> [String] {
        guard let re = try? NSRegularExpression(pattern: #"/patches/(\d+)\.(\d+)<"#) else { return [] }
        var found = Set<String>()
        for m in re.matches(in: xml, range: NSRange(xml.startIndex..., in: xml)) {
            guard let a = Range(m.range(at: 1), in: xml), let b = Range(m.range(at: 2), in: xml) else { continue }
            found.insert("\(xml[a]).\(xml[b])")
        }
        return found.sorted { compare($0, $1) > 0 }
    }

    /// Compares "16.9" and "16.10" as numbers, not text.
    public static func compare(_ a: String, _ b: String) -> Int {
        let x = a.split(separator: ".").compactMap { Int($0) }
        let y = b.split(separator: ".").compactMap { Int($0) }
        for i in 0..<max(x.count, y.count) {
            let p = i < x.count ? x[i] : 0, q = i < y.count ? y[i] : 0
            if p != q { return p < q ? -1 : 1 }
        }
        return 0
    }
}
