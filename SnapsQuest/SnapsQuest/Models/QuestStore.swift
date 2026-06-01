import Foundation
import Combine

/// The total slots per color board (3 × 3).
let slotsPerBoard = 9

/// A reference to a photo. We never copy or re-encode pixels: we store the
/// Photos library local identifier (a `PHAsset.localIdentifier`) and resolve
/// the full-resolution asset on demand. This keeps the app local-only and
/// preserves the original quality exactly.
struct PhotoRef: Codable, Hashable {
    var assetIdentifier: String
    var addedAt: Date

    init(assetIdentifier: String, addedAt: Date = .now) {
        self.assetIdentifier = assetIdentifier
        self.addedAt = addedAt
    }
}

/// Persists the nine boards to a JSON file in Application Support. Only the
/// lightweight references are written to disk — never image data.
@MainActor
final class QuestStore: ObservableObject {
    /// colorID → array of `slotsPerBoard` optional references.
    @Published private(set) var boards: [String: [PhotoRef?]]

    private let fileURL: URL

    init() {
        let dir = FileManager.default
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        fileURL = dir.appendingPathComponent("snaps-quest.json")

        boards = QuestStore.load(from: fileURL)
    }

    // MARK: Reads

    func slots(for colorID: String) -> [PhotoRef?] {
        boards[colorID] ?? Array(repeating: nil, count: slotsPerBoard)
    }

    func ref(color colorID: String, slot: Int) -> PhotoRef? {
        guard slot >= 0 && slot < slotsPerBoard else { return nil }
        return slots(for: colorID)[slot]
    }

    func filledCount(for colorID: String) -> Int {
        slots(for: colorID).compactMap { $0 }.count
    }

    func isComplete(_ colorID: String) -> Bool {
        filledCount(for: colorID) == slotsPerBoard
    }

    /// Number of colors whose board is entirely full.
    var completedColors: Int {
        QuestColor.all.filter { isComplete($0.id) }.count
    }

    /// Total photos placed across every board (out of 81).
    var totalFilled: Int {
        QuestColor.all.reduce(0) { $0 + filledCount(for: $1.id) }
    }

    var totalSlots: Int { QuestColor.all.count * slotsPerBoard }

    // MARK: Writes

    func setPhoto(_ ref: PhotoRef, color colorID: String, slot: Int) {
        guard slot >= 0 && slot < slotsPerBoard else { return }
        var board = slots(for: colorID)
        board[slot] = ref
        boards[colorID] = board
        save()
    }

    func removePhoto(color colorID: String, slot: Int) {
        guard slot >= 0 && slot < slotsPerBoard else { return }
        var board = slots(for: colorID)
        board[slot] = nil
        boards[colorID] = board
        save()
    }

    /// Drops the photo from its current slot and places it in `slot`, swapping
    /// if the destination is occupied. Used for drag-to-reorder within a board.
    func move(color colorID: String, from source: Int, to destination: Int) {
        guard source != destination,
              source >= 0, source < slotsPerBoard,
              destination >= 0, destination < slotsPerBoard else { return }
        var board = slots(for: colorID)
        board.swapAt(source, destination)
        boards[colorID] = board
        save()
    }

    func reset(color colorID: String) {
        boards[colorID] = Array(repeating: nil, count: slotsPerBoard)
        save()
    }

    // MARK: Persistence

    private func save() {
        let snapshot = boards
        let url = fileURL
        Task.detached(priority: .utility) {
            guard let data = try? JSONEncoder().encode(snapshot) else { return }
            try? data.write(to: url, options: .atomic)
        }
    }

    private static func load(from url: URL) -> [String: [PhotoRef?]] {
        guard let data = try? Data(contentsOf: url),
              let decoded = try? JSONDecoder().decode([String: [PhotoRef?]].self, from: data)
        else { return [:] }

        // Normalize every board to the expected length in case the layout changes.
        var result: [String: [PhotoRef?]] = [:]
        for color in QuestColor.all {
            var board = decoded[color.id] ?? []
            if board.count < slotsPerBoard {
                board.append(contentsOf: Array(repeating: nil, count: slotsPerBoard - board.count))
            } else if board.count > slotsPerBoard {
                board = Array(board.prefix(slotsPerBoard))
            }
            result[color.id] = board
        }
        return result
    }
}
