// Automated runner for supabase/verify-rls-audit.sql — see that file for the
// full narrative (what each test proves and why). This script exists so
// those 12+ checks can be run with one command instead of copy-pasting each
// SQL block into the Supabase SQL Editor and eyeballing the result.
//
// Connects DIRECTLY to Postgres (not through PostgREST/the app) with the
// `pg` package, using the same "SET LOCAL ROLE authenticated" +
// set_config('request.jwt.claims', ...) trick the .sql file documents: the
// connection string's role (postgres) bypasses RLS like the SQL Editor
// does, so every test has to explicitly downgrade to `authenticated` and
// impersonate a specific user before it means anything.
//
// Every test runs in its own BEGIN/ROLLBACK — nothing here ever commits,
// so running this against a real project is safe and leaves no trace
// (matching the .sql file's own contract).
//
// Usage: bun run verify-rls   (see package.json)
// Requires DATABASE_URL in the environment / .env — see README note below
// and the message printed if it's missing.
import { Client } from "pg";

// ─────────────────────────────────────────────────────────────
// Connection
// ─────────────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error(
    [
      "",
      "❌ DATABASE_URL is not set.",
      "",
      "Add it to a .env file in the project root (already gitignored):",
      "  DATABASE_URL=postgresql://postgres:<password>@<host>:5432/postgres",
      "",
      "Where to find it: Supabase Dashboard → your project → Connect (top",
      "bar) → Connection string → URI. Use the DIRECT connection (port",
      "5432), not the pooler (6543/pgbouncer) — this script relies on",
      "SET LOCAL ROLE, which needs a real session, not a pooled one shared",
      "across clients.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

const client = new Client({
  connectionString: DATABASE_URL,
  // Supabase's Postgres requires TLS; the cert chain isn't always one
  // node's default trust store recognizes, so this matches how every other
  // short-lived script/CLI connecting to Supabase from outside its own
  // infra is normally configured.
  ssl: { rejectUnauthorized: false },
});

// ─────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────

type Status = "PASS" | "FAIL" | "INFO";

interface TestResult {
  id: string;
  name: string;
  status: Status;
  detail: string;
}

const results: TestResult[] = [];

function record(id: string, name: string, status: Status, detail: string) {
  results.push({ id, name, status, detail });
  const icon = status === "PASS" ? "✅" : status === "FAIL" ? "❌" : "ℹ️ ";
  console.log(`${icon} [${id}] ${name}`);
  if (detail) console.log(`   ${detail.split("\n").join("\n   ")}`);
}

function errMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e)
    return String((e as { message: unknown }).message);
  return String(e);
}

/** Runs `fn` inside its own BEGIN/ROLLBACK — nothing it does ever persists,
 * regardless of whether fn throws. */
async function inTransaction<T>(fn: () => Promise<T>): Promise<T> {
  await client.query("BEGIN");
  try {
    return await fn();
  } finally {
    // Always rollback, even on success — these are read/probe transactions,
    // never meant to persist anything.
    await client.query("ROLLBACK").catch(() => {});
  }
}

/** Downgrades the current transaction from the connection's real role
 * (postgres, which bypasses RLS) to `authenticated` impersonating
 * `userId` — exactly what supabase-js does per-request via the user's JWT,
 * reproduced here by hand since this script talks to Postgres directly. */
async function actAs(userId: string) {
  await client.query("SET LOCAL ROLE authenticated");
  await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: userId, role: "authenticated" }),
  ]);
}

/** Runs a query, expecting it to throw. Returns the error message if it
 * did, or null if it unexpectedly succeeded. */
async function expectError(query: string, params: unknown[] = []): Promise<string | null> {
  try {
    await client.query(query, params);
    return null;
  } catch (e) {
    return errMessage(e);
  }
}

// ─────────────────────────────────────────────────────────────
// Test-user discovery — three distinct profiles with NO friend_requests
// row between the first two in either direction, so the assertions below
// ("now_friends should be false", "profiles_rows should be small") aren't
// muddied by pre-existing relationships. Runs as the connection's real
// role (postgres), which is allowed to read everything — same as the SQL
// Editor being exempt from RLS.
// ─────────────────────────────────────────────────────────────

