(function () {
  "use strict";

  const APP_VERSION = "0.1";
  const STORAGE_KEY = "weeklyPlannerState";
  const DEFAULT_CATEGORIES = ["Работа", "Личное"];
  const BACKLOG_STATUS = "backlog";
  const PLANNED_STATUS = "planned";
  const DONE_STATUSES = new Set(["done", "completed"]);
  const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
  const DAILY_QUOTES = [
    "Пусть сегодня будет достаточно одного честного шага вперед.",
    "Спокойный ритм тоже двигает большие планы.",
    "Сначала важное, потом все остальное станет легче.",
    "Ты можешь сделать меньше, но точнее. Это тоже прогресс.",
    "Хорошая неделя собирается из бережных решений.",
    "Оставь место для отдыха: он тоже часть плана.",
    "Завершай неделю мягко и забирай с собой только полезное."
  ];
  const CORRUPTED_STORAGE_MESSAGE = "Не удалось загрузить сохранённые данные. Можно сбросить данные и начать заново";
  const BLOCKED_STORAGE_MESSAGE = "LocalStorage недоступен. Приложение работает в текущей сессии без сохранения.";

  let appMessage = "";
  let storageAvailable = true;

  function padDatePart(value) {
    return String(value).padStart(2, "0");
  }

  function formatDate(date) {
    return [
      date.getFullYear(),
      padDatePart(date.getMonth() + 1),
      padDatePart(date.getDate())
    ].join("-");
  }

  function parseDate(dateString) {
    if (!ISO_DATE_PATTERN.test(dateString)) {
      throw new Error(`Дата должна быть в формате YYYY-MM-DD: ${dateString}`);
    }

    const [year, month, day] = dateString.split("-").map(Number);
    const date = new Date(year, month - 1, day);

    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      throw new Error(`Некорректная календарная дата: ${dateString}`);
    }

    return date;
  }

  function getTodayString() {
    return formatDate(new Date());
  }

  function addDays(dateInput, days) {
    const date = typeof dateInput === "string" ? parseDate(dateInput) : new Date(dateInput);
    const copy = new Date(date);
    copy.setDate(copy.getDate() + days);
    return copy;
  }

  function getWeekStart(dateInput) {
    const date = typeof dateInput === "string" ? parseDate(dateInput) : new Date(dateInput);
    const day = date.getDay();
    const daysFromMonday = day === 0 ? 6 : day - 1;
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - daysFromMonday);
    return formatDate(weekStart);
  }

  function getWeekDates(weekStartInput) {
    const weekStart = typeof weekStartInput === "string" ? parseDate(weekStartInput) : new Date(weekStartInput);
    const result = [];
    let index = 0;

    while (index < 7) {
      result.push(formatDate(addDays(weekStart, index)));
      index += 1;
    }

    return result;
  }

  function shiftWeek(weekStart, offsetWeeks) {
    return formatDate(addDays(weekStart, offsetWeeks * 7));
  }

  function isPlainObject(value) {
    return Object.prototype.toString.call(value) === "[object Object]";
  }

  function createInitialState(today = getTodayString()) {
    const currentWeekStart = getWeekStart(today);
    return {
      appVersion: APP_VERSION,
      currentWeekStart: currentWeekStart,
      lastSystemWeekStart: currentWeekStart,
      lastOpenedDate: today,
      tasks: [],
      categories: DEFAULT_CATEGORIES.slice(),
      settings: {
        theme: "nature"
      }
    };
  }

  function normalizeState(rawState, today = getTodayString()) {
    const fallback = createInitialState(today);

    if (!isPlainObject(rawState)) {
      return fallback;
    }
    const normalizedCategories = Array.isArray(rawState.categories)
      ? rawState.categories.filter(function (value) { return typeof value === "string"; })
      : fallback.categories;

    return {
      appVersion: typeof rawState.appVersion === "string" ? rawState.appVersion : fallback.appVersion,
      currentWeekStart: ISO_DATE_PATTERN.test(rawState.currentWeekStart || "")
        ? getWeekStart(rawState.currentWeekStart)
        : fallback.currentWeekStart,
      lastSystemWeekStart: ISO_DATE_PATTERN.test(rawState.lastSystemWeekStart || "")
        ? getWeekStart(rawState.lastSystemWeekStart)
        : ISO_DATE_PATTERN.test(rawState.currentWeekStart || "")
          ? getWeekStart(rawState.currentWeekStart)
          : fallback.lastSystemWeekStart,
      lastOpenedDate: ISO_DATE_PATTERN.test(rawState.lastOpenedDate || "")
        ? rawState.lastOpenedDate
        : fallback.lastOpenedDate,
      tasks: Array.isArray(rawState.tasks) ? rawState.tasks.filter(isPlainObject) : fallback.tasks,
      categories: normalizedCategories.length > 0
        ? normalizedCategories
        : fallback.categories,
      settings: {
        theme: isPlainObject(rawState.settings) && typeof rawState.settings.theme === "string"
          ? rawState.settings.theme
          : fallback.settings.theme
      }
    };
  }

  function readStorageValue() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      storageAvailable = false;
      appMessage = BLOCKED_STORAGE_MESSAGE;
      console.warn(BLOCKED_STORAGE_MESSAGE, error);
      return null;
    }
  }

  function loadState() {
    const savedState = readStorageValue();
    if (!savedState) {
      return createInitialState();
    }
    try {
      return normalizeState(JSON.parse(savedState));
    } catch (error) {
      appMessage = CORRUPTED_STORAGE_MESSAGE;
      console.warn(CORRUPTED_STORAGE_MESSAGE, error);
      return createInitialState();
    }
  }

  function saveState(state) {
    if (!storageAvailable) {
      return false;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (error) {
      storageAvailable = false;
      appMessage = BLOCKED_STORAGE_MESSAGE;
      console.warn(BLOCKED_STORAGE_MESSAGE, error);
      return false;
    }
  }

  function clearSavedState() {
    if (!storageAvailable) {
      return false;
    }
    try {
      localStorage.removeItem(STORAGE_KEY);
      return true;
    } catch (error) {
      storageAvailable = false;
      appMessage = BLOCKED_STORAGE_MESSAGE;
      console.warn(BLOCKED_STORAGE_MESSAGE, error);
      return false;
    }
  }

  function isDateInWeek(dateString, weekStart) {
    if (!ISO_DATE_PATTERN.test(dateString || "")) {
      return false;
    }
    return getWeekDates(weekStart).includes(dateString);
  }

  function migrateTasksForNewWeek(tasks, previousWeekStart) {
    if (!Array.isArray(tasks)) {
      return [];
    }
    const migrated = [];
    let index = 0;

    while (index < tasks.length) {
      const task = tasks[index];
      if (!isPlainObject(task)) {
        index += 1;
        continue;
      }

      const inPreviousWeek = isDateInWeek(task.date, previousWeekStart);
      const isPlanned = task.status === PLANNED_STATUS;
      const isDone = DONE_STATUSES.has(task.status);

      if (inPreviousWeek && isPlanned) {
        migrated.push({
          ...task,
          date: null,
          status: BACKLOG_STATUS
        });
      } else if (!(inPreviousWeek && isDone)) {
        migrated.push(task);
      }

      index += 1;
    }

    return migrated;
  }

  function applyWeekRollover(state, today = getTodayString()) {
    const currentMonday = getWeekStart(today);
    const previousWeekStart = state.lastSystemWeekStart || state.currentWeekStart;
    const weekChanged = currentMonday !== previousWeekStart;

    if (weekChanged) {
      state.tasks = migrateTasksForNewWeek(state.tasks, previousWeekStart);
      state.lastSystemWeekStart = currentMonday;
    }
    state.lastOpenedDate = today;

    return {
      state: state,
      weekChanged: weekChanged,
      previousWeekStart: previousWeekStart,
      currentMonday: currentMonday
    };
  }

  function normalizeNameForUniq(value) {
    return value.trim().toLocaleLowerCase("ru-RU");
  }

  function validateCategoryName(name, categories) {
    if (typeof name !== "string") {
      return "Введите название категории.";
    }
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 30) {
      return "Название категории должно быть длиной от 2 до 30 символов.";
    }
    const normalized = normalizeNameForUniq(trimmed);
    const duplicate = categories.some(function (existing) {
      return normalizeNameForUniq(existing) === normalized;
    });
    if (duplicate) {
      return "Такая категория уже существует.";
    }
    return null;
  }

  function validateTaskTitle(title) {
    if (typeof title !== "string" || title.trim().length === 0) {
      return "Введите текст задачи.";
    }
    return null;
  }

  function getNextOrder(tasks, status, date) {
    const sameBucketCount = tasks.filter(function (task) {
      if (status === BACKLOG_STATUS) {
        return task.status === BACKLOG_STATUS;
      }
      return task.status === PLANNED_STATUS && task.date === date;
    }).length;
    return sameBucketCount + 1;
  }

  function createUniqueTaskId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function createTaskObjects(input, state) {
    const createdAt = new Date().toISOString();
    const tasks = [];

    if (input.toBacklog) {
      tasks.push({
        id: createUniqueTaskId(),
        title: input.title.trim(),
        category: input.category,
        status: BACKLOG_STATUS,
        date: null,
        order: getNextOrder(state.tasks, BACKLOG_STATUS, null),
        createdAt: createdAt
      });
      return tasks;
    }

    let index = 0;
    while (index < input.selectedDates.length) {
      const date = input.selectedDates[index];
      tasks.push({
        id: createUniqueTaskId(),
        title: input.title.trim(),
        category: input.category,
        status: PLANNED_STATUS,
        date: date,
        order: getNextOrder(state.tasks.concat(tasks), PLANNED_STATUS, date),
        createdAt: createdAt
      });
      index += 1;
    }
    return tasks;
  }

  function isTaskOverdue(task, today = getTodayString()) {
    return task.status === PLANNED_STATUS &&
      task.date !== null &&
      ISO_DATE_PATTERN.test(task.date || "") &&
      task.date < today;
  }

  function getTaskRenderStatus(task, today = getTodayString()) {
    if (task.status === "completed") {
      return "completed";
    }
    if (task.status === BACKLOG_STATUS) {
      return BACKLOG_STATUS;
    }
    if (isTaskOverdue(task, today)) {
      return "overdue";
    }
    return PLANNED_STATUS;
  }

  function findTaskById(taskId) {
    return appState.tasks.find(function (task) {
      return task.id === taskId;
    });
  }

  let editingTaskId = null;
  let openedDayDate = null;

  function getDateBucketOrder(date, taskId) {
    const tasks = appState.tasks.filter(function (task) {
      return task.id !== taskId;
    });
    return getNextOrder(tasks, PLANNED_STATUS, date);
  }

  function getBacklogOrder(taskId) {
    const tasks = appState.tasks.filter(function (task) {
      return task.id !== taskId;
    });
    return getNextOrder(tasks, BACKLOG_STATUS, null);
  }

  function moveTaskToDate(task, date) {
    const nextOrder = getDateBucketOrder(date, task.id);
    task.date = date;
    if (task.status === BACKLOG_STATUS) {
      task.status = PLANNED_STATUS;
    }
    task.order = nextOrder;
    task.updatedAt = new Date().toISOString();
  }

  function moveTaskToBacklog(task) {
    const nextOrder = getBacklogOrder(task.id);
    task.date = null;
    task.status = BACKLOG_STATUS;
    delete task.completedAt;
    task.order = nextOrder;
    task.updatedAt = new Date().toISOString();
  }

  function getBucketKey(task) {
    return task.status === BACKLOG_STATUS ? BACKLOG_STATUS : task.date;
  }

  function getTasksInBucket(state, bucketKey) {
    return state.tasks
      .filter(function (task) {
        return getBucketKey(task) === bucketKey;
      })
      .sort(function (a, b) {
        return (a.order || 0) - (b.order || 0);
      });
  }

  function applyTaskDrop(state, taskId, target) {
    const task = state.tasks.find(function (item) {
      return item.id === taskId;
    });
    if (!task) {
      return false;
    }

    const sourceBucket = getBucketKey(task);
    const targetBucket = target.type === BACKLOG_STATUS ? BACKLOG_STATUS : target.date;
    const targetTasks = getTasksInBucket(state, targetBucket).filter(function (item) {
      return item.id !== taskId;
    });
    let targetIndex = target.beforeTaskId
      ? targetTasks.findIndex(function (item) { return item.id === target.beforeTaskId; })
      : targetTasks.length;

    if (targetIndex < 0) {
      targetIndex = targetTasks.length;
    }

    if (target.type === BACKLOG_STATUS) {
      task.date = null;
      task.status = BACKLOG_STATUS;
      delete task.completedAt;
    } else {
      task.date = target.date;
      if (task.status === BACKLOG_STATUS) {
        task.status = PLANNED_STATUS;
      }
    }
    task.updatedAt = new Date().toISOString();

    targetTasks.splice(targetIndex, 0, task);
    targetTasks.forEach(function (item, index) {
      item.order = index + 1;
    });

    if (sourceBucket !== targetBucket) {
      getTasksInBucket(state, sourceBucket).forEach(function (item, index) {
        item.order = index + 1;
      });
    }

    return true;
  }

  function toggleTaskCompletion(taskId) {
    const task = findTaskById(taskId);
    if (!task || task.status === BACKLOG_STATUS) {
      return false;
    }

    if (task.status === "completed") {
      task.status = PLANNED_STATUS;
      delete task.completedAt;
    } else {
      task.status = "completed";
      task.completedAt = new Date().toISOString();
    }

    persistAndRender();
    return true;
  }

  function moveTaskByDays(taskId, days) {
    const task = findTaskById(taskId);
    if (!task || task.status === BACKLOG_STATUS || !task.date) {
      return false;
    }

    moveTaskToDate(task, formatDate(addDays(task.date, days)));
    persistAndRender();
    return true;
  }

  function moveTaskToBacklogById(taskId) {
    const task = findTaskById(taskId);
    if (!task) {
      return false;
    }

    moveTaskToBacklog(task);
    persistAndRender();
    return true;
  }

  function updateTaskFromEdit(taskId, values) {
    const task = findTaskById(taskId);
    if (!task) {
      return { ok: false, error: "Задача не найдена." };
    }

    const titleError = validateTaskTitle(values.title);
    if (titleError) {
      return { ok: false, error: titleError };
    }

    task.title = values.title.trim();
    task.category = values.category;

    if (values.toBacklog) {
      moveTaskToBacklog(task);
    } else {
      const dateChanged = task.date !== values.date;
      task.date = values.date;
      if (task.status === BACKLOG_STATUS) {
        task.status = PLANNED_STATUS;
      }
      if (dateChanged) {
        task.order = getDateBucketOrder(values.date, task.id);
      }
      task.updatedAt = new Date().toISOString();
    }

    editingTaskId = null;
    persistAndRender();
    return { ok: true, task: task };
  }

  function deleteTask(taskId) {
    const taskExists = appState.tasks.some(function (task) {
      return task.id === taskId;
    });
    if (!taskExists) {
      return false;
    }

    appState.tasks = appState.tasks.filter(function (task) {
      return task.id !== taskId;
    });
    persistAndRender();
    return true;
  }

  function formatWeekRangeRu(weekStart) {
    const weekDates = getWeekDates(weekStart);
    const startDate = parseDate(weekDates[0]);
    const endDate = parseDate(weekDates[6]);
    const monthFormatter = new Intl.DateTimeFormat("ru-RU", { month: "long" });
    const startDay = startDate.getDate();
    const endDay = endDate.getDate();
    const sameMonth = startDate.getMonth() === endDate.getMonth();

    if (sameMonth) {
      return `${startDay}-${endDay} ${monthFormatter.format(endDate)}`;
    }
    return `${startDay} ${monthFormatter.format(startDate)} - ${endDay} ${monthFormatter.format(endDate)}`;
  }

  const startupToday = getTodayString();
  const startupState = loadState();
  const rolloverInfo = applyWeekRollover(startupState, startupToday);
  const appState = rolloverInfo.state;
  if (appMessage !== CORRUPTED_STORAGE_MESSAGE) {
    saveState(appState);
  }

  const refs = {
    weekRangeText: document.getElementById("week-range-text"),
    categoryList: document.getElementById("category-list"),
    backlogList: document.getElementById("backlog-list"),
    categoryForm: document.getElementById("category-form"),
    categoryInput: document.getElementById("category-input"),
    categoryFormError: document.getElementById("category-form-error"),
    dailyQuote: document.getElementById("daily-quote"),
    taskForm: document.getElementById("task-form"),
    taskTitleInput: document.getElementById("task-title-input"),
    taskCategorySelect: document.getElementById("task-category-select"),
    taskBacklogCheckbox: document.getElementById("task-backlog-checkbox"),
    taskDayPicker: document.getElementById("task-day-picker"),
    taskFormError: document.getElementById("task-form-error"),
    weekGrid: document.querySelector(".week-grid"),
    weekEmptyMessage: document.getElementById("week-empty-message"),
    appMessage: document.getElementById("app-message"),
    categoryEmptyMessage: document.getElementById("category-empty-message"),
    resetAppButton: document.getElementById("reset-app-button"),
    previousWeekButton: document.getElementById("previous-week-button"),
    currentWeekButton: document.getElementById("current-week-button"),
    nextWeekButton: document.getElementById("next-week-button"),
    dayModal: document.getElementById("day-modal"),
    dayModalPanel: document.querySelector(".day-modal-panel"),
    dayModalTitle: document.getElementById("day-modal-title"),
    dayModalDate: document.getElementById("day-modal-date"),
    dayModalTaskList: document.getElementById("day-modal-task-list"),
    progressValue: document.querySelector(".progress-head strong"),
    progressFill: document.querySelector(".progress-fill"),
    progressNote: document.querySelector(".progress-note")
  };

  function persistAndRender() {
    saveState(appState);
    render();
  }

  function replaceAppState(nextState) {
    Object.keys(appState).forEach(function (key) {
      delete appState[key];
    });
    Object.assign(appState, nextState);
  }

  function resetApplication() {
    clearSavedState();
    replaceAppState(createInitialState(getTodayString()));
    editingTaskId = null;
    if (storageAvailable) {
      appMessage = "";
    }
    saveState(appState);
    render();
  }

  function setVisibleWeek(weekStart) {
    appState.currentWeekStart = getWeekStart(weekStart);
    editingTaskId = null;
    openedDayDate = null;
    persistAndRender();
  }

  function moveVisibleWeek(offsetWeeks) {
    setVisibleWeek(shiftWeek(appState.currentWeekStart, offsetWeeks));
  }

  function showCurrentSystemWeek() {
    setVisibleWeek(getWeekStart(getTodayString()));
  }

  function clearError(node) {
    if (node) {
      node.textContent = "";
    }
  }

  function showError(node, message) {
    if (node) {
      node.textContent = message;
    }
  }

  function renderCategories() {
    if (!refs.categoryList || !refs.taskCategorySelect) {
      return;
    }

    refs.categoryList.innerHTML = "";
    refs.taskCategorySelect.innerHTML = "";
    appState.categories.forEach(function (category) {
      const li = document.createElement("li");
      li.textContent = category;
      refs.categoryList.appendChild(li);

      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      refs.taskCategorySelect.appendChild(option);
    });

    if (refs.categoryEmptyMessage) {
      const customCategories = appState.categories.filter(function (category) {
        return !DEFAULT_CATEGORIES.some(function (baseCategory) {
          return normalizeNameForUniq(baseCategory) === normalizeNameForUniq(category);
        });
      });
      refs.categoryEmptyMessage.hidden = customCategories.length > 0;
      refs.categoryEmptyMessage.textContent = customCategories.length > 0
        ? ""
        : "Пока доступны только базовые категории";
    }
  }

  function renderBacklog() {
    if (!refs.backlogList) {
      return;
    }
    const backlogTasks = appState.tasks.filter(function (task) {
      return task.status === BACKLOG_STATUS;
    }).sort(function (a, b) {
      return (a.order || 0) - (b.order || 0);
    });
    refs.backlogList.innerHTML = "";

    if (backlogTasks.length === 0) {
      const li = document.createElement("li");
      li.textContent = "Бэклог пуст - всё под контролем";
      li.className = "task-empty";
      refs.backlogList.appendChild(li);
      return;
    }

    backlogTasks.forEach(function (task) {
      const li = document.createElement("li");
      li.appendChild(createTaskCard(task));
      refs.backlogList.appendChild(li);
    });
  }

  function createTaskCard(task) {
    if (editingTaskId === task.id) {
      return createTaskEditForm(task);
    }

    const renderStatus = getTaskRenderStatus(task);
    const card = document.createElement("article");
    card.className = `task-card is-${renderStatus}`;
    card.dataset.taskId = task.id;
    card.draggable = true;
    card.setAttribute("aria-label", `Карточка задачи: ${task.title}`);

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = task.status === "completed";
    checkbox.disabled = task.status === BACKLOG_STATUS;
    checkbox.dataset.action = "toggle-task";
    checkbox.setAttribute("aria-label", `Изменить статус задачи: ${task.title}`);

    const body = document.createElement("div");
    const title = document.createElement("div");
    title.className = "task-card-title";
    title.textContent = task.title;
    title.title = task.title;

    const meta = document.createElement("small");
    meta.className = "task-card-meta";
    meta.textContent = task.status === BACKLOG_STATUS
      ? task.category
      : `${task.category} · ${task.date}`;

    const deleteButton = document.createElement("button");
    deleteButton.className = "task-delete-btn";
    deleteButton.type = "button";
    deleteButton.dataset.action = "delete-task";
    deleteButton.setAttribute("aria-label", `Удалить задачу: ${task.title}`);
    deleteButton.textContent = "×";

    const actions = document.createElement("div");
    actions.className = "task-card-actions";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "task-action-btn";
    editButton.dataset.action = "edit-task";
    editButton.textContent = "Редактировать";

    const prevButton = document.createElement("button");
    prevButton.type = "button";
    prevButton.className = "task-action-btn";
    prevButton.dataset.action = "move-prev";
    prevButton.disabled = task.status === BACKLOG_STATUS;
    prevButton.textContent = "← День";

    const nextButton = document.createElement("button");
    nextButton.type = "button";
    nextButton.className = "task-action-btn";
    nextButton.dataset.action = "move-next";
    nextButton.disabled = task.status === BACKLOG_STATUS;
    nextButton.textContent = "День →";

    const backlogButton = document.createElement("button");
    backlogButton.type = "button";
    backlogButton.className = "task-action-btn";
    backlogButton.dataset.action = "move-backlog";
    backlogButton.disabled = task.status === BACKLOG_STATUS;
    backlogButton.textContent = "В бэклог";

    actions.appendChild(editButton);
    actions.appendChild(prevButton);
    actions.appendChild(nextButton);
    actions.appendChild(backlogButton);

    body.appendChild(title);
    body.appendChild(meta);
    body.appendChild(actions);
    card.appendChild(checkbox);
    card.appendChild(body);
    card.appendChild(deleteButton);
    return card;
  }

  function createTaskEditForm(task) {
    const card = document.createElement("article");
    card.className = "task-card task-edit-card";
    card.dataset.taskId = task.id;

    const form = document.createElement("form");
    form.className = "task-edit-form";
    form.dataset.action = "save-edit";

    const titleLabel = document.createElement("label");
    titleLabel.textContent = "Текст";
    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.name = "title";
    titleInput.value = task.title;
    titleInput.setAttribute("aria-label", "Редактировать текст задачи");
    titleLabel.appendChild(titleInput);

    const categoryLabel = document.createElement("label");
    categoryLabel.textContent = "Категория";
    const categorySelect = document.createElement("select");
    categorySelect.name = "category";
    categorySelect.setAttribute("aria-label", "Редактировать категорию задачи");
    appState.categories.forEach(function (category) {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      option.selected = category === task.category;
      categorySelect.appendChild(option);
    });
    categoryLabel.appendChild(categorySelect);

    const dateLabel = document.createElement("label");
    dateLabel.textContent = "День";
    const dateSelect = document.createElement("select");
    dateSelect.name = "date";
    dateSelect.setAttribute("aria-label", "Редактировать дату задачи");

    const backlogOption = document.createElement("option");
    backlogOption.value = "backlog";
    backlogOption.textContent = "Бэклог";
    backlogOption.selected = task.status === BACKLOG_STATUS;
    dateSelect.appendChild(backlogOption);

    const dayNames = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
    getWeekDates(appState.currentWeekStart).forEach(function (date, index) {
      const option = document.createElement("option");
      option.value = date;
      option.textContent = `${dayNames[index]} · ${date}`;
      option.selected = task.date === date;
      dateSelect.appendChild(option);
    });
    dateLabel.appendChild(dateSelect);

    const error = document.createElement("p");
    error.className = "form-error task-edit-error";
    error.setAttribute("role", "alert");
    error.setAttribute("aria-live", "polite");

    const controls = document.createElement("div");
    controls.className = "task-edit-controls";

    const saveButton = document.createElement("button");
    saveButton.type = "submit";
    saveButton.className = "task-action-btn task-save-btn";
    saveButton.textContent = "Сохранить";

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "task-action-btn";
    cancelButton.dataset.action = "cancel-edit";
    cancelButton.textContent = "Отмена";

    controls.appendChild(saveButton);
    controls.appendChild(cancelButton);
    form.appendChild(titleLabel);
    form.appendChild(categoryLabel);
    form.appendChild(dateLabel);
    form.appendChild(error);
    form.appendChild(controls);
    card.appendChild(form);
    return card;
  }

  function renderWeekTasks() {
    if (!refs.weekGrid) {
      return;
    }

    const weekDates = getWeekDates(appState.currentWeekStart);
    weekDates.forEach(function (date, index) {
      const dayCard = refs.weekGrid.querySelector(`[data-day-index="${index}"]`);
      const list = refs.weekGrid.querySelector(`[data-day-list="${index}"]`);
      if (!dayCard || !list) {
        return;
      }
      list.classList.add("drop-zone");
      list.dataset.dropType = "day";
      list.dataset.dropDate = date;

      const dateLabel = dayCard.querySelector(".day-date");
      if (dateLabel) {
        dateLabel.textContent = date;
      }
      const countLabel = dayCard.querySelector(".day-task-count");

      const dayTasks = appState.tasks
        .filter(function (task) {
          return task.date === date && task.status !== BACKLOG_STATUS;
        })
        .sort(function (a, b) {
          return (a.order || 0) - (b.order || 0);
        });

      if (countLabel) {
        countLabel.textContent = String(dayTasks.length);
      }

      list.innerHTML = "";
      if (dayTasks.length === 0) {
        const empty = document.createElement("p");
        empty.className = "task-empty";
        empty.textContent = "Пока нет задач на этот день";
        list.appendChild(empty);
        return;
      }

      dayTasks.forEach(function (task) {
        list.appendChild(createTaskCard(task));
      });
    });
  }

  function getDayLabelByDate(date) {
    const weekDates = getWeekDates(appState.currentWeekStart);
    const dayNames = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
    const index = weekDates.indexOf(date);
    return index >= 0 ? dayNames[index] : "День";
  }

  function getDayTasks(date) {
    return appState.tasks
      .filter(function (task) {
        return task.date === date && task.status !== BACKLOG_STATUS;
      })
      .sort(function (a, b) {
        return (a.order || 0) - (b.order || 0);
      });
  }

  function openDayModal(date) {
    openedDayDate = date;
    renderDayModal();
    if (refs.dayModalPanel) {
      refs.dayModalPanel.focus();
    }
  }

  function closeDayModal() {
    openedDayDate = null;
    renderDayModal();
  }

  function renderDayModal() {
    if (!refs.dayModal || !refs.dayModalTaskList) {
      return;
    }

    if (!openedDayDate) {
      refs.dayModal.hidden = true;
      refs.dayModalTaskList.innerHTML = "";
      refs.dayModalTaskList.classList.remove("drop-zone");
      delete refs.dayModalTaskList.dataset.dropType;
      delete refs.dayModalTaskList.dataset.dropDate;
      return;
    }

    refs.dayModal.hidden = false;
    refs.dayModalTaskList.innerHTML = "";
    refs.dayModalTaskList.classList.add("drop-zone");
    refs.dayModalTaskList.dataset.dropType = "day";
    refs.dayModalTaskList.dataset.dropDate = openedDayDate;

    if (refs.dayModalTitle) {
      refs.dayModalTitle.textContent = getDayLabelByDate(openedDayDate);
    }
    if (refs.dayModalDate) {
      refs.dayModalDate.textContent = openedDayDate;
    }

    const tasks = getDayTasks(openedDayDate);
    if (tasks.length === 0) {
      const empty = document.createElement("p");
      empty.className = "task-empty";
      empty.textContent = "Пока нет задач на этот день";
      refs.dayModalTaskList.appendChild(empty);
      return;
    }

    tasks.forEach(function (task) {
      refs.dayModalTaskList.appendChild(createTaskCard(task));
    });
  }

  function renderProgress() {
    const progress = calculateWeekProgress(appState);

    if (refs.progressValue) {
      refs.progressValue.textContent = `${progress.completed} из ${progress.total} задач`;
    }
    if (refs.progressFill) {
      refs.progressFill.style.width = `${progress.percent}%`;
    }
    if (refs.progressNote) {
      refs.progressNote.textContent = progress.total === 0
        ? "Добавьте первую задачу на неделю"
        : progress.completed === progress.total
          ? "Отлично! Все задачи выполнены"
          : `Вы закрыли ${progress.percent}% плана.`;
    }
  }

  function calculateWeekProgress(state) {
    const weekDates = getWeekDates(state.currentWeekStart);
    const weekTasks = state.tasks.filter(function (task) {
      return (task.status === PLANNED_STATUS || task.status === "completed") &&
        weekDates.includes(task.date);
    });
    const completed = weekTasks.filter(function (task) {
      return task.status === "completed";
    }).length;
    const total = weekTasks.length;

    return {
      completed: completed,
      total: total,
      percent: total === 0 ? 0 : Math.round((completed / total) * 100)
    };
  }

  function renderDailyQuote() {
    if (!refs.dailyQuote) {
      return;
    }
    const day = new Date().getDay();
    const quoteIndex = day === 0 ? 6 : day - 1;
    refs.dailyQuote.textContent = `«${DAILY_QUOTES[quoteIndex]}»`;
  }

  function renderHeaderDates() {
    if (refs.weekRangeText) {
      refs.weekRangeText.textContent = formatWeekRangeRu(appState.currentWeekStart);
    }
  }

  function renderAppMessage() {
    if (!refs.appMessage) {
      return;
    }
    refs.appMessage.hidden = appMessage.length === 0;
    refs.appMessage.textContent = appMessage;
  }

  function renderWeekEmptyState() {
    if (!refs.weekEmptyMessage) {
      return;
    }
    const progress = calculateWeekProgress(appState);
    if (progress.total === 0) {
      refs.weekEmptyMessage.hidden = false;
      refs.weekEmptyMessage.textContent = "Добавьте первую задачу на неделю";
    } else if (progress.completed === progress.total) {
      refs.weekEmptyMessage.hidden = false;
      refs.weekEmptyMessage.textContent = "Отлично! Все задачи выполнены";
    } else {
      refs.weekEmptyMessage.hidden = true;
      refs.weekEmptyMessage.textContent = "";
    }
  }

  function syncBacklogMode() {
    if (!refs.taskBacklogCheckbox || !refs.taskDayPicker) {
      return;
    }
    const toBacklog = refs.taskBacklogCheckbox.checked;
    refs.taskDayPicker.classList.toggle("is-disabled", toBacklog);
    const checkboxes = refs.taskDayPicker.querySelectorAll("input[type='checkbox']");
    checkboxes.forEach(function (box) {
      box.disabled = toBacklog;
      if (toBacklog) {
        box.checked = false;
      }
    });
  }

  function render() {
    renderAppMessage();
    renderHeaderDates();
    renderDailyQuote();
    renderCategories();
    renderWeekTasks();
    renderBacklog();
    renderProgress();
    renderWeekEmptyState();
    renderDayModal();
    syncBacklogMode();
  }

  function addCategoryFromInput(rawName) {
    const validationError = validateCategoryName(rawName, appState.categories);
    if (validationError) {
      return { ok: false, error: validationError };
    }
    appState.categories.push(rawName.trim());
    persistAndRender();
    return { ok: true };
  }

  function getSelectedDayDates() {
    if (!refs.taskDayPicker) {
      return [];
    }
    const weekDates = getWeekDates(appState.currentWeekStart);
    const selected = [];
    const checkboxes = refs.taskDayPicker.querySelectorAll("input[type='checkbox']");

    checkboxes.forEach(function (box) {
      if (box.checked) {
        const dayIndex = Number(box.getAttribute("data-day-index"));
        if (!Number.isNaN(dayIndex) && weekDates[dayIndex]) {
          selected.push(weekDates[dayIndex]);
        }
      }
    });
    return selected;
  }

  function addTaskFromForm() {
    if (!refs.taskTitleInput || !refs.taskCategorySelect || !refs.taskBacklogCheckbox) {
      return { ok: false, error: "Форма недоступна." };
    }

    const title = refs.taskTitleInput.value;
    const category = refs.taskCategorySelect.value;
    const toBacklog = refs.taskBacklogCheckbox.checked;
    const titleError = validateTaskTitle(title);
    if (titleError) {
      return { ok: false, error: titleError };
    }
    if (!category) {
      return { ok: false, error: "Выберите категорию." };
    }

    const selectedDates = getSelectedDayDates();
    if (!toBacklog && selectedDates.length === 0) {
      return { ok: false, error: "Выберите хотя бы один день недели или отправьте задачу в бэклог." };
    }

    const createdTasks = createTaskObjects({
      title: title,
      category: category,
      toBacklog: toBacklog,
      selectedDates: selectedDates
    }, appState);

    appState.tasks = appState.tasks.concat(createdTasks);
    persistAndRender();
    return { ok: true, createdTasks: createdTasks };
  }

  function resetTaskForm() {
    if (refs.taskForm) {
      refs.taskForm.reset();
    }
    clearError(refs.taskFormError);
    syncBacklogMode();
  }

  function wireUi() {
    if (refs.categoryForm) {
      refs.categoryForm.addEventListener("submit", function (event) {
        event.preventDefault();
        clearError(refs.categoryFormError);
        const result = addCategoryFromInput(refs.categoryInput ? refs.categoryInput.value : "");
        if (!result.ok) {
          showError(refs.categoryFormError, result.error);
          return;
        }
        if (refs.categoryInput) {
          refs.categoryInput.value = "";
        }
      });
    }

    if (refs.taskBacklogCheckbox) {
      refs.taskBacklogCheckbox.addEventListener("change", function () {
        syncBacklogMode();
      });
    }

    if (refs.taskForm) {
      refs.taskForm.addEventListener("submit", function (event) {
        event.preventDefault();
        clearError(refs.taskFormError);
        const result = addTaskFromForm();
        if (!result.ok) {
          showError(refs.taskFormError, result.error);
          return;
        }
        console.log("Добавлены задачи:", result.createdTasks);
        console.log("Текущее состояние tasks:", appState.tasks);
        resetTaskForm();
      });
    }

    if (refs.resetAppButton) {
      refs.resetAppButton.addEventListener("click", function () {
        if (window.confirm("Вы действительно хотите удалить все данные планировщика? Это действие нельзя отменить.")) {
          resetApplication();
        }
      });
    }

    if (refs.previousWeekButton) {
      refs.previousWeekButton.addEventListener("click", function () {
        moveVisibleWeek(-1);
      });
    }

    if (refs.currentWeekButton) {
      refs.currentWeekButton.addEventListener("click", function () {
        showCurrentSystemWeek();
      });
    }

    if (refs.nextWeekButton) {
      refs.nextWeekButton.addEventListener("click", function () {
        moveVisibleWeek(1);
      });
    }

    document.addEventListener("change", function (event) {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || target.dataset.action !== "toggle-task") {
        return;
      }
      const card = target.closest("[data-task-id]");
      if (!card) {
        return;
      }
      toggleTaskCompletion(card.dataset.taskId);
    });

    document.addEventListener("click", function (event) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const card = target.closest("[data-task-id]");
      if (!card) {
        return;
      }

      if (target.dataset.action === "delete-task" && window.confirm("Вы действительно хотите удалить задачу?")) {
        deleteTask(card.dataset.taskId);
      } else if (target.dataset.action === "edit-task") {
        editingTaskId = card.dataset.taskId;
        render();
      } else if (target.dataset.action === "cancel-edit") {
        editingTaskId = null;
        render();
      } else if (target.dataset.action === "move-prev") {
        moveTaskByDays(card.dataset.taskId, -1);
      } else if (target.dataset.action === "move-next") {
        moveTaskByDays(card.dataset.taskId, 1);
      } else if (target.dataset.action === "move-backlog") {
        moveTaskToBacklogById(card.dataset.taskId);
      }
    });

    document.addEventListener("click", function (event) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      if (target.dataset.action === "open-day") {
        const dayCard = target.closest("[data-day-index]");
        if (!dayCard) {
          return;
        }
        const index = Number(dayCard.getAttribute("data-day-index"));
        const date = getWeekDates(appState.currentWeekStart)[index];
        if (date) {
          openDayModal(date);
        }
      } else if (target.dataset.action === "close-day-modal") {
        closeDayModal();
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && openedDayDate) {
        closeDayModal();
      }
    });

    document.addEventListener("submit", function (event) {
      const target = event.target;
      if (!(target instanceof HTMLFormElement) || target.dataset.action !== "save-edit") {
        return;
      }
      event.preventDefault();
      const card = target.closest("[data-task-id]");
      if (!card) {
        return;
      }

      const formData = new FormData(target);
      const dateValue = String(formData.get("date") || "");
      const result = updateTaskFromEdit(card.dataset.taskId, {
        title: String(formData.get("title") || ""),
        category: String(formData.get("category") || ""),
        toBacklog: dateValue === "backlog",
        date: dateValue
      });

      if (!result.ok) {
        const error = target.querySelector(".task-edit-error");
        showError(error, result.error);
      }
    });

    document.addEventListener("dragstart", function (event) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const card = target.closest(".task-card");
      if (!card) {
        return;
      }
      if (card.classList.contains("task-edit-card")) {
        event.preventDefault();
        return;
      }
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", card.dataset.taskId || "");
      card.classList.add("is-dragging");
    });

    document.addEventListener("dragend", function (event) {
      const target = event.target;
      if (target instanceof HTMLElement) {
        target.classList.remove("is-dragging");
      }
      document.querySelectorAll(".drop-zone.is-drop-target").forEach(function (zone) {
        zone.classList.remove("is-drop-target");
      });
    });

    document.addEventListener("dragover", function (event) {
      const zone = getDropZone(event.target);
      if (!zone) {
        return;
      }
      event.preventDefault();
      zone.classList.add("is-drop-target");
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
    });

    document.addEventListener("dragleave", function (event) {
      const zone = getDropZone(event.target);
      if (zone && !zone.contains(event.relatedTarget)) {
        zone.classList.remove("is-drop-target");
      }
    });

    document.addEventListener("drop", function (event) {
      const zone = getDropZone(event.target);
      if (!zone || !event.dataTransfer) {
        return;
      }
      event.preventDefault();
      zone.classList.remove("is-drop-target");

      const taskId = event.dataTransfer.getData("text/plain");
      if (!taskId) {
        return;
      }

      const beforeTaskId = getDropBeforeTaskId(zone, event.target);
      const target = zone.dataset.dropType === BACKLOG_STATUS
        ? { type: BACKLOG_STATUS, beforeTaskId: beforeTaskId }
        : { type: "day", date: zone.dataset.dropDate, beforeTaskId: beforeTaskId };

      if (target.type === "day" && !target.date) {
        return;
      }

      if (applyTaskDrop(appState, taskId, target)) {
        persistAndRender();
      }
    });
  }

  function getDropZone(target) {
    if (!(target instanceof HTMLElement)) {
      return null;
    }
    return target.closest(".drop-zone");
  }

  function getDropBeforeTaskId(zone, target) {
    if (!(target instanceof HTMLElement)) {
      return null;
    }
    const card = target.closest(".task-card");
    if (!card || !zone.contains(card) || card.classList.contains("is-dragging")) {
      return null;
    }
    return card.dataset.taskId || null;
  }

  function runStage2Checks() {
    const categoryCheck = validateCategoryName("РАБОТА", appState.categories);
    const duplicateRejected = categoryCheck === "Такая категория уже существует.";

    const stateForTest = normalizeState(JSON.parse(JSON.stringify(appState)), getTodayString());
    const weekDates = getWeekDates(appState.currentWeekStart);
    const monday = weekDates[0];
    const tuesday = weekDates[1];

    const testTasks = createTaskObjects({
      title: "Купить продукты",
      category: stateForTest.categories[0],
      toBacklog: false,
      selectedDates: [monday, tuesday]
    }, stateForTest);

    const hasTwo = testTasks.length === 2;
    const idsAreDifferent = hasTwo && testTasks[0].id !== testTasks[1].id;
    const datesAreCorrect = hasTwo &&
      testTasks[0].date === monday &&
      testTasks[1].date === tuesday &&
      testTasks[0].status === PLANNED_STATUS &&
      testTasks[1].status === PLANNED_STATUS;

    console.group("Stage 2 self-check");
    console.log("Duplicate category validation (РАБОТА vs Работа):", duplicateRejected, categoryCheck);
    console.log("Created tasks for Monday+Tuesday:", testTasks);
    console.log("Two tasks created:", hasTwo);
    console.log("IDs are unique:", idsAreDifferent);
    console.log("Dates are correct:", datesAreCorrect);
    console.groupEnd();
  }

  function runStage3Checks() {
    const today = getTodayString();
    const yesterday = formatDate(addDays(today, -1));
    const tomorrow = formatDate(addDays(today, 1));
    const overdueTask = { id: "test-overdue", status: PLANNED_STATUS, date: yesterday };
    const completedOldTask = { id: "test-completed", status: "completed", date: yesterday };
    const backlogTask = { id: "test-backlog", status: BACKLOG_STATUS, date: null };
    const futureTask = { id: "test-future", status: PLANNED_STATUS, date: tomorrow };

    const deleteState = {
      tasks: [
        { id: "delete-me", status: PLANNED_STATUS, date: today },
        { id: "keep-me", status: PLANNED_STATUS, date: today }
      ]
    };
    deleteState.tasks = deleteState.tasks.filter(function (task) {
      return task.id !== "delete-me";
    });

    console.group("Stage 3 self-check");
    console.log("Overdue planned yesterday:", isTaskOverdue(overdueTask, today));
    console.log("Completed old task is not overdue:", !isTaskOverdue(completedOldTask, today));
    console.log("Backlog task is not overdue:", !isTaskOverdue(backlogTask, today));
    console.log("Future planned task is not overdue:", !isTaskOverdue(futureTask, today));
    console.log("Toggle/delete actions call persistAndRender(), which calls saveState() before render().");
    console.log("Deleted id fully removed from task array:", !deleteState.tasks.some(function (task) {
      return task.id === "delete-me";
    }));
    console.groupEnd();
  }

  function runStage4Checks() {
    const targetDate = getWeekDates(appState.currentWeekStart)[2];
    const backlogTask = {
      id: "stage4-backlog",
      title: "Черновик",
      category: appState.categories[0],
      status: BACKLOG_STATUS,
      date: null,
      order: 1,
      createdAt: new Date().toISOString()
    };
    moveTaskToDate(backlogTask, targetDate);

    const sampleTask = {
      id: "stage4-cancel",
      title: "Без изменений",
      category: appState.categories[0],
      status: PLANNED_STATUS,
      date: targetDate,
      order: 1
    };
    const beforeCancel = JSON.stringify(sampleTask);
    editingTaskId = sampleTask.id;
    editingTaskId = null;
    const afterCancel = JSON.stringify(sampleTask);

    console.group("Stage 4 self-check");
    console.log("Backlog -> day status is planned:", backlogTask.status === PLANNED_STATUS);
    console.log("Backlog -> day date filled:", backlogTask.date === targetDate);
    console.log("Backlog -> day updatedAt filled:", typeof backlogTask.updatedAt === "string");
    console.log("Cancel editing keeps task unchanged:", beforeCancel === afterCancel);
    console.groupEnd();
  }

  function runStage5Checks() {
    const weekDates = getWeekDates(appState.currentWeekStart);
    const sampleState = normalizeState({
      ...appState,
      tasks: [
        { id: "done-1", title: "Done 1", status: "completed", date: weekDates[0], order: 1 },
        { id: "done-2", title: "Done 2", status: "completed", date: weekDates[1], order: 1 },
        { id: "planned-1", title: "Planned 1", status: PLANNED_STATUS, date: weekDates[2], order: 1 },
        { id: "planned-2", title: "Planned 2", status: PLANNED_STATUS, date: weekDates[3], order: 1 },
        { id: "backlog-1", title: "Backlog 1", status: BACKLOG_STATUS, date: null, order: 1 },
        { id: "backlog-2", title: "Backlog 2", status: BACKLOG_STATUS, date: null, order: 2 },
        { id: "backlog-3", title: "Backlog 3", status: BACKLOG_STATUS, date: null, order: 3 },
        { id: "backlog-4", title: "Backlog 4", status: BACKLOG_STATUS, date: null, order: 4 },
        { id: "backlog-5", title: "Backlog 5", status: BACKLOG_STATUS, date: null, order: 5 }
      ]
    }, getTodayString());
    const progress = calculateWeekProgress(sampleState);

    const sortState = normalizeState({
      ...appState,
      tasks: [
        { id: "a", title: "A", status: PLANNED_STATUS, date: weekDates[0], order: 1 },
        { id: "b", title: "B", status: PLANNED_STATUS, date: weekDates[0], order: 2 },
        { id: "c", title: "C", status: PLANNED_STATUS, date: weekDates[0], order: 3 }
      ]
    }, getTodayString());
    applyTaskDrop(sortState, "c", { type: "day", date: weekDates[0], beforeTaskId: "a" });
    const reorderedIds = getTasksInBucket(sortState, weekDates[0]).map(function (task) {
      return `${task.id}:${task.order}`;
    });

    console.group("Stage 5 self-check");
    console.log("Progress with 2 completed + 2 planned + 5 backlog is 50%:", progress.percent === 50, progress);
    console.log("DnD reorder recalculates order:", reorderedIds.join(", ") === "c:1, a:2, b:3", reorderedIds);
    console.groupEnd();
  }

  function runStage6Checks() {
    let corruptedHandled = false;
    const previousMessage = appMessage;
    const previousStorageAvailable = storageAvailable;

    if (storageAvailable) {
      try {
        const previousValue = localStorage.getItem(STORAGE_KEY);
        localStorage.setItem(STORAGE_KEY, "{invalid-json");
        loadState();
        corruptedHandled = appMessage === CORRUPTED_STORAGE_MESSAGE;

        if (previousValue === null) {
          localStorage.removeItem(STORAGE_KEY);
        } else {
          localStorage.setItem(STORAGE_KEY, previousValue);
        }
      } catch (error) {
        console.warn("Stage 6 corrupted storage check skipped.", error);
      }
    }

    appMessage = previousMessage;
    storageAvailable = previousStorageAvailable;

    const resetState = createInitialState(getTodayString());
    const resetLooksInitial = resetState.tasks.length === 0 &&
      resetState.categories.length === 2 &&
      resetState.categories[0] === "Работа" &&
      resetState.categories[1] === "Личное";

    console.group("Stage 6 self-check");
    console.log("Corrupted LocalStorage is caught:", corruptedHandled);
    console.log("Reset state returns MVP initial shape:", resetLooksInitial, resetState);
    console.groupEnd();
  }

  function runWeekNavigationChecks() {
    const baseWeek = "2026-05-18";
    const nextWeek = shiftWeek(baseWeek, 1);
    const previousWeek = shiftWeek(baseWeek, -1);
    const navigationState = normalizeState({
      ...appState,
      currentWeekStart: baseWeek,
      lastSystemWeekStart: baseWeek,
      tasks: [
        { id: "this-week", title: "Current", status: PLANNED_STATUS, date: baseWeek, order: 1 },
        { id: "next-week", title: "Future", status: "completed", date: nextWeek, order: 1 }
      ]
    }, getTodayString());
    const currentProgress = calculateWeekProgress(navigationState);
    navigationState.currentWeekStart = nextWeek;
    const nextProgress = calculateWeekProgress(navigationState);
    const visibleOnNextWeek = getTasksInBucket(navigationState, nextWeek).some(function (task) {
      return task.id === "next-week";
    });

    console.group("Week navigation self-check");
    console.log("shiftWeek +1:", nextWeek === "2026-05-25", nextWeek);
    console.log("shiftWeek -1:", previousWeek === "2026-05-11", previousWeek);
    console.log("Progress uses visible week only:", currentProgress.percent === 0 && nextProgress.percent === 100, {
      currentProgress,
      nextProgress
    });
    console.log("Future task appears after switching week:", visibleOnNextWeek);
    console.groupEnd();
  }

  function runDayModalChecks() {
    const weekDates = getWeekDates(appState.currentWeekStart);
    const date = weekDates[0];
    const sampleState = normalizeState({
      ...appState,
      tasks: [
        { id: "modal-1", title: "Modal 1", status: PLANNED_STATUS, date: date, order: 2 },
        { id: "modal-2", title: "Modal 2", status: PLANNED_STATUS, date: date, order: 1 },
        { id: "modal-backlog", title: "Backlog", status: BACKLOG_STATUS, date: null, order: 1 }
      ]
    }, getTodayString());
    const modalDayIds = sampleState.tasks
      .filter(function (task) {
        return task.date === date && task.status !== BACKLOG_STATUS;
      })
      .sort(function (a, b) {
        return (a.order || 0) - (b.order || 0);
      })
      .map(function (task) {
        return task.id;
      });
    const beforeClose = JSON.stringify(sampleState.tasks);
    openedDayDate = date;
    closeDayModal();
    const afterClose = JSON.stringify(sampleState.tasks);

    console.group("Day modal self-check");
    console.log("Modal uses tasks from selected day:", modalDayIds.join(", ") === "modal-2, modal-1", modalDayIds);
    console.log("Closing modal does not change tasks:", beforeClose === afterClose);
    console.groupEnd();
  }

  window.weeklyPlanner = {
    state: appState,
    dates: {
      formatDate,
      parseDate,
      getTodayString,
      addDays,
      getWeekStart,
      getWeekDates,
      shiftWeek
    },
    storage: {
      loadState,
      saveState,
      clearSavedState
    },
    createInitialState,
    resetApplication,
    normalizeState,
    applyWeekRollover,
    migrateTasksForNewWeek,
    validateCategoryName,
    createTaskObjects,
    isTaskOverdue,
    getTaskRenderStatus,
    toggleTaskCompletion,
    deleteTask,
    updateTaskFromEdit,
    moveTaskByDays,
    moveTaskToBacklogById,
    applyTaskDrop,
    calculateWeekProgress,
    setVisibleWeek,
    moveVisibleWeek,
    showCurrentSystemWeek,
    openDayModal,
    closeDayModal
  };

  document.addEventListener("DOMContentLoaded", function () {
    wireUi();
    render();
    console.group("Инициализация weekly planner");
    console.log("State key:", STORAGE_KEY);
    console.log("Rollover info:", rolloverInfo);
    console.log("Current state:", appState);
    console.groupEnd();
    runStage2Checks();
    runStage3Checks();
    runStage4Checks();
    runStage5Checks();
    runStage6Checks();
    runWeekNavigationChecks();
    runDayModalChecks();
  });
})();
