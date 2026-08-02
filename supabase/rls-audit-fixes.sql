-- Life RPG Hub — полный аудит RLS по всем таблицам + исправления
--
-- Продолжение работы, начатой в privacy-migration.sql (там чинилась дыра
-- `using (true)` в profiles). Здесь тем же способом «взломана» каждая
-- оставшаяся таблица: для каждой политики задан вопрос «что я, обычный
-- залогиненный пользователь, смогу сделать прямым запросом к REST API в
-- обход интерфейса».
--
-- Запускать один раз в Supabase SQL Editor (Dashboard → SQL Editor → New
-- query). Идемпотентно, безопасно перегонять повторно. Ничего не удаляет.
-- Проверка результата — supabase/verify-rls-audit.sql.
--
-- ═══════════════════════════════════════════════════════════════════════
-- РЕЗУЛЬТАТ АУДИТА (что нашлось)
-- ═══════════════════════════════════════════════════════════════════════
--
-- КРИТИЧНО (реальная возможность добраться до чужих данных):
--
--   [C1] friend_requests INSERT позволял сразу вставить status='accepted'.
--        Политика проверяла только `auth.uid() = from_user` и НИЧЕГО не
--        говорила про статус. То есть одним прямым запросом
--        POST /rest/v1/friend_requests
--          {"from_user":"<я>","to_user":"<жертва>","status":"accepted"}
--        любой пользователь становился «принятым другом» кого угодно, чей
--        uuid он знает — без единого действия со стороны жертвы. А
--        принятая дружба открывает is_accepted_friend() → доступ к
--        friend_profiles (статы, стрики, достижения) и к полной строке
--        profiles (XP, уровень, индекс формы) даже у приватного профиля.
--        Ровно тот же класс дыры, что и `using (true)`: политика проверяла
--        не то поле.
--
--   [C2] friend_requests UPDATE позволял ОТПРАВИТЕЛЮ принять собственную
--        заявку. `using/with check (auth.uid() = from_user or auth.uid() =
--        to_user)` — то есть обе стороны могли менять статус. Отправитель
--        слал pending и следом сам же переводил его в accepted. Тот же
--        результат, что и [C1], но окольным путём.
--
--   [C3] friend_requests UPDATE позволял переписать самих участников.
--        `with check` требовал лишь, чтобы Я был одной из сторон НОВОЙ
--        строки. Значит, будучи to_user в своей же заявке, можно было
--        подменить from_user на uuid произвольной жертвы — и получить
--        строку (жертва → я, accepted), то есть дружбу с человеком,
--        который вообще ни при чём. Даже после фикса [C2] это осталось бы
--        рабочим обходом, поэтому чинится отдельно, триггером.
--
-- СРЕДНЕ:
--
--   [M1] user_emails позволял записать в свою строку ЛЮБОЙ адрес, а не
--        только свой собственный. Прочитать чужой нельзя (политика на
--        select корректная), но можно было «занять» чужой ещё не
--        зарегистрированный адрес: уникальный индекс по lower(email) потом
--        ломал синхронизацию настоящему владельцу, а find_user_by_email()
--        по этому адресу находил бы захватчика. Подмена личности в поиске
--        друзей по почте.
--
-- НИЗКО / доработки (сейчас fail-closed, дыры нет, но состояние неполное):
--
--   [L1] Нет политик DELETE на profiles, friend_profiles, user_emails.
--        RLS без политики запрещает операцию, так что утечки нет — но
--        пользователь физически не может удалить собственные данные.
--   [L2] Политики storage.objects (бакет quest-photos — там же аватары и
--        фоны, см. avatar-photo.ts / background-photo.ts) не ограничены
--        `to authenticated`. Практически anon всё равно отсекается
--        (auth.uid() = NULL → условие не истинно), но это единственное
--        место в проекте, выпадающее из общего правила.
--   [L3] Нет `revoke ... from anon` на friend_requests, friend_profiles,
--        user_emails — в отличие от game_states/profiles/push_subscriptions.
--        Снова fail-closed (все политики `to authenticated`), но защита в
--        глубину неполная.
--   [L4] push_subscriptions описана только в push-notifications-migration.sql
--        и отсутствует в schema.sql — установка «с нуля» по одному
--        schema.sql оставляет приложение без этой таблицы.
--
-- ПРОВЕРЕНО И ПРИЗНАНО КОРРЕКТНЫМ (менять не нужно):
--
--   • game_states — select/insert/update/delete строго `auth.uid() =
--     user_id`, anon отозван. Это самая важная таблица: КВЕСТЫ, ПОКУПКИ И
--     ЗОЛОТО МАГАЗИНА, ЗАПИСИ БЖУ, ЗАМЕРЫ ТЕЛА И РЕКОРДЫ, ЧИТМИЛЫ, залог,
--     марафоны — всё это поля внутри одного JSONB-блоба state, отдельных
--     таблиц у них нет (см. GameState в src/lib/game.ts). Поэтому вся эта
--     категория данных закрыта одной политикой «строку видит только её
--     владелец», и посторонний не достаёт её ничем, включая прямой запрос.
--   • profiles — после privacy-migration.sql: своя строка + принятые
--     друзья; массовая выгрузка закрыта, редакция приватных полей живёт в
--     SECURITY DEFINER функциях.
--   • friend_profiles — своя строка + принятые друзья через
--     is_accepted_friend(); записи только в свою строку.
--   • user_emails SELECT — только своя строка, чужие адреса недоступны.
--   • push_subscriptions — select/insert/delete только свои, update-политики
--     нет вовсе (клиент делает delete+insert), значит update запрещён.
--   • find_user_by_email / find_profile_by_code / get_visible_profiles /
--     is_accepted_friend / has_pending_request_with — все SECURITY DEFINER,
--     все с `set search_path`, все с revoke от public/anon, ни одна не
--     принимает шаблон/LIKE и не отдаёт список, по которому можно было бы
--     перебрать базу.
--
-- ОСТАТОЧНЫЕ РИСКИ (осознанно НЕ чиню здесь, чтобы не менять поведение
-- приложения молча — вынесены в конец файла отдельным комментарием):
--   • перебор коротких кодов через find_profile_by_code();
--   • подстановка чужого push-endpoint в push_subscriptions;
--   • клиент сам себе пишет XP/золото в game_states (читерство в свою
--     пользу, не утечка).
-- ═══════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────
-- 1. [C1][C2][C3] friend_requests — главный фикс этого аудита.
--
--    Новая модель прав, повторяющая то, что и так делает интерфейс
--    (см. src/lib/friends.ts — отправитель НИКОГДА не вызывает update,
--    отмена заявки у него идёт через delete):
--      • INSERT  — только от своего имени, только status='pending',
--                  и нельзя добавить самого себя.
--      • UPDATE  — только получатель (to_user), только смена статуса на
--                  accepted/declined, участников и дату менять нельзя.
--      • DELETE  — любая из сторон (отменить свою заявку / удалить из
--                  друзей) — остаётся как было, это корректно.
--      • SELECT  — обе стороны видят строку — остаётся как было.
-- ─────────────────────────────────────────────────────────────

