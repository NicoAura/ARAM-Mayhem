import Foundation
import WebKit
#if os(iOS)
import UIKit
#endif

/// Taps you can feel. The site's own taps (tab strips, favourites, the draft, share) reach the phone
/// through `navigator.vibrate`, which the app forwards here; the app adds its own for tabs, refresh and
/// the like. One switch covers both: the site's Vibration setting, mirrored in `enabled`.
@MainActor
public final class Haptics: ObservableObject {
    public static let shared = Haptics()
    public static let enabledKey = "deeparam.haptics"

    public enum Kind: String, Sendable {
        /// A button, star or toggle.
        case tap
        /// Moving between tabs or steps.
        case step
        /// Something finished: a draft completed, a refresh came back.
        case done
        /// Something didn't work, such as going offline.
        case warning
    }

    @Published public private(set) var enabled: Bool
    private var lastPlayed = Date.distantPast

    private init() {
        enabled = UserDefaults.standard.object(forKey: Self.enabledKey) as? Bool ?? true
    }

    public func play(_ kind: Kind) {
        guard enabled else { return }
        // The site may report one tap through both routes (navigator.vibrate and deeparamHaptic); feel it once.
        let now = Date()
        guard now.timeIntervalSince(lastPlayed) > 0.06 else { return }
        lastPlayed = now
        #if os(iOS)
        switch kind {
        case .tap: UIImpactFeedbackGenerator(style: .light).impactOccurred()
        case .step: UISelectionFeedbackGenerator().selectionChanged()
        case .done: UINotificationFeedbackGenerator().notificationOccurred(.success)
        case .warning: UINotificationFeedbackGenerator().notificationOccurred(.warning)
        }
        #endif
    }

    /// Changed from the app's own switch: saved here and written to the site's settings on `pages`
    /// (they share storage, so one loaded page is enough; each is told so open pages update).
    public func setEnabled(_ on: Bool, pages: [WKWebView]) {
        store(on)
        let js = HapticsBridge.writeSettingScript(on)
        for wv in pages where wv.url.map(Site.isInternal) == true { wv.evaluateJavaScript(js) }
        if on { play(.tap) }
    }

    /// Changed on the site (its settings menu): just follow it.
    func siteSettingChanged(_ on: Bool) { store(on) }

    private func store(_ on: Bool) {
        guard on != enabled else { return }
        enabled = on
        UserDefaults.standard.set(on, forKey: Self.enabledKey)
    }
}

/// The page side: gives the site a working `navigator.vibrate` (iPhones have none in the browser) and
/// reports its Vibration setting whenever it loads or changes.
enum HapticsBridge {
    static let name = "deeparamHaptics"

    static let script = """
    (function(){
      var h=window.webkit&&window.webkit.messageHandlers&&window.webkit.messageHandlers.\(name); if(!h)return;
      try{Object.defineProperty(Navigator.prototype,'vibrate',{configurable:true,writable:true,value:function(p){
        var a=Array.isArray(p)?p:[p]; if(!a.length||!a[0])return true;
        h.postMessage({buzz:a.length>1?'done':(a[0]>10?'step':'tap')}); return true;
      }})}catch(e){}
      function sync(){try{var s=JSON.parse(localStorage.getItem('deeparam-settings')||'{}');h.postMessage({haptics:s.haptics!==false})}catch(e){}}
      window.addEventListener('deeparam-settings',sync);
      if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync);else sync();
    })();
    """

    static func writeSettingScript(_ on: Bool) -> String {
        "(function(){try{var k='deeparam-settings',s=JSON.parse(localStorage.getItem(k)||'{}');s.haptics=\(on);localStorage.setItem(k,JSON.stringify(s));window.dispatchEvent(new Event(k))}catch(e){}})();"
    }

    /// The name the site's own app hook posts {kind: "tap" | "step" | "done"} to (web/src/lib/haptics.ts).
    static let siteName = "deeparamHaptic"

    static func install(in content: WKUserContentController) {
        content.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: false))
        content.add(handler, name: name)
        content.add(handler, name: siteName)
    }

    /// One shared, stateless handler, so no page is kept alive by it.
    private static let handler = Handler()

    private final class Handler: NSObject, WKScriptMessageHandler {
        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            guard let body = message.body as? [String: Any] else { return }
            MainActor.assumeIsolated {
                if let on = body["haptics"] as? Bool { Haptics.shared.siteSettingChanged(on) }
                if let kind = ((body["buzz"] ?? body["kind"]) as? String).flatMap(Haptics.Kind.init(rawValue:)) { Haptics.shared.play(kind) }
            }
        }
    }
}
