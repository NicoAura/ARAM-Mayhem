import DeepARAMPad
import SwiftUI

@main
struct DeepARAMPadApp: App {
    var body: some Scene {
        WindowGroup {
            PadRootView()
        }
        .commands { PadCommands() }

        // A champion page in a window of its own (Stage Manager, or Split View beside another app).
        WindowGroup("Champion", id: PadChampionWindow.id, for: String.self) { $alias in
            PadChampionWindow(alias: alias)
        }
    }
}
