-- Life RPG Hub — Приватность профиля (+ закрытие массовой выгрузки profiles)
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor → New query),
-- same as schema.sql. Safe to re-run.
--
-- ─────────────────────────────────────────────────────────────
-- ЧТО ЭТО ЧИНИТ
--
-- 1. КРИТИЧНОЕ, независимо от новой фичи: до этой миграции политика на
--    public.profiles была `using (true)` — то есть ЛЮБОЙ залогиненный
--    пользователь мог одним прямым запросом в обход интерфейса
--        GET /rest/v1/profiles?select=*
--    выгрузить username / avatar / total_xp / level / fitness_index /
--    short_code ВСЕХ пользователей приложения. Интерфейс показывал только
--    друзей, но это было ограничение фронтенда, а не базы. Здесь оно
--    становится ограничением базы.
--
-- 2. Новое поле profiles.is_private + «мягкая» приватность:
--    • Найти по короткому коду и отправить заявку в друзья можно КОМУ
--      УГОДНО, независимо от режима — приватность этого не ограничивает.
--    • Принятые друзья видят полный профиль приватного пользователя как
--      обычно (XP, уровень, индекс формы + всё из friend_profiles:
--      статы, стрики, достижения). На друзей приватность не влияет вообще.
--    • Посторонний (не принятый друг) видит у приватного пользователя
--      только имя и аватар — достаточно, чтобы убедиться, что добавляешь
--      того человека. Прогресс скрыт.
--
-- ─────────────────────────────────────────────────────────────
-- ПОЧЕМУ ЧЕРЕЗ SECURITY DEFINER, А НЕ ТОЛЬКО ЧЕРЕЗ RLS
--
-- RLS в Postgres — построчная, а не поколоночная: политикой нельзя
-- сказать «эту строку видно, но три колонки в ней — нет». Поэтому
-- редактирование (обнуление) полей прогресса для посторонних делается
-- внутри SECURITY DEFINER функций ниже, а сама таблица закрывается
-- жёстко: прямой SELECT возвращает только свою строку и строки принятых
-- друзей. Никакого «спрячем в UI» — посторонний физически не может
-- получить чужой прогресс ни через таблицу, ни через RPC.
--
-- Это тот же приём, которым в schema.sql уже закрыт слив email
-- (user_emails + find_user_by_email) — здесь он просто распространён на
-- profiles.
-- ─────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────
-- 1. Флаг приватности. По умолчанию false — существующие пользователи
--    остаются «открытыми», ничего не теряют.
-- ─────────────────────────────────────────────────────────────
alter table public.profiles add column if not exists is_private boolean not null default false;

-- ─────────────────────────────────────────────────────────────
-- 2. Хелпер: есть ли между вызывающим и p_other ОЖИДАЮЩАЯ заявка
--    (в любую сторону). Нужен, чтобы в списке входящих/исходящих заявок
--    были видны имя и аватар — иначе после ужесточения политики карточки
--    заявок превратились бы в безымянных «Пользователь».
--
--    SECURITY DEFINER по тем же причинам, что и is_accepted_friend в
--    schema.sql: чтобы проверка не зависела от политик friend_requests и
--    не рекурсировала через них. Принимает один uuid, который вызывающий
--    и так знает, возвращает только boolean — перечислить пользователей
--    или чужие связи через неё нельзя.
-- ─────────────────────────────────────────────────────────────
create or replace function public.has_pending_request_with(p_other uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.friend_requests
    where status = 'pending'
      and (
        (from_user = auth.uid() and to_user = p_other)
        or (from_user = p_other and to_user = auth.uid())
      )
  );
$$;

