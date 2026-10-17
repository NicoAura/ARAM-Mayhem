import Foundation

/// The website the apps wrap, and the sections their menus and shortcuts jump to.
public enum Site {
    public static let base = URL(string: "https://deeparam.com")!
    public static let hosts: Set<String> = ["deeparam.com", "www.deeparam.com"]

    /// Polled for patch notifications; built once per site deploy.
    public static let statusURL = url("/data/app-status.json")

    /// Appended to the user agent so the site can tell it is running inside an app.
    public static func userAgentSuffix(platform: String, version: String) -> String {
        "DeepARAMApp/\(version) (\(platform))"
    }

    public struct Section: Identifiable, Hashable, Sendable {
        public let id: String
        public let title: String
        public let path: String
        /// SF Symbol name.
        public let symbol: String

        public var url: URL { Site.url(path) }
    }

    public static let sections: [Section] = [
        Section(id: "home", title: "Home", path: "/", symbol: "house"),
        Section(id: "tier-list", title: "Tier List", path: "/tier-list", symbol: "list.number"),
        Section(id: "simulator", title: "Simulator", path: "/simulator", symbol: "bolt"),
        Section(id: "pbe", title: "PBE", path: "/pbe", symbol: "flask"),
        Section(id: "patches", title: "Patch Recaps", path: "/patches", symbol: "doc.text"),
        Section(id: "info", title: "Info", path: "/info", symbol: "info.circle"),
        Section(id: "lab", title: "The Lab", path: "/lab", symbol: "sparkles"),
        Section(id: "stats", title: "My Stats", path: "/stats", symbol: "person.crop.circle"),
    ]

    public static func url(_ path: String) -> URL {
        URL(string: path, relativeTo: base)!.absoluteURL
    }

    /// Links to the site stay in the app; everything else opens in the default browser.
    public static func isInternal(_ url: URL) -> Bool {
        guard let scheme = url.scheme?.lowercased() else { return true }
        if scheme == "about" || scheme == "blob" || scheme == "data" { return true }
        guard scheme == "https" || scheme == "http", let host = url.host?.lowercased() else { return false }
        return hosts.contains(host)
    }

    /// The section a page belongs to, for highlighting the current one in menus.
    public static func section(for url: URL) -> Section? {
        guard isInternal(url) else { return nil }
        let path = url.path.isEmpty ? "/" : url.path
        return sections
            .filter { $0.path == "/" ? path == "/" : path == $0.path || path.hasPrefix($0.path + "/") }
            .first
    }
}
