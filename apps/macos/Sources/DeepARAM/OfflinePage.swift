import Foundation

/// Shown when a page can't load and there's no saved copy of it yet.
enum OfflinePage {
    static func html(for url: URL) -> String {
        let link = url.absoluteString
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "\"", with: "&quot;")
            .replacingOccurrences(of: "<", with: "&lt;")
        return """
        <!doctype html>
        <html><head><meta charset="utf-8">
        <style>
          :root { color-scheme: light dark; --bg: #f6f7f9; --fg: #14161a; --muted: #5b6270; }
          @media (prefers-color-scheme: dark) { :root { --bg: #0b0c0f; --fg: #eceef2; --muted: #9aa1ad; } }
          html, body { height: 100%; margin: 0; }
          body { display: grid; place-items: center; background: var(--bg); color: var(--fg);
                 font: 15px/1.5 -apple-system, BlinkMacSystemFont, sans-serif; text-align: center; }
          h1 { font-size: 22px; margin: 0 0 6px; }
          p { color: var(--muted); margin: 0 0 18px; max-width: 34em; }
          a { color: inherit; font-weight: 600; }
        </style></head>
        <body><main>
          <h1>You're offline</h1>
          <p>This page hasn't been saved for offline use yet. Pages you've opened, and the main sections,
             are kept so you can read them without a connection.</p>
          <a href="\(link)">Try again</a>
        </main></body></html>
        """
    }
}
