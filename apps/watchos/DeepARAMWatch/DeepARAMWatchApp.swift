import SwiftUI

@main
struct DeepARAMWatchApp: App {
    @State private var store = WatchStore()

    var body: some Scene {
        WindowGroup {
            HomeView()
                .environment(store)
                .tint(Theme.accent)
        }
    }
}

/// The site's dark theme colours.
enum Theme {
    static let accent = Color(red: 0x5c / 255, green: 0xc0 / 255, blue: 0xff / 255)

    static func rarity(_ name: String) -> Color {
        switch name.lowercased() {
        case "prismatic": return Color(red: 0.84, green: 0.55, blue: 1.0)
        case "gold": return Color(red: 1.0, green: 0.78, blue: 0.3)
        default: return Color(white: 0.75)
        }
    }

    static func tier(_ tier: String) -> Color {
        switch tier.uppercased().prefix(1) {
        case "S": return Color(red: 1.0, green: 0.45, blue: 0.45)
        case "A": return Color(red: 1.0, green: 0.7, blue: 0.35)
        case "B": return Color(red: 1.0, green: 0.88, blue: 0.4)
        case "C": return Color(red: 0.55, green: 0.85, blue: 0.5)
        default: return Color(white: 0.7)
        }
    }
}
