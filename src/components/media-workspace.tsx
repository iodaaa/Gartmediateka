"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
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
  Play,
  ExternalLink,
  MoreHorizontal,
  Pencil,
  X,
  Menu,
  PanelRightClose,
  Check,
  FileText,
  Film,
  Box,
} from "lucide-react";
import { demoAssets, type DemoAsset } from "@/lib/demo-data";

const navItems = [
  { label: "Все файлы", icon: Files },
  { label: "Избранное", icon: Star },
  { label: "Недавние", icon: Clock3 },
  { label: "Общие", icon: Share2 },
  { label: "Корзина", icon: Trash2 },
];
const folders = [
  { label: "Фото", count: 36, icon: Folder },
  { label: "Рендеры", count: 48, icon: Box },
  { label: "Видео", count: 12, icon: Film },
  { label: "Документы", count: 8, icon: FileText },
  { label: "Презентации", count: 6, icon: Folder },
];
const roots = [
  { label: "00_ВХОДЯЩИЕ", count: 124 },
  { label: "02_КОНТЕНТ_GART", count: 342 },
  { label: "03_ПОДРЯДЧИКИ_И_ПОСТАВЩИКИ", count: 78 },
  { label: "04_ВНЕШНИЕ_РЕСУРСЫ", count: 215 },
];
type ModalType = "upload" | "folder" | "project" | "preview" | null;

function MediaImage({
  asset,
  className = "",
}: {
  asset: DemoAsset;
  className?: string;
}) {
  return (
    <div
      role="img"
      aria-label={asset.name}
      className={`media-image ${className}`}
      style={
        {
          "--x": `${(asset.tile % 3) * 50}%`,
          "--y": `${Math.floor(asset.tile / 3) * 50}%`,
        } as CSSProperties
      }
    />
  );
}

