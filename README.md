# PhotoVault

An English-language, offline-first photo/video gallery PWA designed for iPhone Safari and GitHub Pages. The app uses a flower-style icon, system light/dark appearance, glass-like UI, local IndexedDB media storage, a nine-dot pattern lock, search, favorites, filtering, batch deletion, simple viewing rotation, and original-file export.

## Important platform notes

- This is a **web app**, not an iOS native app. It cannot fully replace Apple Photos or access the entire library without the user's selection through the iOS picker.
- Imported media is copied into this app's browser storage. Deleting an item here **does not delete the original in Apple Photos**.
- Browser storage may be cleared by the user or reclaimed by iOS. Export/backup important media separately.
- The pattern lock is an app-level convenience lock, not device-grade encryption. Media blobs are not encrypted at rest by this starter project. Anyone with access to the same browser storage/devtools may be able to inspect them.
- Video thumbnail generation depends on browser codec support and file format. Some videos may show a generic play tile.
- Image rotation is a viewing preference only; the original file is unchanged.
- The app requires HTTPS for service workers, Web Crypto, and reliable installation. GitHub Pages provides HTTPS.

## Publish with GitHub Pages

1. Create a new repository on GitHub, for example `photovault`.
2. Upload **all files and folders** from this project. `index.html` should be in the repository root.
3. In the repository, open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select branch `main` and folder `/ (root)`, then save.
6. Wait for GitHub Pages to publish. Open the URL shown in Settings → Pages, usually `https://YOUR-USERNAME.github.io/photovault/`.
7. Open that URL in **Safari on iPhone** while online. Wait for the page to finish loading once.
8. Tap **Share → Add to Home Screen**. If offered, enable **Open as Web App**, then tap Add.
9. Launch PhotoVault from the new Home Screen icon. Import a few test files, then enable Airplane Mode and test again.

## Offline behavior

`sw.js` caches the application shell on installation. The media itself is stored separately in IndexedDB and is not sent to any server by this code. After the first successful online load, reopen the installed app once before testing offline. If you update the app, the service worker will replace the shell cache with the new version.

## Included features

- Import multiple images and videos through the iOS file/photo picker.
- Store media blobs and thumbnails locally in IndexedDB.
- Grid gallery, image/video filters, favorites, text/date search, newest/oldest sorting.
- Full-screen image/video viewer and playback controls.
- Nine-dot pattern setup and unlock.
- Multi-select and delete from PhotoVault.
- Export the original imported file.
- Per-item viewing rotation preference.
- System dark/light mode and reduced-motion support.

## Current starter limitations / future upgrades

- Album assignment is a lightweight local label. The current UI is intentionally minimal; use Select, then double-tap the “Recent media” heading to open album creation, and create an album after selecting items to assign them. A dedicated album browser can be added next.
- This starter lock does not encrypt files. For stronger privacy, implement authenticated encryption with a user-derived key and a recovery/backup flow.
- No cloud sync, iCloud Photos integration, or native Face ID.
- PWA installation and storage behavior vary by iOS version. Always keep a backup of valuable media.

## Local development

Because service workers require a secure context, use GitHub Pages or a local HTTPS server for realistic offline testing. Opening `index.html` directly with `file://` will not test PWA installation or service-worker behavior.
