import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Политика конфиденциальности — Life RPG" },
      { name: "description", content: "Какие данные собирает Life RPG и как они используются." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link to="/" className="text-xs text-muted-foreground underline-offset-2 hover:underline">
        ← Вернуться в приложение
      </Link>

      <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
        Черновая версия документа, финализируется перед публичным запуском.
      </div>

      <h1 className="mt-6 text-xl font-semibold">Политика конфиденциальности</h1>
      <p className="mt-1 text-xs text-muted-foreground">Последнее обновление: 28 июля 2026</p>

      <div className="mt-6 space-y-6 text-sm leading-relaxed text-foreground/90">
        <section>
          <h2 className="text-sm font-semibold">Какие данные мы собираем</h2>
          <p className="mt-2">
            Для работы Life RPG мы собираем и храним: адрес электронной почты (для входа и связи с
            тобой), данные профиля (имя персонажа, аватар, уровень, характеристики, квесты, записи
            питания и параметры тела, которые ты вводишь сам), и, если ты решишь их загрузить,
            фотографии (аватар или фон приложения).
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold">Для чего используются данные</h2>
          <p className="mt-2">
            Данные используются исключительно для работы самого приложения: сохранения и
            синхронизации твоего прогресса между устройствами, отображения таблицы рейтингов друзьям
            (если ты добавляешь друзей), отправки уведомлений о ежедневных квестах (если ты их
            включил) и связи с тобой по вопросам, связанным с твоим аккаунтом.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold">Продажа данных третьим лицам</h2>
          <p className="mt-2">
            Мы не продаём и не передаём твои данные третьим лицам для рекламы или маркетинга. Данные
            могут обрабатываться инфраструктурными поставщиками (например, базой данных и сервисом
            аутентификации), которые используются исключительно для технической работы приложения.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold">Удаление данных</h2>
          <p className="mt-2">
            Ты можешь в любой момент запросить полное удаление своего аккаунта и всех связанных с
            ним данных. Для этого напиши на адрес ниже — мы удалим данные в разумный срок после
            подтверждения запроса.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold">Контакты</h2>
          <p className="mt-2">
            По любым вопросам о данных и конфиденциальности пиши на{" "}
            <a href="mailto:pixelkurel@gmail.com" className="underline underline-offset-2">
              pixelkurel@gmail.com
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
