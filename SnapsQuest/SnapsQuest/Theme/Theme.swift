import SwiftUI

/// User-selectable appearance. Defaults to following the system, with an
/// in-app override that persists across launches.
enum AppearanceMode: String, CaseIterable, Identifiable {
    case system, light, dark

    var id: String { rawValue }

    var label: String {
        switch self {
        case .system: return "System"
        case .light:  return "Light"
        case .dark:   return "Dark"
        }
    }

    var symbol: String {
        switch self {
        case .system: return "circle.lefthalf.filled"
        case .light:  return "sun.max"
        case .dark:   return "moon"
        }
    }

    /// `nil` means "follow the system", which is what SwiftUI expects.
    var colorScheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .light:  return .light
        case .dark:   return .dark
        }
    }
}

@MainActor
final class ThemeManager: ObservableObject {
    private static let key = "appearanceMode"

    @Published var mode: AppearanceMode

    init() {
        let raw = UserDefaults.standard.string(forKey: Self.key)
        mode = AppearanceMode(rawValue: raw ?? "") ?? .system
    }

    func set(_ newMode: AppearanceMode) {
        mode = newMode
        UserDefaults.standard.set(newMode.rawValue, forKey: Self.key)
    }
}

extension Color {
    /// sRGB hex initializer, e.g. `Color(hex: 0xFF3B30)`.
    init(hex: UInt32, alpha: Double = 1) {
        self.init(
            .sRGB,
            red:   Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue:  Double(hex & 0xFF) / 255,
            opacity: alpha
        )
    }
}