interface TestUsers {
  me: string;
  stranger: string;
  victim: string;
}

async function discoverTestUsers(): Promise<TestUsers> {
  const profilesRes = await client.query<{ user_id: string }>(
    "select user_id from public.profiles order by user_id",
  );
  const profileIds = profilesRes.rows.map((r: { user_id: string }) => r.user_id);

  if (profileIds.length < 3) {
    console.error(
      [
        "",
        `❌ Found only ${profileIds.length} row(s) in public.profiles — need at least 3.`,
        "",
        "profiles rows are created the first time each account opens the app",
        "(syncProfile in src/lib/profiles.ts). Sign in with at least 3",
        "different accounts once each, then re-run this script.",
        "",
      ].join("\n"),
    );
    process.exit(1);
  }

  const requestsRes = await client.query<{ from_user: string; to_user: string }>(
    "select from_user, to_user from public.friend_requests",
  );
  const related = new Set<string>();
  for (const r of requestsRes.rows) {
    related.add(`${r.from_user}|${r.to_user}`);
    related.add(`${r.to_user}|${r.from_user}`);
  }

  let me: string | null = null;
  let stranger: string | null = null;
  outer: for (const a of profileIds) {
    for (const b of profileIds) {
      if (a === b) continue;
      if (related.has(`${a}|${b}`)) continue;
      me = a;
      stranger = b;
      break outer;
    }
  }

  if (!me || !stranger) {
    console.error(
      [
        "",
        "❌ Every pair of profiles already has a friend_requests row between",
        "them (any status) — can't pick a clean 'me'/'stranger' pair for the",
        "tests that assert 'not already friends'.",
        "",
        "Add one more test account, or clear out friend_requests rows for",
        "some existing test accounts, then re-run.",
        "",
      ].join("\n"),
    );
    process.exit(1);
  }

  const victim = profileIds.find((id: string) => id !== me && id !== stranger);
  if (!victim) {
    // Unreachable given the length >= 3 check above, but keep TypeScript
    // (and any future refactor) honest about it.
    console.error("❌ Could not find a third distinct profile for 'victim'.");
    process.exit(1);
  }

  return { me, stranger, victim };
}

// ─────────────────────────────────────────────────────────────
// Tests — mirrors supabase/verify-rls-audit.sql block-for-block. Each
// function corresponds to one "ТЕСТ N" section there; see that file for
// the full rationale behind each expectation.
// ─────────────────────────────────────────────────────────────

async function test0_control(u: TestUsers) {
  await inTransaction(async () => {
    await actAs(u.me);
    const res = await client.query<{ acting_as: string; is_authenticated: boolean }>(
      "select auth.uid() as acting_as, auth.uid() is not null as is_authenticated",
    );
    const row = res.rows[0];
    if (row?.acting_as === u.me && row.is_authenticated) {
      record("0", "Контроль: подмена роли работает", "PASS", `acting_as = ${row.acting_as}`);
    } else {
      record(
        "0",
        "Контроль: подмена роли работает",
        "FAIL",
        `acting_as = ${row?.acting_as ?? "null"} (ожидался ${u.me}) — все дальнейшие тесты недостоверны`,
      );
    }
  });
}

async function test1_forgeAcceptedFriendship(u: TestUsers) {
  await inTransaction(async () => {
    await actAs(u.me);
    const error = await expectError(
      "insert into public.friend_requests (from_user, to_user, status) values ($1, $2, 'accepted')",
      [u.me, u.stranger],
    );
    if (error && /row-level security policy/i.test(error)) {
      record(
        "1",
        "[C1] Подделка принятой дружбы одной вставкой",
        "PASS",
        "insert отклонён политикой RLS, как и ожидалось",
      );
    } else if (error) {
      record(
        "1",
        "[C1] Подделка принятой дружбы одной вставкой",
        "FAIL",
        `insert отклонён, но НЕ по RLS — неожиданная ошибка: ${error}`,
      );
    } else {
      record(
        "1",
        "[C1] Подделка принятой дружбы одной вставкой",
        "FAIL",
        "insert со status='accepted' ПРОШЁЛ — дыра [C1] не закрыта!",
      );
    }
  });
}

