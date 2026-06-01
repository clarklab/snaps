import SwiftUI
import UIKit
import Photos

/// Asynchronously resolves and displays a library photo by its identifier.
/// Re-requests when the size settles (so the grid stays crisp) and fades the
/// first frame in. Used by both the grid cells and the full-screen viewer.
struct AssetThumbnail: View {
    let identifier: String
    var contentMode: SwiftUI.ContentMode = .fill

    @State private var image: UIImage?
    @State private var requestedSize: CGSize = .zero

    var body: some View {
        GeometryReader { geo in
            ZStack {
                if let image {
                    Image(uiImage: image)
                        .resizable()
                        .aspectRatio(contentMode: contentMode)
                        .frame(width: geo.size.width, height: geo.size.height)
                        .clipped()
                        .transition(.opacity)
                } else {
                    Rectangle()
                        .fill(.quaternary)
                        .overlay(ProgressView().controlSize(.small))
                }
            }
            .onAppear { load(geo.size) }
            .onChange(of: geo.size) { _, newSize in load(newSize) }
        }
    }

    private func load(_ size: CGSize) {
        guard size.width > 1, size.height > 1 else { return }
        // Avoid redundant requests when the size hasn't meaningfully changed.
        if image != nil, abs(size.width - requestedSize.width) < 1 { return }
        requestedSize = size
        let mode: PHImageContentMode = contentMode == .fill ? .aspectFill : .aspectFit
        PhotoLibraryService.shared.image(for: identifier,
                                         targetSize: size,
                                         contentMode: mode) { result in
            guard let result else { return }
            withAnimation(.easeOut(duration: 0.2)) { self.image = result }
        }
    }
}
