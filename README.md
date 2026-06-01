# Snaps Quest

Colors: you gotta catch 'em all.

**Snaps Quest** is a local-first, iOS-native photo game. You get a 3×3 board of
nine colors arranged like a rainbow. Tap a color and it zooms into its own 3×3
board of empty slots — your job is to fill all nine with photos of things in
that color. A blue door, a blue mug, a blue sky… then step back and admire the
collage.

It's a single-player take on the trip idea where each friend only shoots one
color and ends up with a beautiful single-hue grid.

## What it does

- **Nine colors**, arranged rainbow-style: Red, Orange, Yellow / Green, Blue,
  Purple / Pink, Black, White.
- **Tap to dive in** — a native iOS 18 zoom transition expands the color tile
  into its board.
- **Fill a slot** by choosing from your camera roll, or by taking a photo right
  then with the in-app camera.
- **Full resolution, always.** Photos are *referenced*, never copied or
  compressed — Snaps Quest stores only the Photos-library identifier
  (`PHAsset.localIdentifier`) and resolves the original on demand. Photos you
  capture in-app are saved to your library at full quality, then referenced the
  same way.
- **Local only.** Image requests never touch the network; nothing leaves the
  device. The only persisted data is a small JSON file of references in
  Application Support.
- **Progress, gently.** Each color tile shows a `n/9` ring; the home screen
  shows an overall bar that taps to toggle between “colors complete” (`2 of 9`)
  and “photos placed” (`42 of 81`).
- **Light & dark**, following the system by default, with an in-app switcher in
  Settings (System / Light / Dark).
- **Google Sans Flex** throughout, with an automatic system-font fallback.

## Tech

- **SwiftUI**, targeting **iOS 18.0+** (uses the `.zoom` navigation transition).
- `PhotosUI.PhotosPicker` initialized with `photoLibrary: .shared()` so picked
  items return a reusable asset identifier.
- `PHCachingImageManager` for fast, local-only thumbnail loading.
- No third-party dependencies.

## Project layout

```
SnapsQuest/
  SnapsQuest.xcodeproj
  SnapsQuest/
    SnapsQuestApp.swift        App entry, wires up store + theme
    Models/
      QuestColor.swift         The nine colors and their swatches
      QuestStore.swift         Persistence: colorID → nine photo references
    Photos/
      PhotoLibraryService.swift  Load by reference, save captures, auth
      CameraPicker.swift         UIImagePickerController wrapper
    Theme/
      Theme.swift              Appearance mode + color helpers
      Typography.swift         Google Sans Flex font helpers
    Views/
      RootView.swift           Home: the 3×3 color board + overall progress
      ColorDetailView.swift    A single color's 3×3 photo board
      AssetThumbnail.swift     Async, size-aware library image view
      PhotoViewerView.swift    Full-screen viewer (pinch zoom, replace/remove)
      ProgressViews.swift      Slim bar + progress ring
      SettingsView.swift       Appearance switcher + stats
    Resources/Fonts/           Google Sans Flex (OFL) — see NOTICE.md
    Assets.xcassets/           App icon + accent color
    Info.plist                 Fonts + photo/camera usage strings
```

## Build & run

1. Open `SnapsQuest/SnapsQuest.xcodeproj` in **Xcode 16** or later.
2. Select a simulator or your device and hit **Run**.
   - On a device, set your team under *Signing & Capabilities* (the bundle id is
     `quest.snaps.SnapsQuest`).
3. The first time you add a photo, iOS asks for photo-library access — grant it
   so Snaps Quest can reference your originals.

> The in-app camera requires a real device (the simulator has no camera).

## Notes on quality & privacy

Nothing is uploaded, and originals are never re-encoded for display. iCloud-only
originals aren't downloaded (network access is disabled on image requests), so
if a referenced photo lives only in iCloud and isn't on-device, it simply won't
render until it's available locally.

---

Domain: [snaps.quest](https://snaps.quest)
