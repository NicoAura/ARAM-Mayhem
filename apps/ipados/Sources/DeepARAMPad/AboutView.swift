import DeepARAMKit
import SwiftUI

struct AboutView: View {
    @Environment(\.dismiss) private var dismiss

    private var version: String {
        let info = Bundle.main.infoDictionary
        let short = info?["CFBundleShortVersionString"] as? String ?? "1.0"
        let build = info?["CFBundleVersion"] as? String ?? "1"
        return "\(short) (\(build))"
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(alignment: .leading) {
                        Text("DeepARAM").font(.title2.bold())
                        Text("Version \(version)").foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 6)
                }
                Section("Keyboard") {
                    Text("Hold ⌘ on a hardware keyboard to see every shortcut.")
                }
                Section("Apple Pencil") {
                    Text("Double-tap or squeeze to show or hide the champion pane. Write in any search field with Scribble.")
                }
                Section {
                    Link("Privacy", destination: Site.url("/privacy"))
                    Link("Terms", destination: Site.url("/terms"))
                    Link("Contact", destination: URL(string: "mailto:admin@deeparam.com")!)
                }
                Section {
                    Text(Legal.riotNotice).font(.footnote).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("About")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { Button("Done") { dismiss() } }
        }
    }
}
