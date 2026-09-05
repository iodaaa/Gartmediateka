// Synthetic UI fixtures only. No filesystem, database or client media is accessed.
export type MediaKind = "Фото" | "Видео" | "Рендеры" | "Документы";
export type DemoAsset = {
  id: number;
  name: string;
  size: string;
  kind: MediaKind;
  tile: number;
  resolution: string;
  favorite?: boolean;
  shared?: boolean;
  tags: string[];
  description: string;
};
export const demoAssets: DemoAsset[] = [
  {
    id: 1,
    name: "DSC_8321.jpg",
    size: "12 МБ",
    kind: "Фото",
    tile: 0,
    resolution: "6000 × 4000",
    tags: ["Интерьер", "Стекло"],
    description:
      "Зона отдыха у панорамного остекления. Естественное освещение.",
  },
  {
    id: 2,
    name: "DSC_8322.jpg",
    size: "11 МБ",
    kind: "Фото",
    tile: 1,
    resolution: "6000 × 4000",
    tags: ["Интерьер"],
    description: "Гостиная с видом на сад. Общий план.",
  },
  {
    id: 3,
    name: "Интерьер_гостиная.jpg",
    size: "8,4 МБ",
    kind: "Фото",
    tile: 2,
    resolution: "5472 × 3648",
    tags: ["Интерьер", "Камень"],
    description: "Светлая гостиная. Натуральные материалы и спокойные оттенки.",
  },
  {
    id: 4,
    name: "Терраса_вид.jpg",
    size: "9,1 МБ",
    kind: "Фото",
    tile: 3,
    resolution: "5472 × 3648",
    favorite: true,
    shared: true,
    tags: ["Терраса", "Ландшафт", "Для презентации"],
    description: "Вид с террасы. Естественное освещение, вечер.",
  },
  {
    id: 5,
    name: "Детали_камень.jpg",
    size: "6,7 МБ",
    kind: "Фото",
    tile: 4,
    resolution: "4000 × 2667",
    tags: ["Камень", "Детали"],
    description: "Фактура натурального камня в вечернем свете.",
  },
  {
    id: 6,
    name: "Планировка_3D.jpg",
    size: "4,2 МБ",
    kind: "Рендеры",
    tile: 5,
    resolution: "3000 × 2000",
    tags: ["Планировка", "3D"],
    description: "Объёмная планировка квартиры. Концептуальная визуализация.",
  },
  {
    id: 7,
    name: "Видео_облет.mp4",
    size: "128 МБ",
    kind: "Видео",
    tile: 6,
    resolution: "3840 × 2160",
    tags: ["Видео", "Ландшафт"],
    description:
      "Облёт территории жилого комплекса. Демообложка, видео не подключено.",
  },
  {
    id: 8,
    name: "Фасад_вечер.jpg",
    size: "10,3 МБ",
    kind: "Фото",
    tile: 7,
    resolution: "5472 × 3648",
    shared: true,
    tags: ["Архитектура", "Фасад"],
    description: "Фасад жилого комплекса в вечернем освещении.",
  },
  {
    id: 9,
    name: "Ландшафт.jpg",
    size: "7,6 МБ",
    kind: "Фото",
    tile: 8,
    resolution: "5472 × 3648",
    favorite: true,
    tags: ["Ландшафт", "Сад"],
    description: "Благоустройство территории. Сад и прогулочные дорожки.",
  },
];
