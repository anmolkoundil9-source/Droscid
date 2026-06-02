begin;

alter table public.servers
add column if not exists image_url text;

commit;
