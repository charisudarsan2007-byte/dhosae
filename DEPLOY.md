# Putting dhosae online at dhosae.in

Your site now has a private **/studio** (password-gated) and a database. Locally
the database is a file (`dhosae.db`). On the internet, three things have to be
true:

1. The code lives somewhere a host can build it → **GitHub**.
2. A host runs it → **Vercel** (free, the adapter is already wired in).
3. The database lives in the cloud, not in a file → **Turso** (free libSQL).

Do these once, in order. Anywhere you see `CHANGE_ME`, paste your own value.

---

## 0. One-time accounts (free)

- GitHub — https://github.com/signup
- Vercel — https://vercel.com/signup  → choose **"Continue with GitHub"**
- Turso — https://turso.tech  → sign up (GitHub login is fine)

---

## 1. Put the code on GitHub

From this folder (`C:\Users\4e\dhosae.in`) in a terminal:

```powershell
git init
git add .
git commit -m "dhosae: site + private studio"
```

Then create an **empty** repo on GitHub called `dhosae` (no README), and run the
two lines GitHub shows you, which look like:

```powershell
git remote add origin https://github.com/YOUR_NAME/dhosae.git
git branch -M main
git push -u origin main
```

> `.env` and `dhosae.db` are gitignored on purpose — your secret and local data
> never leave your machine.

---

## 2. Create the cloud database (Turso)

Install the Turso CLI (or use their web dashboard "Create Database" button).
With the CLI:

```powershell
turso auth login
turso db create dhosae
turso db show dhosae --url          # -> libsql://dhosae-YOURNAME.turso.io
turso db tokens create dhosae       # -> a long token string
```

Keep both values — the **URL** and the **token**. The app creates its own
tables on first run, so there's nothing to import.

---

## 3. Generate a production session secret

This signs your login cookie. Make a fresh one (don't reuse the local `.env`):

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Copy the output.

---

## 4. Deploy on Vercel

1. Go to https://vercel.com/new → **Import** your `dhosae` GitHub repo.
2. Vercel auto-detects Astro. Before clicking Deploy, open
   **Environment Variables** and add three:

   | Name                  | Value                                   |
   | --------------------- | --------------------------------------- |
   | `DATABASE_URL`        | `libsql://dhosae-YOURNAME.turso.io`     |
   | `DATABASE_AUTH_TOKEN` | the Turso token from step 2             |
   | `AUTH_SECRET`         | the random string from step 3           |

3. Click **Deploy**. In ~1 minute you get a live URL like
   `dhosae-xxxx.vercel.app`.
4. Visit `your-url.vercel.app/studio` — it will ask you to **create your
   access** (set your password). That password now guards the live studio.

> The adapter switches to Vercel automatically during the cloud build — no code
> change needed. Locally you keep using `npm run dev` with the file database.

---

## 5. Point dhosae.in at it

In Vercel: **Project → Settings → Domains → Add** → type `dhosae.in`.
Vercel shows you the DNS records to set. Then log in to wherever you bought
`dhosae.in` (your registrar) and add what Vercel tells you — usually:

- An **A record** for `@` → `76.76.21.21`, **and/or**
- A **CNAME** for `www` → `cname.vercel-dns.com`

(Vercel shows the exact current values — always use those.) DNS can take
anywhere from a few minutes to a few hours. Vercel auto-issues the HTTPS
certificate once it sees the records.

When it goes green, **https://dhosae.in** is your site, and
**https://dhosae.in/studio** is your private space.

---

## Everyday writing after launch

- Go to `https://dhosae.in/studio`, unlock with your password.
- **New piece** to write; **edit/delete** any piece; **why-I-do-this** to edit
  the creed band.
- Saving writes to the cloud database and is live immediately — no rebuilds, no
  Git, nothing to redeploy.

## If you ever forget your password

There's no email reset (single author, by design). Clear it by deleting the one
admin row in the Turso database, then re-create access at `/studio`:

```powershell
turso db shell dhosae "DELETE FROM admin;"
```

Your writing is untouched — only the password is reset.
