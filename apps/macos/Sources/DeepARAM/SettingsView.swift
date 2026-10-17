import DeepARAMKit
import SwiftUI

struct SettingsView: View {
    @AppStorage(AppSettings.Key.notifyLive) private var notifyLive = true
    @AppStorage(AppSettings.Key.notifyPbe) private var notifyPbe = true
    @AppStorage(AppSettings.Key.saveOffline) private var saveOffline = true
    @AppStorage(AppSettings.Key.reopenLastPage) private var reopenLastPage = true
    @State private var status = ""

    var body: some View {
        Form {
            Section("Notifications") {
                Toggle("Tell me when a new patch goes live", isOn: $notifyLive)
                Toggle("Tell me when the PBE gets a new patch", isOn: $notifyPbe)
                HStack {
                    Button("Check now") {
                        PatchNotifier.shared.check()
                        status = "Checked. You'll get a notification if there's a new patch."
                    }
                    Text(lastSeen).foregroundStyle(.secondary)
                }
            }
            Section("Offline") {
                Toggle("Save the main sections for offline use", isOn: $saveOffline)
                HStack {
                    Button("Save now") {
                        OfflineSaver.shared.save()
                        status = "Saving the main sections in the background."
                    }
                    .disabled(!saveOffline)
                    Button("Clear saved pages") {
                        Task {
                            await OfflineSaver.shared.clear()
                            status = "Saved pages cleared."
                        }
                    }
                }
            }
            Section("Windows") {
                Toggle("Reopen the last page on launch", isOn: $reopenLastPage)
            }
            if !status.isEmpty {
                Text(status).font(.callout).foregroundStyle(.secondary)
            }
            Text("DeepARAM isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .formStyle(.grouped)
        .frame(width: 480)
        .onChange(of: notifyLive) { on in if on { Task { _ = await PatchNotifier.shared.requestPermission() } } }
        .onChange(of: notifyPbe) { on in if on { Task { _ = await PatchNotifier.shared.requestPermission() } } }
    }

    private var lastSeen: String {
        guard let s = PatchWatcher().lastSeen else { return "" }
        return [s.livePatch.map { "Live \($0)" }, s.pbePatch.map { "PBE \($0)" }]
            .compactMap { $0 }
            .joined(separator: " · ")
    }
}
