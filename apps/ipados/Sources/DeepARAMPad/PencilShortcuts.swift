import SwiftUI
import UIKit

extension View {
    /// Apple Pencil double-tap (2nd gen, Pro) and squeeze (Pro) toggle the champion pane, unless the
    /// person has set the Pencil's gesture to do nothing in Settings.
    @ViewBuilder
    func pencilShortcuts(model: PadModel) -> some View {
        if #available(iOS 17.5, *) {
            self
                .onPencilDoubleTap { _ in
                    if UIPencilInteraction.preferredTapAction != .ignore { model.toggleChampionPane() }
                }
                .onPencilSqueeze { phase in
                    if case .ended = phase, UIPencilInteraction.preferredSqueezeAction != .ignore { model.toggleChampionPane() }
                }
        } else {
            self
        }
    }
}
