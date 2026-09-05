# UI v0.1 — GART Media

## Объём

Только UI-shell на Next.js / React / TypeScript. Backend и доступ к реальным файлам не реализованы. Данные, комментарии, описания, новые папки и проекты существуют только в React state; обновление страницы их сбрасывает.

## Сравнение с референсом

- Воспроизведены верхняя панель, светлая трёхпанельная композиция, зелёные кнопки и акценты, дерево папок, счётчики и блок хранилища.
- Воспроизведены breadcrumbs, фильтры, три колонки карточек на обычном desktop, видеообложка с длительностью, имена и размеры.
- Воспроизведены preview, название, сводка, зелёный badge источника, кнопка открытия, вкладки, метаданные и описание.
- Выбранная карточка дополнительно имеет зелёную рамку и галочку. Preview соответствует выбранной карточке.
- Изображения синтетические, близкие по тематике, но не идентичные референсу. Знак G — приближённая CSS-версия; точный фирменный SVG не предоставлен.
- Счётчики фильтров соответствуют девяти демонстрационным файлам. Счётчики дерева и использования хранилища — визуальные значения из референса, не результаты сканирования.
- На Full HD карточки компактнее по высоте, чтобы все девять были видны. На 2560 px сетка содержит четыре колонки. На узком экране панели выдвижные, карточки в две колонки.
- Заголовок «Вариант 1 — …» над макетом не включён: это подпись варианта дизайна, а не часть приложения.
- Добавлена небольшая нижняя строка с числом видимых демоматериалов.

## Проверка

Production build и TypeScript проходят. Playwright проверяет поиск, фильтрацию, выбор карточки, вкладки, комментарии, gallery/list, диалог загрузки, демопапку и сброс после перезагрузки. В проверенном сценарии нет ошибок JavaScript и console.error.

Layout проверен на 1440×1000, 1920×1080, 2560×1440, 1024×768, 390×844. Проверены отсутствие горизонтального переполнения, разделение панелей на desktop, открытие/закрытие панелей на телефоне. Сделаны скриншоты каждого размера; они хранятся отдельно от Git. Основной браузер проверки — Chromium; Safari и Firefox на этом этапе не проверялись.

## Демоизображение

Файл: `public/demo/architecture-sheet.png`. Сгенерирован встроенным ImageGen, используется как CSS-спрайт 3×3. Это ресурс UI-прототипа, не материал реального клиента и не реализация AI-функций приложения.

Точный запрос генерации:

> Create one architectural photography contact sheet texture for a fictional media manager UI. Landscape canvas 1536x1024 or larger same 3:2 aspect ratio. EXACT equal 3 columns x 3 rows edge-to-edge, no gaps no borders no text no labels no UI. Each of nine cells is a complete landscape photograph 3:2. Top row: 1 refined modern glass conservatory lounge dark frames with armchairs and trees outside; 2 symmetrical sophisticated modern living room looking through black framed windows to garden; 3 spacious beige modern living room with stone surfaces. Middle row: 1 elegant outdoor terrace armchairs and round table facing landscaped garden at golden hour; 2 close up pale natural stone wall and small green plant with dappled sunlight; 3 isometric dollhouse 3D apartment architectural floorplan on pale gray background. Bottom row: 1 aerial view of landscaped residential garden in golden evening sun (no play icon); 2 contemporary brick and glass residential building at dusk; 3 manicured garden with tall trees, pale stone path and lush lawn. Photorealistic architectural editorial photography, restrained natural colors green foliage warm stone gray, beautiful realistic light. Critical perfectly equal cells for CSS sprite grid, no padding or separator lines. These are synthetic demo images not actual client projects.

## Последующий этап

Backend подключается после утверждения UI. Реальная медиатека и SQLite будут размещены вне репозитория; файловые операции — через StorageProvider по архитектурным документам.
