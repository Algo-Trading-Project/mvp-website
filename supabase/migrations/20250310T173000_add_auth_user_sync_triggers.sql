-- Ensure auth.users changes are mirrored into public.users via sync_user_from_auth()
-- Creates AFTER INSERT and AFTER UPDATE triggers. Safe to run multiple times.

do $$ begin
  perform 1 from pg_trigger where tgname = 'tr_auth_users_sync_after_insert';
  if not found then
    create trigger tr_auth_users_sync_after_insert
      after insert on auth.users
      for each row execute function public.sync_user_from_auth();
  end if;
end $$;

do $$ begin
  perform 1 from pg_trigger where tgname = 'tr_auth_users_sync_after_update';
  if not found then
    create trigger tr_auth_users_sync_after_update
      after update of raw_user_meta_data, email, last_sign_in_at on auth.users
      for each row execute function public.sync_user_from_auth();
  end if;
end $$;

