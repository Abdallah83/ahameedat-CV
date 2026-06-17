# ahameedat-visits Cloudflare Worker

This Worker collects simple visit events (IP via `cf-connecting-ip`, country, user-agent) and stores counters and a recent list in a KV namespace `VISITS_KV`.

Prerequisites
- Node.js + npm
- `wrangler` (Cloudflare CLI)
- A Cloudflare account with permissions to create Workers and KV

Quick start

1. Install wrangler and login

```powershell
npm install -g wrangler
wrangler login
```

2. Create a KV namespace and bind it

```powershell
cd worker
wrangler kv:namespace create "VISITS_KV" --binding VISITS_KV
# The command prints an id. Copy it and paste it into wrangler.toml
```

Alternatively you can create the namespace in the Cloudflare dashboard and bind it to the Worker after publishing.

3. Add admin password (secret)

```powershell
wrangler secret put ADMIN_PASSWORD
```

4. Publish the Worker

```powershell
wrangler publish
```

After publishing wrangler will print the `workers.dev` URL, for example:

```
https://ahameedat-visits.<account>.workers.dev
```

5. Update your site beacon endpoint

Open `abdallah_hameedat_cv.html` and change the endpoint line to:

```js
const endpoint = 'https://<your-workers-domain>.workers.dev/collect';
```

6. Test dashboard

- Visit `https://<your-workers-domain>.workers.dev/dashboard` and log in with the `ADMIN_PASSWORD` you set.
- Or fetch raw stats using curl with the `x-admin-token` header:

```powershell
curl -H "x-admin-token: YOUR_PASSWORD" https://<your-workers-domain>.workers.dev/stats
```

Security & Privacy
- The Worker stores IPs and user-agents in KV (recent list). Remove or hash data if needed for privacy.
- Show a cookie/consent notice on your site if legally required in your jurisdiction.

Troubleshooting
- If Access/Zero Trust blocks `pages.dev` routes, prefer publishing the Worker to `workers.dev` as above.
- If KV operations fail, make sure the binding name `VISITS_KV` is present in `wrangler.toml` or bound via the dashboard.

Contact
- If you want, I can: generate a ready `wrangler.toml` with the KV id filled (if you paste it here), or replace the beacon endpoint in `abdallah_hameedat_cv.html` with the `workers.dev` URL once you publish.
