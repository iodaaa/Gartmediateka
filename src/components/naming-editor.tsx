"use client";
import type { NamingOptions, NamingContext } from "@/lib/naming";
export function NamingEditor({
  value,
  onChange,
  context,
}: {
  value: NamingOptions;
  onChange: (options: NamingOptions) => void;
  context?: NamingContext;
}) {
  const change = (fields: Partial<NamingOptions>) =>
    onChange({ ...value, ...fields });
  return (
    <div className="naming-editor">
      <label className="field-label">
        Режим именования
        <select
          aria-label="Режим именования"
          value={value.mode}
          onChange={(e) =>
            change({ mode: e.target.value as NamingOptions["mode"] })
          }
        >
          <option value="original">Оставить исходные имена</option>
          <option value="template">Шаблон / новое имя</option>
          <option value="prefix">Добавить префикс</option>
          <option value="suffix">Добавить суффикс</option>
          <option value="replace">Найти и заменить</option>
          <option value="counter">Последовательная нумерация</option>
        </select>
      </label>
      {["template", "prefix", "suffix"].includes(value.mode) && (
        <label className="field-label">
          {value.mode === "template" ? "Шаблон без расширения" : "Текст"}
          <input
            aria-label="Шаблон без расширения"
            value={value.template}
            onChange={(e) => change({ template: e.target.value })}
          />
        </label>
      )}
      {value.mode === "replace" && (
        <>
          <label className="field-label">
            Найти
            <input
              value={value.find || ""}
              onChange={(e) => change({ find: e.target.value })}
            />
          </label>
          <label className="field-label">
            Заменить на
            <input
              value={value.replace || ""}
              onChange={(e) => change({ replace: e.target.value })}
            />
          </label>
        </>
      )}
      {["template", "counter"].includes(value.mode) && (
        <div className="counter-fields">
          <label className="field-label">
            Стартовый номер
            <input
              type="number"
              min={0}
              max={9999999999}
              value={value.start}
              onChange={(e) => change({ start: Number(e.target.value) })}
            />
          </label>
          <label className="field-label">
            Разрядов
            <input
              type="number"
              min={1}
              max={10}
              value={value.digits}
              onChange={(e) => change({ digits: Number(e.target.value) })}
            />
          </label>
        </div>
      )}
      <p className="naming-help">
        {"{original}"} — имя при импорте · {"{counter}"} — счётчик. Расширение
        сохраняется.
      </p>
      {context && (
        <div className="naming-help">
          {(["date", "project", "client", "source", "type"] as const).map(
            (key) => (
              <span key={key}>
                {"{" + key + "}"}:{" "}
                {context[key] ||
                  (key === "type"
                    ? "расширение каждого файла"
                    : "недоступна")}{" "}
                ·{" "}
              </span>
            ),
          )}
        </div>
      )}
    </div>
  );
}
export function NamePreview({
  rows,
}: {
  rows: { oldName: string; newName: string; error?: string }[];
}) {
  return (
    <div className="name-preview" tabIndex={0}>
      <table>
        <thead>
          <tr>
            <th>Старое имя</th>
            <th>Новое имя</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{r.oldName}</td>
              <td className={r.error ? "name-error" : ""}>
                {r.error || r.newName}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
