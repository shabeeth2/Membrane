create table if not exists contexts (
  id bigserial primary key,
  client_id text not null,
  title text not null,
  content text not null,
  content_hash text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists contexts_client_hash_idx
  on contexts (client_id, content_hash);

create index if not exists contexts_client_created_idx
  on contexts (client_id, created_at desc);
