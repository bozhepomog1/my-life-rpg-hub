-- Life RPG Hub — проверка исправлений из rls-audit-fixes.sql
--
-- Тот же принцип, что и в verify-privacy.sql: каждый запрос ниже
-- имитирует ПРЯМОЙ вызов REST API в обход интерфейса. Файл специально
-- пытается сделать то, чего делать нельзя, — если политика реализована
-- только во фронтенде, здесь она не сработает.
--
-- ═══════════════════════════════════════════════════════════════════════
-- КАК ЗАПУСКАТЬ (Dashboard → SQL Editor → New query)
--
-- SQL Editor ходит в базу под ролью postgres, которая RLS игнорирует, —
-- поэтому надо явно переключиться на authenticated и подставить
-- конкретного пользователя, как делает настоящий клиент со своим JWT.
-- Это и делает set_config('request.jwt.claims', ...).
--
-- !!! ВАЖНО: ЗАПУСКАЙ БЛОКИ ПО ОДНОМУ (выделить блок → Run).
-- Половина тестов ДОЛЖНА падать с ошибкой — это и есть успех. Но
-- упавший запрос обрывает всю транзакцию, поэтому если выделить сразу
-- весь файл, всё после первой (ожидаемой) ошибки не выполнится.
-- Каждый блок самодостаточен: у него свои begin/rollback.
--
-- Подставь три реальных uuid (взять: select user_id, username, short_code
-- from public.profiles;):
--   <ПОДСТАВЬ_UUID_ME>       — от чьего имени «заходим»
--   <ПОДСТАВЬ_UUID_STRANGER> — тот, с кем у :me НЕТ ни дружбы, ни заявки
--   <ПОДСТАВЬ_UUID_ЖЕРТВЫ>   — любой третий, вообще не связанный с :me
--                              (нужен только в ТЕСТЕ 3)
--
-- Все тесты завёрнуты в begin/rollback — база после прогона остаётся в
-- исходном состоянии, тестовые заявки в друзья не сохраняются.
-- ═══════════════════════════════════════════════════════════════════════


-- ═════════════════════════════════════════════════════════════
-- ТЕСТ 0. Контроль: убеждаемся, что подмена роли вообще работает.
-- ОЖИДАЕМО: acting_as = подставленный uuid, is_authenticated = true.
-- Если acting_as пустой — все последующие тесты ничего не проверяют.
-- ═════════════════════════════════════════════════════════════
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '<ПОДСТАВЬ_UUID_ME>', 'role', 'authenticated')::text,
  true
);
select auth.uid() as acting_as, auth.uid() is not null as is_authenticated;
rollback;


-- ═════════════════════════════════════════════════════════════
-- ТЕСТ 1. [C1] ГЛАВНЫЙ ТЕСТ. Подделка принятой дружбы одной вставкой.
--
-- До фикса это срабатывало и мгновенно давало доступ к friend_profiles
-- и полной строке profiles любого пользователя, чей uuid известен.
--
-- ОЖИДАЕМО: ОШИБКА
--   new row violates row-level security policy for table "friend_requests"
-- Если строка вставилась — фикс не применён.
-- ═════════════════════════════════════════════════════════════
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '<ПОДСТАВЬ_UUID_ME>', 'role', 'authenticated')::text,
  true
);

insert into public.friend_requests (from_user, to_user, status)
values ('<ПОДСТАВЬ_UUID_ME>', '<ПОДСТАВЬ_UUID_STRANGER>', 'accepted');

rollback;


-- ═════════════════════════════════════════════════════════════
-- ТЕСТ 2. [C2] Отправитель принимает собственную заявку.
--
-- Легальная pending-заявка (вставка должна ПРОЙТИ), а затем попытка
-- самому же перевести её в accepted.
--
-- ОЖИДАЕМО: insert проходит; update возвращает 0 строк
--   (UPDATE 0) — политика просто не видит эту строку как доступную для
--   изменения, потому что я не to_user. Затем контрольный select должен
--   показать status = 'pending', а is_accepted_friend = false.
-- Если после update статус стал accepted — фикс не применён.
-- ═════════════════════════════════════════════════════════════
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '<ПОДСТАВЬ_UUID_ME>', 'role', 'authenticated')::text,
  true
);

