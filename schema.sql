-- Số Hóa Đầu Làng: schema khởi đầu cho Supabase.
-- Chạy trong Supabase Dashboard > SQL Editor > New query.
-- Đọc kỹ và kiểm thử trên dự án thử nghiệm trước khi dùng dữ liệu thật.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  global_role text not null default 'user'
    check (global_role in ('user','system_admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.areas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  area_type text not null check (area_type in ('province','commune','village','neighborhood','other')),
  parent_id uuid references public.areas(id) on delete restrict,
  avatar_url text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.area_members (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references public.areas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'level2' check (role in ('level1','level2')),
  status text not null default 'active' check (status in ('active','pending','suspended')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(area_id, user_id)
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references public.areas(id) on delete cascade,
  title text not null,
  body text not null,
  category text not null default 'Thông báo',
  is_published boolean not null default false,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references public.areas(id) on delete cascade,
  full_name text not null,
  position text,
  phone text,
  email text,
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references public.areas(id) on delete cascade,
  title text not null,
  description text,
  assigned_to uuid references auth.users(id) on delete set null,
  due_at timestamptz,
  status text not null default 'open' check (status in ('open','in_progress','done','cancelled')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references public.areas(id) on delete cascade,
  title text not null,
  description text,
  storage_path text not null,
  sensitivity text not null default 'general' check (sensitivity in ('general','internal','restricted')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.handover_records (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references public.areas(id) on delete cascade,
  from_user_id uuid not null references auth.users(id) on delete restrict,
  to_user_id uuid not null references auth.users(id) on delete restrict,
  approved_by uuid references auth.users(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','approved','rejected','completed')),
  notes text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  area_id uuid references public.areas(id) on delete set null,
  action text not null,
  target_table text,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_area_members_user on public.area_members(user_id, status);
create index if not exists idx_area_members_area on public.area_members(area_id, status);
create index if not exists idx_announcements_area_date on public.announcements(area_id, created_at desc);
create index if not exists idx_contacts_area on public.contacts(area_id);
create index if not exists idx_tasks_area_status on public.tasks(area_id, status);

-- Helper functions run with caller privileges and are used by RLS policies.
create or replace function public.is_system_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.global_role = 'system_admin'
  );
$$;

create or replace function public.has_area_access(target_area uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_system_admin() or exists (
    select 1 from public.area_members am
    where am.area_id = target_area and am.user_id = auth.uid()
      and am.status = 'active'
  );
$$;

create or replace function public.can_manage_area(target_area uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_system_admin() or exists (
    select 1 from public.area_members am
    where am.area_id = target_area and am.user_id = auth.uid()
      and am.status = 'active' and am.role = 'level1'
  );
$$;

alter table public.profiles enable row level security;
alter table public.areas enable row level security;
alter table public.area_members enable row level security;
alter table public.announcements enable row level security;
alter table public.contacts enable row level security;
alter table public.tasks enable row level security;
alter table public.documents enable row level security;
alter table public.handover_records enable row level security;
alter table public.audit_logs enable row level security;

-- Profiles: a user can read/update their own profile; system admin can read all.
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
for select to authenticated using (id = auth.uid() or public.is_system_admin());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- User can read areas where they are a member; system admin can see all.
drop policy if exists "areas_read_assigned_or_admin" on public.areas;
create policy "areas_read_assigned_or_admin" on public.areas
for select to authenticated using (public.is_system_admin() or exists (
  select 1 from public.area_members am
  where am.area_id = id and am.user_id = auth.uid() and am.status = 'active'
));

-- Area memberships: members can see memberships in their areas; system admin can see all.
drop policy if exists "area_members_read_area_or_admin" on public.area_members;
create policy "area_members_read_area_or_admin" on public.area_members
for select to authenticated using (public.is_system_admin() or public.has_area_access(area_id));

-- Only system admin or level 1 can create/update memberships in the area.
drop policy if exists "area_members_insert_manager" on public.area_members;
create policy "area_members_insert_manager" on public.area_members
for insert to authenticated with check (public.can_manage_area(area_id) and created_by = auth.uid());

drop policy if exists "area_members_update_manager" on public.area_members;
create policy "area_members_update_manager" on public.area_members
for update to authenticated using (public.can_manage_area(area_id)) with check (public.can_manage_area(area_id));

-- Announcements: area members read published notices; managers can read drafts and manage.
drop policy if exists "announcements_read" on public.announcements;
create policy "announcements_read" on public.announcements
for select to authenticated using (
  public.can_manage_area(area_id) or (public.has_area_access(area_id) and is_published = true)
);
drop policy if exists "announcements_insert_manager" on public.announcements;
create policy "announcements_insert_manager" on public.announcements
for insert to authenticated with check (public.can_manage_area(area_id) and created_by = auth.uid());
drop policy if exists "announcements_update_manager" on public.announcements;
create policy "announcements_update_manager" on public.announcements
for update to authenticated using (public.can_manage_area(area_id)) with check (public.can_manage_area(area_id));
drop policy if exists "announcements_delete_manager" on public.announcements;
create policy "announcements_delete_manager" on public.announcements
for delete to authenticated using (public.can_manage_area(area_id));

-- Contacts and tasks are limited to assigned area; management requires level 1.
drop policy if exists "contacts_read_area" on public.contacts;
create policy "contacts_read_area" on public.contacts
for select to authenticated using (public.has_area_access(area_id));
drop policy if exists "contacts_insert_manager" on public.contacts;
create policy "contacts_insert_manager" on public.contacts
for insert to authenticated with check (public.can_manage_area(area_id) and created_by = auth.uid());
drop policy if exists "contacts_update_manager" on public.contacts;
create policy "contacts_update_manager" on public.contacts
for update to authenticated using (public.can_manage_area(area_id)) with check (public.can_manage_area(area_id));
drop policy if exists "contacts_delete_manager" on public.contacts;
create policy "contacts_delete_manager" on public.contacts
for delete to authenticated using (public.can_manage_area(area_id));

drop policy if exists "tasks_read_area" on public.tasks;
create policy "tasks_read_area" on public.tasks
for select to authenticated using (public.has_area_access(area_id));
drop policy if exists "tasks_insert_manager" on public.tasks;
create policy "tasks_insert_manager" on public.tasks
for insert to authenticated with check (public.can_manage_area(area_id) and created_by = auth.uid());
drop policy if exists "tasks_update_manager" on public.tasks;
create policy "tasks_update_manager" on public.tasks
for update to authenticated using (public.can_manage_area(area_id)) with check (public.can_manage_area(area_id));

-- Documents: general/internal/restricted all currently area-readable; tighten this policy
-- before uploading any sensitive documents.
drop policy if exists "documents_read_area" on public.documents;
create policy "documents_read_area" on public.documents
for select to authenticated using (public.has_area_access(area_id));
drop policy if exists "documents_insert_manager" on public.documents;
create policy "documents_insert_manager" on public.documents
for insert to authenticated with check (public.can_manage_area(area_id) and created_by = auth.uid());

-- Handover records visible to system admin and managers of that area.
drop policy if exists "handover_read_manager" on public.handover_records;
create policy "handover_read_manager" on public.handover_records
for select to authenticated using (public.can_manage_area(area_id));
drop policy if exists "handover_insert_manager" on public.handover_records;
create policy "handover_insert_manager" on public.handover_records
for insert to authenticated with check (public.can_manage_area(area_id) and from_user_id = auth.uid());

-- Audit logs: system admin only for reading; inserts restricted by authenticated identity.
drop policy if exists "audit_read_admin" on public.audit_logs;
create policy "audit_read_admin" on public.audit_logs
for select to authenticated using (public.is_system_admin());
drop policy if exists "audit_insert_self" on public.audit_logs;
create policy "audit_insert_self" on public.audit_logs
for insert to authenticated with check (actor_id = auth.uid());

-- A newly registered account gets a basic profile; it does NOT receive management rights.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, global_role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), 'user')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- IMPORTANT: Do not grant system_admin from the browser.
-- Bootstrap the first system administrator manually in SQL Editor after signing up:
-- update public.profiles set global_role = 'system_admin' where id = 'AUTH_USER_UUID_HERE';
-- Use the exact auth.users UUID for your own verified admin account, and do this only once.
