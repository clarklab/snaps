import SwiftUI

/// Full-screen viewer for a placed photo. Loads the asset at a large size for a
/// crisp full-resolution look, supports pinch-to-zoom, and offers replace /
/// remove. Presented over a black backdrop like the system photo viewer.
struct PhotoViewerView: View {
    let identifier: String
    var accent: Color
    var onReplace: () -> Void
    var onRemove: () -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var scale: CGFloat = 1
    @State private var lastScale: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var lastOffset: CGSize = .zero

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            AssetThumbnail(identifier: identifier, contentMode: .fit)
                .scaleEffect(scale)
                .offset(offset)
                .simultaneousGesture(magnification)
                .simultaneousGesture(drag)
                .onTapGesture(count: 2) { toggleZoom() }
                .ignoresSafeArea()

            VStack {
                HStack {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundStyle(.white)
                            .padding(11)
                            .background(.ultraThinMaterial, in: Circle())
                    }
                    Spacer()
                    Menu {
                        Button { onReplace() } label: {
                            Label("Replace", systemImage: "arrow.triangle.2.circlepath")
                        }
                        Button(role: .destructive) { onRemove() } label: {
                            Label("Remove", systemImage: "trash")
                        }
                    } label: {
                        Image(systemName: "ellipsis")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundStyle(.white)
                            .padding(11)
                            .background(.ultraThinMaterial, in: Circle())
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                Spacer()
            }
        }
        .statusBarHidden()
    }

    private var magnification: some Gesture {
        MagnificationGesture()
            .onChanged { value in
                scale = min(max(lastScale * value, 1), 5)
            }
            .onEnded { _ in
                lastScale = scale
                if scale <= 1 { resetZoom() }
            }
    }

    private var drag: some Gesture {
        DragGesture()
            .onChanged { value in
                // Only pan when zoomed in; otherwise leave the image centered.
                guard scale > 1 else { return }
                offset = CGSize(width: lastOffset.width + value.translation.width,
                                height: lastOffset.height + value.translation.height)
            }
            .onEnded { _ in
                guard scale > 1 else { return }
                lastOffset = offset
            }
    }

    private func toggleZoom() {
        withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
            if scale > 1 { resetZoom() } else { scale = 2.5; lastScale = 2.5 }
        }
    }

    private func resetZoom() {
        scale = 1; lastScale = 1
        offset = .zero; lastOffset = .zero
    }
}
