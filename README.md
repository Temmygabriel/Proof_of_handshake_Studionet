# Proof of Handshake ⚖️

> AI-powered onchain rental deposit dispute resolution — built on GenLayer

**Bradbury Builders Hackathon 2026 · Onchain Justice Track**

---

## What It Does

Proof of Handshake lets landlords and tenants resolve deposit disputes without courts, lawyers, or bias. Both parties submit their claim and evidence. A panel of **5 AI validators** on GenLayer reads both sides and delivers a binding onchain verdict. One appeal round is available — after that, the verdict is locked permanently on the blockchain.

**Flow:**
1. Host creates a case (property, deposit amount, lease terms)
2. Host submits their claim + evidence
3. Guest receives the Case ID, submits their side
4. Either party requests the AI verdict (5 validators, ~30–60 sec)
5. Losing party may file one appeal → appellate panel re-reads everything
6. Final verdict is sealed onchain — immutable, shareable, auditable

---

## Tech Stack

- **Frontend**: Next.js 14 (App Router) + TypeScript
- **Blockchain**: [GenLayer](https://genlayer.com) (AI-powered smart contracts)
- **Client lib**: `genlayer-js`
- **Hosting**: Vercel

---

## Local Development

### 1. Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/proof-of-handshake.git
cd proof-of-handshake
npm install
```

### 2. Set up environment

```bash
cp .env.example .env.local
```

Edit `.env.local` and paste your deployed GenLayer contract address:

```
NEXT_PUBLIC_CONTRACT_ADDRESS=0xYOUR_CONTRACT_ADDRESS_HERE
```

### 3. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deploy to Vercel

### Option A — Vercel Dashboard (recommended)

1. Push this repo to GitHub
2. Go to [vercel.com/new](https://vercel.com/new) → import your repo
3. In **Environment Variables**, add:
   - `NEXT_PUBLIC_CONTRACT_ADDRESS` = your contract address
4. Click **Deploy**

### Option B — Vercel CLI

```bash
npm i -g vercel
vercel
# Follow prompts, then add env var:
vercel env add NEXT_PUBLIC_CONTRACT_ADDRESS
vercel --prod
```

---

## Project Structure

```
proof-of-handshake/
├── app/
│   ├── layout.tsx          # Root layout + metadata + SEO
│   └── page.tsx            # Full app (all screens in one file)
├── public/
│   └── favicon.svg         # App icon
├── .env.example            # Env variable template
├── .gitignore
├── next.config.ts          # Webpack fallbacks for genlayer-js
├── package.json
├── tsconfig.json
└── vercel.json
```

---

## Contract Functions Used

| Function | Args | Description |
|---|---|---|
| `create_case` | host, guest, address, deposit, terms | Opens a new dispute case |
| `submit_host_claim` | case_id, claim, evidence | Host submits their side |
| `submit_guest_claim` | case_id, claim, evidence | Guest submits their side |
| `request_verdict` | case_id | Triggers the 5-validator AI panel |
| `accept_verdict` | case_id | Seals Round 1 verdict as final |
| `file_appeal` | case_id, party, reason | Files an appeal onchain |
| `resolve_appeal` | case_id | Triggers appellate panel (Round 2) |
| `get_case` | case_id | Reads full case state (returns JSON) |
| `get_case_count` | — | Returns total number of cases |

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | ✅ | Your deployed GenLayer contract address |

---

## License

MIT — build on it, fork it, remix it.
