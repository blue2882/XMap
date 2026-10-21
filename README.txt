Mind Maps — iPadOS 26-inspired web app

HOSTING
- Host this folder on an HTTPS static site such as Netlify or GitHub Pages.
- On iPad, open the site in Safari > Share > Add to Home Screen.

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
7. Deploy this folder. Open the app, click “Sign in / Create account”, expand “Supabase connection settings”, enter Project URL and publishable/anon key, then save. Sign up with email/password or continue with Google.
8. Verify a user can only see their own row in public.mindmap_libraries. Do not disable RLS and do not expose service_role credentials.

SYNC NOTES
- The first successful sign-in uploads this browser's existing library if the account has no cloud library. If the account already has a cloud library, that cloud library replaces the visible local library on this browser. Export important local maps first if needed.
- Changes save locally immediately and are queued to cloud automatically. Realtime updates bring changes from another signed-in device into the app. Simultaneous edits to the same library use last-write-wins behavior; avoid editing the same account on multiple devices at the exact same time. Export individual maps as JSON for backups.
- Login requires internet. Local editing and saving still work offline; queued changes sync when connectivity returns only after a subsequent save/reload (this simple static implementation does not provide a durable offline sync queue).
- The Supabase browser client uses only the public publishable/anon key; RLS is the security boundary.

AI IMPORT
- Existing Anthropic API key setting remains local to the browser. AI import sends slide text and speaker notes to Anthropic. For a public production app, move AI calls to a server/edge function rather than distributing personal API keys.

IPADOS 26-STYLE WORKSPACE
- The app is a responsive web app/PWA, not a native SwiftUI app. It adopts an iPadOS-inspired glass visual style and adapts to resizable browser/PWA windows and split-view widths; actual Stage Manager window management remains controlled by iPadOS.
- Keyboard commands: Command/Ctrl+N (new map in library), Command/Ctrl+O (import), Command/Ctrl+S (save), Shift+Command/Ctrl+F (full-screen map), Command/Ctrl+/ (shortcut help). Node editing also supports Tab, Enter, F2, Delete, arrows, and 0 to fit.
- Drag .pptx or .json files onto the library in browsers that support file drag-and-drop. On iPad, use Import decks or maps with the Files picker.
- Theme is manually toggleable and persisted on this device. The initial theme follows the device appearance when no saved preference exists.
