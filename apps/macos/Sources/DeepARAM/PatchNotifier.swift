import AppKit
import DeepARAMKit
import UserNotifications

/// Checks for a new live or PBE patch every few hours and posts a notification that opens the right page.
@MainActor
final class PatchNotifier: NSObject, UNUserNotificationCenterDelegate {
    static let shared = PatchNotifier()

    private let watcher = PatchWatcher()
    private var timer: Timer?
    private static let interval: TimeInterval = 3 * 60 * 60

    /// Notifications need a real app bundle; `swift run` builds skip them.
    private var center: UNUserNotificationCenter? {
        Bundle.main.bundleIdentifier == nil ? nil : .current()
    }

    func start() {
        center?.delegate = self
        check()
        timer = Timer.scheduledTimer(withTimeInterval: Self.interval, repeats: true) { _ in
            Task { @MainActor in PatchNotifier.shared.check() }
        }
        // Catch up after the Mac wakes rather than waiting for the next timer tick.
        NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didWakeNotification, object: nil, queue: .main
        ) { _ in
            Task { @MainActor in PatchNotifier.shared.check() }
        }
    }

    func check() {
        guard AppSettings.notifyLive || AppSettings.notifyPbe else { return }
        Task {
            guard let changes = try? await watcher.check(), !changes.isEmpty else { return }
            let wanted = changes.filter {
                if case .newPatch = $0 { return AppSettings.notifyLive } else { return AppSettings.notifyPbe }
            }
            for change in wanted { await post(change) }
            // A new patch means new pages; refresh the saved copies too.
            OfflineSaver.shared.save()
        }
    }

    /// Asks once, the first time there's something to tell, or when a toggle is switched on.
    func requestPermission() async -> Bool {
        guard let center else { return false }
        return (try? await center.requestAuthorization(options: [.alert, .sound])) ?? false
    }

    private func post(_ news: SiteNews) async {
        guard let center, await requestPermission() else { return }
        let content = UNMutableNotificationContent()
        let id: String, url: URL
        switch news {
        case .newPatch(let p):
            content.title = "Patch \(p) is live"
            content.body = "The tier list and stats now cover the new patch."
            id = "live-\(p)"
            url = SiteTab.tiers.url
        case .newPBE(let build):
            content.title = "New PBE update"
            content.body = "See what's changing for ARAM Mayhem on the test server."
            id = "pbe-\(build)"
            url = SiteTab.pbe.url
        }
        content.sound = .default
        content.userInfo = ["url": url.absoluteString]
        try? await center.add(UNNotificationRequest(identifier: id, content: content, trigger: nil))
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        guard let s = response.notification.request.content.userInfo["url"] as? String,
              let url = URL(string: s), Site.isInternal(url) else { return }
        await MainActor.run { WindowRouter.shared.open(url) }
    }
}