insert into public.friend_requests (from_user, to_user, status)
values ('<ПОДСТАВЬ_UUID_ME>', '<ПОДСТАВЬ_UUID_STRANGER>', 'pending');

update public.friend_requests
   set status = 'accepted'
 where from_user = '<ПОДСТАВЬ_UUID_ME>'
   and to_user = '<ПОДСТАВЬ_UUID_STRANGER>';

select status, public.is_accepted_friend('<ПОДСТАВЬ_UUID_STRANGER>') as now_friends
  from public.friend_requests
 where from_user = '<ПОДСТАВЬ_UUID_ME>'
   and to_user = '<ПОДСТАВЬ_UUID_STRANGER>';

rollback;


-- ═════════════════════════════════════════════════════════════
-- ТЕСТ 3. [C3] Подмена участников уже существующей заявки.
--
-- Сценарий: у меня есть заявка, где Я — получатель (to_user). Пытаюсь
-- переписать from_user на постороннего, чтобы «подружиться» с человеком,
-- который мне ничего не отправлял.
--
-- Для чистоты теста строку создаём тут же от имени постороннего
-- (под postgres, до переключения роли), а потом переключаемся на себя.
--
-- ОЖИДАЕМО: ОШИБКА
--   friend_request participants cannot be changed
-- ═════════════════════════════════════════════════════════════
begin;

-- подготовка под postgres: посторонний шлёт мне заявку
insert into public.friend_requests (from_user, to_user, status)
values ('<ПОДСТАВЬ_UUID_STRANGER>', '<ПОДСТАВЬ_UUID_ME>', 'pending')
on conflict (from_user, to_user) do nothing;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '<ПОДСТАВЬ_UUID_ME>', 'role', 'authenticated')::text,
  true
);

-- я получатель, поэтому with check пропустит — заблокировать должен триггер
update public.friend_requests
   set from_user = '<ПОДСТАВЬ_UUID_ЖЕРТВЫ>', status = 'accepted'
 where to_user = '<ПОДСТАВЬ_UUID_ME>'
   and from_user = '<ПОДСТАВЬ_UUID_STRANGER>';

rollback;


-- ═════════════════════════════════════════════════════════════
-- ТЕСТ 3b. Легальный путь всё ещё работает (проверка, что не сломали).
--
-- Тот же сценарий, но я честно принимаю входящую заявку.
-- ОЖИДАЕМО: UPDATE 1, статус accepted, now_friends = true.
-- Если здесь ошибка — политика перекручена и приложение сломано.
-- ═════════════════════════════════════════════════════════════
begin;

insert into public.friend_requests (from_user, to_user, status)
values ('<ПОДСТАВЬ_UUID_STRANGER>', '<ПОДСТАВЬ_UUID_ME>', 'pending')
on conflict (from_user, to_user) do nothing;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '<ПОДСТАВЬ_UUID_ME>', 'role', 'authenticated')::text,
  true
);

update public.friend_requests
   set status = 'accepted'
 where to_user = '<ПОДСТАВЬ_UUID_ME>'
   and from_user = '<ПОДСТАВЬ_UUID_STRANGER>';

select status, public.is_accepted_friend('<ПОДСТАВЬ_UUID_STRANGER>') as now_friends
  from public.friend_requests
 where to_user = '<ПОДСТАВЬ_UUID_ME>'
   and from_user = '<ПОДСТАВЬ_UUID_STRANGER>';

rollback;


-- ═════════════════════════════════════════════════════════════
-- ТЕСТ 4. Заявка самому себе.
-- ОЖИДАЕМО: ОШИБКА (нарушение row-level security policy либо
-- ограничения friend_requests_no_self).
-- ═════════════════════════════════════════════════════════════
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '<ПОДСТАВЬ_UUID_ME>', 'role', 'authenticated')::text,
  true
);

