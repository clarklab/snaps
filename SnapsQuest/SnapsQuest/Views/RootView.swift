import SwiftUI

struct RootView: View {
    @EnvironmentObject private var theme: ThemeManager

    @Namespace private var zoom
    @State private var path: [String] = []
    @State private var showSettings = false

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                VStack(spacing: 22) {
                    OverallProgress()
                        .padding(.horizontal, 20)
                        .padding(.top, 4)

                    ColorBoardGrid(namespace: zoom)
                        .padding(.horizontal, 16)
                }
                .padding(.bottom, 28)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Snaps Quest")
            .navigationDestination(for: String.self) { colorID in
                if let color = QuestColor.color(id: colorID) {
                    ColorDetailView(color: color)
                        .navigationTransition(.zoom(sourceID: colorID, in: zoom))
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showSettings = true
                    } label: {
                        Image(systemName: theme.mode.symbol)
                            .font(.system(size: 17, weight: .semibold))
                    }
                    .accessibilityLabel("Appearance and settings")
                }
            }
            .sheet(isPresented: $showSettings) {
                SettingsView()
                    .presentationDetents([.medium, .large])
                    .presentationDragIndicator(.visible)
            }
        }
    }
}

/// A tappable summary that toggles between "colors complete" and "photos
/// placed". Small, quiet, and lives at the top of the board.
private struct OverallProgress: View {
    @EnvironmentObject private var store: QuestStore
    @AppStorage("overallProgressMode") private var showingPhotos = false

    var body: some View {
        let colors = store.completedColors
        let totalColors = QuestColor.all.count
        let photos = store.totalFilled
        let totalPhotos = store.totalSlots

        let value = showingPhotos ? photos : colors
        let total = showingPhotos ? totalPhotos : totalColors

        Button {
            withAnimation(.snappy) { showingPhotos.toggle() }
        } label: {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .firstTextBaseline) {
                    Text(showingPhotos ? "Photos placed" : "Colors complete")
                        .font(.gs(13, .medium))
                        .foregroundStyle(.secondary)
                    Spacer()
                    Text("\(value) of \(total)")
                        .font(.gs(15, .semibold))
                        .foregroundStyle(.primary)
                        .contentTransition(.numericText())
                        .monospacedDigit()
                }
                SlimProgressBar(value: value, total: total, tint: .accentColor)
            }
            .padding(16)
            .background(Color(.secondarySystemGroupedBackground),
                        in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityHint("Double tap to switch between colors and photos.")
    }
}

/// The 3 × 3 grid of color tiles, arranged like a rainbow with the wildcards on
/// the bottom row. Each tile zooms into its board on tap.
private struct ColorBoardGrid: View {
    var namespace: Namespace.ID
    @EnvironmentObject private var store: QuestStore

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 12), count: 3)

    var body: some View {
        LazyVGrid(columns: columns, spacing: 12) {
            ForEach(QuestColor.all) { color in
                NavigationLink(value: color.id) {
                    ColorTile(color: color,
                              filled: store.filledCount(for: color.id))
                }
                .buttonStyle(TileButtonStyle())
                .matchedTransitionSource(id: color.id, in: namespace)
            }
        }
    }
}

/// A single color square on the home board: the swatch, the color's name, and a
/// progress ring showing how many of its nine slots are filled.
struct ColorTile: View {
    let color: QuestColor
    let filled: Int
    @Environment(\.colorScheme) private var scheme

    private var isComplete: Bool { filled == slotsPerBoard }

    var body: some View {
        let swatch = color.swatch(scheme)
        // Text/ring need to contrast against the swatch; monochrome tiles flip.
        let onColor: Color = readableForeground(on: swatch)

        ZStack {
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(swatch)
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .strokeBorder(Color.primary.opacity(color.needsBorder ? 0.12 : 0), lineWidth: 1)

            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Spacer()
                    if isComplete {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 18, weight: .bold))
                            .foregroundStyle(onColor)
                            .transition(.scale.combined(with: .opacity))
                    } else {
                        ProgressRing(value: filled, total: slotsPerBoard, tint: onColor)
                            .frame(width: 18, height: 18)
                    }
                }
                Spacer()
                Text(color.name)
                    .font(.gs(18, .semibold))
                    .foregroundStyle(onColor)
                Text("\(filled)/\(slotsPerBoard)")
                    .font(.gs(12, .medium))
                    .foregroundStyle(onColor.opacity(0.7))
                    .monospacedDigit()
                    .contentTransition(.numericText())
            }
            .padding(14)
        }
        .aspectRatio(1, contentMode: .fit)
        .animation(.snappy, value: filled)
    }

    private func readableForeground(on background: Color) -> Color {
        // Approximate luminance from the resolved RGB.
        let ui = UIColor(background)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        ui.getRed(&r, green: &g, blue: &b, alpha: &a)
        let luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
        return luminance > 0.6 ? Color.black.opacity(0.85) : Color.white
    }
}

/// Press feedback that feels like Apple's photo tiles: a gentle scale-down.
struct TileButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .animation(.spring(response: 0.3, dampingFraction: 0.7), value: configuration.isPressed)
    }
}
