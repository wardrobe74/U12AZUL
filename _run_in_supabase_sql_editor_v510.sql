-- v5.1.0 additions (upload opponent logo, roster list & CSV, payments approvals, consent, exports)
-- Buckets
insert into storage.buckets (id, name, public) values ('game-logos','game-logos', false) on conflict (id) do nothing;

-- Payments workflow
do $$ begin
  alter table public.payments add column if not exists status text check (status in ('pending','approved','rejected','adjusted')) default 'pending';
  alter table public.payments add column if not exists note text;
  alter table public.payments add column if not exists approved_by uuid;
  alter table public.payments add column if not exists approved_at timestamptz;
exception when others then null; end $$;

-- Documents consent
do $$ begin
  alter table public.documents add column if not exists consent boolean default false;
  alter table public.documents add column if not exists consent_at timestamptz;
exception when others then null; end $$;

-- Storage policies for game-logos
create policy if not exists storage_games_admin_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'game-logos' and exists (select 1 from public.team_members tm where tm.user_id = auth.uid() and tm.role in ('admin','coach','coordinadora','treasurer')));

create policy if not exists storage_games_admin_read on storage.objects
for select to authenticated
using (bucket_id = 'game-logos');