async function test2_senderSelfAccept(u: TestUsers) {
  await inTransaction(async () => {
    await actAs(u.me);
    await client.query(
      "insert into public.friend_requests (from_user, to_user, status) values ($1, $2, 'pending')",
      [u.me, u.stranger],
    );
    const updateRes = await client.query(
      "update public.friend_requests set status = 'accepted' where from_user = $1 and to_user = $2",
      [u.me, u.stranger],
    );
    const checkRes = await client.query<{ status: string; now_friends: boolean }>(
      `select status, public.is_accepted_friend($2) as now_friends
         from public.friend_requests where from_user = $1 and to_user = $2`,
      [u.me, u.stranger],
    );
    const row = checkRes.rows[0];
    if (updateRes.rowCount === 0 && row?.status === "pending" && row.now_friends === false) {
      record(
        "2",
        "[C2] Отправитель принимает свою же заявку",
        "PASS",
        `update затронул 0 строк, статус остался '${row.status}', is_accepted_friend = ${row.now_friends}`,
      );
    } else {
      record(
        "2",
        "[C2] Отправитель принимает свою же заявку",
        "FAIL",
        `update затронул ${updateRes.rowCount} строк(и); status=${row?.status}, now_friends=${row?.now_friends} — дыра [C2] не закрыта!`,
      );
    }
  });
}

async function test3_rewriteParticipants(u: TestUsers) {
  await inTransaction(async () => {
    // Setup happens BEFORE the role switch, as the connection's real role
    // (postgres) — mirrors "под postgres" in the .sql file.
    await client.query(
      `insert into public.friend_requests (from_user, to_user, status)
       values ($1, $2, 'pending') on conflict (from_user, to_user) do nothing`,
      [u.stranger, u.me],
    );

    await actAs(u.me);
    const error = await expectError(
      `update public.friend_requests set from_user = $1, status = 'accepted'
        where to_user = $2 and from_user = $3`,
      [u.victim, u.me, u.stranger],
    );
    if (error && /participants cannot be changed/i.test(error)) {
      record(
        "3",
        "[C3] Подмена участников существующей заявки",
        "PASS",
        "триггер заблокировал изменение from_user/to_user",
      );
    } else if (error) {
      record(
        "3",
        "[C3] Подмена участников существующей заявки",
        "FAIL",
        `отклонено, но неожиданной ошибкой: ${error}`,
      );
    } else {
      record(
        "3",
        "[C3] Подмена участников существующей заявки",
        "FAIL",
        "update ПРОШЁЛ без ошибки — дыра [C3] не закрыта!",
      );
    }
  });
}

async function test3b_legitimateAccept(u: TestUsers) {
  await inTransaction(async () => {
    await client.query(
      `insert into public.friend_requests (from_user, to_user, status)
       values ($1, $2, 'pending') on conflict (from_user, to_user) do nothing`,
      [u.stranger, u.me],
    );

    await actAs(u.me);
    const updateRes = await client.query(
      "update public.friend_requests set status = 'accepted' where to_user = $1 and from_user = $2",
      [u.me, u.stranger],
    );
    const checkRes = await client.query<{ status: string; now_friends: boolean }>(
      `select status, public.is_accepted_friend($2) as now_friends
         from public.friend_requests where to_user = $1 and from_user = $2`,
      [u.me, u.stranger],
    );
    const row = checkRes.rows[0];
    if (updateRes.rowCount === 1 && row?.status === "accepted" && row.now_friends === true) {
      record(
        "3b",
        "Легальный accept всё ещё работает",
        "PASS",
        "update затронул 1 строку, статус accepted, is_accepted_friend = true",
      );
    } else {
      record(
        "3b",
        "Легальный accept всё ещё работает",
        "FAIL",
        `update затронул ${updateRes.rowCount} строк(и); status=${row?.status}, now_friends=${row?.now_friends} — легальный путь сломан!`,
      );
    }
  });
}

