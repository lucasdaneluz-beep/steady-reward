<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules
- Points balance is only ever the sum of `point_transactions`; that table is append-only (trigger-enforced) and written solely by the `check_in`, `undo_check_in` and `redeem_reward` database functions — why: balances can never drift from history.
- Undoing a check-in marks the completion `undone_at` and appends a reversal; goals/rewards are archived, never deleted — why: the ledger keeps valid references.
- Every visitor gets an anonymous session on first load (`src/lib/session.tsx`); new users are seeded with default goals/rewards by a trigger on auth.users — why: instant guest use, linkable later via email/password.
- Rules live in `src/lib/progress.ts` / `dates.ts` / `streak.ts` with tests in `src/lib/progress.test.ts`; weeks start Monday on both client and database.