revoke all on function public.has_pending_request_with(uuid) from public, anon;
grant execute on function public.has_pending_request_with(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 3. ГЛАВНОЕ: снимаем `using (true)` с profiles.
--    Прямой SELECT теперь отдаёт только свою строку и строки ПРИНЯТЫХ
--    друзей — с полным прогрессом, в том числе если друг приватный
--    (приватность на друзей не распространяется).
--
--    Заявки (pending) сюда НЕ входят намеренно: их карточки идут через
--    get_visible_profiles() ниже, которая умеет отдать имя+аватар и при
--    этом вырезать прогресс у приватного пользователя. Если бы pending
--    был разрешён прямо здесь, RLS отдала бы строку целиком — вырезать
--    колонки политикой нельзя (см. шапку файла).
-- ─────────────────────────────────────────────────────────────
drop policy if exists "read profiles (authenticated)" on public.profiles;
drop policy if exists "read own and friends profiles" on public.profiles;
create policy "read own and friends profiles"
  on public.profiles for select
  to authenticated
  using (
    auth.uid() = user_id
    or public.is_accepted_friend(user_id)
  );

-- Defence-in-depth: как и у game_states/push_subscriptions, анонимный
-- (незалогиненный) доступ отзывается на уровне грантов, а не только
-- политикой.
revoke all on public.profiles from anon;

-- ─────────────────────────────────────────────────────────────
-- 4. Поиск по короткому коду.
--
--    Работает ВСЕГДА, и для открытых, и для приватных — «мягкая»
--    приватность не мешает найти человека и отправить ему заявку.
--    Но если найденный приватный и вы ещё не принятые друзья, поля
--    прогресса возвращаются как NULL: посторонний получает имя, аватар и
--    возможность добавить — и ничего больше.
--
--    Только точное совпадение кода, без LIKE, limit 1 — перебирать или
--    выгружать через неё нельзя.
-- ─────────────────────────────────────────────────────────────
drop function if exists public.find_profile_by_code(text);
create or replace function public.find_profile_by_code(p_code text)
returns table (
  user_id uuid,
  username text,
  avatar text,
  total_xp integer,
  level integer,
  fitness_index integer,
  short_code text,
  is_private boolean
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select
    p.user_id,
    p.username,
    p.avatar,
    case when not p.is_private or public.is_accepted_friend(p.user_id)
         then p.total_xp end,
    case when not p.is_private or public.is_accepted_friend(p.user_id)
         then p.level end,
    case when not p.is_private or public.is_accepted_friend(p.user_id)
         then p.fitness_index end,
    p.short_code,
    p.is_private
  from public.profiles p
  where p_code is not null
    and length(btrim(p_code)) > 0
    and p.short_code = upper(btrim(p_code))
    and p.user_id <> auth.uid()   -- себя не находим
  limit 1;
$$;

revoke all on function public.find_profile_by_code(text) from public, anon;
grant execute on function public.find_profile_by_code(text) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 5. Пакетное получение карточек профилей (лидерборд + карточки заявок).
--
--    Отдаёт строку ТОЛЬКО если вызывающий имеет к этому пользователю
--    отношение: это он сам, принятый друг, или между ними висит заявка.
--    Для постороннего из списка не вернётся ничего — то есть подсунуть
--    сюда чужие uuid и выкачать базу нельзя.
--
--    Прогресс вырезается ровно по тому же правилу, что и в поиске:
--    приватный + не принятый друг → NULL.
-- ─────────────────────────────────────────────────────────────
drop function if exists public.get_visible_profiles(uuid[]);
create or replace function public.get_visible_profiles(p_user_ids uuid[])
returns table (
  user_id uuid,
  username text,
  avatar text,
  total_xp integer,
  level integer,
  fitness_index integer,
  short_code text,
  is_private boolean
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select
    p.user_id,
    p.username,
    p.avatar,
    case when not p.is_private or public.is_accepted_friend(p.user_id)
         then p.total_xp end,
    case when not p.is_private or public.is_accepted_friend(p.user_id)
         then p.level end,
    case when not p.is_private or public.is_accepted_friend(p.user_id)
         then p.fitness_index end,
    p.short_code,
    p.is_private
  from public.profiles p
  where p.user_id = any(coalesce(p_user_ids, '{}'::uuid[]))
    and (
      p.user_id = auth.uid()
      or public.is_accepted_friend(p.user_id)
      or public.has_pending_request_with(p.user_id)
    );
$$;

revoke all on function public.get_visible_profiles(uuid[]) from public, anon;
grant execute on function public.get_visible_profiles(uuid[]) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 6. friend_profiles (статы, стрики, достижения) НЕ меняется.
--
--    Там уже стоит правильная политика из friend-profile-migration.sql:
--        using (auth.uid() = user_id or public.is_accepted_friend(user_id))
--    То есть детали профиля и так видны только себе и принятым друзьям, а
--    посторонним — нет, независимо от is_private. Приватному
--    пользователю здесь ужесточать нечего, а его друзьям — ослаблять
--    нечего: они видят всё как обычно, что и требовалось.
--
--    game_states (квесты, фото-подтверждения, питание, замеры тела) тоже
--    не меняется — он и так читаем только владельцем.
-- ─────────────────────────────────────────────────────────────
