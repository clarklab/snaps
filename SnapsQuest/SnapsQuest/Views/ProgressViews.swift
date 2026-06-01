import SwiftUI

/// A slim, capsule progress bar. Used at the top of a color board ("3 of 9").
struct SlimProgressBar: View {
    var value: Int
    var total: Int
    var tint: Color

    private var fraction: Double {
        total == 0 ? 0 : Double(value) / Double(total)
    }

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(.quaternary)
                Capsule()
                    .fill(tint)
                    .frame(width: max(0, geo.size.width * fraction))
                    .animation(.spring(response: 0.45, dampingFraction: 0.85), value: fraction)
            }
        }
        .frame(height: 6)
    }
}

/// A compact ring used on each color tile to show how full that board is.
struct ProgressRing: View {
    var value: Int
    var total: Int
    var tint: Color
    var lineWidth: CGFloat = 3

    private var fraction: Double {
        total == 0 ? 0 : Double(value) / Double(total)
    }

    var body: some View {
        ZStack {
            Circle()
                .stroke(.white.opacity(0.35), lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: fraction)
                .stroke(tint, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(.spring(response: 0.5, dampingFraction: 0.85), value: fraction)
        }
    }
}
