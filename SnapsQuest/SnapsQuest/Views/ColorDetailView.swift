import SwiftUI
import PhotosUI

struct ColorDetailView: View {
    let color: QuestColor

    @EnvironmentObject private var store: QuestStore
    @Environment(\.colorScheme) private var scheme

    /// Slot the player is currently acting on (adding / replacing).
    @State private var activeSlot: Int?

    @State private var showSourceDialog = false
    @State private var showPhotosPicker = false
    @State private var pickerSelection: PhotosPickerItem?

    /// A single full-screen presentation, so we never stack covers.
    @State private var presentation: Presentation?

    @State private var alert: AlertState?

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 10), count: 3)

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                header
                grid
            }
            .padding(20)
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle(color.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                if store.filledCount(for: color.id) > 0 {
                    Menu {
                        Button(role: .destructive) {
                            withAnimation { store.reset(color: color.id) }
                        } label: {
                            Label("Clear this board", systemImage: "trash")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                            .font(.system(size: 17, weight: .semibold))
                    }
                }
            }
        }
        // Empty-slot action sheet
        .confirmationDialog("Add a \(color.name.lowercased()) photo",
                            isPresented: $showSourceDialog, titleVisibility: .visible) {
            Button("Choose from Library") { beginLibraryPick() }
            Button("Take Photo") { beginCamera() }
            Button("Cancel", role: .cancel) { activeSlot = nil }
        }
        // Library picker — initialized with the shared library so the result
        // carries a PHAsset identifier we can reference (no copy, full quality).
        .photosPicker(isPresented: $showPhotosPicker,
                      selection: $pickerSelection,
                      matching: .images,
                      preferredItemEncoding: .automatic,
                      photoLibrary: .shared())
        .onChange(of: pickerSelection) { _, newValue in
            handlePicked(newValue)
        }
        .fullScreenCover(item: $presentation) { item in
            switch item {
            case .camera:
                CameraPicker(
                    onCapture: { image in
                        presentation = nil
                        saveCaptured(image)
                    },
                    onCancel: {
                        presentation = nil
                        activeSlot = nil
                    }
                )
                .ignoresSafeArea()

            case .viewer(let slot):
                if let ref = store.ref(color: color.id, slot: slot) {
                    PhotoViewerView(
                        identifier: ref.assetIdentifier,
                        accent: color.swatch(scheme),
                        onReplace: {
                            presentation = nil
                            activeSlot = slot
                            // Let the cover finish dismissing before re-presenting.
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                                showSourceDialog = true
                            }
                        },
                        onRemove: {
                            withAnimation { store.removePhoto(color: color.id, slot: slot) }
                            presentation = nil
                        }
                    )
                } else {
                    Color.black.ignoresSafeArea()
                }
            }
        }
        .alert(item: $alert) { state in
            Alert(title: Text(state.title),
                  message: Text(state.message),
                  dismissButton: .default(Text("OK")))
        }
    }

    // MARK: Header

    private var header: some View {
        let filled = store.filledCount(for: color.id)
        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text(filled == slotsPerBoard ? "Board complete" : "Keep collecting")
                    .font(.gs(13, .medium))
                    .foregroundStyle(.secondary)
                Spacer()
                Text("\(filled) of \(slotsPerBoard)")
                    .font(.gs(15, .semibold))
                    .monospacedDigit()
                    .contentTransition(.numericText())
            }
            SlimProgressBar(value: filled, total: slotsPerBoard, tint: color.swatch(scheme))
        }
        .padding(16)
        .background(Color(.secondarySystemGroupedBackground),
                    in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    // MARK: Grid

    private var grid: some View {
        LazyVGrid(columns: columns, spacing: 10) {
            ForEach(0..<slotsPerBoard, id: \.self) { index in
                slotView(index)
            }
        }
    }

    @ViewBuilder
    private func slotView(_ index: Int) -> some View {
        let ref = store.ref(color: color.id, slot: index)
        let shape = RoundedRectangle(cornerRadius: 16, style: .continuous)

        Button {
            if ref == nil {
                activeSlot = index
                showSourceDialog = true
            } else {
                presentation = .viewer(index)
            }
        } label: {
            ZStack {
                if let ref {
                    AssetThumbnail(identifier: ref.assetIdentifier)
                } else {
                    color.wash(scheme)
                    Image(systemName: "plus")
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundStyle(color.swatch(scheme))
                        .opacity(0.7)
                }
            }
            .aspectRatio(1, contentMode: .fill)
            .clipShape(shape)
            .overlay(shape.strokeBorder(Color.primary.opacity(0.06), lineWidth: 1))
        }
        .buttonStyle(TileButtonStyle())
        .contextMenu {
            if ref != nil {
                Button { presentation = .viewer(index) } label: {
                    Label("View", systemImage: "arrow.up.left.and.arrow.down.right")
                }
                Button {
                    activeSlot = index
                    showSourceDialog = true
                } label: {
                    Label("Replace", systemImage: "arrow.triangle.2.circlepath")
                }
                Button(role: .destructive) {
                    withAnimation { store.removePhoto(color: color.id, slot: index) }
                } label: {
                    Label("Remove", systemImage: "trash")
                }
            }
        }
    }

    // MARK: Actions

    private func beginLibraryPick() {
        Task { @MainActor in
            let ok = await PhotoLibraryService.shared.ensureAuthorization()
            if ok {
                showPhotosPicker = true
            } else {
                alert = .permission
                activeSlot = nil
            }
        }
    }

    private func beginCamera() {
        guard UIImagePickerController.isSourceTypeAvailable(.camera) else {
            alert = AlertState(title: "No Camera",
                               message: "This device doesn't have a camera available.")
            activeSlot = nil
            return
        }
        presentation = .camera
    }

    private func handlePicked(_ item: PhotosPickerItem?) {
        guard let item, let slot = activeSlot else { return }
        pickerSelection = nil
        if let id = item.itemIdentifier {
            withAnimation { store.setPhoto(PhotoRef(assetIdentifier: id), color: color.id, slot: slot) }
            activeSlot = nil
        } else {
            // No identifier means we lack full library access; can't reference it.
            alert = .permission
            activeSlot = nil
        }
    }

    private func saveCaptured(_ image: UIImage) {
        guard let slot = activeSlot else { return }
        Task { @MainActor in
            do {
                let id = try await PhotoLibraryService.shared.saveCapturedPhoto(image, data: nil)
                withAnimation { store.setPhoto(PhotoRef(assetIdentifier: id), color: color.id, slot: slot) }
                activeSlot = nil
            } catch {
                alert = AlertState(title: "Couldn't Save", message: error.localizedDescription)
                activeSlot = nil
            }
        }
    }
}

// MARK: - Presentation & alerts

private enum Presentation: Identifiable {
    case camera
    case viewer(Int)

    var id: String {
        switch self {
        case .camera:          return "camera"
        case .viewer(let i):   return "viewer-\(i)"
        }
    }
}

private struct AlertState: Identifiable {
    let id = UUID()
    let title: String
    let message: String

    static let permission = AlertState(
        title: "Photo Access Needed",
        message: "Snaps Quest needs access to your photo library so it can reference your photos at full quality. Enable access in Settings › Privacy › Photos."
    )
}