insert into public.friend_requests (from_user, to_user, status)
values ('<ПОДСТАВЬ_UUID_ME>', '<ПОДСТАВЬ_UUID_ME>', 'pending');

rollback;


-- ═════════════════════════════════════════════════════════════
-- ТЕСТ 5. [M1] Захват чужого email.
--
-- Пытаюсь записать в СВОЮ строку user_emails адрес, который мне не
-- принадлежит (возьми любой заведомо чужой/несуществующий).
--
-- ОЖИДАЕМО: ОШИБКА
--   user_emails.email must match the account's own email
-- ═════════════════════════════════════════════════════════════
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '<ПОДСТАВЬ_UUID_ME>', 'role', 'authenticated')::text,
  true
);

insert into public.user_emails (user_id, email)
values ('<ПОДСТАВЬ_UUID_ME>', 'someone-elses-address@example.com')
on conflict (user_id) do update set email = excluded.email;

rollback;


-- ═════════════════════════════════════════════════════════════
-- ТЕСТ 6. Массовые выгрузки по всем таблицам разом.
--
-- ОЖИДАЕМО (при условии, что у :me нет принятых друзей —
-- иначе к «своим» строкам добавятся строки друзей):
--   profiles_rows        = 1   (только я)
--   friend_profiles_rows = 1   (только я; 0, если строка ещё не создана)
--   game_states_rows     = 1   (только я)
--   user_emails_rows     = 1   (только я)
--   push_rows            = число МОИХ устройств
--   friend_requests_rows = только заявки, где я одна из сторон
--
-- Ни одно из этих чисел не должно равняться общему числу строк в
-- таблице (сравни с контрольным блоком в самом конце файла).
-- ═════════════════════════════════════════════════════════════
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '<ПОДСТАВЬ_UUID_ME>', 'role', 'authenticated')::text,
  true
);

select
  (select count(*) from public.profiles)          as profiles_rows,
  (select count(*) from public.friend_profiles)   as friend_profiles_rows,
  (select count(*) from public.game_states)       as game_states_rows,
  (select count(*) from public.user_emails)       as user_emails_rows,
  (select count(*) from public.push_subscriptions) as push_rows,
  (select count(*) from public.friend_requests)   as friend_requests_rows;

rollback;


-- ═════════════════════════════════════════════════════════════
-- ТЕСТ 7. Точечное чтение чужих строк по известному uuid.
-- ОЖИДАЕМО: везде 0 строк.
--
-- Это те самые «квесты / покупки / БЖУ / замеры тела / читмилы»:
-- отдельных таблиц у них нет, всё лежит в game_states.state (JSONB),
-- поэтому достаточно убедиться, что чужой game_states недоступен.
-- ═════════════════════════════════════════════════════════════
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '<ПОДСТАВЬ_UUID_ME>', 'role', 'authenticated')::text,
  true
);

select 'game_states' as t, count(*) from public.game_states
  where user_id = '<ПОДСТАВЬ_UUID_STRANGER>'
union all
select 'profiles', count(*) from public.profiles
  where user_id = '<ПОДСТАВЬ_UUID_STRANGER>'
union all
select 'friend_profiles', count(*) from public.friend_profiles
  where user_id = '<ПОДСТАВЬ_UUID_STRANGER>'
union all
select 'user_emails', count(*) from public.user_emails
  where user_id = '<ПОДСТАВЬ_UUID_STRANGER>'
union all
select 'push_subscriptions', count(*) from public.push_subscriptions
  where user_id = '<ПОДСТАВЬ_UUID_STRANGER>';

rollback;


-- ═════════════════════════════════════════════════════════════
-- ТЕСТ 8. Попытка ЗАПИСАТЬ в чужие строки.
-- ОЖИДАЕМО: везде UPDATE 0 (политика не видит чужую строку).
-- Ни одна из строк не должна измениться.
-- ═════════════════════════════════════════════════════════════
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '<ПОДСТАВЬ_UUID_ME>', 'role', 'authenticated')::text,
  true
);