async function test4_selfRequest(u: TestUsers) {
  await inTransaction(async () => {
    await actAs(u.me);
    const error = await expectError(
      "insert into public.friend_requests (from_user, to_user, status) values ($1, $1, 'pending')",
      [u.me],
    );
    if (error && /(row-level security policy|friend_requests_no_self)/i.test(error)) {
      record("4", "Заявка самому себе", "PASS", "insert отклонён");
    } else if (error) {
      record("4", "Заявка самому себе", "FAIL", `отклонено неожиданной ошибкой: ${error}`);
    } else {
      record("4", "Заявка самому себе", "FAIL", "insert ПРОШЁЛ — заявка самому себе разрешена!");
    }
  });
}

async function test5_emailSquatting(u: TestUsers) {
  await inTransaction(async () => {
    await actAs(u.me);
    const error = await expectError(
      `insert into public.user_emails (user_id, email) values ($1, $2)
       on conflict (user_id) do update set email = excluded.email`,
      [u.me, "someone-elses-address@example.com"],
    );
    if (error && /must match the account.s own email/i.test(error)) {
      record("5", "[M1] Захват чужого email", "PASS", "insert/update отклонён триггером");
    } else if (error) {
      record("5", "[M1] Захват чужого email", "FAIL", `отклонено неожиданной ошибкой: ${error}`);
    } else {
      record(
        "5",
        "[M1] Захват чужого email",
        "FAIL",
        "запись с чужим email ПРОШЛА — дыра [M1] не закрыта!",
      );
    }
  });
}

async function test6_bulkCounts(u: TestUsers) {
  // Real totals, read as postgres (bypasses RLS) — for comparison only.
  const totals = (
    await client.query<{ total: string }>("select count(*)::text as total from public.profiles")
  ).rows[0];
  const totalProfiles = Number(totals?.total ?? 0);

  await inTransaction(async () => {
    await actAs(u.me);
    const res = await client.query<{
      profiles_rows: string;
      friend_profiles_rows: string;
      game_states_rows: string;
      user_emails_rows: string;
      push_rows: string;
      friend_requests_rows: string;
    }>(`
      select
        (select count(*) from public.profiles)           as profiles_rows,
        (select count(*) from public.friend_profiles)     as friend_profiles_rows,
        (select count(*) from public.game_states)         as game_states_rows,
        (select count(*) from public.user_emails)         as user_emails_rows,
        (select count(*) from public.push_subscriptions)  as push_rows,
        (select count(*) from public.friend_requests)     as friend_requests_rows
    `);
    const row = res.rows[0];
    const profilesRows = Number(row?.profiles_rows ?? -1);
    const detail =
      `profiles=${row?.profiles_rows} (всего в базе: ${totalProfiles}), ` +
      `friend_profiles=${row?.friend_profiles_rows}, game_states=${row?.game_states_rows}, ` +
      `user_emails=${row?.user_emails_rows}, push=${row?.push_rows}, ` +
      `friend_requests=${row?.friend_requests_rows}`;

    if (totalProfiles > profilesRows && profilesRows >= 1) {
      record("6", "Массовая выгрузка по всем таблицам", "PASS", detail);
    } else {
      record(
        "6",
        "Массовая выгрузка по всем таблицам",
        "FAIL",
        `${detail} — profiles_rows должен быть строго меньше общего числа профилей (${totalProfiles})`,
      );
    }
  });
}

async function test7_pointReads(u: TestUsers) {
  await inTransaction(async () => {
    await actAs(u.me);
    const res = await client.query<{ t: string; count: string }>(
      `
      select 'game_states' as t, count(*)::text from public.game_states where user_id = $1
      union all
      select 'profiles', count(*)::text from public.profiles where user_id = $1
      union all
      select 'friend_profiles', count(*)::text from public.friend_profiles where user_id = $1
      union all
      select 'user_emails', count(*)::text from public.user_emails where user_id = $1
      union all
      select 'push_subscriptions', count(*)::text from public.push_subscriptions where user_id = $1
      `,
      [u.stranger],
    );
    const nonZero = res.rows.filter((r: { t: string; count: string }) => Number(r.count) !== 0);
    const detail = res.rows
      .map((r: { t: string; count: string }) => `${r.t}=${r.count}`)
      .join(", ");
    if (nonZero.length === 0) {
      record("7", "Точечное чтение чужих строк по uuid", "PASS", detail);
    } else {
      record(
        "7",
        "Точечное чтение чужих строк по uuid",
        "FAIL",
        `${detail} — ожидались нули везде, но видно чужие данные: ${nonZero.map((r: { t: string }) => r.t).join(", ")}`,
      );
    }
  });
}

