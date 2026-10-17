import DeepARAMKit
import SwiftUI
import WebKit

/// One app window: the site, a slim toolbar, and a note when showing saved pages offline.
struct BrowserWindow: View {
    @StateObject private var model = BrowserModel()
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        WebView(webView: model.webView)
            .ignoresSafeArea()
            .overlay(alignment: .top) {
                if model.isOffline {
                    OfflineBanner { model.reload() }
                        .padding(.top, 8)
                        .transition(.move(edge: .top).combined(with: .opacity))
                }
            }
            .animation(.easeOut(duration: 0.2), value: model.isOffline)
            .navigationTitle(model.title)
            .toolbar { toolbar }
            .focusedSceneObject(model)
            .onAppear {
                OpenWindowBridge.openMain = { [openWindow] in openWindow(id: "main") }
                model.loadInitial(WindowRouter.shared.takePending())
            }
            .onReceive(NotificationCenter.default.publisher(for: .deeparamOpenURL)) { note in
                // Patch alerts and deep links land in the frontmost window.
                guard let url = note.object as? URL, model.webView.window?.isKeyWindow == true else { return }
                model.load(url)
            }
    }

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        ToolbarItemGroup(placement: .navigation) {
            Button { model.goBack() } label: { Label("Back", systemImage: "chevron.left") }
                .disabled(!model.canGoBack)
                .help("Back")
            Button { model.goForward() } label: { Label("Forward", systemImage: "chevron.right") }
                .disabled(!model.canGoForward)
                .help("Forward")
        }
        ToolbarItemGroup(placement: .primaryAction) {
            Menu {
                ForEach(Site.sections) { s in
                    Button { model.go(s) } label: { Label(s.title, systemImage: s.symbol) }
                }
            } label: {
                Label(currentSectionTitle, systemImage: "square.grid.2x2")
            }
            .help("Go to a section")
            Button { model.openSearch() } label: { Label("Search", systemImage: "magnifyingglass") }
                .help("Search champions, augments and items (⌘K)")
            if model.isLoading {
                Button { model.stop() } label: { Label("Stop", systemImage: "xmark") }
                    .help("Stop loading")
            } else {
                Button { model.reload() } label: { Label("Reload", systemImage: "arrow.clockwise") }
                    .help("Reload")
            }
            if let url = model.url, Site.isInternal(url), url.scheme != "about" {
                ShareLink(item: url) { Label("Share", systemImage: "square.and.arrow.up") }
                    .help("Share this page")
            }
        }
    }

    private var currentSectionTitle: String {
        model.url.flatMap(Site.section(for:))?.title ?? "Sections"
    }
}

private struct OfflineBanner: View {
    let retry: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "wifi.slash")
            Text("You're offline. Showing the saved copy of this page.")
            Button("Try again", action: retry)
                .buttonStyle(.link)
        }
        .font(.callout)
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(.regularMaterial, in: Capsule())
        .shadow(radius: 6, y: 2)
    }
}

/// Hosts the model's WKWebView in SwiftUI.
struct WebView: NSViewRepresentable {
    let webView: WKWebView
    func makeNSView(context: Context) -> WKWebView { webView }
    func updateNSView(_ nsView: WKWebView, context: Context) {}
}

extension Notification.Name {
    static let deeparamOpenURL = Notification.Name("deeparam.openURL")
}

/// Hands a URL to the next window that opens (when a patch alert is clicked with no window open).
@MainActor
final class WindowRouter {
    static let shared = WindowRouter()
    private var pending: URL?

    func open(_ url: URL) {
        if NSApp.windows.contains(where: { $0.isVisible && $0.canBecomeMain }) {
            NSApp.activate(ignoringOtherApps: true)
            NotificationCenter.default.post(name: .deeparamOpenURL, object: url)
        } else {
            pending = url
            NSApp.activate(ignoringOtherApps: true)
            OpenWindowBridge.openMain?()
        }
    }

    func takePending() -> URL? {
        defer { pending = nil }
        return pending
    }
}

/// SwiftUI only exposes `openWindow` inside views; the commands capture it here for code outside them.
@MainActor
enum OpenWindowBridge {
    static var openMain: (() -> Void)?
}
