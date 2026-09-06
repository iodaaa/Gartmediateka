export type NamingOptions = {
  mode: "original" | "template" | "prefix" | "suffix" | "replace" | "counter";
  template: string;
  start: number;
  digits: number;
  find?: string;
  replace?: string;
};
export type NamingContext = Partial<
  Record<"project" | "client" | "source" | "type" | "date", string>
>;
export const defaultNaming: NamingOptions = {
  mode: "original",
  template: "{original}",
  start: 1,
  digits: 3,
};
export const namingPresets = [
  { id: "original", name: "Оставить исходные имена", template: "{original}" },
  {
    id: "client",
    name: "Фото от клиента",
    template: "{project}_{client}_{counter}",
  },
  { id: "render", name: "Рендер", template: "{project}_render_{counter}" },
  {
    id: "real",
    name: "Реализованный объект",
    template: "REAL_{date}_{counter}",
  },
  { id: "ai", name: "AI", template: "AI_{date}_{counter}" },
];
export const filenameParts = (name: string) => {
  const at = name.lastIndexOf(".");
  return at > 0
    ? { stem: name.slice(0, at), extension: name.slice(at) }
    : { stem: name, extension: "" };
};
export function safeStem(value: string) {
  let name = value
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .trim()
    .replace(/[. ]+$/g, "");
  if (!name || name === "." || name === "..")
    throw new Error("Имя не может быть пустым");
  if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(name))
    name = "_" + name;
  return name;
}
export function makeName(
  original: string,
  current: string,
  options: NamingOptions,
  context: NamingContext,
  index: number,
) {
  if (
    !options ||
    typeof options.template !== "string" ||
    options.template.length > 500
  )
    throw new Error("Некорректный шаблон");
  if (
    !options ||
    ![
      "original",
      "template",
      "prefix",
      "suffix",
      "replace",
      "counter",
    ].includes(options.mode)
  )
    throw new Error("Неизвестный режим именования");
  if (
    !Number.isSafeInteger(options.start) ||
    options.start < 0 ||
    !Number.isInteger(options.digits) ||
    options.digits < 1 ||
    options.digits > 10 ||
    options.start + index > 9999999999
  )
    throw new Error("Проверьте стартовый номер и разряды (1–10)");
  const old = filenameParts(original),
    now = filenameParts(current);
  const counter = String(options.start + index).padStart(options.digits, "0");
  let stem: string;
  if (options.mode === "original") stem = old.stem;
  else if (options.mode === "prefix") stem = options.template + now.stem;
  else if (options.mode === "suffix") stem = now.stem + options.template;
  else if (options.mode === "replace") {
    if (!options.find) throw new Error("Введите текст для поиска");
    stem = now.stem.split(options.find).join(options.replace || "");
  } else if (options.mode === "counter") stem = counter;
  else {
    if (typeof options.template !== "string" || options.template.length > 500)
      throw new Error("Шаблон слишком длинный");
    stem = options.template.replace(/\{([^{}]+)\}/g, (_, key: string) => {
      if (key === "original") return old.stem;
      if (key === "counter") return counter;
      const value = context[key as keyof NamingContext];
      if (!value) throw new Error("Переменная {" + key + "} недоступна");
      return value;
    });
    if (/[{}]/.test(stem)) throw new Error("Некорректная переменная шаблона");
  }
  const result = safeStem(stem) + now.extension;
  if (result.length > 180) throw new Error("Имя превышает 180 символов");
  return result;
}
