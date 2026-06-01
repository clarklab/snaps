import SwiftUI

/// One of the nine colors the player collects. Each tile carries a light- and
/// dark-mode swatch so the board reads well in either appearance, plus a flag
/// for the near-black / near-white tiles that need a hairline border to stay
/// visible against the background.
struct QuestColor: Identifiable, Hashable {
    let id: String
    let name: String
    private let lightHex: UInt32
    private let darkHex: UInt32
    let needsBorder: Bool

    func swatch(_ scheme: ColorScheme) -> Color {
        Color(hex: scheme == .dark ? darkHex : lightHex)
    }

    /// A soft, color-matched fill for empty slots and backgrounds.
    func wash(_ scheme: ColorScheme) -> Color {
        swatch(scheme).opacity(scheme == .dark ? 0.16 : 0.12)
    }

    static let all: [QuestColor] = [
        // Row 1 — warm
        QuestColor(id: "red",    name: "Red",    lightHex: 0xFF3B30, darkHex: 0xFF453A, needsBorder: false),
        QuestColor(id: "orange", name: "Orange", lightHex: 0xFF9500, darkHex: 0xFF9F0A, needsBorder: false),
        QuestColor(id: "yellow", name: "Yellow", lightHex: 0xFFCC00, darkHex: 0xFFD60A, needsBorder: false),
        // Row 2 — cool
        QuestColor(id: "green",  name: "Green",  lightHex: 0x34C759, darkHex: 0x30D158, needsBorder: false),
        QuestColor(id: "blue",   name: "Blue",   lightHex: 0x007AFF, darkHex: 0x0A84FF, needsBorder: false),
        QuestColor(id: "purple", name: "Purple", lightHex: 0xAF52DE, darkHex: 0xBF5AF2, needsBorder: false),
        // Row 3 — the wildcards
        QuestColor(id: "pink",   name: "Pink",   lightHex: 0xFF2D55, darkHex: 0xFF375F, needsBorder: false),
        QuestColor(id: "black",  name: "Black",  lightHex: 0x111114, darkHex: 0xF2F2F7, needsBorder: true),
        QuestColor(id: "white",  name: "White",  lightHex: 0xFFFFFF, darkHex: 0x1C1C1E, needsBorder: true),
    ]

    static func color(id: String) -> QuestColor? {
        all.first { $0.id == id }
    }
}

extension QuestColor {
    /// "Black" and "White" are special: the swatch tracks the player's word,
    /// not the literal pixel, so the dark-mode "Black" tile is rendered light
    /// (it still means "go shoot black things"). This keeps both tiles legible.
    var isMonochrome: Bool { id == "black" || id == "white" }
}
