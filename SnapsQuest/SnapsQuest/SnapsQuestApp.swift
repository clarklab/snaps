import SwiftUI

@main
struct SnapsQuestApp: App {
    @StateObject private var store = QuestStore()
    @StateObject private var theme = ThemeManager()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .environmentObject(theme)
                .preferredColorScheme(theme.mode.colorScheme)
                .tint(.accentColor)
        }
    }
}