async function test8_writeToStranger(u: TestUsers) {
  await inTransaction(async () => {
    await actAs(u.me);
    const profilesRes = await client.query(
      "update public.profiles set username = 'HACKED' where user_id = $1",
      [u.stranger],
    );
    const friendProfilesRes = await client.query(
      "update public.friend_profiles set current_streak = 9999 where user_id = $1",
      [u.stranger],
    );
    const gameStatesRes = await client.query(
      "update public.game_states set state = '{}'::jsonb where user_id = $1",
      [u.stranger],
    );
    const rows = {
      profiles: profilesRes.rowCount ?? 0,
      friend_profiles: friendProfilesRes.rowCount ?? 0,
      game_states: gameStatesRes.rowCount ?? 0,
    };
    const detail = Object.entries(rows)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
    if (Object.values(rows).every((n) => n === 0)) {
      record("8", "Попытка записи в чужие строки", "PASS", detail);
    } else {
      record(
        "8",
        "Попытка записи в чужие строки",
        "FAIL",
        `${detail} — чужая строка была изменена!`,
      );
    }
  });
}

async function test9_deleteStranger(u: TestUsers) {
  await inTransaction(async () => {
    await actAs(u.me);
    const profilesRes = await client.query("delete from public.profiles where user_id = $1", [
      u.stranger,
    ]);
    const friendProfilesRes = await client.query(
      "delete from public.friend_profiles where user_id = $1",
      [u.stranger],
    );
    const gameStatesRes = await client.query("delete from public.game_states where user_id = $1", [
      u.stranger,
    ]);
    const userEmailsRes = await client.query("delete from public.user_emails where user_id = $1", [
      u.stranger,
    ]);
    const rows = {
      profiles: profilesRes.rowCount ?? 0,
      friend_profiles: friendProfilesRes.rowCount ?? 0,
      game_states: gameStatesRes.rowCount ?? 0,
      user_emails: userEmailsRes.rowCount ?? 0,
    };
    const detail = Object.entries(rows)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
    if (Object.values(rows).every((n) => n === 0)) {
      record("9", "Попытка удаления чужих строк", "PASS", detail);
    } else {
      record("9", "Попытка удаления чужих строк", "FAIL", `${detail} — чужая строка была удалена!`);
    }
  });
}

async function test10_changeOwnUserId(u: TestUsers) {
  await inTransaction(async () => {
    await actAs(u.me);
    let rowCount = 0;
    const error = await (async () => {
      try {
        const res = await client.query(
          "update public.game_states set user_id = $1 where user_id = $2",
          [u.stranger, u.me],
        );
        rowCount = res.rowCount ?? 0;
        return null;
      } catch (e) {
        return errMessage(e);
      }
    })();
    if (error || rowCount === 0) {
      record(
        "10",
        "Подмена владельца собственной строки",
        "PASS",
        error ? `отклонено ошибкой: ${error}` : "update затронул 0 строк",
      );
    } else {
      record(
        "10",
        "Подмена владельца собственной строки",
        "FAIL",
        `update перенёс строку на чужой user_id (${rowCount} строк)!`,
      );
    }
  });
}

