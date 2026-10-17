import DeepARAMKit
import WebKit

/// Loads each main section in a hidden web view once a day so they're in the cache for offline use.
/// It shares the windows' data store, so whatever it loads is what a window falls back to offline.
@MainActor
final class OfflineSaver: NSObject, WKNavigationDelegate {
    static let shared = OfflineSaver()

    private var webView: WKWebView?
    private var queue: [URL] = []
    private var timeout: Timer?
    private static let lastSaveKey = "deeparam.lastOfflineSave"
    private static let every: TimeInterval = 20 * 60 * 60

    func saveIfDue() {
        AppSettings.register()
        let last = UserDefaults.standard.double(forKey: Self.lastSaveKey)
        if Date().timeIntervalSince1970 - last > Self.every { save() }
    }

    func save() {
        guard AppSettings.saveOffline, queue.isEmpty else { return }
        queue = Site.sections.map(\.url)
        let wv = WKWebView(frame: CGRect(x: 0, y: 0, width: 1280, height: 800), configuration: BrowserModel.configuration())
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
        // A section that hangs shouldn't stop the rest.
        timeout = Timer.scheduledTimer(withTimeInterval: 30, repeats: false) { _ in
            Task { @MainActor in OfflineSaver.shared.next() }
        }
    }

    nonisolated func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // Give the page a moment to pull in its lazy images and data before moving on.
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            OfflineSaver.shared.next()
        }
    }

    nonisolated func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        Task { @MainActor in OfflineSaver.shared.next() }
    }

    nonisolated func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        Task { @MainActor in OfflineSaver.shared.next() }
    }

    func clear() async {
        let types: Set<String> = [WKWebsiteDataTypeDiskCache, WKWebsiteDataTypeMemoryCache]
        await WKWebsiteDataStore.default().removeData(ofTypes: types, modifiedSince: .distantPast)
        UserDefaults.standard.removeObject(forKey: Self.lastSaveKey)
    }
}