-- Нельзя отправить заявку самому себе. NOT VALID — чтобы миграция не
-- падала, если в базе уже есть такая строка со времён старой политики;
-- на новые вставки ограничение действует сразу.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'friend_requests_no_self'
  ) then
    alter table public.friend_requests
      add constraint friend_requests_no_self check (from_user <> to_user) not valid;
  end if;
end $$;

-- [C1] Заявку можно создать только как pending и только от своего имени.
drop policy if exists "send friend_request" on public.friend_requests;
create policy "send friend_request"
  on public.friend_requests for insert
  to authenticated
  with check (
    auth.uid() = from_user
    and from_user <> to_user
    and status = 'pending'
  );

-- [C2] Отвечать на заявку может ТОЛЬКО получатель. Отправителю update не
-- нужен вообще: отменить свою заявку он может delete-политикой ниже.
drop policy if exists "update own friend_requests" on public.friend_requests;
drop policy if exists "respond to received friend_request" on public.friend_requests;
create policy "respond to received friend_request"
  on public.friend_requests for update
  to authenticated
  using (auth.uid() = to_user)
  with check (auth.uid() = to_user);

-- [C3] Политика `with check` проверяет только НОВУЮ строку целиком, а не
-- «что именно изменилось» — поэтому она не способна запретить подмену
-- from_user/to_user (новая строка всё ещё удовлетворяет `auth.uid() =
-- to_user`). Такое выражается только триггером.
create or replace function public.enforce_friend_request_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.from_user is distinct from old.from_user
     or new.to_user is distinct from old.to_user then
    raise exception 'friend_request participants cannot be changed';
  end if;
  if new.id is distinct from old.id or new.created_at is distinct from old.created_at then
    raise exception 'friend_request identity/created_at cannot be changed';
  end if;
  -- Обратно в pending статус не возвращается: иначе принятую дружбу можно
  -- было бы бесконечно «переоткрывать», обходя намерение получателя.
  if new.status not in ('accepted', 'declined') then
    raise exception 'friend_request status can only be changed to accepted or declined';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_friend_requests_guard on public.friend_requests;