async function test11_rlsEnabledEverywhere() {
  // Runs as the connection's real role (postgres) — no role switch, same
  // as the .sql file's ТЕСТ 11.
  const tables = [
    "game_states",
    "profiles",
    "user_emails",
    "friend_requests",
    "friend_profiles",
    "push_subscriptions",
  ];
  const rlsRes = await client.query<{ table_name: string; rls_enabled: boolean }>(
    `select relname as table_name, relrowsecurity as rls_enabled
       from pg_class
      where relnamespace = 'public'::regnamespace
        and relname = any($1)`,
    [tables],
  );
  const byName = new Map(
    rlsRes.rows.map((r: { table_name: string; rls_enabled: boolean }) => [
      r.table_name,
      r.rls_enabled,
    ]),
  );
  const missingOrDisabled = tables.filter((t) => byName.get(t) !== true);

  const openPoliciesRes = await client.query<{
    schemaname: string;
    tablename: string;
    policyname: string;
  }>(
    `select schemaname, tablename, policyname
       from pg_policies
      where schemaname in ('public', 'storage')
        and (
          qual = 'true'
          or with_check = 'true'
          or roles::text like '%anon%'
          or roles = '{public}'
        )`,
  );

  const detailLines = [
    `RLS enabled: ${tables.map((t) => `${t}=${byName.get(t) ?? "MISSING"}`).join(", ")}`,
    openPoliciesRes.rows.length === 0
      ? "Открытых политик (using/with check = true, roles включает anon/public) не найдено"
      : `Найдены открытые политики: ${openPoliciesRes.rows
          .map((r: { tablename: string; policyname: string }) => `${r.tablename}.${r.policyname}`)
          .join(", ")}`,
  ];

  if (missingOrDisabled.length === 0 && openPoliciesRes.rows.length === 0) {
    record("11", "RLS включён везде, открытых политик нет", "PASS", detailLines.join("\n"));
  } else {
    record("11", "RLS включён везде, открытых политик нет", "FAIL", detailLines.join("\n"));
  }
}

async function test12_policyInventory() {
  // Informational only — matches the .sql file's own framing ("для
  // глазами-просмотра"), not an assertion, so this is always INFO rather
  // than PASS/FAIL.
  const res = await client.query<{
    tablename: string;
    cmd: string;
    policyname: string;
    roles: string;
  }>(
    `select tablename, cmd, policyname, roles::text as roles
       from pg_policies
      where schemaname in ('public', 'storage')
      order by tablename, cmd, policyname`,
  );
  const lines = res.rows.map(
    (r: { tablename: string; cmd: string; policyname: string; roles: string }) =>
      `${r.tablename} · ${r.cmd} · "${r.policyname}" · ${r.roles}`,
  );
  record("12", "Полный список действующих политик (для просмотра)", "INFO", lines.join("\n"));
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

async function main() {
  console.log("Подключаюсь к базе…");
  try {
    await client.connect();
  } catch (e) {
    console.error(`\n❌ Не удалось подключиться: ${errMessage(e)}\n`);
    process.exit(1);
  }
  console.log("Подключено. Ищу тестовых пользователей в public.profiles…\n");

  const users = await discoverTestUsers();
  console.log(`me=${users.me}\nstranger=${users.stranger}\nvictim=${users.victim}\n`);
  console.log("Запускаю тесты (каждый в своей транзакции с откатом)…\n");

  const tests: Array<() => Promise<void>> = [
    () => test0_control(users),
    () => test1_forgeAcceptedFriendship(users),
    () => test2_senderSelfAccept(users),
    () => test3_rewriteParticipants(users),
    () => test3b_legitimateAccept(users),
    () => test4_selfRequest(users),
    () => test5_emailSquatting(users),
    () => test6_bulkCounts(users),
    () => test7_pointReads(users),
    () => test8_writeToStranger(users),
    () => test9_deleteStranger(users),
    () => test10_changeOwnUserId(users),
    () => test11_rlsEnabledEverywhere(),
    () => test12_policyInventory(),
  ];

  for (const t of tests) {
    try {
      await t();
    } catch (e) {
      // A test throwing here means the HARNESS broke (e.g. an aborted
      // transaction leaking into the next query), not that the security
      // check failed — surface it loudly rather than silently skipping.
      record("?", "Тест упал с необработанной ошибкой раннера", "FAIL", errMessage(e));
      // Reset the connection state in case the failed transaction left it
      // aborted, so remaining tests can still run.
      await client.query("ROLLBACK").catch(() => {});
    }
  }

  await client.end();

  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const info = results.filter((r) => r.status === "INFO").length;

  console.log("\n" + "─".repeat(60));
  console.log(`Итого: ${passed} пройдено, ${failed} провалено, ${info} информационных`);
  console.log("─".repeat(60));

  if (failed > 0) {
    console.log("\nПровалившиеся тесты:");
    for (const r of results.filter((x) => x.status === "FAIL")) {
      console.log(`  ❌ [${r.id}] ${r.name}`);
    }
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Неожиданная ошибка:", e);
  process.exit(1);
});
