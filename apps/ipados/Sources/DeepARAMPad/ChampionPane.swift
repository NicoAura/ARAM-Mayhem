import DeepARAMKit
import SwiftUI

/// The right-hand pane: a champion page, or a grid to pick one.
struct ChampionPane: View {
    @ObservedObject var model: PadModel
    @ObservedObject private var state: PageState
    @ObservedObject private var page: SitePage
    @Environment(\.openWindow) private var openWindow

    init(model: PadModel) {
        self.model = model
        self.state = model.championState
        self.page = model.championState.page
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()
            if model.champion == nil {
                ChampionPicker(search: model.search) { model.openChampion($0) }
            } else {
                PadWebPage(state: state)
            }
        }
        .background(.background)
    }

    private var header: some View {
        HStack(spacing: 4) {
            if model.champion != nil {
                PaneButton("Back", symbol: "chevron.backward", enabled: page.canGoBack) { page.goBack() }
                PaneButton("All Champions", symbol: "square.grid.3x3") { model.showChampionGrid() }
            }
            Text(model.champion == nil ? "Champions" : paneTitle)
                .font(.headline)
                .lineLimit(1)
                .frame(maxWidth: .infinity)
            if let alias = model.champion {
                PaneButton("Open in New Window", symbol: "macwindow.badge.plus") { openWindow(id: PadChampionWindow.id, value: alias) }
                if let url = state.url {
                    ShareLink(item: url) { Image(systemName: "square.and.arrow.up") }
                        .frame(width: 44, height: 44)
                        .hoverEffect()
                }
            }
            PaneButton("Close Champion Pane", symbol: "xmark") { model.toggleChampionPane() }
        }
        .padding(.horizontal, 8)
        .frame(height: 52)
    }

    private var paneTitle: String {
        state.shortTitle.isEmpty ? (model.champion ?? "") : state.shortTitle
    }
}

/// A 44-point icon button with a pointer and Pencil hover highlight.
struct PaneButton: View {
    let title: String
    let symbol: String
    var enabled = true
    let action: () -> Void

    init(_ title: String, symbol: String, enabled: Bool = true, action: @escaping () -> Void) {
        self.title = title
        self.symbol = symbol
        self.enabled = enabled
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            Image(systemName: symbol)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(enabled ? Color.accentColor : .secondary)
        .disabled(!enabled)
        .hoverEffect()
        .accessibilityLabel(title)
        .help(title)
    }
}

/// Every champion as a large, easy-to-hit tile, filterable by name (Scribble works in the field).
struct ChampionPicker: View {
    @ObservedObject var search: SearchIndex
    var onPick: (String) -> Void
    @State private var filter = ""

    private var champions: [SearchItem] {
        let all = search.champions
        let q = filter.trimmingCharacters(in: .whitespaces).lowercased()
        return q.isEmpty ? all : all.filter { $0.name.lowercased().contains(q) }
    }

    var body: some View {
        ScrollView {
            TextField("Filter champions", text: $filter)
                .textFieldStyle(.roundedBorder)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .padding([.horizontal, .top])
            if search.failed {
                ContentUnavailableView {
                    Label("Can't load champions", systemImage: "wifi.exclamationmark")
                } actions: {
                    Button("Try Again") { Task { await search.load() } }
                }
            } else if search.items.isEmpty {
                ProgressView().padding(40)
            }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 84), spacing: 12)], spacing: 16) {
                ForEach(champions) { champ in
                    Button { champ.championAlias.map(onPick) } label: {
                        VStack(spacing: 6) {
                            ItemIcon(url: champ.iconURL, size: 64)
                            Text(champ.name).font(.caption).lineLimit(1)
                            if let hint = champ.hint {
                                Text(hint).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                            }
                        }
                        .frame(maxWidth: .infinity, minHeight: 110)
                        .contentShape(RoundedRectangle(cornerRadius: 12))
                    }
                    .buttonStyle(.plain)
                    .hoverEffect(.lift)
                    .draggable(champ.url)
                }
            }
            .padding()
        }
    }
}

/// A champion page alone in its own window. Add it to the app as
/// `WindowGroup(id: PadChampionWindow.id, for: String.self) { PadChampionWindow(alias: $0.wrappedValue) }`.
public struct PadChampionWindow: View {
    public static let id = "champion"
    let alias: String?
    @StateObject private var state = PageState(page: SitePage(tab: .page("/champions", title: "Champion"), platform: "ipad"))

    public init(alias: String?) { self.alias = alias }

    public var body: some View {
        NavigationStack {
            PadWebPage(state: state)
                .navigationTitle(state.shortTitle.isEmpty ? (alias ?? "Champion") : state.shortTitle)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItemGroup(placement: .topBarLeading) { BackButton(page: state.page) }
                    ToolbarItemGroup(placement: .topBarTrailing) {
                        Button { state.page.reload() } label: { Label("Reload", systemImage: "arrow.clockwise") }
                        if let url = state.url { ShareLink(item: url) }
                    }
                }
        }
        .task { if state.url == nil { state.page.open(alias.map(Champion.url) ?? Site.url("/champions")) } }
    }
}
