import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Условия использования — Life RPG" },
      { name: "description", content: "Условия использования приложения Life RPG." },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link to="/" className="text-xs text-muted-foreground underline-offset-2 hover:underline">
        ← Вернуться в приложение
      </Link>

      <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
        Черновая версия документа, финализируется перед публичным запуском.
      </div>

      <h1 className="mt-6 text-xl font-semibold">Условия использования</h1>
      <p className="mt-1 text-xs text-muted-foreground">Последнее обновление: 28 июля 2026</p>

      <div className="mt-6 space-y-6 text-sm leading-relaxed text-foreground/90">
        <section>
          <h2 className="text-sm font-semibold">Общие положения</h2>
          <p className="mt-2">
            Life RPG — личное приложение-трекер, которое помогает превратить повседневные задачи,
            питание и физическую форму в игровую систему квестов и характеристик. Используя
            приложение, ты соглашаешься с этими условиями.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold">Учётная запись</h2>
          <p className="mt-2">
            Для использования приложения нужен вход через Google или по ссылке на email. Ты
            отвечаешь за сохранность доступа к своей учётной записи и за достоверность данных,
            которые вводишь.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold">Данные и контент</h2>
          <p className="mt-2">
            Весь прогресс (квесты, характеристики, записи питания, параметры тела) хранится на наших
            серверах и синхронизируется между твоими устройствами. Подробнее о том, какие данные
            собираются и как используются, смотри в{" "}
            <Link to="/privacy" className="underline underline-offset-2">
              Политике конфиденциальности
            </Link>
            .
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold">Отсутствие гарантий</h2>
          <p className="mt-2">
            Life RPG — не медицинское и не диетологическое приложение. Расчёты калорий, БЖУ и
            показатели физической формы носят справочный характер и не заменяют консультацию
            специалиста. Приложение предоставляется «как есть», без гарантий бесперебойной работы.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold">Изменения условий</h2>
          <p className="mt-2">
            Мы можем время от времени обновлять эти условия по мере развития приложения. Актуальная
            версия всегда доступна на этой странице.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold">Контакты</h2>
          <p className="mt-2">
            По любым вопросам пиши на{" "}
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
