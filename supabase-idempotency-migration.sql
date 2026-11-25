-- Steady: idempotent mutation RPCs
--
-- This is a review/apply draft for Lovable, not a repository migration.
-- Apply it only after comparing the existing two-argument RPC bodies and live
-- constraints in the Supabase project. It intentionally does not edit
-- supabase/migrations/ because Lovable owns database changes.
--
-- Contract added for the browser outbox:
--   check_in(goal_id, date, operation_id) -> jsonb
--   undo_check_in(goal_id, date, operation_id) -> jsonb
--   redeem_reward(reward_id, operation_id) -> jsonb
--
-- The existing two-argument functions remain available and are called inside
-- the wrappers below. That minimizes changes to the existing ledger logic.

begin;

create table if not exists public.mutation_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  operation_kind text not null check (
    operation_kind in ('check_in', 'undo_check_in', 'redeem_reward')
  ),
  request_fingerprint text not null,
  status text not null check (status in ('processing', 'succeeded')),
  result jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, operation_id)
);

alter table public.mutation_receipts enable row level security;

-- A client may inspect its own receipt, but cannot forge or mutate receipts.
drop policy if exists "Users can read their own mutation receipts"
  on public.mutation_receipts;
create policy "Users can read their own mutation receipts"
  on public.mutation_receipts
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.mutation_receipts from anon, authenticated;
grant select on public.mutation_receipts to authenticated;

delete from public.mutation_receipts
where created_at < now() - interval '90 days';

create index if not exists mutation_receipts_created_at_idx
  on public.mutation_receipts (user_id, created_at desc);

