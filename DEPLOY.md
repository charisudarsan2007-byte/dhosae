# Putting dhosae online at dhosae.in

dhosae has a private, password-gated **/studio** and a database. Locally the
database is just a file (`dhosae.db`). On the internet three things must be true:

1. The code lives somewhere a host can build it → **GitHub**.
2. A host runs it → **Netlify** (free; the adapter is already wired in).
3. The database lives in the cloud, not in a file → **Turso** (free libSQL).

Do these once, in order. Anywhere you see `YOUR_…`, paste your own value.

---

## 0. One-time accounts (all free)

- GitHub — https://github.com/signup
- Netlify — https://app.netlify.com/signup → choose **"Sign up with GitHub"**
- Turso — https://turso.tech → sign up (GitHub login is fine)

---

## 1. Put the code on GitHub

From this folder (`C:\Users\4e\dhosae.in`) in a terminal:

```powershell
git add .
git commit -m "dhosae: the journal"
```

Create an **empty** repo on GitHub called `dhosae` (no README), then run the
lines GitHub shows you:

```powershell
git remote add origin https://github.com/YOUR_NAME/dhosae.git
git branch -M main
git push -u origin main
```

> `.env` and `dhosae.db` are gitignored on purpose — your secret and your local
> writing never leave your machine.

---

## 2. Create the cloud database (Turso)

Use the Turso dashboard's **Create Database** button, or the CLI:

```powershell
turso auth login
turso db create dhosae
turso db show dhosae --url      # -> libsql://dhosae-YOURNAME.turso.io
turso db tokens create dhosae   # -> a long token string
```

Keep both the **URL** and the **token**. The app builds its own tables and seeds
the opening entry on first run — there is nothing to import.

---

## 3. Make a production session secret

This signs your login cookie. Generate a fresh one (don't reuse local):

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Copy the output.

---

## 4. Deploy on Netlify

1. Go to https://app.netlify.com → **Add new site → Import an existing project**
   → pick GitHub → choose your `dhosae` repo.
2. Netlify reads `netlify.toml`, so build command (`npm run build`) and publish
   dir (`dist`) are already filled in. **Before** the first deploy, open
   **Site configuration → Environment variables** and add three:

   | Key                   | Value                                   |
   | --------------------- | --------------------------------------- |
   | `DATABASE_URL`        | `libsql://dhosae-YOURNAME.turso.io`     |
   | `DATABASE_AUTH_TOKEN` | the Turso token from step 2             |
   | `AUTH_SECRET`         | the random string from step 3           |

3. **Deploy site.** In ~1–2 minutes you get a URL like
   `https://dhosae-xxxx.netlify.app`.
4. Visit `https://dhosae-xxxx.netlify.app/studio` — it asks you to **create your
   access** (set your password). That password now guards the live studio.

> The adapter switches to Netlify automatically during the cloud build (it keys
> off Netlify's own `NETLIFY` env var) — no code change needed. Locally you keep
> using `npm run dev` with the file database.

---

## 5. Point dhosae.in at it (Hostinger DNS)

You bought `dhosae.in` from Hostinger, so keep DNS there and aim it at Netlify.

**a. Tell Netlify about the domain.** Netlify → **Domain management → Add a
domain** → type `dhosae.in` → Add. Netlify will list it as "awaiting external
DNS".

**b. Add the records at Hostinger.** Log in to Hostinger →
**Domains → dhosae.in → DNS / Nameservers (DNS Zone editor)**. Add/modify:

| Type    | Name / Host | Value / Points to        | TTL   |
| ------- | ----------- | ------------------------ | ----- |
| `A`     | `@`         | `75.2.60.5`              | 3600  |
| `CNAME` | `www`       | `dhosae-xxxx.netlify.app`| 3600  |

- `75.2.60.5` is Netlify's load-balancer IP for apex (root) domains.
- For the `www` CNAME, use **your** Netlify subdomain (the `*.netlify.app` from
  step 4).
- Delete any pre-existing parking `A`/`CNAME` records for `@` and `www` that
  Hostinger added, or they'll conflict.

> Prefer zero-config? Instead of the table above you can switch Hostinger's
> **nameservers** to Netlify's (`dns1.p0X.nsone.net …`, shown under "Set up
> Netlify DNS"). That hands all DNS to Netlify and sets both records for you.
> Use **either** the records **or** the nameserver method — not both.

**c. Wait, then HTTPS.** DNS takes minutes to a few hours. Once Netlify sees the
records it auto-issues a free Let's Encrypt certificate. In Domain management set
`https://dhosae.in` as the **primary domain** and enable **Force HTTPS**.

When it goes green, **https://dhosae.in** is your journal and
**https://dhosae.in/studio** is your private space.

---

## Everyday writing after launch

- Go to `https://dhosae.in/studio`, unlock with your password.
- **Write today** to add a day; open any day to **edit/delete** it; **the note**
  edits the short standing note on your homepage.
- Saving writes to the cloud database and is live immediately — no rebuilds, no
  Git, nothing to redeploy.

## If you ever forget your password

There's no email reset (single author, by design). Clear the one admin row in
Turso, then re-create access at `/studio`:

```powershell
turso db shell dhosae "DELETE FROM admin;"
```

Your writing is untouched — only the password is reset.
