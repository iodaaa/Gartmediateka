"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
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
type Dialog = "folder" | "rename" | "upload" | "preview" | "scan" | null;
type ScanResult = {
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
      alt={asset.originalFilename}
      loading={preview ? "eager" : "lazy"}
      onError={() => setFailed(true)}
    />
  );
}

export default function RealWorkspace() {
  const [data, setData] = useState<LibraryResponse | null>(null);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
  const selected = assets.find((a) => a.id === selectedId) || assets[0] || null;
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const params = new URLSearchParams({ q: search, page: String(page), sort });
    if (folderId) params.set("folderId", folderId);
    api<LibraryResponse>("/api/library?" + params, {
      signal: controller.signal,
    })
      .then((value) => {
        if (!controller.signal.aborted) {
          setData(value);
          setError("");
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
    setFolderId(id);
    setPage(1);
    setSelectedId(null);
    setSidebarOpen(false);
    setDetailsOpen(false);
    setQuery("");
    setSearch("");
  }
  function open(type: Dialog) {
    setError("");
    setName(type === "rename" ? current?.name || "" : "");
    setUploadFiles([]);
    setUploadResults(null);
    setModal(type);
  }
  function close() {
    if (!busy) setModal(null);
  }
  function choose(asset: AssetRecord) {
    setSelectedId(asset.id);
    setDetailsOpen(true);
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
    if (!currentId || busy) return;
    setUploadFiles(files);
    setUploadResults(null);
    setSourceType("UNKNOWN");
    setError("");
    setModal("upload");
  }
  async function upload() {
    if (!currentId || !uploadFiles.length) return;
    if (
      uploadFiles.length > 20 ||
      uploadFiles.some((f) => f.size > 50 * 1024 ** 2) ||
      uploadFiles.reduce((n, f) => n + f.size, 0) > 100 * 1024 ** 2
    ) {
      setError("До 20 изображений, до 50 МБ каждое и до 100 МБ за загрузку");
      return;
    }
    const body = new FormData();
    body.set("folderId", currentId);
    body.set("sourceType", sourceType);
    uploadFiles.forEach((file) => body.append("files", file));
    setBusy("Сохраняем изображения и создаём превью…");
    setError("");
    try {
      const result = await api<{ results: UploadResult[] }>("/api/ingest", {
        method: "POST",
        body,
      });
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
    <div className="app-shell real-app">
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
            disabled
            title="Проекты — на следующем этапе"
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
            { label: "Корзина", icon: Trash2 },
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
          {loading ? (
            <div className="empty-state">
              <LoaderCircle className="spinning" />
              <p>Читаем каталог…</p>
            </div>
          ) : (
            <>
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
                  <button
                    key={asset.id}
                    className={`asset-card ${selected?.id === asset.id ? "is-selected" : ""}`}
                    aria-label={`Выбрать ${asset.originalFilename}`}
                    aria-pressed={selected?.id === asset.id}
                    onClick={() => choose(asset)}
                    onDoubleClick={() => {
                      choose(asset);
                      open("preview");
                    }}
                  >
                    <div className="thumbnail">
                      <FileImage asset={asset} />
                      {selected?.id === asset.id && (
                        <span className="selection-check">
                          <Check size={13} />
                        </span>
                      )}
                    </div>
                    <div className="asset-caption">
                      <span
                        className="asset-name"
                        title={asset.originalFilename}
                      >
                        {asset.originalFilename}
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
                  </button>
                ))}
              </div>
              {!assets.length && (
                <div className="empty-state">
                  <FolderOpen size={42} />
                  <h2>
                    {!data?.rootId
                      ? "Подключите медиатеку"
                      : search
                        ? "Ничего не найдено"
                        : "В этой папке нет изображений"}
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
                    {data?.rootId ? "Загрузить изображения" : "Scan хранилища"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
        <footer className="workspace-footer">
          <span>
            {data?.total || 0} изображений ·{" "}
            {selected ? "выбран 1 файл" : "ничего не выбрано"}
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
            <h1>{selected.originalFilename}</h1>
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
                ["Название", selected.originalFilename],
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
          {modal === "preview" && selected ? (
            <>
              <FileImage asset={selected} preview />
              <h2>{selected.originalFilename}</h2>
              <p className="subtle">
                {selected.width} × {selected.height} · {selected.storagePath}
              </p>
            </>
          ) : modal === "scan" ? (
            <>
              <h2>Scan завершён</h2>
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
                    onChange={(e) =>
                      setUploadFiles(Array.from(e.target.files || []))
                    }
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
                    <span>JPG, JPEG, PNG, WEBP · до 50 МБ на файл</span>
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
                      disabled={!uploadFiles.length || !!busy}
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
