import DeepARAMKit
import SwiftUI

/// The menu bar: a Go menu for the site's sections plus browser-style View and navigation items.
struct AppCommands: Commands {
    @FocusedObject private var model: BrowserModel?
    @Environment(\.openWindow) private var openWindow

    var body: some Commands {
        CommandGroup(after: .newItem) {
            Button("New Tab") {
                // A new window joins the current one as a tab when tabbing is on.
                NSApp.keyWindow?.tabbingMode = .preferred
                openWindow(id: "main")
            }
            .keyboardShortcut("t")

            Divider()

            Button("Open in Browser") { model?.openInBrowser() }
                .keyboardShortcut("o", modifiers: [.command, .shift])
                .disabled(model == nil)
            Button("Copy Link") { model?.copyLink() }
                .keyboardShortcut("c", modifiers: [.command, .shift])
                .disabled(model == nil)
        }

        CommandGroup(after: .textEditing) {
            Button("Search…") { model?.openSearch() }
                .keyboardShortcut("k")
                .disabled(model == nil)
        }

        CommandGroup(before: .toolbar) {
            Button("Reload Page") { model?.reload() }
                .keyboardShortcut("r")
                .disabled(model == nil)
            Divider()
            Button("Actual Size") { model?.resetZoom() }
                .keyboardShortcut("0")
                .disabled(model == nil)
            Button("Zoom In") { model?.zoom(by: 0.1) }
                .keyboardShortcut("+")
                .disabled(model == nil)
            Button("Zoom Out") { model?.zoom(by: -0.1) }
                .keyboardShortcut("-")
                .disabled(model == nil)
            Divider()
        }

        CommandMenu("Go") {
            Button("Back") { model?.goBack() }
                .keyboardShortcut("[")
                .disabled(model?.canGoBack != true)
            Button("Forward") { model?.goForward() }
                .keyboardShortcut("]")
                .disabled(model?.canGoForward != true)
            Divider()
            ForEach(Array(Site.sections.enumerated()), id: \.element.id) { i, section in
                Button(section.title) { model?.go(section) }
                    .keyboardShortcut(KeyEquivalent(Character(String(i + 1))))
                    .disabled(model == nil)
            }
        }

        CommandGroup(replacing: .help) {
            Button("DeepARAM Website") { NSWorkspace.shared.open(Site.base) }
            Button("Report a Bug or Request a Feature") {
                if let url = URL(string: "mailto:admin@deeparam.com?subject=DeepARAM%20for%20Mac") {
                    NSWorkspace.shared.open(url)
                }
            }
        }
    }
}
