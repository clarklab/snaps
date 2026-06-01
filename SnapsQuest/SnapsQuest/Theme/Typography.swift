import SwiftUI
import UIKit

/// Google Sans Flex typography.
///
/// The four weights ship inside `Resources/Fonts` and are registered via the
/// `UIAppFonts` key in `Info.plist`. We reference them by PostScript name and
/// fall back to the system font automatically if a face is ever missing, so the
/// UI never renders blank.
enum GS {
    enum Weight {
        case regular, medium, semibold, bold

        var postScriptName: String {
            switch self {
            case .regular:  return "GoogleSansFlex-Regular"
            case .medium:   return "GoogleSansFlex-Medium"
            case .semibold: return "GoogleSansFlex-SemiBold"
            case .bold:     return "GoogleSansFlex-Bold"
            }
        }

        var system: Font.Weight {
            switch self {
            case .regular:  return .regular
            case .medium:   return .medium
            case .semibold: return .semibold
            case .bold:     return .bold
            }
        }
    }

    /// True when the bundled faces actually registered. Evaluated once.
    static let isAvailable: Bool = UIFont(name: Weight.regular.postScriptName, size: 12) != nil

    /// A Google Sans Flex font that scales with Dynamic Type (relative to `style`).
    static func font(_ size: CGFloat, _ weight: Weight = .regular,
                     relativeTo style: Font.TextStyle = .body) -> Font {
        guard isAvailable else { return .system(size: size, weight: weight.system) }
        return .custom(weight.postScriptName, size: size, relativeTo: style)
    }
}

extension Font {
    /// Shorthand: `Font.gs(17, .semibold)`.
    static func gs(_ size: CGFloat, _ weight: GS.Weight = .regular,
                   relativeTo style: Font.TextStyle = .body) -> Font {
        GS.font(size, weight, relativeTo: style)
    }
}
