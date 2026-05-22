create table if not exists public.contexts (
  id bigserial primary key,
  client_id text not null,
  title text not null,
  content text not null,
  content_hash text not null,
  created_at timestamptz not null default now()
);

alter table public.contexts enable row level security;

create unique index if not exists contexts_client_hash_idx
  on public.contexts (client_id, content_hash);

create index if not exists contexts_client_created_idx
  on public.contexts (client_id, created_at desc);

revoke all on table public.contexts from anon, authenticated;
revoke all on sequence public.contexts_id_seq from anon, authenticated;
