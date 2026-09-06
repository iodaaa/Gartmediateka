"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import FolderPicker from "./folder-picker";
import UploadNaming from "./upload-naming";
import { NamingEditor, NamePreview } from "./naming-editor";
import { defaultNaming, filenameParts, type NamingOptions } from "@/lib/naming";
import {
  Bell,
  Search,
  Upload,
  FolderPlus,
  Plus,
  Folder,
  FolderOpen,
  Files,
  Star,
  Clock3,
  Share2,
  Trash2,
  ChevronDown,
  ChevronRight,
  LayoutGrid,
  List,
  ArrowUpDown,
  ExternalLink,
  Pencil,
  X,
  Menu,
  PanelRightClose,
  Check,
  RefreshCw,
  LoaderCircle,
  AlertCircle,
} from "lucide-react";
import type {
  AssetRecord,
  FolderRecord,
  LibraryResponse,
  UploadResult,
} from "@/lib/api-types";

const formatSize = (n: number) =>
  new Intl.NumberFormat("ru", { maximumFractionDigits: 1 }).format(
    n >= 1024 ** 3 ? n / 1024 ** 3 : n >= 1024 ** 2 ? n / 1024 ** 2 : n / 1024,
  ) + (n >= 1024 ** 3 ? " ГБ" : n >= 1024 ** 2 ? " МБ" : " КБ");
const date = (value: string) =>
  new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
const sourceLabels: Record<string, string> = {
  GART: "Наши",
  CLIENT: "Клиент",
  CONTRACTOR: "Подрядчик",
  AI: "AI",
  EXTERNAL: "Внешний",
  UNKNOWN: "Не указан",
};
const imageUrl = (asset: AssetRecord, preview = false) =>
  `/api/assets/${asset.id}${preview ? "" : "?thumbnail=1"}`;
type Dialog =
  | "folder"
  | "rename"
  | "upload"
  | "preview"
  | "scan"
  | "trash"
  | "move"
  | "project"
  | "asset-rename"
  | null;
type ScanResult = {
  unchanged: number;
  duplicateCount: number;
  duplicates: {
    id: string;
    filename: string;
    storagePath: string;
    status: string;
    assetId: string;
    mediaId: string;
    existingPath: string;
    folderId: string;
    existingTrash: boolean;
  }[];
  folderCount: number;
  imageCount: number;
  skipped: number;
  warnings: string[];
};
async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Не удалось выполнить операцию");
  return data;
}
function FileImage({
  asset,
  preview = false,
}: {
  asset: AssetRecord;
  preview?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <div className="image-unavailable">
      <AlertCircle />
      <span>Изображение недоступно</span>
    </div>
  ) : (
    <img
      className="real-media-image"
      src={imageUrl(asset, preview)}
      alt={asset.storedFilename}
      loading={preview ? "eager" : "lazy"}
      onError={() => setFailed(true)}
    />
  );
}

