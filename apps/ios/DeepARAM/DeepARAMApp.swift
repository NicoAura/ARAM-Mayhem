import DeepARAMKit
import DeepARAMPad
import SwiftUI

@main
struct DeepARAMApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            Group {
                // iPads get the sidebar layout from apps/ipados; iPhones the tab bar.
                if UIDevice.current.userInterfaceIdiom == .pad { PadRootView() } else { RootView() }
            }
            .preferredColorScheme(.dark)
            .tint(Theme.accent)
        }
        .commands { PadCommands() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .background { PatchAlerts.shared.scheduleRefresh() }
            if phase == .active { Task { await PatchAlerts.shared.checkNow() } }
        }

        // iPad: a champion page in a window of its own (Stage Manager, or Split View beside another app).
        WindowGroup("Champion", id: PadChampionWindow.id, for: String.self) { $alias in
            PadChampionWindow(alias: alias)
                .preferredColorScheme(.dark)
                .tint(Theme.accent)
        }
    }
}

final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        PatchAlerts.shared.register()
        return true
    }
}
