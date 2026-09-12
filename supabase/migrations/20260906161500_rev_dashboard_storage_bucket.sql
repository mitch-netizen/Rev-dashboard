insert into storage.buckets (id, name, public)
values ('revenue-source-documents', 'revenue-source-documents', false);

-- objects are stored as {venue_id}/{type}/{filename}; RLS keys off the
-- first path segment matching a venue the user belongs to.
create policy rev_source_documents_storage_select on storage.objects for select
  using (
    bucket_id = 'revenue-source-documents'
    and (storage.foldername(name))[1]::uuid in (select public.auth_venue_ids())
  );

create policy rev_source_documents_storage_insert on storage.objects for insert
  with check (
    bucket_id = 'revenue-source-documents'
    and (storage.foldername(name))[1]::uuid in (select public.auth_venue_ids())
    and public.auth_venue_role((storage.foldername(name))[1]::uuid) in ('admin', 'manager', 'coordinator')
  );