create trigger trg_friend_requests_guard
  before update on public.friend_requests
  for each row execute function public.enforce_friend_request_update();

-- Delete/select оставляем как есть, они корректны — пересоздаём только для
-- идемпотентности и чтобы всё, что касается таблицы, лежало в одном месте.
drop policy if exists "read own friend_requests" on public.friend_requests;
create policy "read own friend_requests"
  on public.friend_requests for select
  to authenticated
  using (auth.uid() = from_user or auth.uid() = to_user);

drop policy if exists "delete own friend_requests" on public.friend_requests;
create policy "delete own friend_requests"
  on public.friend_requests for delete
  to authenticated
  using (auth.uid() = from_user or auth.uid() = to_user);


-- ─────────────────────────────────────────────────────────────
-- 2. [M1] user_emails — адрес в строке обязан совпадать с реальным
--    адресом аккаунта из auth.users.
--
--    SECURITY DEFINER нужен, чтобы триггер мог заглянуть в auth.users
--    (обычному authenticated она недоступна). Функция ничего не
--    возвращает наружу и не принимает пользовательских параметров, кроме
--    самой строки, — перебрать ей чужие адреса нельзя, она только
--    сравнивает переданный адрес с уже известным ей настоящим.
-- ─────────────────────────────────────────────────────────────
create or replace function public.enforce_own_email()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  real_email text;
begin
  select u.email into real_email from auth.users u where u.id = new.user_id;
  if real_email is null then
    raise exception 'no auth user for %', new.user_id;
  end if;
  if lower(btrim(new.email)) is distinct from lower(btrim(real_email)) then
    raise exception 'user_emails.email must match the account''s own email';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_user_emails_own_address on public.user_emails;
create trigger trg_user_emails_own_address
  before insert or update on public.user_emails
  for each row execute function public.enforce_own_email();


-- ─────────────────────────────────────────────────────────────
-- 3. [L1] Недостающие политики DELETE — «удалить свои данные».
--
--    Сейчас RLS без DELETE-политики просто запрещает удаление (fail-closed,
--    дыры нет), но и владелец не может убрать собственную строку. Даём
--    удалять СТРОГО свою и только свою.
-- ─────────────────────────────────────────────────────────────
drop policy if exists "delete own profile" on public.profiles;
create policy "delete own profile"
  on public.profiles for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "delete own extended profile" on public.friend_profiles;
create policy "delete own extended profile"
  on public.friend_profiles for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "delete own email" on public.user_emails;
