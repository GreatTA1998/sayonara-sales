-- Sayonara shop state (replaces single Blob JSON)
create table if not exists public.shops (
  id text primary key,
  address text not null default '',
  bio text not null default '',
  jimoty_url text not null default '',
  youtube_url text not null default '',
  line_invite_url text not null default '',
  phone text not null default '',
  slots text[],
  pickup_from text,
  pickup_to text,
  move_out text,
  published boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.items (
  id text primary key,
  shop_id text not null references public.shops(id) on delete cascade,
  name text not null default '',
  price integer,
  note text,
  claim_id text,
  photos text[] not null default '{}',
  paused boolean not null default false,
  pos integer not null default 0
);

create index if not exists items_shop_pos on public.items(shop_id, pos);

create table if not exists public.claims (
  id text primary key,
  shop_id text not null references public.shops(id) on delete cascade,
  code text not null,
  day text not null,
  slot text,
  item_ids text[] not null default '{}',
  contact text,
  contact_method text check (contact_method is null or contact_method in ('line', 'phone')),
  status text not null check (status in ('booked', 'picked_up', 'cancelled')),
  created_at timestamptz not null default now()
);

create index if not exists claims_shop_created on public.claims(shop_id, created_at desc);

alter table public.shops enable row level security;
alter table public.items enable row level security;
alter table public.claims enable row level security;