export default function MediaWorkspace() {
  const [assets, setAssets] = useState(demoAssets);
  const [selectedId, setSelectedId] = useState(4);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Все");
  const [section, setSection] = useState("Все файлы");
  const [folder, setFolder] = useState("Фото");
  const [expanded, setExpanded] = useState(true);
  const [projectExpanded, setProjectExpanded] = useState(true);
  const [rootOpen, setRootOpen] = useState<string | null>(null);
  const [view, setView] = useState<"gallery" | "list">("gallery");
  const [tab, setTab] = useState("Метаданные");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [modal, setModal] = useState<ModalType>(null);
  const [popover, setPopover] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [createdFolders, setCreatedFolders] = useState<string[]>([]);
  const [createdProjects, setCreatedProjects] = useState<string[]>([]);
  const [toast, setToast] = useState("");
  const [sort, setSort] = useState(false);
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState("");
  const [comments, setComments] = useState<Record<number, string[]>>({});
  const [comment, setComment] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const selected = assets.find((a) => a.id === selectedId)!;
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (modal) dialog.current?.showModal();
    else dialog.current?.close();
  }, [modal]);
  const visible = assets.filter(
    (a) =>
      (filter === "Все" || a.kind === filter) &&
      a.name.toLocaleLowerCase("ru").includes(query.toLocaleLowerCase("ru")) &&
      (section !== "Избранное" || a.favorite) &&
      (section !== "Общие" || a.shared) &&
      section !== "Корзина" &&
      (folder === "Фото" ||
        folder === "ЖК Садовые кварталы" ||
        folders.some((f) => f.label === folder && a.kind === f.label)),
  );
  const displayed = sort
    ? [...visible].sort((a, b) => a.name.localeCompare(b.name, "ru"))
    : section === "Недавние"
      ? [...visible].reverse()
      : visible;
  function openModal(type: ModalType) {
    setName("");
    setPopover(null);
    setModal(type);
  }
  function choose(asset: DemoAsset) {
    setSelectedId(asset.id);
    setEditing(false);
    setTab("Метаданные");
    setDetailsOpen(true);
  }
  function selectFolder(label: string) {
    setFolder(label);
    setFilter("Все");
    setSection("Все файлы");
    setSidebarOpen(false);
  }
  function favorite() {
    setAssets((items) =>
      items.map((a) =>
        a.id === selectedId ? { ...a, favorite: !a.favorite } : a,
      ),
    );
    setPopover(null);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          className="icon-button mobile-menu"
          aria-label="Открыть меню"
          onClick={() => setSidebarOpen(true)}
        >
          <Menu />
        </button>
        <a className="brand" href="/" aria-label="GART Media — главная">
          <span className="brand-mark">
            G<span />
          </span>
          <span>
            GART <b>Media</b>
          </span>
        </a>
        <label className="search">
          <Search size={21} />
          <input
            aria-label="Поиск по медиатеке"
            placeholder="Поиск по медиатеке"
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
            onClick={() => openModal("upload")}
          >
            <Upload size={18} />
            <span>Загрузить</span>
          </button>
          <button className="button" onClick={() => openModal("folder")}>
            <FolderPlus size={19} />
            <span>Новая папка</span>
          </button>
          <button
            className="button primary"
            onClick={() => openModal("project")}
          >
            <Plus size={19} />
            <span>Новый проект</span>
          </button>
        </div>
        <div className="account-actions">
          <button
            className="icon-button"
            aria-label="Уведомления"
            aria-expanded={popover === "notifications"}
            onClick={() =>
              setPopover(popover === "notifications" ? null : "notifications")
            }
          >
            <Bell size={22} />
          </button>
          <button
            className="avatar"
            aria-label="Профиль пользователя"
            aria-expanded={popover === "profile"}
            onClick={() => setPopover(popover === "profile" ? null : "profile")}
          >
            АК
          </button>
        </div>
        {popover === "notifications" && (
          <div className="popover header-popover">
            <strong>Уведомления</strong>
            <p>Новых уведомлений пока нет</p>
            <span className="subtle">Здесь появятся события медиатеки.</span>
          </div>
        )}
        {popover === "profile" && (
          <div className="popover header-popover">
            <strong>Александр К.</strong>
            <p>Команда GART</p>
            <span className="subtle">Демонстрационный профиль</span>
          </div>
        )}
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
          {navItems.map(({ label, icon: Icon }) => (
            <button
              key={label}
              className={`nav-item ${section === label && label !== "Все файлы" ? "active" : ""}`}
              onClick={() => {
                setSection(label);
                setFolder("Фото");
                setFilter("Все");
                setSidebarOpen(false);
              }}
            >
              <Icon size={21} />
              <span>{label}</span>
              {label === "Избранное" && (
                <span className="nav-count">
                  {assets.filter((a) => a.favorite).length}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="folder-heading">
          <h2>Папки</h2>
          <button
            className="icon-button small"
            aria-label="Добавить папку"
            onClick={() => openModal("folder")}
          >
            <Plus size={16} />
          </button>
        </div>
        <nav className="folder-tree" aria-label="Дерево папок">
          <button
            className="tree-row"
            onClick={() => {
              setRootOpen(rootOpen === roots[0].label ? null : roots[0].label);
              selectFolder(roots[0].label);
            }}
          >
            <ChevronRight size={15} />
            <FolderOpen className="inbox-folder" size={21} />
            <span>{roots[0].label}</span>
            <small>124</small>
          </button>
          <button
            className="tree-row"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            <Folder className="gold-folder" size={21} />
            <span>01_КЛИЕНТСКИЕ_ПРОЕКТЫ</span>
            <small>0</small>
          </button>
          {expanded && (
            <>
              <div className="project-row">
                <button
                  className="tree-toggle"
                  aria-label="Развернуть проект"
                  aria-expanded={projectExpanded}
                  onClick={() => setProjectExpanded(!projectExpanded)}
                >
                  {projectExpanded ? (
                    <ChevronDown size={15} />
                  ) : (
                    <ChevronRight size={15} />
                  )}
                </button>
                <button
                  className="project-select"
                  onClick={() => selectFolder("ЖК Садовые кварталы")}
                >
                  <Folder size={21} />
                  <span>ЖК Садовые кварталы</span>
                  <small>156</small>
                </button>
              </div>
              {projectExpanded && (
                <div className="child-folders">
                  {folders.map(({ label, count, icon: Icon }) => (
                    <button
                      key={label}
                      className={`tree-row child ${folder === label ? "current-folder" : ""}`}
                      onClick={() => selectFolder(label)}
                    >
                      <Icon size={20} />
                      <span>{label}</span>
                      <small>{count}</small>
                    </button>
                  ))}
                  {createdFolders.map((label) => (
                    <button
                      className="tree-row child"
                      key={label}
                      onClick={() => selectFolder(label)}
                    >
                      <Folder size={20} />
                      <span>{label}</span>
                      <small>0</small>
                    </button>
                  ))}
                </div>
              )}
              {createdProjects.map((label) => (
                <button
                  key={label}
                  className="tree-row"
                  onClick={() => selectFolder(label)}
                >
                  <ChevronRight size={15} />
                  <Folder className="green-folder" size={20} />
                  <span>{label}</span>
                  <small>0</small>
                </button>
              ))}
            </>
          )}
          <div className="other-roots">
            {roots.slice(1).map((root) => (
              <div key={root.label}>
                <button
                  className="tree-row"
                  title={root.label}
                  onClick={() => {
                    setRootOpen(rootOpen === root.label ? null : root.label);
                    selectFolder(root.label);
                  }}
                  aria-expanded={rootOpen === root.label}
                >
                  {rootOpen === root.label ? (
                    <ChevronDown size={15} />
                  ) : (
                    <ChevronRight size={15} />
                  )}
                  <Folder className="gold-folder" size={21} />
                  <span>{root.label}</span>
                  <small>{root.count}</small>
                </button>
                {rootOpen === root.label && (
                  <p className="tree-hint">
                    Содержимое появится после подключения хранилища
                  </p>
                )}
              </div>
            ))}
          </div>
        </nav>
        <div className="storage">
          <h3>Хранилище</h3>
          <div className="storage-line">
            <div
              className="progress"
              role="progressbar"
              aria-label="Использование хранилища"
              aria-valuenow={21}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span />
            </div>
            <span>21%</span>
          </div>
          <p>428 ГБ из 2 ТБ</p>
        </div>
      </aside>
      <main className="workspace">
        <div className="workspace-toolbar">
          <nav className="breadcrumbs" aria-label="Путь к папке">
            <Files size={18} />
            <button onClick={() => selectFolder("ЖК Садовые кварталы")}>
              01_КЛИЕНТСКИЕ_ПРОЕКТЫ
            </button>
            <ChevronRight size={15} />
            <button onClick={() => selectFolder("ЖК Садовые кварталы")}>
              ЖК Садовые кварталы
            </button>
            <ChevronRight size={15} />
            <strong>{section === "Все файлы" ? folder : section}</strong>
          </nav>
          <div className="view-controls">
            <button
              className={`icon-button small ${sort ? "selected" : ""}`}
              aria-label="Сортировать по имени"
              aria-pressed={sort}
              onClick={() => setSort(!sort)}
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
          {["Все", "Фото", "Видео", "Рендеры", "Документы"].map((label) => (
            <button
              key={label}
              className={`filter-chip ${filter === label ? "active" : ""}`}
              aria-pressed={filter === label}
              onClick={() => setFilter(label)}
            >
              {label}
              <span>
                {label === "Все"
                  ? assets.length
                  : assets.filter((a) => a.kind === label).length}
              </span>
            </button>
          ))}
        </div>
        <div className="asset-scroll">
          {view === "list" && displayed.length > 0 && (
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
            {displayed.map((asset) => (
              <button
                key={asset.id}
                className={`asset-card ${selectedId === asset.id ? "is-selected" : ""}`}
                aria-label={`Выбрать ${asset.name}`}
                aria-pressed={selectedId === asset.id}
                onClick={() => choose(asset)}
                onDoubleClick={() => {
                  choose(asset);
                  openModal("preview");
                }}
              >
                <div className="thumbnail">
                  <MediaImage asset={asset} />
                  {selectedId === asset.id && (
                    <span className="selection-check">
                      <Check size={13} />
                    </span>
                  )}
                  {asset.kind === "Видео" && (
                    <>
                      <span className="play">
                        <Play fill="currentColor" size={30} />
                      </span>
                      <span className="duration">00:42</span>
                    </>
                  )}
                </div>
                <div className="asset-caption">
                  <span className="asset-name">{asset.name}</span>
                  <span className="asset-size">{asset.size}</span>
                </div>
                <span className="list-kind">{asset.kind}</span>
                <span className="list-size">{asset.size}</span>
              </button>
            ))}
          </div>
          {!displayed.length && (
            <div className="empty-state">
              <FolderOpen size={42} />
              <h2>
                {query
                  ? "Ничего не найдено"
                  : section === "Корзина"
                    ? "Корзина пуста"
                    : "Здесь пока нет файлов"}
              </h2>
              <p>
                {query
                  ? "Попробуйте другое название или измените фильтры."
                  : "В этом разделе нет демонстрационных материалов."}
              </p>
              <button
                className="button"
                onClick={() => {
                  setQuery("");
                  setFilter("Все");
                  selectFolder("Фото");
                }}
              >
                Показать все файлы
              </button>
            </div>
          )}
        </div>
        <footer className="workspace-footer">
          <span>{displayed.length} файлов · демоматериалы</span>
          <span>Выбран 1 файл</span>
        </footer>
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
        <button
          className="preview-button"
          aria-label="Открыть предпросмотр"
          onClick={() => openModal("preview")}
        >
          <MediaImage asset={selected} />
          {selected.kind === "Видео" && (
            <span className="play">
              <Play size={32} />
            </span>
          )}
        </button>
        <h1>{selected.name}</h1>
        <p className="file-summary">
          {selected.kind === "Видео" ? "MP4" : "JPG"} · {selected.size} ·{" "}
          {selected.resolution}
        </p>
        <span className="source-badge">Наши</span>
        <div className="property-actions">
          <button
            className="button primary"
            onClick={() => openModal("preview")}
          >
            <ExternalLink size={17} />
            Открыть
          </button>
          <div className="more-anchor">
            <button
              className="button more-button"
              aria-label="Действия с файлом"
              aria-expanded={popover === "more"}
              onClick={() => setPopover(popover === "more" ? null : "more")}
            >
              <MoreHorizontal />
            </button>
            {popover === "more" && (
              <div className="popover file-popover">
                <button onClick={favorite}>
                  <Star size={17} />
                  {selected.favorite ? "Убрать из избранного" : "В избранное"}
                </button>
                <button
                  onClick={() => {
                    setPopover(null);
                    setToast(
                      "Ссылка будет доступна после подключения хранилища",
                    );
                  }}
                >
                  <Share2 size={17} />
                  Поделиться
                </button>
              </div>
            )}
          </div>
        </div>
        <div
          className="property-tabs"
          role="tablist"
          aria-label="Информация о файле"
        >
          {["Метаданные", "Теги", "Комментарии"].map((label) => (
            <button
              key={label}
              role="tab"
              aria-selected={tab === label}
              id={`tab-${label}`}
              aria-controls="property-tab-panel"
              onClick={() => setTab(label)}
            >
              {label}
            </button>
          ))}
        </div>
        <div
          id="property-tab-panel"
          role="tabpanel"
          aria-labelledby={`tab-${tab}`}
        >
          {tab === "Метаданные" && (
            <>
              <dl className="metadata">
                {[
                  ["Название", selected.name],
                  [
                    "Тип файла",
                    selected.kind === "Видео"
                      ? "MP4 (video/mp4)"
                      : "JPEG (image/jpeg)",
                  ],
                  ["Размер", selected.size],
                  ["Разрешение", selected.resolution],
                  ["Источник", "GART · Наши"],
                  ["Дата съёмки", "14 апр. 2024, 16:23"],
                  ["Загружено", "15 апр. 2024, 10:12"],
                  ["Автор", "Команда GART"],
                  ["Проект", "ЖК Садовые кварталы"],
                  ["Папка", `/${selected.kind}`],
                ].map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <section className="description">
                <div>
                  <h2>Описание</h2>
                  <button
                    className="icon-button small"
                    aria-label="Редактировать описание"
                    onClick={() => {
                      setDescription(selected.description);
                      setEditing(true);
                    }}
                  >
                    <Pencil size={17} />
                  </button>
                </div>
                {editing ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      setAssets((items) =>
                        items.map((a) =>
                          a.id === selectedId ? { ...a, description } : a,
                        ),
                      );
                      setEditing(false);
                      setToast("Описание изменено в демосессии");
                    }}
                  >
                    <textarea
                      aria-label="Описание файла"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      autoFocus
                    />
                    <button className="button primary" type="submit">
                      Сохранить
                    </button>
                  </form>
                ) : (
                  <p>{selected.description}</p>
                )}
              </section>
            </>
          )}
          {tab === "Теги" && (
            <div className="tags-panel">
              <h2>Теги файла</h2>
              <div className="tags">
                {selected.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <p className="subtle">
                Теги помогают находить материалы без дополнительных копий.
              </p>
            </div>
          )}
          {tab === "Комментарии" && (
            <div className="comments-panel">
              <h2>Комментарии</h2>
              {!comments[selectedId]?.length && (
                <p className="subtle">
                  Пока нет комментариев. Добавьте первый.
                </p>
              )}
              {comments[selectedId]?.map((text, index) => (
                <div className="comment" key={index}>
                  <strong>Александр К.</strong>
                  <p>{text}</p>
                </div>
              ))}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!comment.trim()) return;
                  setComments((prev) => ({
                    ...prev,
                    [selectedId]: [...(prev[selectedId] || []), comment.trim()],
                  }));
                  setComment("");
                }}
              >
                <textarea
                  aria-label="Новый комментарий"
                  placeholder="Написать комментарий…"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
                <button className="button primary" disabled={!comment.trim()}>
                  Отправить
                </button>
              </form>
            </div>
          )}
        </div>
      </aside>
      {modal && (
        <dialog
          ref={dialog}
          aria-label={
            modal === "preview" ? "Предпросмотр файла" : "Действие с медиатекой"
          }
          className={modal === "preview" ? "modal preview-modal" : "modal"}
          onCancel={() => setModal(null)}
          onClick={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <button
            className="icon-button modal-close"
            aria-label="Закрыть диалог"
            onClick={() => setModal(null)}
          >
            <X />
          </button>
          {modal === "preview" ? (
            <>
              <MediaImage asset={selected} />
              <h2>{selected.name}</h2>
              <p className="subtle">
                {selected.kind === "Видео"
                  ? "Демообложка видео. Воспроизведение будет доступно после подключения хранилища."
                  : "Демонстрационное изображение · " + selected.resolution}
              </p>
            </>
          ) : (
            <>
              <div className="modal-icon">
                {modal === "upload" ? <Upload /> : <FolderPlus />}
              </div>
              <h2>
                {modal === "upload"
                  ? "Загрузка файлов"
                  : modal === "folder"
                    ? "Новая папка"
                    : "Новый проект"}
              </h2>
              <p className="subtle">
                {modal === "upload"
                  ? "Загрузка станет доступна после подключения хранилища."
                  : "Будет добавлено только в текущую демосессию."}
              </p>
              {modal === "upload" ? (
                <div className="upload-placeholder">
                  <Upload size={32} />
                  <strong>Место для ваших материалов</strong>
                  <span>Фото, видео, рендеры и документы</span>
                  <span className="demo-label">
                    UI-прототип · загрузка отключена
                  </span>
                </div>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const value = name.trim();
                    if (!value) return;
                    if (modal === "folder") {
                      setCreatedFolders((prev) => [...prev, value]);
                      setExpanded(true);
                      setProjectExpanded(true);
                    } else {
                      setCreatedProjects((prev) => [...prev, value]);
                      setExpanded(true);
                    }
                    setModal(null);
                    setToast(
                      "Добавлено в демосессию. После обновления страницы изменения сбросятся.",
                    );
                  }}
                >
                  <label className="field-label">
                    Название
                    <input
                      autoFocus
                      maxLength={70}
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={
                        modal === "folder"
                          ? "Название папки"
                          : "Название проекта"
                      }
                    />
                  </label>
                  <div className="modal-actions">
                    <button
                      className="button"
                      type="button"
                      onClick={() => setModal(null)}
                    >
                      Отмена
                    </button>
                    <button className="button primary" disabled={!name.trim()}>
                      Создать
                    </button>
                  </div>
                </form>
              )}
            </>
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
