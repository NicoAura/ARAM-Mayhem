import DeepARAMKit
import Foundation

extension SiteTab {
    /// Every section, in the order the sidebar lists them.
    static let padSections: [SiteTab] = SiteTab.primary + SiteTab.more

    var isBeta: Bool { id == SiteTab.simulator.id }

    /// The sidebar section a site link belongs to, matched on its path.
    static func padSection(for url: URL) -> SiteTab? {
        guard Site.isInternal(url) else { return nil }
        let path = url.path.isEmpty ? "/" : url.path
        return padSections.last { $0.path == "/" ? path == "/" : (path == $0.path || path.hasPrefix($0.path + "/")) }
    }

    /// A page that isn't a section, such as one champion.
    static func page(_ path: String, title: String) -> SiteTab {
        SiteTab(id: "page:" + path, title: title, symbol: "doc", path: path)
    }
}

enum Champion {
    static func path(_ alias: String) -> String { "/champions/\(alias)" }
    static func url(_ alias: String) -> URL { Site.url(path(alias)) }

    /// The alias in a /champions/<alias> link, if it is one.
    static func alias(in url: URL) -> String? {
        guard Site.isInternal(url) else { return nil }
        let parts = url.path.split(separator: "/")
        guard parts.count == 2, parts[0] == "champions" else { return nil }
        return String(parts[1])
    }
}
