# NTW Approvals Portal

Production-ready approvals portal for EA users. Frontend runs on Vite + React and is hosted on GitHub Pages. Backend is a Google Apps Script Web App backed by the `OrderCycle` sheet.

## Repo structure

- `frontend/` Vite React app
- `apps-script/` Google Apps Script backend
- `.github/workflows/deploy.yml` GitHub Pages deploy pipeline

## Apps Script setup (backend)

1. Open Google Apps Script in the browser.
2. Create a new project (or open the existing one).
3. Replace the default `Code.gs` with `apps-script/Code.gs`.
4. Ensure the constants match your environment:
   - Spreadsheet ID: `1WSQMXxEAWVqeSBcEiYPWZ8HAL5d9y0Rdcel6xupbTPI`
   - Sheet tab: `OrderCycle`
   - Client ID: `360849757137-agopfs0m8rgmcj541ucpg22btep5olt3.apps.googleusercontent.com`
5. Deploy as Web App:
   - Deploy > New deployment > Select type: Web app
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Copy the Web App URL (the `/exec` link). This is `VITE_GAS_WEBAPP_URL`.

## Frontend setup

From `frontend/`:

```bash
npm install
```

Create a `.env` file (or set environment variables):

```bash
VITE_GSI_CLIENT_ID=360849757137-agopfs0m8rgmcj541ucpg22btep5olt3.apps.googleusercontent.com
VITE_GAS_WEBAPP_URL=https://script.google.com/macros/s/XXXXX/exec
```

Run locally:

```bash
npm run dev
```

## GitHub Pages deployment

1. Push to the `main` branch.
2. The workflow builds `frontend/` and deploys `frontend/dist`.
3. Vite base path is set dynamically using the repo name.
4. In GitHub, enable Pages for the repository if needed.

## Eligibility logic summary

- AQ maps to `segmentIndex 0` (Final).
- AR groups map to `segmentIndex 1..N` (Additional-1, Additional-2, ...).
- Each segment is pending if:
  - Segment docs are non-empty **and** approval entry is not `Yes`.
- Missing approvals are treated as **not approved**.
- Rows with missing Order ID (BD) are skipped.

## Troubleshooting

- **Unauthorized user**: Ensure the Google account is either `ea01@ntwoods.com` or `ea02@ntwoods.com` and the OAuth Client ID matches the one configured in Apps Script.
- **Token verification fails**: Check the Apps Script deployment is public (Anyone) and the Client ID is correct.
- **No cards appear**: Verify the `OrderCycle` sheet has data in `AQ/AR` and the approvals columns `BF/BG` are not fully marked `Yes`.
- **Approval parsing oddities**: Approvals are split on `|` and trimmed. Missing entries are treated as pending. Empty AR groups are ignored.

## Data columns (OrderCycle)

- B: Dealer Name
- C: Marketing Person
- D: Location
- F: CRM
- AQ: Final order docs (CSV)
- AR: Additional order docs (groups separated by `;`)
- BD: Order ID (unique key)
- BF: EA01 approvals (pipe separated)
- BG: EA02 approvals (pipe separated)

## Notes

- JSONP is used to avoid CORS issues with Google Apps Script Web Apps.
- `markChecked` uses `LockService` to prevent concurrent writes.
- A `Logs` sheet is created automatically if it does not exist.
