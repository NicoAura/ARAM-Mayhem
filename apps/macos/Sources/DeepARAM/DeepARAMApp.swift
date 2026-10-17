import AppKit
import DeepARAMKit
import SwiftUI

@main
struct DeepARAMApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup("DeepARAM", id: "main") {
            BrowserWindow()
                .frame(minWidth: 720, minHeight: 480)
        }
        .defaultSize(width: 1360, height: 900)
        .commands { AppCommands() }

        Settings {
            SettingsView()
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        // Running straight from `swift run` has no bundle; make it a regular app with a Dock icon anyway.
        if Bundle.main.bundleIdentifier == nil {
            NSApp.setActivationPolicy(.regular)
            NSApp.activate(ignoringOtherApps: true)
        }
        NSWindow.allowsAutomaticWindowTabbing = true
        PatchNotifier.shared.start()
        OfflineSaver.shared.saveIfDue()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        // Stay running so patch alerts keep coming; clicking the Dock icon opens a new window.
        false
    }
}
