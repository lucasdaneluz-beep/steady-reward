-- Steady Reward: idempotent mutation RPCs for the existing Lovable database
--
-- This migration is tailored to the live functions inspected on 2026-11-25:
--   check_in(uuid, date) returns uuid
--   undo_check_in(uuid, date) returns void
--   redeem_reward(uuid) returns void
--
-- It preserves those existing functions and adds overloads with operation_id.
-- Do NOT add an active-completion unique index here: the current product logic
-- allows a user to undo and then check in again.
--
-- Apply this in the SQL editor for the Lovable project that contains the real
-- goals, completion_records, rewards, and point_transactions tables.

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

drop policy if exists "Users can read their own mutation receipts"
  on public.mutation_receipts;
create policy "Users can read their own mutation receipts"
  on public.mutation_receipts
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.mutation_receipts from anon, authenticated;
grant select on public.mutation_receipts to authenticated;

create index if not exists mutation_receipts_created_at_idx
  on public.mutation_receipts (user_id, created_at desc);

create or replace function public.check_in(
  p_goal_id uuid,
  p_date date,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_fingerprint text := pg_catalog.md5(
    'check_in|' || p_goal_id::text || '|' || p_date::text
  );
  v_receipt public.mutation_receipts;
  v_inserted boolean;
  v_completion_id uuid;
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
    where user_id = v_user_id
      and operation_id = p_operation_id
    for update;

    if v_receipt.operation_kind <> 'check_in'
       or v_receipt.request_fingerprint <> v_fingerprint then
      raise exception using errcode = '22023', message = 'operation_id_reused';
    end if;

    if v_receipt.status = 'succeeded' then
      return coalesce(v_receipt.result, '{}'::jsonb)
        || jsonb_build_object('applied', false);
    end if;

    raise exception using errcode = '40001', message = 'operation_in_progress';
  end if;

  begin
    -- Existing function preserves the current authorization, goal locking,
    -- daily/weekly rules, completion insert, and points ledger insert.
    v_completion_id := public.check_in(p_goal_id, p_date);
    v_result := jsonb_build_object(
      'completion_id', v_completion_id,
      'applied', true
    );

    update public.mutation_receipts
    set status = 'succeeded', result = v_result
    where user_id = v_user_id
      and operation_id = p_operation_id;

    return v_result;
  exception when others then
    delete from public.mutation_receipts
    where user_id = v_user_id
      and operation_id = p_operation_id;
    raise;
  end;
end;
$function$;

create or replace function public.undo_check_in(
  p_goal_id uuid,
  p_date date,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_fingerprint text := pg_catalog.md5(
    'undo_check_in|' || p_goal_id::text || '|' || p_date::text
  );
  v_receipt public.mutation_receipts;
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
    where user_id = v_user_id
      and operation_id = p_operation_id
    for update;

    if v_receipt.operation_kind <> 'undo_check_in'
       or v_receipt.request_fingerprint <> v_fingerprint then
      raise exception using errcode = '22023', message = 'operation_id_reused';
    end if;

    if v_receipt.status = 'succeeded' then
      return coalesce(v_receipt.result, '{}'::jsonb)
        || jsonb_build_object('applied', false);
    end if;

    raise exception using errcode = '40001', message = 'operation_in_progress';
  end if;

  begin
    -- Existing function preserves current completion selection and reversal.
    perform public.undo_check_in(p_goal_id, p_date);
    v_result := jsonb_build_object('applied', true);

    update public.mutation_receipts
    set status = 'succeeded', result = v_result
    where user_id = v_user_id
      and operation_id = p_operation_id;

    return v_result;
  exception when others then
    delete from public.mutation_receipts
    where user_id = v_user_id
      and operation_id = p_operation_id;
    raise;
  end;
end;
$function$;

create or replace function public.redeem_reward(
  p_reward_id uuid,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_fingerprint text := pg_catalog.md5(
    'redeem_reward|' || p_reward_id::text
  );
  v_receipt public.mutation_receipts;
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
    where user_id = v_user_id
      and operation_id = p_operation_id
    for update;

    if v_receipt.operation_kind <> 'redeem_reward'
       or v_receipt.request_fingerprint <> v_fingerprint then
      raise exception using errcode = '22023', message = 'operation_id_reused';
    end if;

    if v_receipt.status = 'succeeded' then
      return coalesce(v_receipt.result, '{}'::jsonb)
        || jsonb_build_object('applied', false);
    end if;

    raise exception using errcode = '40001', message = 'operation_in_progress';
  end if;

  begin
    -- Existing function preserves the advisory lock, reward lookup,
    -- balance calculation, and redemption ledger insert.
    perform public.redeem_reward(p_reward_id);
    v_result := jsonb_build_object('applied', true);

    update public.mutation_receipts
    set status = 'succeeded', result = v_result
    where user_id = v_user_id
      and operation_id = p_operation_id;

    return v_result;
  exception when others then
    delete from public.mutation_receipts
    where user_id = v_user_id
      and operation_id = p_operation_id;
    raise;
  end;
end;
$function$;

revoke execute on function public.check_in(uuid, date, uuid) from public, anon;
revoke execute on function public.undo_check_in(uuid, date, uuid) from public, anon;
revoke execute on function public.redeem_reward(uuid, uuid) from public, anon;
grant execute on function public.check_in(uuid, date, uuid) to authenticated;
grant execute on function public.undo_check_in(uuid, date, uuid) to authenticated;
grant execute on function public.redeem_reward(uuid, uuid) to authenticated;

commit;

-- Verification query:
-- select p.proname,
--        pg_get_function_identity_arguments(p.oid) as arguments,
--        pg_get_function_result(p.oid) as return_type
-- from pg_proc p
-- join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public'
--   and p.proname in ('check_in', 'undo_check_in', 'redeem_reward')
-- order by p.proname, arguments;
