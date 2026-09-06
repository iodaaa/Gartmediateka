"use client";
import { useMemo, useState, useEffect } from "react";
import { ChevronRight, ChevronDown, Folder } from "lucide-react";
import type { FolderRecord } from "@/lib/api-types";
export default function FolderPicker({
  folders,
  value,
  onChange,
  currentFolderId,
  movingFolderId,
}: {
  folders: FolderRecord[];
  value: string;
  onChange: (id: string) => void;
  currentFolderId: string;
  movingFolderId?: string | null;
}) {
  const [search, setSearch] = useState(""),
    [expanded, setExpanded] = useState<Set<string>>(new Set()),
    [recent, setRecent] = useState<string[]>([]);
  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("gart-recent-folders") || "[]",
      );
      if (Array.isArray(saved))
        // eslint-disable-next-line react-hooks/set-state-in-effect -- Hydrate the browser-only recent-folder preference.
        setRecent(saved.filter((x) => typeof x === "string").slice(0, 5));
    } catch {}
  }, []);
  const moving = folders.find((f) => f.id === movingFolderId);
  const disabled = (f: FolderRecord) =>
    f.id === currentFolderId ||
    (moving &&
      (f.id === moving.id ||
        f.storagePath.startsWith(moving.storagePath + "/") ||
        f.id === moving.parentId));
  const visible = useMemo(() => {
    if (!search.trim()) return null;
    const ids = new Set<string>();
    for (const f of folders.filter((f) =>
      f.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
    )) {
      let p: FolderRecord | undefined = f;
      const visited = new Set<string>();
      while (p && !visited.has(p.id)) {
        visited.add(p.id);
        ids.add(p.id);
        p = folders.find((x) => x.id === p!.parentId);
      }
    }
    return ids;
  }, [folders, search]);
  const crumbs: FolderRecord[] = [];
  let cursor = folders.find((f) => f.id === value);
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    crumbs.unshift(cursor);
    cursor = folders.find((f) => f.id === cursor!.parentId);
  }
  function choose(id: string) {
    onChange(id);
    const next = [id, ...recent.filter((x) => x !== id)].slice(0, 5);
    setRecent(next);
    try {
      localStorage.setItem("gart-recent-folders", JSON.stringify(next));
    } catch {}
  }
  const tree = (parent: string | null, depth = 0): React.ReactNode =>
    folders
      .filter((f) => f.parentId === parent && (!visible || visible.has(f.id)))
      .map((f) => {
        const children = folders.some((c) => c.parentId === f.id),
          open = depth === 0 || !!visible || expanded.has(f.id);
        return (
          <div key={f.id}>
            <div
              className={"picker-row " + (value === f.id ? "active" : "")}
              style={{ paddingLeft: Math.min(depth, 10) * 15 }}
            >
              <button
                type="button"
                aria-label={"Раскрыть в выборе " + f.name}
                aria-expanded={open}
                disabled={!children || depth === 0 || !!visible}
                onClick={() =>
                  setExpanded((prev) => {
                    const n = new Set(prev);
                    if (n.has(f.id)) n.delete(f.id);
                    else n.add(f.id);
                    return n;
                  })
                }
              >
                {children ? (
                  open ? (
                    <ChevronDown size={15} />
                  ) : (
                    <ChevronRight size={15} />
                  )
                ) : null}
              </button>
              <button
                type="button"
                disabled={!!disabled(f)}
                aria-pressed={value === f.id}
                title={f.storagePath || "GART_FILES"}
                onClick={() => choose(f.id)}
              >
                <Folder size={18} />
                {depth === 0 ? "GART_FILES" : f.name}
              </button>
            </div>
            {open && children && tree(f.id, depth + 1)}
          </div>
        );
      });
  return (
    <section className="folder-picker">
      <label className="field-label">
        Поиск папки
        <input
          aria-label="Поиск папки"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Название папки"
        />
      </label>
      {!search &&
        recent.some((id) =>
          folders.some((f) => f.id === id && !disabled(f)),
        ) && (
          <div className="picker-recent">
            <small>Недавние папки</small>
            {recent
              .map((id) => folders.find((f) => f.id === id))
              .filter((f): f is FolderRecord => !!f && !disabled(f))
              .map((f) => (
                <button
                  type="button"
                  key={f.id}
                  title={f.storagePath}
                  onClick={() => choose(f.id)}
                >
                  {f.name}
                </button>
              ))}
          </div>
        )}
      <div className="picker-tree" aria-label="Папка назначения">
        {tree(null)}
        {visible?.size === 0 && <p>Папки не найдены</p>}
      </div>
      <nav
        className="picker-breadcrumb"
        aria-label="Выбранная папка назначения"
      >
        {crumbs.length
          ? crumbs.map((f, i) => (
              <span key={f.id}>
                {i > 0 ? " › " : ""}
                {f.parentId ? f.name : "GART_FILES"}
              </span>
            ))
          : "Выберите папку назначения"}
      </nav>
    </section>
  );
}
