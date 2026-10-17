import Foundation

/// Keeps the last good copy of each tab's page (a web archive) so a tab still opens without a connection.
public struct OfflineStore: Sendable {
    public let folder: URL

    public init(folder: URL? = nil) {
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        self.folder = folder ?? caches.appendingPathComponent("OfflinePages", isDirectory: true)
    }

    public func fileURL(for page: URL) -> URL {
        let key = (page.path.isEmpty ? "/" : page.path)
            .replacingOccurrences(of: "/", with: "_")
            .addingPercentEncoding(withAllowedCharacters: .alphanumerics.union(CharacterSet(charactersIn: "_-.")))
            ?? "page"
        return folder.appendingPathComponent("page\(key).webarchive")
    }

    public func save(_ data: Data, for page: URL) {
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        try? data.write(to: fileURL(for: page), options: .atomic)
    }

    public func load(for page: URL) -> Data? {
        try? Data(contentsOf: fileURL(for: page))
    }

    public func savedDate(for page: URL) -> Date? {
        (try? FileManager.default.attributesOfItem(atPath: fileURL(for: page).path))?[.modificationDate] as? Date
    }
}
