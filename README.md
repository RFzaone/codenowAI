# CodeNow Cloud Web v3

CodeNow is a browser coding workspace powered by Cloudflare Workers AI.

## Architecture

Browser UI → Cloudflare Worker → Workers AI

The Worker uses the `AI` binding. Current plan routing:

- Free: `@cf/zai-org/glm-4.7-flash`
- Plus: `@cf/qwen/qwen3-30b-a3b-fp8`
- Pro: `@cf/zai-org/glm-5.3-flash`

These are server-side selections. The browser cannot choose an arbitrary model.

## Included fixes and features

- Fixed desktop chat scrolling and horizontal code-block overflow.
- Responsive desktop/tablet/mobile layout.
- Real onboarding flow: name → optional profile picture → ready screen.
- Skip button actually exits onboarding.
- CSS fade/entrance animation works on desktop and mobile.
- Profile name and picture persist locally.
- Free / Plus / Pro plans page.
- Single-use Plus/Pro redemption codes backed by D1.
- Admin code generation endpoint protected by `ADMIN_CODE_SECRET`.
- Server-side plan/model selection.
- Existing ZIP workspace import/export and file editor.
- Project memory and local chat history.
- Dark/light mode.

## Cloudflare setup

Keep the existing Workers AI binding named `AI`.

The Wrangler config requests a D1 database binding named `DB` for license codes. After deployment, verify that the Worker has a D1 binding named `DB` pointing at `codenow-licenses`.

Set a Worker secret named `ADMIN_CODE_SECRET` before generating codes.

Generate codes with:

```text
POST /api/admin/codes
Header: x-admin-secret: YOUR_SECRET
JSON: { "plan": "plus", "count": 10 }
```

or:

```text
{ "plan": "pro", "count": 10 }
```

The response contains the generated single-use codes. Keep these private. Do not put the admin secret in frontend code.

## Development

```bash
npm install
npm run build
npx wrangler deploy
```

The GitHub/Cloudflare deployment can use:

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Root directory: `/`

## Important billing note

Workers AI model availability and pricing can change. GLM-5.2 is paid-only, while this build uses GLM-5.3-Flash for Pro because it is a newer coding-focused model in the current Cloudflare catalog. Check the Cloudflare model page and billing dashboard before selling Pro access.

## Redemption codes

The current build includes a server-side Plus/Pro redemption system.

1. Create a Cloudflare D1 database named `codenow-licenses` and put its `database_id` in `wrangler.toml`.
2. Apply `migrations/0001_licenses.sql` with Wrangler.
3. Set the Worker secret `ADMIN_CODE_SECRET`.
4. Generate codes by POSTing to `/api/admin/codes` with header `x-admin-secret` and JSON such as `{ "plan": "plus", "count": 10 }` or `{ "plan": "pro", "count": 10 }`.
5. Give the returned codes to users. Codes look like `CN-PLUS-XXXXXX-XXXXXX` or `CN-PRO-XXXXXX-XXXXXX`.

Redeeming is atomic and single-use. The Worker stores the user's plan in D1 and `/api/chat` resolves the plan from D1 instead of trusting the browser's selected plan. A Plus code cannot downgrade a Pro account.