export default function RealWorkspace() {
  const [data, setData] = useState<LibraryResponse | null>(null);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [revealedAsset, setRevealedAsset] = useState<AssetRecord | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const anchor = useRef<string | null>(null);
  const [trashView, setTrashView] = useState(false);
  const [trashEntries, setTrashEntries] = useState<
    {
      id: string;
      name: string;
      originalPath: string;
      fileCount: number;
      folderCount: number;
      createdAt: string;
    }[]
  >([]);
  const [trashPlan, setTrashPlan] = useState<{
    name: string;
    fileCount: number;
    folderCount: number;
    token: string;
    ids?: string[];
    folderId?: string;
  } | null>(null);
  const [destination, setDestination] = useState("");
  const [movingFolderId, setMovingFolderId] = useState<string | null>(null);
  const [naming, setNaming] = useState<NamingOptions>(defaultNaming);
  const [namingValid, setNamingValid] = useState(false);
  const [renameOptions, setRenameOptions] =
    useState<NamingOptions>(defaultNaming);
  const [renamePlan, setRenamePlan] = useState<{
    token: string;
    rows: { id: string; oldName: string; newName: string; error?: string }[];
  } | null>(null);
  const [templates, setTemplates] = useState<
    { id: string; name: string; folders: string[] }[]
  >([]);
  const [templateId, setTemplateId] = useState("standard");
  const [projectNumber, setProjectNumber] = useState("");
  const [projectYear, setProjectYear] = useState(new Date().getFullYear());
  const [projectDescription, setProjectDescription] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("name");
  const [view, setView] = useState<"gallery" | "list">("gallery");
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [modal, setModal] = useState<Dialog>(null);
  const [name, setName] = useState("");
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [sourceType, setSourceType] = useState("UNKNOWN");
  const [uploadResults, setUploadResults] = useState<UploadResult[] | null>(
    null,
  );
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const folders = data?.folders || [];
  const currentId = folderId || data?.rootId || null;
  const current = folders.find((f) => f.id === currentId);
  const assets = data?.assets || [];
  const childFolders = folders.filter(
    (f) =>
      f.parentId === currentId &&
      (!search ||
        f.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())),
  );
  const selected = trashView
    ? null
    : assets.find((a) => a.id === selectedId) ||
      (revealedAsset?.id === selectedId ? revealedAsset : null) ||
      assets[0] ||
      null;
  useEffect(() => {
    api<typeof templates>("/api/actions?action=templates")
      .then(setTemplates)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (trashView)
      api<typeof trashEntries>("/api/actions")
        .then(setTrashEntries)
        .catch((e) => setError(e.message));
  }, [trashView, revision]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    const controller = new AbortController();
    // Loading state tracks the external network request, not derived component state.
    setLoading(true);
    const params = new URLSearchParams({ q: search, page: String(page), sort });
    if (folderId) params.set("folderId", folderId);
    api<LibraryResponse>("/api/library?" + params, {
      signal: controller.signal,
    })
      .then((value) => {
        if (!controller.signal.aborted) {
          setData(value);
          const parents: string[] = [];
          let f = value.folders.find((f) => f.id === folderId);
          while (f?.parentId) {
            parents.push(f.parentId);
            f = value.folders.find((p) => p.id === f!.parentId);
          }
          if (parents.length)
            setExpanded((prev) => new Set([...prev, ...parents]));
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [folderId, search, page, sort, revision]);
  useEffect(() => {
    if (modal) dialog.current?.showModal();
  }, [modal]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSidebarOpen(false);
        setDetailsOpen(false);
        setSelection(new Set());
        anchor.current = null;
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, []);
  const breadcrumbs: FolderRecord[] = [];
  let cursor = current;
  const visited = new Set<string>();
  while (cursor && !visited.has(cursor.id)) {
    visited.add(cursor.id);
    breadcrumbs.unshift(cursor);
    cursor = folders.find((f) => f.id === cursor!.parentId);
  }
  function navigate(id: string) {
    setRevealedAsset(null);
    setError("");
    setTrashView(false);
    setSelection(new Set());
    anchor.current = null;
    setFolderId(id);
    setPage(1);
    setSelectedId(null);
    setSidebarOpen(false);
    setDetailsOpen(false);
    setQuery("");
    setSearch("");
  }
  function open(type: Dialog) {
    if (type === "upload") {
      setNaming(defaultNaming);
      setNamingValid(false);
    }
    setError("");
    setName(type === "rename" ? current?.name || "" : "");
    setUploadFiles([]);
    setUploadResults(null);
    setModal(type);
  }
  function close() {
    if (!busy) setModal(null);
  }
  function choose(
    asset: AssetRecord,
    event?: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean },
    checkbox = false,
  ) {
    setSelection((prev) => {
      const next = new Set(
        event?.ctrlKey || event?.metaKey || checkbox ? prev : [],
      );
      const first = assets.findIndex((a) => a.id === anchor.current),
        last = assets.findIndex((a) => a.id === asset.id);
      if (event?.shiftKey && first >= 0)
        for (const a of assets.slice(
          Math.min(first, last),
          Math.max(first, last) + 1,
        ))
          next.add(a.id);
      else if (next.has(asset.id)) next.delete(asset.id);
      else next.add(asset.id);
      return next;
    });
    if (!event?.shiftKey) anchor.current = asset.id;
    setSelectedId(asset.id);
    setDetailsOpen(true);
  }
  async function action(payload: object) {
    return api<{
      results?: { ok: boolean; error?: string }[];
      folderId?: string;
    }>("/api/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }
  async function runAction(payload: object) {
    setBusy("Выполняем операцию…");
    setLoading(true);
    setError("");
    try {
      const result = await action(payload);
      const failures = result.results?.filter((r) => !r.ok) || [];
      if (failures.length)
        throw new Error(failures.map((r) => r.error).join("; "));
      setModal(null);
      setSelection(new Set());
      setRevision((r) => r + 1);
      if (
        result.folderId &&
        (!trashView || (payload as { action?: string }).action === "project")
      )
        navigate(result.folderId);
      setToast("Операция завершена");
      return true;
    } catch (e) {
      setError((e as Error).message);
      setRevision((r) => r + 1);
      return false;
    } finally {
      setBusy("");
    }
  }
  async function prepareTrash(folder = false) {
    setBusy("Проверяем содержимое…");
    setError("");
    const target = folder ? { folderId: currentId! } : { ids: [...selection] };
    try {
      const plan = await api<NonNullable<typeof trashPlan>>("/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "trash-preview", ...target }),
      });
      setTrashPlan({ ...plan, ...target });
      setModal("trash");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  function downloadFiles(folder = false) {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/api/download";
    form.target = "_blank";
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "payload";
    input.value = JSON.stringify(
      folder ? { folderId: currentId } : { ids: [...selection] },
    );
    form.append(input);
    document.body.append(form);
    form.submit();
    form.remove();
  }
  async function scan() {
    setBusy("Читаем структуру хранилища…");
    setError("");
    try {
      const result = await api<ScanResult>("/api/scan", { method: "POST" });
      setScanResult(result);
      setModal("scan");
      setRevision((r) => r + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function saveFolder(e: React.FormEvent) {
    e.preventDefault();
    if (!currentId) return;
    setBusy(modal === "rename" ? "Переименовываем папку…" : "Создаём папку…");
    setError("");
    try {
      const result = await api<FolderRecord>("/api/folders", {
        method: modal === "rename" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          parentId: currentId,
          folderId: currentId,
        }),
      });
      setExpanded((prev) => new Set([...prev, currentId]));
      setModal(null);
      setRevision((r) => r + 1);
      navigate(result.id);
      setToast("Папка сохранена на диске и в SQLite");
    } catch (e) {
      setError((e as Error).message);
      setRevision((r) => r + 1);
    } finally {
      setBusy("");
    }
  }
  function pick(files: File[]) {
    if (!currentId || busy || !files.length || trashView) return;
    setUploadFiles((prev) =>
      modal === "upload" && !uploadResults ? [...prev, ...files] : files,
    );
    setUploadResults(null);
    setSourceType("UNKNOWN");
    setError("");
    setModal("upload");
    if (modal !== "upload" || uploadResults) {
      setNaming(defaultNaming);
      setNamingValid(false);
    }
  }
  async function upload() {
    if (!currentId || !uploadFiles.length || !namingValid) return;
    setBusy("Сохраняем изображения и создаём превью…");
    setError("");
    try {
      const result: { results: UploadResult[] } = { results: [] };
      const groups: File[][] = [];
      let group: File[] = [],
        bytes = 0;
      for (const file of uploadFiles) {
        if (file.size > 50 * 1024 ** 2) {
          if (group.length) {
            groups.push(group);
            group = [];
            bytes = 0;
          }
          result.results.push({
            filename: file.name,
            status: "error",
            message: "Файл превышает 50 МБ",
          });
          continue;
        }
        if (group.length === 20 || bytes + file.size > 99 * 1024 ** 2) {
          groups.push(group);
          group = [];
          bytes = 0;
        }
        group.push(file);
        bytes += file.size;
      }
      if (group.length) groups.push(group);
      for (const batch of groups) {
        const offset = uploadFiles.indexOf(batch[0]);
        const body = new FormData();
        body.set("folderId", currentId);
        body.set("sourceType", sourceType);
        body.set(
          "naming",
          JSON.stringify({ ...naming, start: naming.start + offset }),
        );
        batch.forEach((file) => body.append("files", file));
        try {
          const response = await api<{ results: UploadResult[] }>(
            "/api/ingest",
            { method: "POST", body },
          );
          result.results.push(...response.results);
        } catch (e) {
          result.results.push(
            ...batch.map((file) => ({
              filename: file.name,
              status: "error" as const,
              message: (e as Error).message,
            })),
          );
        }
      }
      setUploadResults(result.results);
      setRevision((r) => r + 1);
      const imported = result.results.find((r) => r.status === "imported");
      if (imported?.assetId) setSelectedId(imported.assetId);
    } catch (e) {
      setError((e as Error).message);
      setRevision((r) => r + 1);
    } finally {
      setBusy("");
    }
  }
  const renderTree = (
    parentId: string | null,
    depth: number,
  ): React.ReactNode =>
    folders
      .filter((f) => f.parentId === parentId)
      .map((item) => {
        const children = folders.some((f) => f.parentId === item.id);
        const isExpanded = expanded.has(item.id) || depth === 0;
        return (
          <div key={item.id}>
            <div
              className={`real-tree-row ${currentId === item.id ? "active" : ""}`}
              style={{ paddingLeft: Math.min(depth, 8) * 15 + 7 }}
            >
              <button
                className="tree-expander"
                aria-label={`Раскрыть ${item.name}`}
                aria-expanded={children ? isExpanded : undefined}
                disabled={!children || depth === 0}
                onClick={() =>
                  setExpanded((prev) => {
                    const next = new Set(prev);
                    if (next.has(item.id)) next.delete(item.id);
                    else next.add(item.id);
                    return next;
                  })
                }
              >
                {children ? (
                  isExpanded ? (
                    <ChevronDown size={14} />
                  ) : (
                    <ChevronRight size={14} />
                  )
                ) : (
                  <span />
                )}
              </button>
              <button
                className="real-tree-select"
                title={item.storagePath || item.name}
                aria-current={currentId === item.id ? "page" : undefined}
                onClick={() => navigate(item.id)}
              >
                <Folder
                  size={19}
                  className={depth === 1 ? "gold-folder" : ""}
                />
                <span>{item.name}</span>
                <small>{item.fileCount}</small>
              </button>
            </div>
            {children && isExpanded && renderTree(item.id, depth + 1)}
          </div>
        );
      });
  const used = data ? data.capacity.total - data.capacity.available : 0;
  const percent = data?.capacity.total
    ? Math.round((used / data.capacity.total) * 100)
    : 0;
  return (
    <div
      className="app-shell real-app"
      onDragOverCapture={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDropCapture={(e) => {
        e.preventDefault();
        e.stopPropagation();
        dragDepth.current = 0;
        setDragging(false);
        pick(Array.from(e.dataTransfer.files));
      }}
    >
      <header className="topbar">
        <button
          className="icon-button mobile-menu"
          aria-label="Открыть меню"
          onClick={() => setSidebarOpen(true)}
        >
          <Menu />
        </button>
        <Link className="brand" href="/" aria-label="GART Media — главная">
          <span className="brand-mark">
            G<span />
          </span>
          <span>
            GART <b>Media</b>
          </span>
        </Link>
        <label className="search">
          <Search size={21} />
          <input
            aria-label="Поиск в выбранной папке"
            placeholder="Поиск в выбранной папке"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button aria-label="Очистить поиск" onClick={() => setQuery("")}>
              <X size={16} />
            </button>
          )}
        </label>
        <div className="header-actions">
          <button
            className="button primary"
            disabled={!currentId || !!busy}
            onClick={() => open("upload")}
          >
            <Upload size={18} />
            <span>Загрузить</span>
          </button>
          <button
            className="button"
            disabled={!currentId || !!busy}
            onClick={() => open("folder")}
          >
            <FolderPlus size={19} />
            <span>Новая папка</span>
          </button>
          <button
            className="button primary"
            disabled={!!busy || !data?.rootId}
            onClick={() => open("project")}
          >
            <Plus size={19} />
            <span>Новый проект</span>
          </button>
        </div>
        <div className="account-actions">
          <button
            className="icon-button"
            aria-label="Уведомления — позже"
            disabled
          >
            <Bell size={22} />
          </button>
          <span className="avatar local-avatar" title="Локальная медиатека">
            G
          </span>
        </div>
      </header>
      {sidebarOpen && (
        <button
          className="drawer-backdrop"
          aria-label="Закрыть меню"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className={`sidebar ${sidebarOpen ? "is-open" : ""}`}
        aria-label="Навигация медиатеки"
      >
        <div className="mobile-sidebar-title">
          <strong>Медиатека</strong>
          <button
            className="icon-button"
            aria-label="Закрыть меню"
            onClick={() => setSidebarOpen(false)}
          >
            <X />
          </button>
        </div>
        <nav className="main-nav">
          <button
            className="nav-item"
            onClick={() => {
              if (data?.rootId) navigate(data.rootId);
            }}
          >
            <Files size={21} />
            <span>Все файлы</span>
          </button>
          {[
            { label: "Избранное", icon: Star },
            { label: "Недавние", icon: Clock3 },
            { label: "Общие", icon: Share2 },
          ].map(({ label, icon: Icon }) => (
            <button
              className="nav-item"
              key={label}
              disabled
              title="Будет доступно позже"
            >
              <Icon size={21} />
              <span>{label}</span>
            </button>
          ))}
          <button
            className="nav-item"
            onClick={() => {
              setTrashView(true);
              setSelection(new Set());
              setSidebarOpen(false);
            }}
          >
            <Trash2 size={21} />
            <span>Корзина</span>
          </button>
        </nav>
        <div className="folder-heading">
          <h2>Папки</h2>
          <div>
            <button
              className="icon-button small"
              aria-label="Scan — прочитать хранилище"
              disabled={!!busy}
              onClick={scan}
            >
              <RefreshCw size={16} />
            </button>
            <button
              className="icon-button small"
              aria-label="Добавить папку"
              disabled={!currentId || !!busy}
              onClick={() => open("folder")}
            >
              <Plus size={16} />
            </button>
          </div>
        </div>
        <nav className="folder-tree real-folder-tree" aria-label="Дерево папок">
          {renderTree(null, 0)}
          {!folders.length && (
            <p className="tree-hint">
              Нажмите Scan, чтобы прочитать существующие папки.
            </p>
          )}
        </nav>
        <div className="storage">
          <h3>Диск хранилища</h3>
          <div className="storage-line">
            <div
              className="progress"
              role="progressbar"
              aria-label="Использование диска"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span style={{ width: percent + "%" }} />
            </div>
            <span>{percent}%</span>
          </div>
          <p>
            {data
              ? `${formatSize(data.capacity.available)} свободно из ${formatSize(data.capacity.total)}`
              : "Подключение…"}
          </p>
          <p>{data?.indexed || 0} изображений в каталоге</p>
        </div>
      </aside>
      <main
        className={`workspace ${dragging ? "drop-active" : ""}`}
        onDragEnter={(e) => {
          e.preventDefault();
          if (e.dataTransfer.types.includes("Files")) {
            dragDepth.current++;
            setDragging(true);
          }
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          if (--dragDepth.current <= 0) setDragging(false);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          pick(Array.from(e.dataTransfer.files));
        }}
      >
        <div className="workspace-toolbar">
          <nav
            className="breadcrumbs real-breadcrumbs"
            aria-label="Путь к папке"
          >
            <Files size={18} />
            {breadcrumbs.map((item, index) => (
              <span className="breadcrumb-part" key={item.id}>
                {index > 0 && <ChevronRight size={15} />}
                <button
                  aria-current={item.id === currentId ? "page" : undefined}
                  onClick={() => navigate(item.id)}
                >
                  {item.name}
                </button>
              </span>
            ))}
          </nav>
          <div className="view-controls">
            <button
              className="icon-button small"
              aria-label="Переименовать папку"
              disabled={!current?.parentId || !!busy}
              onClick={() => open("rename")}
            >
              <Pencil size={17} />
            </button>
            <button
              className="icon-button small"
              aria-label="Сортировать по дате"
              aria-pressed={sort === "date"}
              onClick={() => {
                setSort(sort === "date" ? "name" : "date");
                setPage(1);
              }}
            >
              <ArrowUpDown size={17} />
            </button>
            <button
              className={`icon-button small ${view === "gallery" ? "selected" : ""}`}
              aria-label="Галерея"
              aria-pressed={view === "gallery"}
              onClick={() => setView("gallery")}
            >
              <LayoutGrid size={18} />
            </button>
            <button
              className={`icon-button small ${view === "list" ? "selected" : ""}`}
              aria-label="Список"
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
            >
              <List size={18} />
            </button>
          </div>
        </div>
        <div className="filter-bar">
          <button className="filter-chip active">
            Все<span>{data?.total || 0}</span>
          </button>
          <span className="filter-chip">
            Фото<span>{data?.total || 0}</span>
          </span>
          {["Видео", "Рендеры", "Документы"].map((label) => (
            <button
              key={label}
              className="filter-chip"
              disabled
              title="На этом этапе поддерживаются только изображения"
            >
              {label}
            </button>
          ))}
          <button
            className="button scan-button"
            disabled={!!busy}
            onClick={scan}
          >
            <RefreshCw size={15} />
            Scan
          </button>
        </div>
        {!trashView && currentId && (
          <div className="folder-actions">
            <button
              className="button"
              disabled={!!busy || !current?.parentId}
              onClick={() => {
                setMovingFolderId(currentId);
                setDestination("");
                open("move");
              }}
            >
              Переместить папку
            </button>
            <button
              className="button"
              disabled={!!busy || loading}
              onClick={async () => {
                try {
                  setSelection(
                    new Set(
                      await api<string[]>(
                        "/api/actions?action=ids&folderId=" + currentId,
                      ),
                    ),
                  );
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Выбрать всё
            </button>
            <button
              className="button"
              disabled={!!busy}
              onClick={() => downloadFiles(true)}
            >
              Скачать папку ZIP
            </button>
            <button
              className="button"
              disabled={!!busy || !current?.parentId}
              onClick={() => prepareTrash(true)}
            >
              Удалить папку
            </button>
          </div>
        )}
        {!!selection.size && !trashView && (
          <div
            className="selection-actions"
            role="toolbar"
            aria-label="Действия с выделением"
          >
            <strong>Выбрано: {selection.size}</strong>
            <button
              className="button"
              disabled={!!busy}
              onClick={() => downloadFiles()}
            >
              Скачать
            </button>
            <button
              className="button"
              disabled={!!busy}
              onClick={() => {
                setDestination("");
                setMovingFolderId(null);
                open("move");
              }}
            >
              Переместить
            </button>
            <button className="button" disabled>
              Добавить в коллекцию
            </button>
            <button
              className="button"
              disabled={!!busy}
              onClick={() => {
                setRenamePlan(null);
                setRenameOptions({
                  ...defaultNaming,
                  mode: "template",
                  template:
                    selection.size === 1
                      ? filenameParts(
                          assets.find((a) => selection.has(a.id))
                            ?.storedFilename || "",
                        ).stem
                      : "{original}_{counter}",
                });
                open("asset-rename");
              }}
            >
              Переименовать
            </button>
            <button
              className="button"
              disabled={!!busy}
              onClick={() => prepareTrash()}
            >
              Удалить
            </button>
            <button
              className="button"
              onClick={() => {
                setSelection(new Set());
                anchor.current = null;
              }}
            >
              Снять выделение
            </button>
          </div>
        )}
        {busy && (
          <div className="status-banner" role="status">
            <LoaderCircle className="spinning" size={17} />
            {busy}
          </div>
        )}
        {error && !modal && (
          <div className="error-banner" role="alert">
            {error}
            <button
              className="button"
              onClick={() => setRevision((r) => r + 1)}
            >
              Повторить
            </button>
          </div>
        )}
        <div className="asset-scroll" aria-busy={loading}>
          {trashView ? (
            <section className="trash-list">
              <h2>Корзина</h2>
              <p>Окончательное удаление отключено. Оригиналы сохранены.</p>
              {!trashEntries.length && <p>Корзина пуста</p>}
              {trashEntries.map((entry) => (
                <article key={entry.id}>
                  <div>
                    <strong>{entry.name}</strong>
                    <p>{entry.originalPath}</p>
                    <small>
                      Файлов: {entry.fileCount} · Вложенных папок:{" "}
                      {entry.folderCount} · {date(entry.createdAt)}
                    </small>
                  </div>
                  <button
                    className="button"
                    disabled={!!busy}
                    onClick={() =>
                      runAction({ action: "restore", id: entry.id })
                    }
                  >
                    Восстановить
                  </button>
                </article>
              ))}
            </section>
          ) : loading ? (
            <div className="empty-state">
              <LoaderCircle className="spinning" />
              <p>Читаем каталог…</p>
            </div>
          ) : (
            <>
              {!!childFolders.length && (
                <div className="central-folders" aria-label="Вложенные папки">
                  {childFolders.map((f) => (
                    <button
                      key={f.id}
                      className="central-folder"
                      title={f.storagePath}
                      onClick={() => navigate(f.id)}
                    >
                      <Folder size={28} />
                      <span>{f.name}</span>
                      <small>{f.fileCount} изображений</small>
                    </button>
                  ))}
                </div>
              )}
              {view === "list" && assets.length > 0 && (
                <div className="list-heading">
                  <span>Название</span>
                  <span>Тип</span>
                  <span>Размер</span>
                </div>
              )}
              <div
                className={`asset-grid ${view === "list" ? "list-view" : ""}`}
                aria-label="Файлы"
              >
                {assets.map((asset) => (
                  <div
                    role="button"
                    tabIndex={0}
                    key={asset.id}
                    className={`asset-card ${selection.has(asset.id) ? "is-selected" : ""}`}
                    aria-label={`Выбрать ${asset.storedFilename}`}
                    aria-pressed={selection.has(asset.id)}
                    onClick={(e) => choose(asset, e)}
                    onKeyDown={(e) => {
                      if (
                        e.target === e.currentTarget &&
                        (e.key === "Enter" || e.key === " ")
                      ) {
                        e.preventDefault();
                        choose(asset, e);
                      }
                    }}
                    onDoubleClick={() => {
                      choose(asset);
                      open("preview");
                    }}
                  >
                    <div className="thumbnail">
                      <FileImage asset={asset} />
                      <input
                        className="asset-checkbox"
                        type="checkbox"
                        aria-label={`Выделить ${asset.storedFilename}`}
                        checked={selection.has(asset.id)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => choose(asset, undefined, true)}
                      />
                    </div>
                    <div className="asset-caption">
                      <span className="asset-name" title={asset.storedFilename}>
                        {asset.storedFilename}
                      </span>
                      <span className="asset-size">
                        {formatSize(asset.fileSize)}
                      </span>
                      <time className="asset-date" dateTime={asset.createdAt}>
                        {date(asset.createdAt)}
                      </time>
                    </div>
                    <span className="list-kind">
                      {asset.extension.toUpperCase()}
                    </span>
                    <span className="list-size">
                      {formatSize(asset.fileSize)}
                    </span>
                  </div>
                ))}
              </div>
              {!!data?.unindexedFiles?.length && (
                <section className="unindexed-files">
                  <h3>Другие физические файлы</h3>
                  {data.unindexedFiles.map((f) => (
                    <p key={f.path}>
                      <Files size={16} />
                      {f.name} · {formatSize(f.size)}
                    </p>
                  ))}
                  <small>
                    Новые изображения и дубли проверяются через Scan. Остальные
                    форматы показаны без предпросмотра.
                  </small>
                </section>
              )}
              {!assets.length &&
                !childFolders.length &&
                !data?.unindexedFiles?.length && (
                  <div className="empty-state">
                    <FolderOpen size={42} />
                    <h2>
                      {!data?.rootId
                        ? "Подключите медиатеку"
                        : search
                          ? "Ничего не найдено"
                          : "В этой папке пусто"}
                    </h2>
                    <p>
                      {!data?.rootId
                        ? "Scan прочитает существующую структуру GART_FILES."
                        : "Выберите вложенную папку или загрузите JPG, PNG, WEBP."}
                    </p>
                    <button
                      className="button primary"
                      disabled={!!busy}
                      onClick={() => (data?.rootId ? open("upload") : scan())}
                    >
                      {data?.rootId
                        ? "Загрузить изображения"
                        : "Scan хранилища"}
                    </button>
                  </div>
                )}
            </>
          )}
        </div>
        <footer className="workspace-footer">
          <span>
            {data?.total || 0} изображений ·{" "}
            {selection.size
              ? `выбрано файлов: ${selection.size}`
              : "ничего не выбрано"}
          </span>
          <div className="pagination">
            <button
              disabled={page === 1 || loading}
              onClick={() => setPage((p) => p - 1)}
              aria-label="Предыдущая страница"
            >
              ←
            </button>
            <span>
              {page} / {Math.max(1, Math.ceil((data?.total || 0) / 60))}
            </span>
            <button
              disabled={page * 60 >= (data?.total || 0) || loading}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Следующая страница"
            >
              →
            </button>
          </div>
        </footer>
        {dragging && (
          <div className="drop-overlay">
            <Upload size={44} />
            <strong>
              {current
                ? `Загрузить в «${current.name}»`
                : "Сначала выполните Scan"}
            </strong>
            <span>JPG · JPEG · PNG · WEBP</span>
          </div>
        )}
      </main>
      {detailsOpen && (
        <button
          className="details-backdrop"
          aria-label="Закрыть свойства"
          onClick={() => setDetailsOpen(false)}
        />
      )}
      <aside
        className={`properties ${detailsOpen ? "is-open" : ""}`}
        aria-label="Свойства файла"
      >
        <div className="mobile-details-title">
          <strong>Свойства файла</strong>
          <button
            className="icon-button"
            aria-label="Закрыть свойства"
            onClick={() => setDetailsOpen(false)}
          >
            <PanelRightClose />
          </button>
        </div>
        {selected && !loading ? (
          <>
            <button
              className="preview-button"
              aria-label="Открыть предпросмотр"
              onClick={() => open("preview")}
            >
              <FileImage key={selected.id} asset={selected} preview />
            </button>
            <h1>{selected.storedFilename}</h1>
            <p className="file-summary">
              {selected.extension.toUpperCase()} ·{" "}
              {formatSize(selected.fileSize)} · {selected.width} ×{" "}
              {selected.height}
            </p>
            <span className="source-badge">
              {sourceLabels[selected.sourceType] || selected.sourceType}
            </span>
            <div className="property-actions">
              <button
                className="button primary"
                onClick={() => open("preview")}
              >
                <ExternalLink size={17} />
                Открыть
              </button>
            </div>
            <div
              className="property-tabs"
              role="tablist"
              aria-label="Информация о файле"
            >
              <button role="tab" aria-selected="true">
                Метаданные
              </button>
              <button
                role="tab"
                aria-selected="false"
                disabled
                title="Будет позже"
              >
                Теги
              </button>
              <button
                role="tab"
                aria-selected="false"
                disabled
                title="Будет позже"
              >
                Комментарии
              </button>
            </div>
            <dl className="metadata">
              {[
                ["Название", selected.storedFilename],
                ["Имя при импорте", selected.originalFilename],
                ["Тип файла", selected.mimeType],
                ["Размер", formatSize(selected.fileSize)],
                ["Разрешение", `${selected.width} × ${selected.height}`],
                ["Источник", sourceLabels[selected.sourceType]],
                ["Загружено", date(selected.createdAt)],
                ["Media ID", selected.mediaId],
                ["SHA-256", selected.checksumSha256.slice(0, 16) + "…"],
                ["Папка", current?.name || ""],
                ["Путь", selected.storagePath],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd
                    title={
                      label === "SHA-256" ? selected.checksumSha256 : value
                    }
                  >
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            <section className="description">
              <h2>Оригинал</h2>
              <p>Хранится без изменений. Превью создано отдельно.</p>
            </section>
          </>
        ) : (
          <div className="properties-empty">
            <Files size={38} />
            <p>
              Выберите изображение,
              <br />
              чтобы посмотреть свойства
            </p>
          </div>
        )}
      </aside>
      {modal && (
        <dialog
          ref={dialog}
          className={modal === "preview" ? "modal preview-modal" : "modal"}
          aria-label="Действие с медиатекой"
          onCancel={(e) => {
            // A file input emits its own bubbling cancel event when the native picker closes.
            // Only the dialog's Escape event should dismiss this modal.
            if (e.target !== e.currentTarget) return;
            if (busy) e.preventDefault();
            else close();
          }}
          onClick={(e) => {
            if (e.currentTarget === e.target) close();
          }}
        >
          <button
            className="icon-button modal-close"
            aria-label="Закрыть диалог"
            disabled={!!busy}
            onClick={close}
          >
            <X />
          </button>
          {modal === "trash" && trashPlan ? (
            <>
              <h2>Отправить в корзину?</h2>
              <p>{trashPlan.name}</p>
              <p>
                Файлов: {trashPlan.fileCount}. Вложенных папок:{" "}
                {trashPlan.folderCount}.
              </p>
              <p>
                Объекты будут перемещены в корзину с возможностью
                восстановления. Окончательного удаления нет.
              </p>
              <div className="modal-actions">
                <button className="button" disabled={!!busy} onClick={close}>
                  Отмена
                </button>
                <button
                  className="button primary"
                  disabled={!!busy}
                  onClick={async () => {
                    const ok = await runAction({
                      action: "trash",
                      ...trashPlan,
                    });
                    if (ok && trashPlan.folderId && current?.parentId)
                      navigate(current.parentId);
                  }}
                >
                  В корзину
                </button>
              </div>
            </>
          ) : modal === "asset-rename" ? (
            <>
              <h2>Переименовать · {selection.size} файлов</h2>
              <NamingEditor
                value={renameOptions}
                onChange={(v) => {
                  setRenameOptions(v);
                  setRenamePlan(null);
                }}
              />
              <p className="naming-help">
                Переменные project/client берутся из проекта каждого файла; date
                — дата импорта, source — источник, type — расширение.
                Недоступные значения будут показаны в preview как ошибки.
              </p>
              <button
                className="button"
                disabled={!!busy}
                onClick={async () => {
                  setBusy("Проверяем новые имена…");
                  setError("");
                  try {
                    setRenamePlan(
                      await api("/api/actions", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          action: "rename-preview",
                          ids: [...selection],
                          naming: renameOptions,
                        }),
                      }),
                    );
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy("");
                  }
                }}
              >
                Проверить имена
              </button>
              {renamePlan && <NamePreview rows={renamePlan.rows} />}
              <button
                className="button primary"
                disabled={
                  !!busy || !renamePlan || renamePlan.rows.some((r) => r.error)
                }
                onClick={() =>
                  runAction({
                    action: "rename-apply",
                    ids: [...selection],
                    naming: renameOptions,
                    token: renamePlan?.token,
                  })
                }
              >
                Применить переименование
              </button>
            </>
          ) : modal === "move" ? (
            <>
              <h2>
                {movingFolderId
                  ? "Переместить папку"
                  : `Переместить ${selection.size} файлов`}
              </h2>
              <FolderPicker
                folders={folders}
                value={destination}
                onChange={setDestination}
                currentFolderId={currentId || ""}
                movingFolderId={movingFolderId}
              />
              <p>
                Оригиналы будут перемещены без копирования. При совпадении имени
                операция остановится.
              </p>
              <button
                className="button primary"
                disabled={!destination || !!busy}
                onClick={() =>
                  runAction({
                    action: movingFolderId ? "move-folder" : "move",
                    movingFolderId,
                    ids: [...selection],
                    folderId: destination,
                  })
                }
              >
                Переместить сюда
              </button>
            </>
          ) : modal === "project" ? (
            <>
              <h2>Новый проект</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void runAction({
                    action: "project",
                    projectId: projectNumber.trim(),
                    name: name.trim(),
                    year: projectYear,
                    description: projectDescription,
                    templateId,
                  });
                }}
              >
                <label className="field-label">
                  Шаблон
                  <select
                    value={templateId}
                    onChange={(e) => setTemplateId(e.target.value)}
                  >
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-label">
                  Номер проекта
                  <input
                    required
                    placeholder="GART-0264"
                    pattern="GART-[0-9]{4,8}"
                    value={projectNumber}
                    onChange={(e) => setProjectNumber(e.target.value)}
                  />
                </label>
                <label className="field-label">
                  Название
                  <input
                    required
                    value={name}
                    maxLength={100}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label className="field-label">
                  Год
                  <input
                    required
                    type="number"
                    min={1900}
                    max={2200}
                    value={projectYear}
                    onChange={(e) => setProjectYear(Number(e.target.value))}
                  />
                </label>
                <label className="field-label">
                  Описание
                  <textarea
                    maxLength={4000}
                    value={projectDescription}
                    onChange={(e) => setProjectDescription(e.target.value)}
                  />
                </label>
                <p className="subtle">
                  Будет создано{" "}
                  {templates.find((t) => t.id === templateId)?.folders.length ||
                    0}{" "}
                  основных папок. Глубокие подпапки не создаются.
                </p>
                <button className="button primary" disabled={!!busy}>
                  Создать проект
                </button>
              </form>
            </>
          ) : modal === "preview" && selected ? (
            <>
              <FileImage asset={selected} preview />
              <h2>{selected.storedFilename}</h2>
              <p className="subtle">
                {selected.width} × {selected.height} · {selected.storagePath}
              </p>
            </>
          ) : modal === "scan" ? (
            <>
              <h2>Scan завершён</h2>
              <p className="scan-summary">
                Найдено новых файлов: {scanResult?.imageCount} · Без изменений:{" "}
                {scanResult?.unchanged} · Точных дублей:{" "}
                {scanResult?.duplicateCount} · Ошибок: {scanResult?.skipped}
              </p>
              <div className="scan-duplicates">
                {scanResult?.duplicates.map((copy) => (
                  <article key={copy.id}>
                    <strong>{copy.filename}</strong>
                    <p>Найденная копия: {copy.storagePath}</p>
                    <p>
                      Существующий MediaAsset: {copy.mediaId}
                      <br />
                      {copy.existingPath}
                    </p>
                    {copy.status === "KEPT" && (
                      <p>Обе физические копии оставлены</p>
                    )}
                    <button
                      className="button"
                      onClick={async () => {
                        if (copy.existingTrash) {
                          setTrashView(true);
                        } else {
                          try {
                            const asset = await api<AssetRecord>(
                              "/api/actions?action=asset&id=" +
                                encodeURIComponent(copy.assetId),
                            );
                            navigate(asset.folderId);
                            setRevealedAsset(asset);
                            setSelectedId(asset.id);
                            setDetailsOpen(true);
                          } catch (e) {
                            setError((e as Error).message);
                            return;
                          }
                        }
                        close();
                      }}
                    >
                      Показать существующий
                    </button>
                    <button
                      className="button"
                      disabled={!!busy || copy.status === "KEPT"}
                      onClick={async () => {
                        setBusy("Сохраняем решение…");
                        try {
                          await action({
                            action: "duplicate-keep",
                            id: copy.id,
                          });
                          setScanResult((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  duplicates: prev.duplicates.map((c) =>
                                    c.id === copy.id
                                      ? { ...c, status: "KEPT" }
                                      : c,
                                  ),
                                }
                              : prev,
                          );
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy("");
                        }
                      }}
                    >
                      Оставить обе физические копии
                    </button>
                    <button
                      className="button"
                      disabled={!!busy}
                      onClick={async () => {
                        if (
                          !window.confirm(
                            "Переместить только найденную копию в корзину?\n" +
                              copy.storagePath,
                          )
                        )
                          return;
                        setBusy("Перемещаем копию в корзину…");
                        try {
                          await action({
                            action: "duplicate-trash",
                            id: copy.id,
                          });
                          setScanResult((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  duplicates: prev.duplicates.filter(
                                    (c) => c.id !== copy.id,
                                  ),
                                }
                              : prev,
                          );
                          setRevision((r) => r + 1);
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy("");
                        }
                      }}
                    >
                      Переместить найденную копию в корзину
                    </button>
                  </article>
                ))}
              </div>
              <p className="subtle">
                Прочитано папок: {scanResult?.folderCount}. Добавлено
                изображений: {scanResult?.imageCount}. Пропущено с
                предупреждением: {scanResult?.skipped}.
              </p>
              <p className="subtle">
                Существующие файлы не перемещались и не изменялись.
              </p>
              <ul className="scan-warnings">
                {scanResult?.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
              <button className="button primary" onClick={close}>
                Готово
              </button>
            </>
          ) : modal === "upload" ? (
            <>
              <div className="modal-icon">
                <Upload />
              </div>
              <h2>Загрузить изображения</h2>
              <p className="subtle">
                Папка: {current?.storagePath || "GART_FILES"}
              </p>
              {uploadResults ? (
                <>
                  <p className="upload-summary" role="status">
                    Загружено:{" "}
                    {
                      uploadResults.filter((r) => r.status === "imported")
                        .length
                    }{" "}
                    · Пропущено:{" "}
                    {
                      uploadResults.filter((r) => r.status === "duplicate")
                        .length
                    }{" "}
                    · Ошибок:{" "}
                    {uploadResults.filter((r) => r.status === "error").length}
                  </p>
                  <ul className="upload-results">
                    {uploadResults.map((result, index) => (
                      <li key={index} className={result.status}>
                        <strong>{result.filename}</strong>
                        <span>
                          {result.status === "imported"
                            ? "Загружен"
                            : result.status === "duplicate"
                              ? "Пропущен — такой файл уже есть"
                              : "Ошибка: " + result.message}
                        </span>
                        {result.storagePath && (
                          <small>{result.storagePath}</small>
                        )}
                        {result.status === "duplicate" && (
                          <button
                            className="button"
                            onClick={() => {
                              const parent = folders.find(
                                (f) =>
                                  f.storagePath ===
                                  result.storagePath
                                    ?.split("/")
                                    .slice(0, -1)
                                    .join("/"),
                              );
                              if (parent) {
                                navigate(parent.id);
                                setSelectedId(result.assetId || null);
                                close();
                              }
                            }}
                          >
                            Показать папку
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                  <button className="button primary" onClick={close}>
                    Готово
                  </button>
                </>
              ) : (
                <>
                  <input
                    ref={fileInput}
                    className="file-input"
                    type="file"
                    multiple
                    accept=".jpg,.jpeg,.png,.webp"
                    aria-label="Выбрать изображения"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      e.target.value = "";
                      pick(files);
                    }}
                  />
                  <button
                    className="upload-placeholder upload-picker"
                    disabled={!!busy}
                    onClick={() => fileInput.current?.click()}
                  >
                    <Upload size={30} />
                    <strong>
                      {uploadFiles.length
                        ? `Выбрано файлов: ${uploadFiles.length}`
                        : "Выбрать изображения"}
                    </strong>
                    <span>
                      Или перетащите файлы сюда · JPG, JPEG, PNG, WEBP · до 50
                      МБ на файл
                    </span>
                  </button>
                  <ul className="pending-files">
                    {uploadFiles.map((file, index) => (
                      <li key={index}>
                        {file.name} · {formatSize(file.size)}
                      </li>
                    ))}
                  </ul>
                  <label className="field-label">
                    Источник
                    <select
                      aria-label="Источник"
                      value={sourceType}
                      disabled={!!busy}
                      onChange={(e) => setSourceType(e.target.value)}
                    >
                      {Object.entries(sourceLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <fieldset className="naming-fieldset" disabled={!!busy}>
                    {currentId && (
                      <UploadNaming
                        folderId={currentId}
                        names={uploadFiles.map((f) => f.name)}
                        sourceType={sourceType}
                        value={naming}
                        onChange={(v) => {
                          setNaming(v);
                          setNamingValid(false);
                        }}
                        onValid={setNamingValid}
                      />
                    )}
                  </fieldset>
                  <div className="modal-actions">
                    <button
                      className="button"
                      disabled={!!busy}
                      onClick={close}
                    >
                      Отмена
                    </button>
                    <button
                      className="button primary"
                      disabled={!uploadFiles.length || !namingValid || !!busy}
                      onClick={upload}
                    >
                      {busy ? "Загрузка…" : "Загрузить файлы"}
                    </button>
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <div className="modal-icon">
                <FolderPlus />
              </div>
              <h2>
                {modal === "rename" ? "Переименовать папку" : "Новая папка"}
              </h2>
              <p className="subtle">
                {modal === "rename"
                  ? `Переименование «${current?.name}» обновит пути вложенных папок и файлов в каталоге.`
                  : `Создать внутри «${current?.name || "GART_FILES"}»`}
              </p>
              <form onSubmit={saveFolder}>
                <label className="field-label">
                  Название
                  <input
                    autoFocus
                    required
                    maxLength={180}
                    value={name}
                    disabled={!!busy}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <div className="modal-actions">
                  <button
                    className="button"
                    type="button"
                    disabled={!!busy}
                    onClick={close}
                  >
                    Отмена
                  </button>
                  <button
                    className="button primary"
                    disabled={!name.trim() || !!busy}
                  >
                    {busy
                      ? "Сохранение…"
                      : modal === "rename"
                        ? "Переименовать"
                        : "Создать"}
                  </button>
                </div>
              </form>
            </>
          )}
          {error && (
            <div className="error-banner" role="alert">
              {error}
            </div>
          )}
        </dialog>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
          <button aria-label="Закрыть сообщение" onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
