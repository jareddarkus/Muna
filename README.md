# Muna

A minimalist habit tracker. White, black and a small palette of accent gradients; everything rounded, everything smooth.

- **Today** – the ring for today, pending habits, then completed ones in their own color. Tap a habit to record progress: count up, or run a timer.
- **Reports** – your last 21 days, for all habits or one at a time, colored red to green.
- **Social** – friends and groups (public or private, admins, invitations, posts, comments, likes), with predictive search.
- **Account** – profile photo (cropped, WebP), username, About me, notifications, updates.
- **Sync** – accounts, data and realtime sync run on Supabase, so your phone, Mac and iPad always agree, and shared habits update live for everyone in a group.
- **Day browsing** – arrows on the Today screen step through days; log what you forgot, or preview upcoming habits. Each habit can have a start date.
- **Reminders** – turn on notifications in Settings, then set a time on any habit (Web Push, delivered even when the app is closed).
- **Appearance** – System / Light / Dark, and an *Updates* page with the version number and changelog.
- **Icons** – all of [Tabler Icons](https://tabler.io/icons) (5,233 outline + 1,054 filled), searchable.

It's a plain static web app (no build step) – `index.html`, `css/`, `js/`. On an iPhone: open the site in Safari → Share → *Add to Home Screen*.

## One-time setup (the parts only the account owner can do)

1. **Merge to `main`.** The included workflow publishes the site to GitHub Pages on every push to `main`.
2. **Turn on Pages:** GitHub repo → *Settings* → *Pages* → *Source: GitHub Actions*. Your site will be at `https://<your-username>.github.io/Muna/`.
3. **Google sign-in** (Supabase project `vqtepepiagjsljvauqyn`):
   1. In [Google Cloud Console](https://console.cloud.google.com/) → *APIs & Services* → *Credentials* → *Create credentials* → *OAuth client ID* → type **Web application**.
      Add this *Authorized redirect URI*: `https://vqtepepiagjsljvauqyn.supabase.co/auth/v1/callback`
      (If asked to configure the consent screen first: choose *External*, fill in the app name, and publish it.)
   2. Copy the **Client ID** and **Client secret**.
   3. Supabase dashboard → *Authentication* → *Sign In / Providers* → **Google** → enable, paste both, save.
   4. Supabase dashboard → *Authentication* → *URL Configuration*: set **Site URL** to your Pages address, and add `https://<your-username>.github.io/Muna/**` under *Redirect URLs*.

Until step 3 is done the login screen offers *Preview without an account* (data stays on that device).

## Notifications

Reminders use Web Push. Every minute a Supabase scheduler (`pg_cron`) calls the `push` edge function (`supabase/functions/push`), which asks the database which reminders are due in each person's own timezone, skips habits already completed today, and sends an encrypted push to that person's devices. The push key pair is generated on first use and stored in the database, never in this repo.
On iPhone, notifications only work once Muna has been added to the Home Screen (iOS 16.4+). Settings → Notifications has a *Send a test* button.

## Releasing an update

Edit `js/version.js` (bump `VERSION`, add the changelog entry) – that is what the Updates page and the version chip show.

## How it fits together

| Path | What |
| --- | --- |
| `js/store.js` | App state, optimistic updates, realtime merge, streak maths |
| `js/backend-remote.js` | Supabase auth / database / storage / realtime |
| `js/backend-demo.js` | Local-only preview mode |
| `js/home.js` `focus.js` `editor.js` `stats.js` `settings.js` | The screens |
| `supabase/migrations/` | Database schema + row level security (already applied) |
| `supabase/functions/push/` | Reminder delivery (deployed) |
| `fonts/` | Lexend (SIL Open Font License) |
| `scripts/build-icons.mjs` | Rebuilds `icons/` from the `@tabler/icons` npm package |

Security: the Supabase URL and *publishable* key in `js/config.js` are meant to be public; row level security decides who can see what. Habits are private unless shared with a group; group members see each other's progress on shared habits only.

Fonts: Lexend, SIL OFL (`fonts/LICENSE-lexend.txt`). Icons: Tabler Icons, MIT licence (`icons/LICENSE-tabler.txt`). Supabase client: MIT (`vendor/LICENSE-supabase-js.txt`).
