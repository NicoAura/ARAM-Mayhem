import DeepARAMKit
import SwiftUI
import WebKit

/// What the iPad layout needs from a page beyond `SitePage`: its address and title, forward
/// history, and champion-link taps sent to the champion pane instead of navigating.
@MainActor
final class PageState: NSObject, ObservableObject {
    let page: SitePage
    @Published private(set) var url: URL?
    @Published private(set) var title = ""
    @Published private(set) var canGoForward = false
    @Published private(set) var progress: Double = 0

    /// When set, champion links call this instead of opening in the page.
    var onChampionLink: ((String) -> Void)? {
        didSet { syncFlag() }
    }

    private var observations: [NSKeyValueObservation] = []

    init(page: SitePage) {
        self.page = page
        super.init()
        let content = page.webView.configuration.userContentController
        content.addUserScript(WKUserScript(source: Self.script, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        content.add(WeakHandler(self), name: Self.handlerName)
        let wv = page.webView
        observations = [
            wv.observe(\.url) { [weak self] wv, _ in MainActor.assumeIsolated { self?.url = wv.url } },
            wv.observe(\.title) { [weak self] wv, _ in MainActor.assumeIsolated { self?.title = wv.title ?? "" } },
            wv.observe(\.canGoForward) { [weak self] wv, _ in MainActor.assumeIsolated { self?.canGoForward = wv.canGoForward } },
            wv.observe(\.estimatedProgress) { [weak self] wv, _ in MainActor.assumeIsolated { self?.progress = wv.estimatedProgress } },
            // The page script reads the flag on each tap; set it again after every load.
            wv.observe(\.isLoading) { [weak self] wv, _ in MainActor.assumeIsolated { if !wv.isLoading { self?.syncFlag() } } },
        ]
    }

    /// The page title without the site name: "Jinx" from "Jinx · DeepARAM".
    var shortTitle: String {
        title.components(separatedBy: CharacterSet(charactersIn: "·|–")).first?
            .trimmingCharacters(in: .whitespaces) ?? ""
    }

    func goForward() { page.webView.goForward() }

    func scrollToTop() {
        page.webView.evaluateJavaScript("window.scrollTo({top:0,behavior:'smooth'})")
    }

    /// Focuses the page's own search box when it has one (the Tier List's table search, for example).
    func focusPageSearch() {
        page.webView.evaluateJavaScript("(function(){var e=document.querySelector('.table-search input, input[type=search]');if(e){e.focus();return true}return false})()")
    }

    private func syncFlag() {
        page.webView.evaluateJavaScript("window.__deeparamChampionPane = \(onChampionLink != nil);")
    }

    fileprivate func receive(_ body: Any) {
        guard let msg = body as? [String: Any], msg["type"] as? String == "champion",
              let alias = msg["alias"] as? String else { return }
        onChampionLink?(alias)
    }

    static let handlerName = "deeparamPad"

    /// Site navigation is client-side, so champion-link taps are caught on the page rather than in
    /// the navigation delegate. Modified clicks (⌘-click) are left alone.
    static let script = """
    document.addEventListener("click", function(e){
      if (!window.__deeparamChampionPane || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
      if (!a) return;
      var u; try { u = new URL(a.getAttribute("href"), location.href); } catch (_) { return; }
      if (u.origin !== location.origin) return;
      var m = u.pathname.match(/^\\/champions\\/([^\\/]+)\\/?$/);
      if (!m) return;
      e.preventDefault(); e.stopPropagation();
      window.webkit.messageHandlers.\(handlerName).postMessage({type: "champion", alias: decodeURIComponent(m[1])});
    }, true);
    """
}

/// Keeps the content controller from retaining the page state.
private final class WeakHandler: NSObject, WKScriptMessageHandler {
    weak var target: PageState?
    init(_ target: PageState) { self.target = target }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        let body = message.body
        MainActor.assumeIsolated { target?.receive(body) }
    }
}

/// A page with a thin progress bar, a note when it's a saved offline copy, and a retry state.
struct PadWebPage: View {
    @ObservedObject var state: PageState
    @ObservedObject private var page: SitePage

    init(state: PageState) {
        self.state = state
        self.page = state.page
    }

    var body: some View {
        ZStack(alignment: .top) {
            SiteWebView(page: page)
                .ignoresSafeArea(.container, edges: .bottom)
            if page.isLoading && state.progress < 1 {
                ProgressView(value: state.progress).progressViewStyle(.linear)
            }
            if page.failedOffline {
                ContentUnavailableView {
                    Label("You're offline", systemImage: "wifi.slash")
                } description: {
                    Text("This page hasn't been saved for offline use yet.")
                } actions: {
                    Button("Try Again") { page.reload() }.buttonStyle(.borderedProminent)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(.background)
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if let date = page.offlineCopyDate {
                HStack {
                    Label("Saved copy from \(date.formatted(.relative(presentation: .named)))", systemImage: "wifi.slash")
                    Spacer()
                    Button("Reload") { page.reload() }
                }
                .font(.footnote)
                .padding(.horizontal, 16).padding(.vertical, 10)
                .background(.bar)
            }
        }
    }
}
