"use client";
import { useEffect, useState } from "react";
import { NamingEditor, NamePreview } from "./naming-editor";
import {
  namingPresets,
  defaultNaming,
  type NamingOptions,
  type NamingContext,
} from "@/lib/naming";
export default function UploadNaming({
  folderId,
  names,
  sourceType,
  value,
  onChange,
  onValid,
}: {
  folderId: string;
  names: string[];
  sourceType: string;
  value: NamingOptions;
  onChange: (v: NamingOptions) => void;
  onValid: (valid: boolean) => void;
}) {
  const [info, setInfo] = useState<{
      context: NamingContext;
      recommended: string;
      folderPath: string;
      rows: { oldName: string; newName: string; error?: string }[];
    } | null>(null),
    [error, setError] = useState("");
  const key = JSON.stringify({ folderId, names, sourceType, naming: value });
  useEffect(() => {
    const controller = new AbortController();
    onValid(false);
    const timer = setTimeout(() => {
      fetch("/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "upload-preview", ...JSON.parse(key) }),
        signal: controller.signal,
      })
        .then(async (r) => {
          const data = await r.json();
          if (!r.ok) throw new Error(data.error);
          return data;
        })
        .then((data) => {
          if (!controller.signal.aborted) {
            setInfo(data);
            setError("");
            onValid(
              data.rows.length > 0 &&
                !data.rows.some((r: { error?: string }) => r.error),
            );
          }
        })
        .catch((e) => {
          if (!controller.signal.aborted) {
            setError(e.message);
            onValid(false);
          }
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, onValid]);
  const recommended =
    namingPresets.find((p) => p.id === info?.recommended) || namingPresets[0];
  return (
    <section className="upload-naming">
      <h3>Именование · {names.length} файлов</h3>
      <p className="subtle">Назначение: {info?.folderPath || "GART_FILES"}</p>
      <p className="naming-help">
        Рекомендация: {recommended.name}{" "}
        <button
          type="button"
          className="button"
          onClick={() =>
            onChange({
              ...defaultNaming,
              mode: recommended.id === "original" ? "original" : "template",
              template: recommended.template,
            })
          }
        >
          Применить рекомендацию
        </button>
      </p>
      <label className="field-label">
        Базовый preset
        <select
          aria-label="Базовый preset"
          value=""
          onChange={(e) => {
            const p = namingPresets.find((p) => p.id === e.target.value);
            if (p)
              onChange({
                ...defaultNaming,
                mode: p.id === "original" ? "original" : "template",
                template: p.template,
              });
          }}
        >
          <option value="">Выбрать…</option>
          {namingPresets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <NamingEditor value={value} onChange={onChange} context={info?.context} />
      {error && <p role="alert">{error}</p>}
      {info && <NamePreview rows={info.rows} />}
    </section>
  );
}
