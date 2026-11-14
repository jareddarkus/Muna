# Muna

A minimalist habit tracker. White, black and a small palette of accent gradients; everything rounded, everything smooth.

- **Today** – a progress ring for the day and your habits underneath. Tap a habit to focus: count up, or run a timer.
- **Progress** – rounded bar charts (week / month / year), streaks and a heatmap, for all habits or one at a time.
- **Settings** – profile photo (compressed to WebP), username, friends and groups.
- **Sync** – accounts, data and realtime sync run on Supabase, so your phone, Mac and iPad always agree, and shared habits update live for everyone in a group.
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

## How it fits together

| Path | What |
| --- | --- |
| `js/store.js` | App state, optimistic updates, realtime merge, streak maths |
| `js/backend-remote.js` | Supabase auth / database / storage / realtime |
| `js/backend-demo.js` | Local-only preview mode |
| `js/home.js` `focus.js` `editor.js` `stats.js` `settings.js` | The screens |
| `supabase/migrations/` | Database schema + row level security (already applied) |
| `scripts/build-icons.mjs` | Rebuilds `icons/` from the `@tabler/icons` npm package |

Security: the Supabase URL and *publishable* key in `js/config.js` are meant to be public; row level security decides who can see what. Habits are private unless shared with a group; group members see each other's progress on shared habits only.

Icons: Tabler Icons, MIT licence (`icons/LICENSE-tabler.txt`). Supabase client: MIT (`vendor/LICENSE-supabase-js.txt`).
