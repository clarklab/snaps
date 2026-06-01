import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var theme: ThemeManager
    @EnvironmentObject private var store: QuestStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Appearance", selection: appearanceBinding) {
                        ForEach(AppearanceMode.allCases) { mode in
                            Label(mode.label, systemImage: mode.symbol).tag(mode)
                        }
                    }
                    .pickerStyle(.segmented)
                    .labelStyle(.titleOnly)
                } header: {
                    Text("Appearance")
                } footer: {
                    Text("Choose how Snaps Quest looks, or follow your system setting.")
                }

                Section {
                    LabeledContent("Photos placed",
                                   value: "\(store.totalFilled) of \(store.totalSlots)")
                    LabeledContent("Colors complete",
                                   value: "\(store.completedColors) of \(QuestColor.all.count)")
                } header: {
                    Text("Progress")
                }

                Section {
                    LabeledContent("Storage", value: "On this device")
                    LabeledContent("Photo quality", value: "Original, by reference")
                } header: {
                    Text("Your Photos")
                } footer: {
                    Text("Snaps Quest only stores a reference to each photo in your library — the originals are never copied or compressed.")
                }

                Section {
                    LabeledContent("snaps.quest", value: "v1.0")
                } header: {
                    Text("About")
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private var appearanceBinding: Binding<AppearanceMode> {
        Binding(get: { theme.mode }, set: { theme.set($0) })
    }
}
