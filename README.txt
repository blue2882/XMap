Mind Maps — iPadOS 26-inspired web app

BUILD AND HOSTING
- This app is TypeScript + React, built with Vite. Do not serve the repo root as the live site.
- Local development: npm install, then npm run dev (opens the Vite dev server).
- Optional dev seed: copy data.json.example to data.json (gitignored) for extra legacy maps in dev, or rely on the committed example alone. Replace data.json with your own export; do not commit personal libraries.
- Production: npm run build, then deploy dist/ to GitHub Pages over HTTPS.
- GitHub Pages project site: build with VITE_BASE_PATH=/XMap/ (see .github/workflows/deploy-pages.yml).
- GitHub Pages cannot attach custom response headers. Production builds inject a Content-Security-Policy meta tag in dist/index.html (self, Supabase, Anthropic). A meta policy cannot enforce frame-ancestors, so embedding is not blocked, and HSTS and X-Frame-Options are not set.
- On iPad, open the deployed site in Safari > Share > Add to Home Screen.

FEATURES
- iPadOS 26-inspired Liquid Glass interface, adaptive layouts for landscape/portrait and Stage Manager-style window widths, pointer hover feedback, and persistent light/dark toggle.
- AI-powered PowerPoint import, editable maps, folders, edge-to-edge full-screen canvas, undo/redo, keyboard command shortcuts, and drag-and-drop file import on desktop/iPad with pointer support.
- Local saves continue to work when signed out.
- Optional Supabase email/password and Google sign-in with automatic cloud library sync and Realtime updates.

SUPABASE SETUP (required to activate login/cloud sync)
1. Create a project at https://supabase.com/.
2. In Project Settings / API, copy the Project URL and the publishable key (or legacy anon key). Never use the service_role key in the browser.
3. Open SQL Editor and run the complete contents of supabase-setup.sql. This creates one JSON library row per account and enables Row Level Security policies that restrict each user to their own row.
4. In Authentication > Providers, enable Email. Decide whether email confirmation is required; configure SMTP for production email delivery.
5. For Google login, enable Google in Authentication > Sign In / Providers and enter the OAuth Client ID and secret from Google Cloud Console. Add the Supabase callback URL shown in the provider setup to Google Cloud's authorized redirect URIs.
6. In Authentication > URL Configuration, set Site URL to your hosted app origin and add the full hosted app URL (including path if applicable) to Redirect URLs. Use HTTPS in production.
7. Copy .env.example to .env.local and set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY for local development. For production builds (GitHub Actions), set the same variables as repository secrets (VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY). Deploy dist/ after npm run build, then sign up with email/password or continue with Google.
- If those secrets are missing, production builds still run but cloud sign-in is disabled. The library and settings pages show: "Cloud sync not configured—set VITE_SUPABASE_* in deploy secrets."
8. Verify a user can only see their own row in public.mindmap_libraries. Do not disable RLS and do not expose service_role credentials.

SYNC NOTES
- The first successful sign-in uploads this browser's existing library if the account has no cloud library. If the account already has a cloud library, that cloud library replaces the visible local library on this browser. Export important local maps first if needed.
- Changes save locally immediately and are queued to cloud automatically. Realtime updates bring changes from another signed-in device into the app. Simultaneous edits to the same library use last-write-wins behavior; avoid editing the same account on multiple devices at the exact same time. Export individual maps as JSON for backups.
- Cloud sync uploads one JSON blob per account (default limit about 5 MB encoded size). Maps with large embedded base64 images may fail to upload until you shrink images or export locally; splitting storage into per-map rows would require a Supabase schema migration.
- Before each cloud upload, the app reads the row updated_at in Supabase and skips overwriting a newer cloud copy, then merges remote maps by each map updatedAt when applying Realtime or pull updates.
- Unreadable maps from cloud sync land in Quarantine on the device. Dismiss adds the map id to dismissedUnreadableMapIds in your cloud library JSON so the next push stops re-uploading that blob; the quarantine toast appears only when new entries are added, not on every pull.
- Login requires internet. Local editing and saving still work offline; queued changes sync when connectivity returns only after a subsequent save/reload (there is no durable offline sync queue).
- The Supabase browser client uses only the public publishable/anon key; RLS is the security boundary.

AI IMPORT
- AI import calls Anthropic directly from the browser (no backend proxy). Slide text and speaker notes are sent to Anthropic when you run AI import.
- Your Anthropic API key stays on this device. By default it is stored in the library IndexedDB blob as plain text. Enable “Session-only key storage” in Settings to keep the key in sessionStorage for the current tab instead (cleared when you close the browser).
- Anyone with access to this browser profile, devtools, or a device backup could read a persisted key. For a shared or production deployment, use a server or edge function for AI calls instead of personal API keys in the client.
- Optional build-time model override: set VITE_ANTHROPIC_MODEL when running npm run build (defaults to claude-sonnet-5-5).

IPADOS 26-STYLE WORKSPACE
- The app is a responsive web app/PWA, not a native SwiftUI app. It adopts an iPadOS-inspired glass visual style and adapts to resizable browser/PWA windows and split-view widths; actual Stage Manager window management remains controlled by iPadOS.
- Keyboard commands: Command/Ctrl+N (new map in library), Command/Ctrl+O (import), Command/Ctrl+S (save), Shift+Command/Ctrl+F (full-screen map), Command/Ctrl+/ (shortcut help). Node editing also supports Tab, Enter, F2, Delete, arrows, and 0 to fit.
- Drag .pptx or .json files onto the library in browsers that support file drag-and-drop. On iPad, use Import decks or maps with the Files picker.
- Theme is manually toggleable and persisted on this device. The initial theme follows the device appearance when no saved preference exists.
