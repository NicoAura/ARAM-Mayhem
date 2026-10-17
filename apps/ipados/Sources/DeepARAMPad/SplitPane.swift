import SwiftUI

/// Two panes side by side with a divider you can drag with a finger, trackpad or Apple Pencil.
/// The divider's grab area is wider than it looks, and double-tapping it resets the split.
struct SplitPane<Primary: View, Secondary: View>: View {
    @Binding var fraction: CGFloat
    var showSecondary: Bool
    @ViewBuilder var primary: Primary
    @ViewBuilder var secondary: Secondary

    @GestureState private var dragStart: CGFloat?
    private let minFraction: CGFloat = 0.3
    private let maxFraction: CGFloat = 0.75

    var body: some View {
        GeometryReader { geo in
            HStack(spacing: 0) {
                primary
                    .frame(width: showSecondary ? geo.size.width * fraction : geo.size.width)
                if showSecondary {
                    divider(width: geo.size.width)
                    secondary
                        .frame(maxWidth: .infinity)
                        .transition(.move(edge: .trailing))
                }
            }
        }
    }

    private func divider(width: CGFloat) -> some View {
        Rectangle()
            .fill(.separator)
            .frame(width: 1)
            .overlay {
                Capsule()
                    .fill(.secondary.opacity(0.5))
                    .frame(width: 5, height: 44)
            }
            .frame(width: 24)
            .contentShape(Rectangle())
            .hoverEffect(.highlight)
            .gesture(
                DragGesture(minimumDistance: 1, coordinateSpace: .global)
                    .updating($dragStart) { _, start, _ in if start == nil { start = fraction } }
                    .onChanged { value in
                        let base = dragStart ?? fraction
                        fraction = min(maxFraction, max(minFraction, base + value.translation.width / width))
                    }
            )
            .onTapGesture(count: 2) { withAnimation(.snappy) { fraction = 0.58 } }
            .accessibilityElement()
            .accessibilityLabel("Resize panes")
            .accessibilityValue("\(Int(fraction * 100)) percent")
            .accessibilityAdjustableAction { direction in
                switch direction {
                case .increment: fraction = min(maxFraction, fraction + 0.05)
                case .decrement: fraction = max(minFraction, fraction - 0.05)
                @unknown default: break
                }
            }
    }
}
