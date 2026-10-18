-- Run with `supabase test db` against a disposable Supabase test database.
-- The transaction rolls back all users and records created by this test.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(9);
insert into auth.users(id) values
 ('11111111-1111-4111-8111-111111111111'),
 ('22222222-2222-4222-8222-222222222222');
insert into public.learning_progress(user_id,state) values
 ('11111111-1111-4111-8111-111111111111','{"nickname":"A"}'),
 ('22222222-2222-4222-8222-222222222222','{"nickname":"B"}');
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select is((select count(*) from public.learning_progress),1::bigint,'A sees exactly one profile');
select is((select state->>'nickname' from public.learning_progress),'A','A reads own profile');
select results_eq($$with changed as (update public.learning_progress set state='{}' where user_id='22222222-2222-4222-8222-222222222222' returning 1) select count(*) from changed$$,$$values (0::bigint)$$,'A cannot update B');
select throws_ok($$insert into public.learning_progress(user_id,state) values ('33333333-3333-4333-8333-333333333333','{}')$$,'42501',null,'A cannot insert for another user');
select lives_ok($$update public.learning_progress set state='{"nickname":"A2"}' where version=1$$,'A can update own profile');
select is((select version from public.learning_progress),2::bigint,'Server increments version');
select results_eq($$with changed as (update public.learning_progress set state='{}' where version=1 returning 1) select count(*) from changed$$,$$values (0::bigint)$$,'Stale version does not overwrite');
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select is((select state->>'nickname' from public.learning_progress),'B','B has a separate profile');
set local role anon;
select throws_ok('select * from public.learning_progress','42501',null,'Visitors cannot read profiles');
select * from finish();
rollback;
