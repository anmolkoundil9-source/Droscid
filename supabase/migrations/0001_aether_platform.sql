begin;

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  uid text not null unique,
  username text not null unique,
  display_name text not null,
  global_role text not null default 'member' check (global_role in ('member', 'primal', 'primal_lead')),
  title text,
  title_color text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.platform_settings (
  id integer primary key default 1,
  theme text not null default 'night' check (theme in ('night', 'cherry', 'halloween', 'valentine')),
  last_changed_at timestamptz,
  last_changed_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.platform_bans (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  banned_by uuid references public.profiles(id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.servers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  invite_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  theme text not null default 'night' check (theme in ('night', 'cherry', 'halloween', 'valentine')),
  created_at timestamptz not null default now()
);

create table if not exists public.server_memberships (
  server_id uuid not null references public.servers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  title text,
  title_color text,
  muted_until timestamptz,
  banned_until timestamptz,
  created_at timestamptz not null default now(),
  primary key (server_id, user_id)
);

create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers(id) on delete cascade,
  name text not null,
  slug text not null,
  description text not null default '',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (server_id, slug)
);

create table if not exists public.dm_threads (
  id uuid primary key default gen_random_uuid(),
  member_a_id uuid not null references public.profiles(id) on delete cascade,
  member_b_id uuid not null references public.profiles(id) on delete cascade,
  name text not null default 'Personal Messages',
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (member_a_id, member_b_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  server_id uuid references public.servers(id) on delete cascade,
  channel_id uuid references public.channels(id) on delete cascade,
  thread_id uuid references public.dm_threads(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  author_name text not null,
  author_title text,
  author_role text not null default 'member',
  content text not null default '',
  kind text not null default 'text' check (kind in ('text', 'system', 'image', 'video', 'gif')),
  reply_to_id uuid references public.messages(id) on delete set null,
  attachment jsonb,
  mentions text[] not null default '{}'::text[],
  system_tag text,
  created_at timestamptz not null default now(),
  check ((server_id is not null and channel_id is not null and thread_id is null) or (thread_id is not null and server_id is null and channel_id is null))
);

create or replace function public.aether_generate_uid()
returns text
language sql
stable
as $$
  select 'AETHER-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
$$;

create or replace function public.aether_is_primal_user(target_user_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = target_user_id
      and p.global_role in ('primal', 'primal_lead')
  );
$$;

create or replace function public.aether_is_lead_primal_user(target_user_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = target_user_id
      and p.global_role = 'primal_lead'
  );
$$;

create or replace function public.aether_server_role(target_user_id uuid, target_server_id uuid)
returns text
language sql
stable
as $$
  select case
    when exists (
      select 1
      from public.servers s
      where s.id = target_server_id and s.owner_id = target_user_id
    ) then 'owner'
    when exists (
      select 1
      from public.server_memberships m
      where m.server_id = target_server_id and m.user_id = target_user_id and m.role = 'admin'
    ) then 'admin'
    when exists (
      select 1
      from public.server_memberships m
      where m.server_id = target_server_id and m.user_id = target_user_id
    ) then 'member'
    else 'member'
  end;
$$;

create or replace function public.aether_can_manage_server(target_user_id uuid, target_server_id uuid)
returns boolean
language sql
stable
as $$
  select public.aether_is_primal_user(target_user_id)
    or public.aether_server_role(target_user_id, target_server_id) in ('owner', 'admin');
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  raw_username text := coalesce(nullif(new.raw_user_meta_data ->> 'username', ''), split_part(new.email, '@', 1));
  normalized_username text := initcap(raw_username);
  primal_role text := case
    when lower(raw_username) = 'raga' then 'primal_lead'
    when lower(raw_username) = 'kaysss' then 'primal'
    else 'member'
  end;
begin
  insert into public.profiles (
    id,
    uid,
    username,
    display_name,
    global_role,
    title,
    title_color,
    avatar_url
  ) values (
    new.id,
    public.aether_generate_uid(),
    raw_username,
    normalized_username,
    primal_role,
    case when primal_role in ('primal', 'primal_lead') then 'Team Primals' else null end,
    case when primal_role in ('primal', 'primal_lead') then '#ffd0df' else null end,
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
    set username = excluded.username,
        display_name = excluded.display_name,
        title = excluded.title,
        title_color = excluded.title_color,
        avatar_url = excluded.avatar_url;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_auth_user();

insert into public.platform_settings (id, theme)
values (1, 'night')
on conflict (id) do nothing;

alter table public.profiles enable row level security;
alter table public.platform_settings enable row level security;
alter table public.platform_bans enable row level security;
alter table public.servers enable row level security;
alter table public.server_memberships enable row level security;
alter table public.channels enable row level security;
alter table public.dm_threads enable row level security;
alter table public.messages enable row level security;

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
on public.profiles
for select
to authenticated
using (true);

drop policy if exists "profiles_update_self_or_primal" on public.profiles;
create policy "profiles_update_self_or_primal"
on public.profiles
for update
to authenticated
using (auth.uid() = id or public.aether_is_primal_user(auth.uid()))
with check (auth.uid() = id or public.aether_is_primal_user(auth.uid()));

drop policy if exists "platform_settings_select_primal" on public.platform_settings;
create policy "platform_settings_select_primal"
on public.platform_settings
for select
to authenticated
using (true);

drop policy if exists "platform_settings_update_primal" on public.platform_settings;
create policy "platform_settings_update_primal"
on public.platform_settings
for update
to authenticated
using (public.aether_is_primal_user(auth.uid()))
with check (public.aether_is_primal_user(auth.uid()));

drop policy if exists "platform_bans_select_primal" on public.platform_bans;
create policy "platform_bans_select_primal"
on public.platform_bans
for select
to authenticated
using (public.aether_is_primal_user(auth.uid()));

drop policy if exists "platform_bans_modify_primal" on public.platform_bans;
create policy "platform_bans_modify_primal"
on public.platform_bans
for all
to authenticated
using (public.aether_is_primal_user(auth.uid()))
with check (public.aether_is_primal_user(auth.uid()));

drop policy if exists "servers_select_accessible" on public.servers;
create policy "servers_select_accessible"
on public.servers
for select
to authenticated
using (
  public.aether_is_primal_user(auth.uid())
  or owner_id = auth.uid()
  or exists (
    select 1
    from public.server_memberships m
    where m.server_id = id and m.user_id = auth.uid()
  )
);

drop policy if exists "servers_insert_authenticated" on public.servers;
create policy "servers_insert_authenticated"
on public.servers
for insert
to authenticated
with check (owner_id = auth.uid());

drop policy if exists "servers_update_owner_or_primal" on public.servers;
create policy "servers_update_owner_or_primal"
on public.servers
for update
to authenticated
using (owner_id = auth.uid() or public.aether_is_primal_user(auth.uid()))
with check (owner_id = auth.uid() or public.aether_is_primal_user(auth.uid()));

drop policy if exists "servers_delete_owner_or_primal" on public.servers;
create policy "servers_delete_owner_or_primal"
on public.servers
for delete
to authenticated
using (owner_id = auth.uid() or public.aether_is_primal_user(auth.uid()));

drop policy if exists "server_memberships_select_accessible" on public.server_memberships;
create policy "server_memberships_select_accessible"
on public.server_memberships
for select
to authenticated
using (
  public.aether_is_primal_user(auth.uid())
  or user_id = auth.uid()
  or exists (
    select 1
    from public.servers s
    where s.id = server_id and s.owner_id = auth.uid()
  )
  or exists (
    select 1
    from public.server_memberships m
    where m.server_id = server_id and m.user_id = auth.uid()
  )
);

drop policy if exists "server_memberships_insert_self_or_primal" on public.server_memberships;
create policy "server_memberships_insert_self_or_primal"
on public.server_memberships
for insert
to authenticated
with check (
  public.aether_is_primal_user(auth.uid())
  or (
    user_id = auth.uid()
    and exists (
      select 1
      from public.servers s
      where s.id = server_id and s.owner_id = auth.uid()
    )
  )
);

drop policy if exists "server_memberships_update_moderator" on public.server_memberships;
create policy "server_memberships_update_moderator"
on public.server_memberships
for update
to authenticated
using (public.aether_can_manage_server(auth.uid(), server_id) or public.aether_is_primal_user(auth.uid()))
with check (public.aether_can_manage_server(auth.uid(), server_id) or public.aether_is_primal_user(auth.uid()));

drop policy if exists "server_memberships_delete_moderator" on public.server_memberships;
create policy "server_memberships_delete_moderator"
on public.server_memberships
for delete
to authenticated
using (public.aether_can_manage_server(auth.uid(), server_id) or public.aether_is_primal_user(auth.uid()));

drop policy if exists "channels_select_accessible" on public.channels;
create policy "channels_select_accessible"
on public.channels
for select
to authenticated
using (
  public.aether_is_primal_user(auth.uid())
  or exists (
    select 1
    from public.servers s
    where s.id = server_id and (
      s.owner_id = auth.uid()
      or exists (
        select 1
        from public.server_memberships m
        where m.server_id = s.id and m.user_id = auth.uid()
      )
    )
  )
);

drop policy if exists "channels_manage_moderator" on public.channels;
create policy "channels_manage_moderator"
on public.channels
for all
to authenticated
using (public.aether_can_manage_server(auth.uid(), server_id) or public.aether_is_primal_user(auth.uid()))
with check (public.aether_can_manage_server(auth.uid(), server_id) or public.aether_is_primal_user(auth.uid()));

drop policy if exists "dm_threads_select_member" on public.dm_threads;
create policy "dm_threads_select_member"
on public.dm_threads
for select
to authenticated
using (
  public.aether_is_primal_user(auth.uid())
  or member_a_id = auth.uid()
  or member_b_id = auth.uid()
);

drop policy if exists "dm_threads_insert_member" on public.dm_threads;
create policy "dm_threads_insert_member"
on public.dm_threads
for insert
to authenticated
with check (
  public.aether_is_primal_user(auth.uid())
  or member_a_id = auth.uid()
  or member_b_id = auth.uid()
);

drop policy if exists "dm_threads_update_member" on public.dm_threads;
create policy "dm_threads_update_member"
on public.dm_threads
for update
to authenticated
using (public.aether_is_primal_user(auth.uid()) or member_a_id = auth.uid() or member_b_id = auth.uid())
with check (public.aether_is_primal_user(auth.uid()) or member_a_id = auth.uid() or member_b_id = auth.uid());

drop policy if exists "messages_select_accessible" on public.messages;
create policy "messages_select_accessible"
on public.messages
for select
to authenticated
using (
  public.aether_is_primal_user(auth.uid())
  or (
    server_id is not null
    and exists (
      select 1
      from public.servers s
      where s.id = server_id and (
        s.owner_id = auth.uid()
        or exists (
          select 1
          from public.server_memberships m
          where m.server_id = s.id and m.user_id = auth.uid()
        )
      )
    )
  )
  or (
    thread_id is not null
    and exists (
      select 1
      from public.dm_threads t
      where t.id = thread_id and (t.member_a_id = auth.uid() or t.member_b_id = auth.uid())
    )
  )
);

drop policy if exists "messages_insert_authorized" on public.messages;
create policy "messages_insert_authorized"
on public.messages
for insert
to authenticated
with check (
  auth.uid() = author_id
  and (
    (
      server_id is not null
      and exists (
        select 1
        from public.servers s
        where s.id = server_id and (
          s.owner_id = auth.uid()
          or exists (
            select 1
            from public.server_memberships m
            where m.server_id = s.id and m.user_id = auth.uid()
              and (m.banned_until is null or m.banned_until < now())
              and (m.muted_until is null or m.muted_until < now())
            )
          )
        )
    )
    or (
      thread_id is not null
      and exists (
        select 1
        from public.dm_threads t
        where t.id = thread_id and (t.member_a_id = auth.uid() or t.member_b_id = auth.uid())
      )
    )
  )
);

drop policy if exists "messages_update_author_or_primal" on public.messages;
create policy "messages_update_author_or_primal"
on public.messages
for update
to authenticated
using (auth.uid() = author_id or public.aether_is_primal_user(auth.uid()))
with check (auth.uid() = author_id or public.aether_is_primal_user(auth.uid()));

drop policy if exists "messages_delete_author_or_primal" on public.messages;
create policy "messages_delete_author_or_primal"
on public.messages
for delete
to authenticated
using (auth.uid() = author_id or public.aether_is_primal_user(auth.uid()));

insert into storage.buckets (id, name, public)
values ('chat-media', 'chat-media', true)
on conflict (id) do nothing;

drop policy if exists "chat-media-select" on storage.objects;
create policy "chat-media-select"
on storage.objects
for select
to authenticated
using (bucket_id = 'chat-media');

drop policy if exists "chat-media-insert" on storage.objects;
create policy "chat-media-insert"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'chat-media');

drop policy if exists "chat-media-update" on storage.objects;
create policy "chat-media-update"
on storage.objects
for update
to authenticated
using (bucket_id = 'chat-media')
with check (bucket_id = 'chat-media');

drop policy if exists "chat-media-delete" on storage.objects;
create policy "chat-media-delete"
on storage.objects
for delete
to authenticated
using (bucket_id = 'chat-media');

commit;
