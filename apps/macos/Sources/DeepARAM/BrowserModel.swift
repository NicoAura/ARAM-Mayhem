import AppKit
import DeepARAMKit
import WebKit

/// One window's web view and the state its toolbar and menus show.
@MainActor
final class BrowserModel: NSObject, ObservableObject {
    @Published private(set) var title = "DeepARAM"
    @Published private(set) var url: URL?
    @Published private(set) var canGoBack = false
    @Published private(set) var canGoForward = false
    @Published private(set) var isLoading = false
    /// True while showing saved pages because the site can't be reached.
    @Published private(set) var isOffline = false

    let webView: WKWebView
    private var observers: [NSKeyValueObservation] = []
    /// Loads served from the saved copy (or the offline page), so `isOffline` follows what's on screen.
    private var offlineNavigations: [WKNavigation] = []
    /// The page that couldn't load, so Reload retries it rather than the offline page.
    private var offlineURL: URL?
    private static let lastURLKey = "deeparam.lastURL"

    override init() {
        webView = WKWebView(frame: .zero, configuration: Self.configuration())
        super.init()
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.allowsMagnification = true
        webView.pageZoom = AppSettings.pageZoom
        webView.setValue(false, forKey: "drawsBackground")
        observe()
    }

    static func configuration() -> WKWebViewConfiguration {
        let config = WKWebViewConfiguration()
        // The default store keeps the HTTP cache and cookies (sign-in, settings) between launches,
        // and is shared with the offline saver so its pages are there when the network isn't.
        config.websiteDataStore = .default()
        config.applicationNameForUserAgent = Site.userAgentSuffix(platform: "macOS", version: AppInfo.version)
        config.preferences.isElementFullscreenEnabled = true
        return config
    }

    private func observe() {
        observers = [
            webView.observe(\.title) { [weak self] wv, _ in
                Task { @MainActor in self?.title = Self.cleanTitle(wv.title) }
            },
            webView.observe(\.url) { [weak self] wv, _ in
                Task { @MainActor in
                    self?.url = wv.url
                    if let u = wv.url, Site.isInternal(u), u.scheme != "about" {
                        UserDefaults.standard.set(u.absoluteString, forKey: Self.lastURLKey)
                    }
                }
            },
            webView.observe(\.canGoBack) { [weak self] wv, _ in
                Task { @MainActor in self?.canGoBack = wv.canGoBack }
            },
            webView.observe(\.canGoForward) { [weak self] wv, _ in
                Task { @MainActor in self?.canGoForward = wv.canGoForward }
            },
            webView.observe(\.isLoading) { [weak self] wv, _ in
                Task { @MainActor in self?.isLoading = wv.isLoading }
            },
        ]
    }

    /// "Tier List · DeepARAM" -> "Tier List"; the window already says it's DeepARAM.
    static func cleanTitle(_ raw: String?) -> String {
        guard let raw, !raw.isEmpty else { return "DeepARAM" }
        for sep in [" · DeepARAM", " | DeepARAM", " - DeepARAM", " — DeepARAM"] where raw.hasSuffix(sep) {
            return String(raw.dropLast(sep.count))
        }
        return raw
    }

    // MARK: Navigation

    func loadInitial(_ url: URL? = nil) {
        if let url { return load(url) }
        let saved = UserDefaults.standard.string(forKey: Self.lastURLKey).flatMap(URL.init(string:))
        load(AppSettings.reopenLastPage ? (saved ?? Site.base) : Site.base)
    }

    func load(_ url: URL, fromCache: Bool = false) {
        var request = URLRequest(url: url)
        if fromCache { request.cachePolicy = .returnCacheDataDontLoad }
        let nav = webView.load(request)
        if fromCache, let nav { offlineNavigations.append(nav) }
    }

    private func showOfflinePage(for url: URL) {
        if let nav = webView.loadHTMLString(OfflinePage.html(for: url), baseURL: nil) {
            offlineNavigations.append(nav)
        }
    }

    func go(_ section: Site.Section) { load(section.url) }
    func goBack() { webView.goBack() }
    func goForward() { webView.goForward() }
    func reload() {
        if isOffline { load(offlineURL ?? url ?? Site.base) } else { webView.reload() }
    }
    func stop() { webView.stopLoading() }

    func openSearch() {
        // The site's own search palette opens on ⌘K; the menu item claims that shortcut, so pass it on.
        webView.evaluateJavaScript(
            "window.dispatchEvent(new KeyboardEvent('keydown',{key:'k',metaKey:true,bubbles:true}))"
        )
    }

    func openInBrowser() {
        if let url { NSWorkspace.shared.open(url) }
    }

    func copyLink() {
        guard let url else { return }
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(url.absoluteString, forType: .string)
    }

    // MARK: Zoom

    func zoom(by step: CGFloat) { setZoom(webView.pageZoom + step) }
    func resetZoom() { setZoom(1) }
    private func setZoom(_ z: CGFloat) {
        let clamped = min(max(z, 0.5), 3)
        webView.pageZoom = clamped
        AppSettings.pageZoom = clamped
    }
}

extension BrowserModel: WKNavigationDelegate {
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard let url = action.request.url else { return .allow }
        if action.targetFrame?.isMainFrame != false, !Site.isInternal(url) {
            NSWorkspace.shared.open(url)
            return .cancel
        }
        return .allow
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        isOffline = offlineNavigations.contains { $0 === navigation }
        offlineNavigations.removeAll { $0 !== navigation }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        handle(error, navigation: navigation)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        handle(error, navigation: navigation)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.reload()
    }

    private func handle(_ error: Error, navigation: WKNavigation?) {
        let failedFromCache = offlineNavigations.contains { $0 === navigation }
        let ns = error as NSError
        guard ns.domain == NSURLErrorDomain else { return }
        let failed = (ns.userInfo[NSURLErrorFailingURLErrorKey] as? URL) ?? url ?? Site.base
        offlineURL = failed
        switch ns.code {
        case NSURLErrorCancelled:
            return
        case NSURLErrorNotConnectedToInternet, NSURLErrorNetworkConnectionLost, NSURLErrorTimedOut,
             NSURLErrorCannotFindHost, NSURLErrorCannotConnectToHost, NSURLErrorDNSLookupFailed:
            if failedFromCache {
                // Not saved either: show the offline page.
                showOfflinePage(for: failed)
            } else {
                load(failed, fromCache: true)
            }
        case NSURLErrorResourceUnavailable where failedFromCache:
            showOfflinePage(for: failed)
        default:
            return
        }
    }
}

extension BrowserModel: WKUIDelegate {
    /// Links with target="_blank": site pages open in this window, anything else in the browser.
    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for action: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if let url = action.request.url {
            if Site.isInternal(url) { webView.load(action.request) } else { NSWorkspace.shared.open(url) }
        }
        return nil
    }

    func webView(
        _ webView: WKWebView,
        runOpenPanelWith parameters: WKOpenPanelParameters,
        initiatedByFrame frame: WKFrameInfo
    ) async -> [URL]? {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseDirectories = parameters.allowsDirectories
        return await panel.begin() == .OK ? panel.urls : nil
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo) async {
        let alert = NSAlert()
        alert.messageText = message
        alert.runModal()
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo) async -> Bool {
        let alert = NSAlert()
        alert.messageText = message
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Cancel")
        return alert.runModal() == .alertFirstButtonReturn
    }
}

enum AppInfo {
    static var version: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "dev"
    }
}