-- The function is deliberately security definer because normal clients cannot
-- write receipts. Keep the search path fixed to avoid object-shadowing risks.
create or replace function public.check_in(
  p_goal_id uuid,
  p_date date,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_fingerprint text := p_goal_id::text || ':' || p_date::text;
  v_receipt public.mutation_receipts%rowtype;
  v_inserted boolean;
  v_completion_id text;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;

  if p_operation_id is null then
    raise exception using errcode = '22023', message = 'operation_id_required';
  end if;

  insert into public.mutation_receipts (
    user_id, operation_id, operation_kind, request_fingerprint, status
  ) values (
    v_user_id, p_operation_id, 'check_in', v_fingerprint, 'processing'
  )
  on conflict (user_id, operation_id) do nothing;
  v_inserted := found;

  if not v_inserted then
    select * into v_receipt
    from public.mutation_receipts
    where user_id = v_user_id and operation_id = p_operation_id
    for update;

    if v_receipt.operation_kind <> 'check_in'
       or v_receipt.request_fingerprint <> v_fingerprint then
      raise exception using errcode = '22023', message = 'operation_id_reused';
    end if;

    if v_receipt.status = 'succeeded' then
      return coalesce(v_receipt.result, '{}'::jsonb) || jsonb_build_object('applied', false);
    end if;

    raise exception using errcode = '40001', message = 'operation_in_progress';
  end if;

  begin
    -- Calls the existing two-argument function, preserving its current
    -- ledger, uniqueness, and authorization behavior. Its current generated
    -- type says it returns a string, expected to be the completion ID.
    v_completion_id := public.check_in(p_goal_id, p_date);
    v_result := jsonb_build_object(
      'completion_id', v_completion_id,
      'applied', true
    );

    update public.mutation_receipts
    set status = 'succeeded', result = v_result
    where user_id = v_user_id and operation_id = p_operation_id;

    return v_result;
  exception when others then
    -- Do not leave a committed processing receipt after a rejected command.
    delete from public.mutation_receipts
    where user_id = v_user_id and operation_id = p_operation_id;
    raise;
  end;
end;
$$;

create or replace function public.undo_check_in(
  p_goal_id uuid,
  p_date date,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_fingerprint text := p_goal_id::text || ':' || p_date::text;
  v_receipt public.mutation_receipts%rowtype;
  v_inserted boolean;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;

  if p_operation_id is null then
    raise exception using errcode = '22023', message = 'operation_id_required';
  end if;

  insert into public.mutation_receipts (
    user_id, operation_id, operation_kind, request_fingerprint, status
  ) values (
    v_user_id, p_operation_id, 'undo_check_in', v_fingerprint, 'processing'
  )
  on conflict (user_id, operation_id) do nothing;
  v_inserted := found;

  if not v_inserted then
    select * into v_receipt
    from public.mutation_receipts
    where user_id = v_user_id and operation_id = p_operation_id
    for update;

    if v_receipt.operation_kind <> 'undo_check_in'
       or v_receipt.request_fingerprint <> v_fingerprint then
      raise exception using errcode = '22023', message = 'operation_id_reused';
    end if;

    if v_receipt.status = 'succeeded' then
      return coalesce(v_receipt.result, '{}'::jsonb) || jsonb_build_object('applied', false);
    end if;

    raise exception using errcode = '40001', message = 'operation_in_progress';
  end if;

  begin
    perform public.undo_check_in(p_goal_id, p_date);
    v_result := jsonb_build_object('applied', true);

    update public.mutation_receipts
    set status = 'succeeded', result = v_result
    where user_id = v_user_id and operation_id = p_operation_id;

    return v_result;
  exception when others then
    delete from public.mutation_receipts
    where user_id = v_user_id and operation_id = p_operation_id;
    raise;
  end;
end;
$$;

create or replace function public.redeem_reward(
  p_reward_id uuid,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_fingerprint text := p_reward_id::text;
  v_receipt public.mutation_receipts%rowtype;
  v_inserted boolean;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;

  if p_operation_id is null then
    raise exception using errcode = '22023', message = 'operation_id_required';
  end if;

  insert into public.mutation_receipts (
    user_id, operation_id, operation_kind, request_fingerprint, status
  ) values (
    v_user_id, p_operation_id, 'redeem_reward', v_fingerprint, 'processing'
  )
  on conflict (user_id, operation_id) do nothing;
  v_inserted := found;

  if not v_inserted then
    select * into v_receipt
    from public.mutation_receipts
    where user_id = v_user_id and operation_id = p_operation_id
    for update;

    if v_receipt.operation_kind <> 'redeem_reward'
       or v_receipt.request_fingerprint <> v_fingerprint then
      raise exception using errcode = '22023', message = 'operation_id_reused';
    end if;

    if v_receipt.status = 'succeeded' then
      return coalesce(v_receipt.result, '{}'::jsonb) || jsonb_build_object('applied', false);
    end if;

    raise exception using errcode = '40001', message = 'operation_in_progress';
  end if;

  begin
    perform public.redeem_reward(p_reward_id);
    v_result := jsonb_build_object('applied', true);

    update public.mutation_receipts
    set status = 'succeeded', result = v_result
    where user_id = v_user_id and operation_id = p_operation_id;

    return v_result;
  exception when others then
    delete from public.mutation_receipts
    where user_id = v_user_id and operation_id = p_operation_id;
    raise;
  end;
end;
$$;

revoke execute on function public.check_in(uuid, date, uuid) from public, anon;
revoke execute on function public.undo_check_in(uuid, date, uuid) from public, anon;
revoke execute on function public.redeem_reward(uuid, uuid) from public, anon;
grant execute on function public.check_in(uuid, date, uuid) to authenticated;
grant execute on function public.undo_check_in(uuid, date, uuid) to authenticated;
grant execute on function public.redeem_reward(uuid, uuid) to authenticated;

commit;

-- Verification queries to run after applying:
-- select p.proname, pg_get_function_identity_arguments(p.oid), pg_get_function_result(p.oid)
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and p.proname in ('check_in','undo_check_in','redeem_reward');
--
-- Then test with the same authenticated user and operation ID twice:
-- select public.check_in('<goal-id>', current_date, '<operation-uuid>');
-- select public.check_in('<goal-id>', current_date, '<same-operation-uuid>');
-- The second call should return applied=false and must not create another ledger row.