create policy "delete own email"
  on public.user_emails for delete
  to authenticated
  using (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────
-- 4. [L3] Защита в глубину: отзываем права у anon и выдаём явные
--    (а не унаследованные по умолчанию) права authenticated —
--    так же, как это уже сделано для game_states/profiles.
--
--    Смысл: если когда-нибудь политика будет случайно удалена или
--    переписана без `to authenticated`, таблица всё равно не откроется
--    для незалогиненных.
-- ─────────────────────────────────────────────────────────────
revoke all on public.friend_requests from anon;
grant select, insert, update, delete on public.friend_requests to authenticated;

revoke all on public.friend_profiles from anon;
grant select, insert, update, delete on public.friend_profiles to authenticated;

revoke all on public.user_emails from anon;
grant select, insert, update, delete on public.user_emails to authenticated;

revoke all on public.profiles from anon;
grant select, insert, update, delete on public.profiles to authenticated;

revoke all on public.game_states from anon;
grant select, insert, update, delete on public.game_states to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 5. [L4] push_subscriptions — дублируем определение из
--    push-notifications-migration.sql, чтобы таблица и её RLS гарантированно
--    существовали независимо от того, какой файл прогонялся.
--    Полностью идемпотентно, существующие строки не трогает.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

revoke all on public.push_subscriptions from anon;
grant select, insert, delete on public.push_subscriptions to authenticated;

drop policy if exists "select own push subscriptions" on public.push_subscriptions;
create policy "select own push subscriptions"
  on public.push_subscriptions for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "insert own push subscriptions" on public.push_subscriptions;
create policy "insert own push subscriptions"
  on public.push_subscriptions for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "delete own push subscriptions" on public.push_subscriptions;
create policy "delete own push subscriptions"
  on public.push_subscriptions for delete
  to authenticated
  using (auth.uid() = user_id);
-- UPDATE-политики намеренно нет: клиент пересоздаёт подписку через
-- delete+insert (src/lib/push.ts), значит update должен быть запрещён.


-- ─────────────────────────────────────────────────────────────
-- 6. [L2] storage.objects (бакет quest-photos) — те же правила, но
--    явно `to authenticated`.
--
--    В этом бакете лежат не только фото-подтверждения квестов, но и
--    аватары и фоны (avatar-photo.ts / background-photo.ts) — все под
--    префиксом "<user_id>/...", поэтому разграничение по первому сегменту
--    пути закрывает все три сценария сразу.
--
--    У UPDATE добавлен явный `with check`: без него Postgres подставляет
--    туда выражение из `using`, что работает верно, но полагаться на
--    неявное поведение в политике безопасности не стоит.
-- ─────────────────────────────────────────────────────────────
drop policy if exists "read own quest photos" on storage.objects;
create policy "read own quest photos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'quest-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "upload own quest photos" on storage.objects;
create policy "upload own quest photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'quest-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "update own quest photos" on storage.objects;
create policy "update own quest photos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'quest-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'quest-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "delete own quest photos" on storage.objects;
create policy "delete own quest photos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'quest-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );


-- ─────────────────────────────────────────────────────────────
-- 7. Мелкая доработка: фиксируем search_path у обычных (не SECURITY
--    DEFINER) функций-триггеров. Риск низкий — они выполняются с правами
--    вызывающего, — но у всех SECURITY DEFINER функций проекта search_path
--    уже прибит, и незачем оставлять исключения.
-- ─────────────────────────────────────────────────────────────
alter function public.set_updated_at() set search_path = public, pg_temp;
alter function public.generate_short_code() set search_path = public, pg_temp;
alter function public.set_profile_short_code() set search_path = public, pg_temp;
alter function public.prevent_short_code_change() set search_path = public, pg_temp;


-- ═══════════════════════════════════════════════════════════════════════
-- ОСТАТОЧНЫЕ РИСКИ — сознательно НЕ закрыты этой миграцией
-- ═══════════════════════════════════════════════════════════════════════
--
-- 1. Перебор коротких кодов. find_profile_by_code() отдаёт по одному
--    точному коду, без LIKE и без списка, но код — это 7 символов из
--    31-символьного алфавита (~27 млрд комбинаций). Целенаправленный
--    перебор теоретически возможен. Лечится не SQL-политикой, а
--    ограничением частоты запросов на уровне API (Supabase Dashboard →
--    Auth/API rate limits) — поэтому оставляю решение за тобой, а не
--    меняю поведение поиска молча.
--
-- 2. Подстановка чужого push-endpoint. endpoint объявлен UNIQUE глобально,
--    и вставить строку со СВОИМ user_id, но с чужим (каким-то образом
--    узнанным) endpoint, политика не запрещает: проверить принадлежность
--    endpoint-а базе данных нечем. Последствия — чужое устройство получит
--    мои напоминания, а настоящий владелец перестанет получать свои
--    (unique violation при переподписке). Требует предварительной утечки
--    самого endpoint-а, который нигде не показывается в интерфейсе;
--    честная и полная защита здесь — проверка подписи на стороне Edge
--    Function, это отдельная задача, а не строчка в RLS.
--
-- 3. Клиент авторитетен для собственного game_states. Пользователь может
--    прямым запросом выставить себе любой XP, золото или достижения в
--    своём JSONB. Это читерство в свою пользу, а не доступ к чужому:
--    на данные других людей это никак не влияет. Настоящее лечение —
--    считать прогресс на сервере, что означало бы переписать игровую
--    логику целиком; для трекера привычек это осознанно избыточно.
--    Отмечаю явно, чтобы это было решением, а не недосмотром.