update public.profiles set username = 'HACKED'
  where user_id = '<ПОДСТАВЬ_UUID_STRANGER>';

update public.friend_profiles set current_streak = 9999
  where user_id = '<ПОДСТАВЬ_UUID_STRANGER>';

update public.game_states set state = '{}'::jsonb
  where user_id = '<ПОДСТАВЬ_UUID_STRANGER>';

rollback;


-- ═════════════════════════════════════════════════════════════
-- ТЕСТ 9. Попытка УДАЛИТЬ чужие строки.
-- ОЖИДАЕМО: везде DELETE 0.
-- (Политики delete из раздела 3 миграции разрешают удалять только своё.)
-- ═════════════════════════════════════════════════════════════
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '<ПОДСТАВЬ_UUID_ME>', 'role', 'authenticated')::text,
  true
);

delete from public.profiles        where user_id = '<ПОДСТАВЬ_UUID_STRANGER>';
delete from public.friend_profiles where user_id = '<ПОДСТАВЬ_UUID_STRANGER>';
delete from public.game_states     where user_id = '<ПОДСТАВЬ_UUID_STRANGER>';
delete from public.user_emails     where user_id = '<ПОДСТАВЬ_UUID_STRANGER>';

rollback;


-- ═════════════════════════════════════════════════════════════
-- ТЕСТ 10. Подмена владельца собственной строки (перенос на чужой uuid).
-- ОЖИДАЕМО: UPDATE 0 либо ошибка нарушения RLS — with check не даст
-- сохранить строку с чужим user_id.
-- ═════════════════════════════════════════════════════════════
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '<ПОДСТАВЬ_UUID_ME>', 'role', 'authenticated')::text,
  true
);

update public.game_states
   set user_id = '<ПОДСТАВЬ_UUID_STRANGER>'
 where user_id = '<ПОДСТАВЬ_UUID_ME>';

rollback;


-- ═════════════════════════════════════════════════════════════
-- ТЕСТ 11. Все ли таблицы вообще под RLS и есть ли где-то `using (true)`.
--
-- Запускать под postgres (без переключения роли).
--
-- ОЖИДАЕМО:
--   • в первом запросе rls_enabled = true у ВСЕХ шести таблиц;
--   • второй запрос не возвращает ни одной строки. Любая строка здесь —
--     это политика, открытая всем подряд, ровно как была у profiles.
-- ═════════════════════════════════════════════════════════════
select relname as table_name, relrowsecurity as rls_enabled
  from pg_class
 where relnamespace = 'public'::regnamespace
   and relname in ('game_states','profiles','user_emails',
                   'friend_requests','friend_profiles','push_subscriptions')
 order by relname;

select schemaname, tablename, policyname, cmd, roles, qual, with_check
  from pg_policies
 where schemaname in ('public','storage')
   and (
     qual = 'true'
     or with_check = 'true'
     or roles::text like '%anon%'
     or roles = '{public}'
   )
 order by tablename, policyname;


-- ═════════════════════════════════════════════════════════════
-- ТЕСТ 12. Полный перечень действующих политик — для глазами-просмотра,
-- что ни одна таблица не осталась без нужной команды и что везде стоит
-- {authenticated}.
-- ═════════════════════════════════════════════════════════════
select tablename, cmd, policyname, roles
  from pg_policies
 where schemaname in ('public','storage')
 order by tablename, cmd, policyname;


-- ═════════════════════════════════════════════════════════════
-- КОНТРОЛЬ. Реальные размеры таблиц (под postgres, RLS не действует) —
-- чтобы сравнить с ТЕСТОМ 6.
-- ═════════════════════════════════════════════════════════════
select
  (select count(*) from public.profiles)           as total_profiles,
  (select count(*) from public.friend_profiles)    as total_friend_profiles,
  (select count(*) from public.game_states)        as total_game_states,
  (select count(*) from public.user_emails)        as total_user_emails,
  (select count(*) from public.push_subscriptions) as total_push,
  (select count(*) from public.friend_requests)    as total_friend_requests;
