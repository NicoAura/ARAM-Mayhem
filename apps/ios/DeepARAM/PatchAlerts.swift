import BackgroundTasks
import DeepARAMKit
import UserNotifications
import UIKit

/// New-patch and PBE alerts. iOS wakes the app now and then in the background; it checks the
/// site and posts a local notification when something new is up. Tapping it opens that page.
final class PatchAlerts: NSObject, UNUserNotificationCenterDelegate, @unchecked Sendable {
    static let shared = PatchAlerts()
    static let enabledKey = "deeparam.patchAlerts"
    static let taskID = "com.deeparam.app.refresh"
    static let openPage = Notification.Name("deeparam.openPage")

    private let watcher = PatchWatcher()
    private var enabled: Bool { UserDefaults.standard.bool(forKey: Self.enabledKey) }

    func register() {
        UNUserNotificationCenter.current().delegate = self
        BGTaskScheduler.shared.register(forTaskWithIdentifier: Self.taskID, using: nil) { task in
            self.handle(task as! BGAppRefreshTask)
        }
    }

    func requestPermission() async -> Bool {
        let ok = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        if ok { _ = try? await watcher.check() } // records today's patch so the first alert is a real new one
        return ok
    }

    func scheduleRefresh() {
        guard enabled else { return }
        let req = BGAppRefreshTaskRequest(identifier: Self.taskID)
        req.earliestBeginDate = Date(timeIntervalSinceNow: 3 * 3600)
        try? BGTaskScheduler.shared.submit(req)
    }

    /// Run when the app opens too, so the stored patch stays current.
    func checkNow() async {
        guard let news = try? await watcher.check(), enabled else { return }
        for item in news { await notify(item) }
    }

    private func handle(_ task: BGAppRefreshTask) {
        scheduleRefresh()
        let work = Task {
            await checkNow()
            task.setTaskCompleted(success: true)
        }
        task.expirationHandler = { work.cancel() }
    }

    private func notify(_ news: SiteNews) async {
        let content = UNMutableNotificationContent()
        let path: String
        switch news {
        case .newPatch(let patch):
            content.title = "Patch \(patch) is live"
            content.body = "See the new tier list and what changed for Mayhem augments."
            path = "/patches/\(patch)"
        case .newPBE(let build):
            content.title = "PBE updated"
            content.body = "New test server changes are up (build \(build))."
            path = "/pbe"
        }
        content.sound = .default
        content.userInfo = ["path": path]
        let req = UNNotificationRequest(identifier: "news-\(path)", content: content, trigger: nil)
        try? await UNUserNotificationCenter.current().add(req)
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        guard let path = response.notification.request.content.userInfo["path"] as? String else { return }
        await MainActor.run { NotificationCenter.default.post(name: Self.openPage, object: Site.url(path)) }
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }
}
