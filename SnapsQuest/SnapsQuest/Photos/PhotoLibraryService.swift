import Photos
import UIKit

/// Bridges to the Photos framework. Everything is local: we never enable
/// network access on image requests, so iCloud-only originals simply aren't
/// fetched rather than silently downloaded.
@MainActor
final class PhotoLibraryService {
    static let shared = PhotoLibraryService()
    private let imageManager = PHCachingImageManager()

    private init() {}

    // MARK: Authorization

    /// Requests read/write access. Returns `true` for `.authorized` or
    /// `.limited` (limited still lets us reference the chosen photos).
    func ensureAuthorization() async -> Bool {
        let current = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        switch current {
        case .authorized, .limited:
            return true
        case .notDetermined:
            let status = await PHPhotoLibrary.requestAuthorization(for: .readWrite)
            return status == .authorized || status == .limited
        default:
            return false
        }
    }

    var isAuthorized: Bool {
        let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        return status == .authorized || status == .limited
    }

    // MARK: Fetching

    private func asset(for identifier: String) -> PHAsset? {
        PHAsset.fetchAssets(withLocalIdentifiers: [identifier], options: nil).firstObject
    }

    /// Loads an image sized for display. `targetSize` in points; pass a large
    /// size for the full-screen viewer. The completion may fire more than once
    /// (a fast low-res pass, then the sharp one) — that's expected and smooth.
    func image(for identifier: String,
               targetSize: CGSize,
               contentMode: PHImageContentMode = .aspectFill,
               completion: @escaping (UIImage?) -> Void) {
        guard let asset = asset(for: identifier) else {
            completion(nil)
            return
        }
        let options = PHImageRequestOptions()
        options.deliveryMode = .opportunistic
        options.resizeMode = .fast
        options.isNetworkAccessAllowed = false   // strictly local
        options.isSynchronous = false

        let scale = UIScreen.main.scale
        let pixelSize = CGSize(width: targetSize.width * scale,
                               height: targetSize.height * scale)

        imageManager.requestImage(for: asset,
                                  targetSize: pixelSize,
                                  contentMode: contentMode,
                                  options: options) { image, _ in
            // PHImageManager may call back off the main thread; UI consumers
            // need this on main.
            if Thread.isMainThread {
                completion(image)
            } else {
                DispatchQueue.main.async { completion(image) }
            }
        }
    }

    /// Warms the cache for a set of identifiers about to scroll on screen.
    func startCaching(_ identifiers: [String], targetSize: CGSize) {
        let assets = PHAsset.fetchAssets(withLocalIdentifiers: identifiers, options: nil)
        var list: [PHAsset] = []
        assets.enumerateObjects { a, _, _ in list.append(a) }
        let scale = UIScreen.main.scale
        let pixelSize = CGSize(width: targetSize.width * scale, height: targetSize.height * scale)
        imageManager.startCachingImages(for: list, targetSize: pixelSize,
                                        contentMode: .aspectFill, options: nil)
    }

    // MARK: Saving captured photos

    /// Saves a freshly captured photo to the user's library at full quality and
    /// returns its new local identifier, which we then reference like any other
    /// library photo. We persist the original JPEG/HEIC data when we have it to
    /// avoid a re-encode round-trip.
    func saveCapturedPhoto(_ image: UIImage, data: Data?) async throws -> String {
        var placeholderID: String?
        try await PHPhotoLibrary.shared().performChanges {
            let request: PHAssetCreationRequest = .forCreatingAsset()
            if let data {
                request.addResource(with: .photo, data: data, options: nil)
            } else if let jpeg = image.jpegData(compressionQuality: 1.0) {
                request.addResource(with: .photo, data: jpeg, options: nil)
            }
            placeholderID = request.placeholderForCreatedAsset?.localIdentifier
        }
        guard let id = placeholderID else {
            throw NSError(domain: "SnapsQuest", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "Couldn't save the photo."])
        }
        return id
    }
}
