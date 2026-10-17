import DeepARAMKit
import Foundation

/// One entry of the site's search list: a page, champion, augment or item.
struct SearchItem: Decodable, Identifiable, Hashable, Sendable {
    let group: String
    let name: String
    let hint: String?
    let href: String
    let icon: String?

    var id: String { href }
    var url: URL { Site.url(href) }
    var iconURL: URL? { icon.map(Site.url) }
    var championAlias: String? { Champion.alias(in: url) }
}

/// The site's search list (/data/search.json), loaded once and filtered on the device.
@MainActor
final class SearchIndex: ObservableObject {
    @Published private(set) var items: [SearchItem] = []
    @Published private(set) var failed = false

    var champions: [SearchItem] { items.filter { $0.championAlias != nil } }

    func load() async {
        guard items.isEmpty else { return }
        do {
            let (data, _) = try await URLSession.shared.data(from: Site.url("/data/search.json"))
            items = try JSONDecoder().decode([SearchItem].self, from: data)
            failed = false
        } catch {
            failed = true
        }
    }

    /// Names containing `query`, those starting with it first.
    func search(_ query: String, limit: Int = 40) -> [SearchItem] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard !q.isEmpty else { return [] }
        let hits = items.filter { $0.name.lowercased().contains(q) }
        let (prefix, rest) = (hits.filter { $0.name.lowercased().hasPrefix(q) }, hits.filter { !$0.name.lowercased().hasPrefix(q) })
        return Array((prefix + rest).prefix(limit))
    }
}
