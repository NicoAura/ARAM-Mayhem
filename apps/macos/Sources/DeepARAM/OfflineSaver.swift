import DeepARAMKit
import WebKit

/// Once a day (and after a new patch), loads every section in a hidden web view and keeps a copy of
/// each, so a section opens offline even if it wasn't visited. Same copies the windows save as you browse.
@MainActor
final class OfflineSaver: NSObject, WKNavigationDelegate {
    static let shared = OfflineSaver()

    private let store = OfflineStore()
    private var webView: WKWebView?
    private var queue: [URL] = []
    private var timeout: Timer?
    private static let lastSaveKey = "deeparam.lastOfflineSave"
    private static let every: TimeInterval = 20 * 60 * 60

    func saveIfDue() {
        let last = UserDefaults.standard.double(forKey: Self.lastSaveKey)
        if Date().timeIntervalSince1970 - last > Self.every { save() }
    }

    func save() {
        guard AppSettings.saveOffline, queue.isEmpty else { return }
        queue = WindowModel.sections.map(\.url)
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.applicationNameForUserAgent = Site.userAgentSuffix
        config.userContentController.addUserScript(
            WKUserScript(source: AppChrome.script(platform: "macos"), injectionTime: .atDocumentStart, forMainFrameOnly: true)
        )
        let wv = WKWebView(frame: CGRect(x: 0, y: 0, width: 1280, height: 800), configuration: config)
        wv.navigationDelegate = self
        webView = wv
        next()
    }

    private func next() {
        timeout?.invalidate()
        guard let webView, !queue.isEmpty else {
            UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: Self.lastSaveKey)
            self.webView = nil
            return
        }
        webView.load(URLRequest(url: queue.removeFirst()))
        // A section that hangs shouldn't hold up the rest.
        timeout = Timer.scheduledTimer(withTimeInterval: 30, repeats: false) { _ in
            Task { @MainActor in OfflineSaver.shared.next() }
        }
    }

    nonisolated func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        Task { @MainActor in
            // Give the page a moment to fill in its data before keeping a copy.
            try? await Task.sleep(nanoseconds: 2_500_000_000)
            guard let wv = OfflineSaver.shared.webView, let url = wv.url, Site.isInternal(url) else {
                return OfflineSaver.shared.next()
            }
            if let data = try? await wv.webArchiveData(), data.count > 1024 {
                OfflineSaver.shared.store.save(data, for: url)
            }
            OfflineSaver.shared.next()
        }
    }

    nonisolated func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        Task { @MainActor in OfflineSaver.shared.next() }
    }

    nonisolated func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        Task { @MainActor in OfflineSaver.shared.next() }
    }

    func clear() {
        try? FileManager.default.removeItem(at: store.folder)
        UserDefaults.standard.removeObject(forKey: Self.lastSaveKey)
    }
}

private extension WKWebView {
    func webArchiveData() async throws -> Data {
        try await withCheckedThrowingContinuation { cont in
            createWebArchiveData { cont.resume(with: $0) }
        }
    }
}
