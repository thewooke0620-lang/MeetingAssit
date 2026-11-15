-- 회의 통역 도우미: Supabase 표와 보안 규칙
-- Supabase 화면의 SQL Editor 에 붙여 넣고 Run 을 누르면 된다. 여러 번 실행해도 괜찮다.
-- 기록은 통째로(JSON) 저장하고, 각 사용자는 자기 기록만 읽고 쓸 수 있다(RLS).

create table if not exists public.packs (
  id text not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  deleted boolean not null default false,       -- 지운 것도 다른 기기에 알리려고 표시만 남긴다
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.meetings (
  id text not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists packs_user_updated on public.packs (user_id, updated_at);
create index if not exists meetings_user_updated on public.meetings (user_id, updated_at);

-- 바뀐 시각은 서버 시계로 적는다 (기기마다 시계가 달라도 순서가 맞게)
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists packs_touch on public.packs;
create trigger packs_touch before insert or update on public.packs for each row execute function public.touch_updated_at();
drop trigger if exists meetings_touch on public.meetings;
create trigger meetings_touch before insert or update on public.meetings for each row execute function public.touch_updated_at();

-- 보안 규칙: 로그인한 사람은 자기 줄만
alter table public.packs enable row level security;
alter table public.meetings enable row level security;

drop policy if exists "own packs" on public.packs;
create policy "own packs" on public.packs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "own meetings" on public.meetings;
create policy "own meetings" on public.meetings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
