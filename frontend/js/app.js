(function () {
  "use strict";

  var API_BASE = "/api";
  var THEME_KEY = "servicebox_theme";
  var CLIENT_DRAFT_KEY = "servicebox_client_draft";
  var CLIENT_PROFILE_STORAGE_KEY = "servicebox_client_profile_v2";
  var MASTER_PROFILE_STORAGE_KEY = "servicebox_master_profile_v2";

  var REPAIR_OPTIONS = [
    { id: "diagnostic", title: "Диагностика устройства", priceFrom: 0, duration: "15–60 минут" },
    { id: "display", title: "Замена дисплея / экрана", priceFrom: 2490, duration: "30–90 минут" },
    { id: "battery", title: "Замена аккумулятора", priceFrom: 890, duration: "30–60 минут" },
    { id: "connector", title: "Ремонт разъёма зарядки", priceFrom: 1190, duration: "от 60 минут" },
    { id: "water", title: "Восстановление после влаги", priceFrom: 1990, duration: "от 90 минут" },
    { id: "camera", title: "Замена камеры / стекла камеры", priceFrom: 1490, duration: "30–90 минут" },
    { id: "speaker", title: "Динамик, микрофон или связь", priceFrom: 990, duration: "30–90 минут" },
    { id: "software", title: "Настройка, прошивка или перенос данных", priceFrom: 790, duration: "30–120 минут" },
    { id: "cleaning", title: "Чистка ноутбука / профилактика", priceFrom: 1490, duration: "45–90 минут" }
  ];

  var BASE_PRICES = {
    phone: { display: 2490, battery: 890, connector: 1190, water: 1990, software: 790, cleaning: 990 },
    tablet: { display: 3290, battery: 1290, connector: 1490, water: 2190, software: 890, cleaning: 1190 },
    laptop: { display: 4290, battery: 1490, connector: 1890, water: 2490, software: 990, cleaning: 1490 }
  };

  var BRAND_MULTIPLIERS = { standard: 1, apple: 1.25 };

  function safeSetText(element, text) {
    if (!element) return;
    element.textContent = text == null || text === "" ? "—" : String(text);
  }

  function setStatus(element, message, type) {
    if (!element) return;
    element.textContent = message || "";
    element.classList.remove("is-ok", "is-error");
    if (type === "ok") element.classList.add("is-ok");
    if (type === "error") element.classList.add("is-error");
  }

  function normalizePhone(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function formatPrice(value) {
    if (Number(value) === 0) return "от 0 ₽";
    return "от " + Math.round(Number(value) || 0).toLocaleString("ru-RU") + " ₽";
  }

  function formatDate(value) {
    var date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function toDatetimeLocalValue(date) {
    return [date.getFullYear(), pad2(date.getMonth() + 1), pad2(date.getDate())].join("-") +
      "T" + [pad2(date.getHours()), pad2(date.getMinutes())].join(":");
  }

  function getNowRoundedToMinute() {
    var now = new Date();
    now.setSeconds(0, 0);
    return now;
  }

  function setMinDateTime(input) {
    if (!input) return;
    input.min = toDatetimeLocalValue(getNowRoundedToMinute());
  }

  function isPastPreferredTime(value) {
    if (!value) return false;
    var selected = new Date(value);
    if (Number.isNaN(selected.getTime())) return false;
    return selected.getTime() < getNowRoundedToMinute().getTime();
  }

  function toServerDateTime(value) {
    if (!value) return null;
    var date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toISOString();
  }

  function findRepairOption(id) {
    return REPAIR_OPTIONS.find(function (item) { return item.id === id; }) || null;
  }

  function getRepairLabel(id) {
    var option = findRepairOption(id);
    return option ? option.title : "—";
  }

  function getRepairPrice(id) {
    var option = findRepairOption(id);
    return option ? formatPrice(option.priceFrom) : "—";
  }

  function readStoredJson(storageKey) {
    try {
      var raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function saveStoredJson(storageKey, data) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(data));
      return true;
    } catch (_) {
      return false;
    }
  }

  function removeStoredJson(storageKey) {
    try {
      localStorage.removeItem(storageKey);
    } catch (_) {}
  }

  async function apiFetch(path, options) {
    var response = await fetch(API_BASE + path, Object.assign({
      headers: { "Content-Type": "application/json" }
    }, options || {}));

    var data = null;
    try {
      data = await response.json();
    } catch (_) {}

    if (!response.ok) {
      var message = data && data.detail ? data.detail : "Ошибка сервера";
      if (Array.isArray(message)) message = "Проверьте заполнение полей формы.";
      throw new Error(message);
    }
    return data;
  }

  function saveClientProfile(profile) {
    var normalized = Object.assign({}, profile, {
      role: "client",
      phoneNormalized: profile.phoneNormalized || normalizePhone(profile.phone)
    });
    saveStoredJson(CLIENT_PROFILE_STORAGE_KEY, normalized);
    applyRoleVisibility();
    return normalized;
  }

  function getClientProfile() {
    var profile = readStoredJson(CLIENT_PROFILE_STORAGE_KEY);
    return profile && profile.role === "client" ? profile : null;
  }

  function clearClientProfile() {
    removeStoredJson(CLIENT_PROFILE_STORAGE_KEY);
    applyRoleVisibility();
  }

  function saveMasterProfile(profile) {
    var normalized = Object.assign({}, profile, { role: "master" });
    saveStoredJson(MASTER_PROFILE_STORAGE_KEY, normalized);
    applyRoleVisibility();
    return normalized;
  }

  function getMasterProfile() {
    var profile = readStoredJson(MASTER_PROFILE_STORAGE_KEY);
    return profile && profile.role === "master" ? profile : null;
  }

  function clearMasterProfile() {
    removeStoredJson(MASTER_PROFILE_STORAGE_KEY);
    applyRoleVisibility();
  }

  function setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch (_) {}
  }

  function loadTheme() {
    var saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (_) {}
    if (saved === "dark" || saved === "light") {
      setTheme(saved);
      return;
    }
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      setTheme("dark");
    } else {
      setTheme("light");
    }
  }

  function wireThemeToggle() {
    var button = document.getElementById("theme-toggle");
    if (!button) return;

    function updateButtonLabel() {
      var theme = document.documentElement.getAttribute("data-theme") || "light";
      var nextTheme = theme === "dark" ? "светлую" : "тёмную";
      button.textContent = theme === "dark" ? "☀" : "☾";
      button.setAttribute("aria-label", "Включить " + nextTheme + " тему");
      button.setAttribute("title", "Включить " + nextTheme + " тему");
    }

    updateButtonLabel();
    button.addEventListener("click", function () {
      var isDark = document.documentElement.getAttribute("data-theme") === "dark";
      setTheme(isDark ? "light" : "dark");
      updateButtonLabel();
    });
  }

  function applyRoleVisibility() {
    var isMaster = Boolean(getMasterProfile());
    var current = window.location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll("[data-master-link]").forEach(function (link) {
      link.hidden = !isMaster && current !== "master.html";
    });
  }

  function setNavCurrent() {
    var current = window.location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll(".nav a").forEach(function (link) {
      if (link.getAttribute("href") === current) link.setAttribute("aria-current", "page");
    });
  }

  function createElement(tagName, className, text) {
    var element = document.createElement(tagName);
    if (className) element.className = className;
    if (text != null) element.textContent = String(text);
    return element;
  }

  function createMeta(label, value) {
    var item = createElement("div", "request-meta__item");
    item.appendChild(createElement("span", "request-meta__label", label));
    item.appendChild(createElement("strong", "request-meta__value", value || "—"));
    return item;
  }

  function getStatusText(status) {
    if (status === "open") return "Свободна";
    if (status === "in_progress") return "В работе";
    if (status === "done") return "Готова";
    return "Свободна";
  }

  function getRequestMessages(request) {
    return Array.isArray(request.messages) ? request.messages.filter(function (item) { return item && item.text; }) : [];
  }

  function getMessageAuthor(message, request, context) {
    if (context === "client") return message.from === "client" ? "Вы" : "Сервисный центр";
    if (message.from === "client") return "Клиент: " + (message.author || request.clientName || request.client || "Клиент");
    return "Вы";
  }

  function createMessageThread(request, context) {
    var messages = getRequestMessages(request);
    if (!messages.length) return null;
    var thread = createElement("div", "message-thread");
    thread.appendChild(createElement("strong", "message-thread__title", "Переписка по заявке"));
    messages.forEach(function (message) {
      var item = createElement("div", "thread-message thread-message--" + (message.from === "client" ? "client" : "master"));
      item.appendChild(createElement("span", "thread-message__author", getMessageAuthor(message, request, context)));
      item.appendChild(createElement("p", "", message.text));
      item.appendChild(createElement("time", "thread-message__time", formatDate(message.createdAt)));
      thread.appendChild(item);
    });
    return thread;
  }

  function createReplyForm(request, mode) {
    var isMaster = mode === "master";
    var box = createElement("div", isMaster ? "reply-box master-reply-box" : "reply-box");
    var idPrefix = isMaster ? "master-reply-" : "reply-";
    var textarea = document.createElement("textarea");
    var label = createElement("label", "visually-hidden", isMaster ? "Ответить клиенту" : "Ответить мастеру");
    label.setAttribute("for", idPrefix + request.id);
    textarea.id = idPrefix + request.id;
    textarea.rows = 3;
    textarea.maxLength = 1000;
    textarea.placeholder = isMaster ? "Напишите сообщение клиенту..." : "Напишите ответ мастеру...";
    textarea.dataset.replyText = mode;
    box.appendChild(label);
    box.appendChild(textarea);

    var actions = createElement("div", "request-actions");
    var send = createElement("button", "", isMaster ? "Отправить клиенту" : "Ответить мастеру");
    send.type = "button";
    send.dataset.requestAction = isMaster ? "master-reply" : "client-reply";
    send.dataset.requestId = request.id;
    actions.appendChild(send);

    if (isMaster) {
      var done = createElement("button", "button button--ghost", "Отметить готовой");
      done.type = "button";
      done.dataset.requestAction = "done";
      done.dataset.requestId = request.id;
      actions.appendChild(done);
    }

    box.appendChild(actions);
    return box;
  }

  function createRequestCard(request, context) {
    var card = createElement("article", "request-card");
    card.dataset.requestId = request.id == null ? "" : String(request.id);

    var top = createElement("div", "request-card__top");
    var titleWrap = createElement("div");
    titleWrap.appendChild(createElement("p", "eyebrow", request.id == null ? "Заявка" : "REQ-" + request.id));
    titleWrap.appendChild(createElement("h3", "", request.device || "Устройство не указано"));
    top.appendChild(titleWrap);
    top.appendChild(createElement("span", "status-pill status-pill--" + (request.status || "open"), getStatusText(request.status)));
    card.appendChild(top);

    var meta = createElement("div", "request-meta");
    meta.appendChild(createMeta("Клиент", request.clientName || request.client));
    meta.appendChild(createMeta("Телефон", request.phone));
    meta.appendChild(createMeta("Запрос", request.repairTitle || getRepairLabel(request.repairId)));
    meta.appendChild(createMeta("Стоимость", request.priceText || getRepairPrice(request.repairId)));
    meta.appendChild(createMeta("Время", formatDate(request.preferredTime)));
    meta.appendChild(createMeta("Создана", formatDate(request.createdAt)));
    if ((context === "master" || context === "master-mine") && request.status !== "open") {
      meta.appendChild(createMeta("Исполнитель", request.assigneeName || "Мастер"));
    }
    card.appendChild(meta);

    if (request.problem || request.comment) {
      card.appendChild(createElement("p", "request-comment", request.problem || request.comment));
    }

    var thread = createMessageThread(request, context === "client" ? "client" : "master");
    if (thread) card.appendChild(thread);

    if (context === "client" && request.status === "in_progress") {
      card.appendChild(createReplyForm(request, "client"));
    }

    if (context === "master-open") {
      var actionsOpen = createElement("div", "request-actions");
      var accept = createElement("button", "", "Взять в работу");
      accept.type = "button";
      accept.dataset.requestAction = "accept";
      accept.dataset.requestId = request.id;
      actionsOpen.appendChild(accept);
      card.appendChild(actionsOpen);
    }

    if (context === "master-mine") {
      card.appendChild(createReplyForm(request, "master"));
    }

    return card;
  }

  function renderEmpty(container, text) {
    if (!container) return;
    container.replaceChildren();
    var empty = createElement("div", "empty-state");
    empty.appendChild(createElement("strong", "", "Пока пусто"));
    empty.appendChild(createElement("p", "", text));
    container.appendChild(empty);
  }

  function populateRepairSelect(select) {
    if (!select) return;
    var current = select.value;
    select.replaceChildren();
    var placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Выберите обращение";
    select.appendChild(placeholder);
    REPAIR_OPTIONS.forEach(function (option) {
      var item = document.createElement("option");
      item.value = option.id;
      item.textContent = option.title + " — " + formatPrice(option.priceFrom);
      item.dataset.price = String(option.priceFrom);
      select.appendChild(item);
    });
    if (current) select.value = current;
  }

  function getClientElements() {
    return {
      profileForm: document.getElementById("client-profile-form"),
      profileName: document.getElementById("profile-client-name"),
      profilePhone: document.getElementById("profile-client-phone"),
      profileCurrent: document.getElementById("client-profile-current"),
      profileReset: document.getElementById("client-profile-reset"),
      profileStatus: document.getElementById("client-profile-status"),
      form: document.getElementById("client-request-form"),
      name: document.getElementById("client-name"),
      phone: document.getElementById("client-phone"),
      device: document.getElementById("client-device"),
      repair: document.getElementById("client-repair-type"),
      time: document.getElementById("client-time"),
      comment: document.getElementById("client-comment"),
      status: document.getElementById("client-status"),
      clear: document.getElementById("client-form-clear"),
      refresh: document.getElementById("client-refresh"),
      previewName: document.getElementById("client-preview-name"),
      previewPhone: document.getElementById("client-preview-phone"),
      previewDevice: document.getElementById("client-preview-device"),
      previewRepair: document.getElementById("client-preview-repair"),
      previewPrice: document.getElementById("client-preview-price"),
      previewTime: document.getElementById("client-preview-time"),
      previewComment: document.getElementById("client-preview-comment")
    };
  }

  function readClientForm(elements) {
    return {
      clientName: elements.name ? elements.name.value.trim() : "",
      phone: elements.phone ? elements.phone.value.trim() : "",
      device: elements.device ? elements.device.value.trim() : "",
      repairId: elements.repair ? elements.repair.value : "",
      preferredTime: elements.time ? elements.time.value.trim() : "",
      comment: elements.comment ? elements.comment.value.trim() : ""
    };
  }

  function writeClientForm(elements, data) {
    if (!data || typeof data !== "object") return;
    if (elements.name) elements.name.value = typeof data.clientName === "string" ? data.clientName : "";
    if (elements.phone) elements.phone.value = typeof data.phone === "string" ? data.phone : "";
    if (elements.device) elements.device.value = typeof data.device === "string" ? data.device : "";
    if (elements.repair) elements.repair.value = typeof data.repairId === "string" ? data.repairId : "";
    if (elements.time) elements.time.value = typeof data.preferredTime === "string" ? data.preferredTime : "";
    if (elements.comment) elements.comment.value = typeof data.comment === "string" ? data.comment : "";
  }

  function renderClientPreview(elements) {
    var data = readClientForm(elements);
    safeSetText(elements.previewName, data.clientName);
    safeSetText(elements.previewPhone, data.phone);
    safeSetText(elements.previewDevice, data.device);
    safeSetText(elements.previewRepair, getRepairLabel(data.repairId));
    safeSetText(elements.previewPrice, getRepairPrice(data.repairId));
    safeSetText(elements.previewTime, data.preferredTime ? formatDate(new Date(data.preferredTime)) : "—");
    safeSetText(elements.previewComment, data.comment);
  }

  function saveClientDraft(elements) {
    saveStoredJson(CLIENT_DRAFT_KEY, readClientForm(elements));
  }

  function loadClientDraft(elements) {
    var draft = readStoredJson(CLIENT_DRAFT_KEY);
    if (draft) writeClientForm(elements, draft);
  }

  function validateClientRequest(data) {
    if (!data.clientName) return "Введите имя клиента.";
    if (!data.phone) return "Введите телефон для связи.";
    if (!normalizePhone(data.phone)) return "Введите корректный телефон для привязки профиля.";
    if (!data.device) return "Введите устройство.";
    if (!data.repairId) return "Выберите тип ремонта.";
    if (isPastPreferredTime(data.preferredTime)) return "Выберите дату и время не раньше текущего момента.";
    return "";
  }

  function renderClientProfile(elements) {
    var profile = getClientProfile();
    if (profile) {
      if (elements.profileName) elements.profileName.value = profile.name || "";
      if (elements.profilePhone) elements.profilePhone.value = profile.phone || "";
      if (elements.name) elements.name.value = profile.name || "";
      if (elements.phone) elements.phone.value = profile.phone || "";
      safeSetText(elements.profileCurrent, (profile.name || "Клиент") + " · " + (profile.phone || "без телефона"));
    } else {
      safeSetText(elements.profileCurrent, "Профиль не выбран");
    }
  }

  async function saveClientProfileFromFields(elements, name, phone) {
    var profile = await apiFetch("/client/profile", {
      method: "POST",
      body: JSON.stringify({ name: name, phone: phone })
    });
    saveClientProfile(profile);
    renderClientProfile(elements);
    await renderClientRequests();
    return profile;
  }

  async function renderClientRequests() {
    var container = document.getElementById("client-request-list");
    if (!container) return;
    var profile = getClientProfile();
    if (!profile || !profile.phoneNormalized) {
      renderEmpty(container, "Сначала сохраните профиль клиента по телефону. После этого здесь появятся только ваши заявки.");
      return;
    }
    try {
      var requests = await apiFetch("/requests/client?phone=" + encodeURIComponent(profile.phone || profile.phoneNormalized));
      if (!requests.length) {
        renderEmpty(container, "Для этого телефона заявок пока нет. Отправьте первое обращение через форму выше.");
        return;
      }
      container.replaceChildren();
      requests.forEach(function (request) { container.appendChild(createRequestCard(request, "client")); });
    } catch (error) {
      renderEmpty(container, "Не удалось загрузить заявки: " + error.message);
    }
  }

  async function wireClientReply() {
    var container = document.getElementById("client-request-list");
    var statusEl = document.getElementById("client-status");
    if (!container) return;
    container.addEventListener("click", async function (event) {
      var target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.dataset.requestAction !== "client-reply") return;
      var profile = getClientProfile();
      if (!profile) {
        setStatus(statusEl, "Сначала сохраните профиль клиента.", "error");
        return;
      }
      var card = target.closest(".request-card");
      var textarea = card ? card.querySelector('textarea[data-reply-text="client"]') : null;
      var text = textarea ? textarea.value.trim() : "";
      if (!text) {
        setStatus(statusEl, "Введите ответ мастеру.", "error");
        return;
      }
      try {
        await apiFetch("/requests/" + encodeURIComponent(target.dataset.requestId) + "/messages", {
          method: "POST",
          body: JSON.stringify({
            senderRole: "client",
            author: profile.name || "Клиент",
            phone: profile.phone || profile.phoneNormalized,
            text: text
          })
        });
        if (textarea) textarea.value = "";
        await renderClientRequests();
        setStatus(statusEl, "Ответ отправлен мастеру.", "ok");
      } catch (error) {
        setStatus(statusEl, error.message, "error");
        await renderClientRequests();
      }
    });
  }

  function clearClientForm(elements) {
    var profile = getClientProfile();
    if (elements.form) elements.form.reset();
    if (profile) {
      if (elements.name) elements.name.value = profile.name || "";
      if (elements.phone) elements.phone.value = profile.phone || "";
    }
    populateRepairSelect(elements.repair);
    setMinDateTime(elements.time);
    removeStoredJson(CLIENT_DRAFT_KEY);
    renderClientPreview(elements);
  }

  async function wireClientProfile() {
    var elements = getClientElements();
    if (!elements.form && !elements.profileForm) return;

    populateRepairSelect(elements.repair);
    setMinDateTime(elements.time);
    loadClientDraft(elements);
    renderClientProfile(elements);
    renderClientPreview(elements);
    await renderClientRequests();
    wireClientReply();

    if (elements.profileForm) {
      elements.profileForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        var name = elements.profileName ? elements.profileName.value.trim() : "";
        var phone = elements.profilePhone ? elements.profilePhone.value.trim() : "";
        if (!name) return setStatus(elements.profileStatus, "Введите имя клиента.", "error");
        if (!normalizePhone(phone)) return setStatus(elements.profileStatus, "Введите телефон клиента.", "error");
        try {
          await saveClientProfileFromFields(elements, name, phone);
          renderClientPreview(elements);
          setStatus(elements.profileStatus, "Профиль клиента сохранён в браузере и в SQLite.", "ok");
        } catch (error) {
          setStatus(elements.profileStatus, error.message, "error");
        }
      });
    }

    if (elements.profileReset) {
      elements.profileReset.addEventListener("click", async function () {
        clearClientProfile();
        if (elements.profileName) elements.profileName.value = "";
        if (elements.profilePhone) elements.profilePhone.value = "";
        renderClientProfile(elements);
        await renderClientRequests();
        setStatus(elements.profileStatus, "Профиль клиента очищен в браузере. Можно войти под другим телефоном.", "ok");
      });
    }

    if (elements.form) {
      elements.form.addEventListener("input", function () {
        renderClientPreview(elements);
        saveClientDraft(elements);
      });
      elements.form.addEventListener("change", function () {
        setMinDateTime(elements.time);
        renderClientPreview(elements);
        saveClientDraft(elements);
      });
      elements.form.addEventListener("submit", async function (event) {
        event.preventDefault();
        setMinDateTime(elements.time);
        var data = readClientForm(elements);
        var error = validateClientRequest(data);
        if (error) return setStatus(elements.status, error, "error");
        try {
          var profile = getClientProfile();
          if (!profile || profile.phoneNormalized !== normalizePhone(data.phone)) {
            profile = await saveClientProfileFromFields(elements, data.clientName, data.phone);
            setStatus(elements.profileStatus, "Профиль клиента автоматически сохранён по телефону из заявки.", "ok");
          }
          await apiFetch("/requests", {
            method: "POST",
            body: JSON.stringify(Object.assign({}, data, { preferredTime: toServerDateTime(data.preferredTime) }))
          });
          removeStoredJson(CLIENT_DRAFT_KEY);
          clearClientForm(elements);
          await renderClientRequests();
          setStatus(elements.status, "Заявка отправлена в общую доску мастеров и сохранена в SQLite.", "ok");
        } catch (err) {
          setStatus(elements.status, err.message, "error");
        }
      });
      if (elements.clear) {
        elements.clear.addEventListener("click", function () {
          clearClientForm(elements);
          setStatus(elements.status, "Форма очищена.", "ok");
        });
      }
      if (elements.refresh) {
        elements.refresh.addEventListener("click", async function () {
          await renderClientRequests();
          setStatus(elements.status, "Список заявок обновлён.", "ok");
        });
      }
    }
  }

  async function renderMasterRequests() {
    var openContainer = document.getElementById("master-open-list");
    var mineContainer = document.getElementById("master-my-list");
    if (!openContainer && !mineContainer) return;
    var profile = getMasterProfile();
    if (!profile) return;
    try {
      var openRequests = await apiFetch("/requests/open");
      var myRequests = await apiFetch("/requests/master?masterId=" + encodeURIComponent(profile.id));
      if (openContainer) {
        if (!openRequests.length) renderEmpty(openContainer, "Свободных заявок нет. Если другой мастер уже взял заявку, она исчезает из общей доски.");
        else {
          openContainer.replaceChildren();
          openRequests.forEach(function (request) { openContainer.appendChild(createRequestCard(request, "master-open")); });
        }
      }
      if (mineContainer) {
        if (!myRequests.length) renderEmpty(mineContainer, "У вас пока нет заявок в работе. Возьмите свободную заявку из общей доски.");
        else {
          mineContainer.replaceChildren();
          myRequests.forEach(function (request) { mineContainer.appendChild(createRequestCard(request, "master-mine")); });
        }
      }
    } catch (error) {
      renderEmpty(openContainer, "Не удалось загрузить заявки: " + error.message);
      renderEmpty(mineContainer, "Не удалось загрузить заявки: " + error.message);
    }
  }

  async function acceptMasterRequest(id) {
    var profile = getMasterProfile();
    var statusEl = document.getElementById("master-status");
    if (!profile) return setStatus(statusEl, "Сначала войдите как мастер.", "error");
    try {
      await apiFetch("/requests/" + encodeURIComponent(id) + "/accept", {
        method: "POST",
        body: JSON.stringify({ masterId: profile.id, masterName: profile.name || "Мастер" })
      });
      await renderMasterRequests();
      setStatus(statusEl, "Заявка взята в работу и исчезла из общей доски.", "ok");
    } catch (error) {
      setStatus(statusEl, error.message, "error");
      await renderMasterRequests();
    }
  }

  async function sendMasterMessage(id, text) {
    var profile = getMasterProfile();
    var statusEl = document.getElementById("master-status");
    if (!profile) return setStatus(statusEl, "Сначала войдите как мастер.", "error");
    if (!text) return setStatus(statusEl, "Введите сообщение клиенту.", "error");
    try {
      await apiFetch("/requests/" + encodeURIComponent(id) + "/messages", {
        method: "POST",
        body: JSON.stringify({
          senderRole: "master",
          author: profile.name || "Мастер",
          masterId: profile.id,
          text: text
        })
      });
      await renderMasterRequests();
      setStatus(statusEl, "Сообщение отправлено клиенту.", "ok");
    } catch (error) {
      setStatus(statusEl, error.message, "error");
      await renderMasterRequests();
    }
  }

  async function markRequestDone(id) {
    var profile = getMasterProfile();
    var statusEl = document.getElementById("master-status");
    if (!profile) return setStatus(statusEl, "Сначала войдите как мастер.", "error");
    try {
      await apiFetch("/requests/" + encodeURIComponent(id) + "/done", {
        method: "POST",
        body: JSON.stringify({ masterId: profile.id })
      });
      await renderMasterRequests();
      setStatus(statusEl, "Заявка отмечена готовой.", "ok");
    } catch (error) {
      setStatus(statusEl, error.message, "error");
      await renderMasterRequests();
    }
  }

  async function refreshMasterAuthUI() {
    var authCard = document.getElementById("master-auth-card");
    var workspace = document.getElementById("master-workspace");
    var currentProfile = document.getElementById("master-current-profile");
    var loginNameEl = document.getElementById("master-login-name");
    var profile = getMasterProfile();
    if (!authCard && !workspace) return;
    if (profile) {
      if (authCard) authCard.hidden = true;
      if (workspace) workspace.hidden = false;
      safeSetText(currentProfile, "Мастер: " + (profile.name || "Мастер"));
      await renderMasterRequests();
    } else {
      if (authCard) authCard.hidden = false;
      if (workspace) workspace.hidden = true;
      if (loginNameEl && !loginNameEl.value) loginNameEl.value = "Алексей";
    }
  }

  async function wireMasterProfile() {
    var loginForm = document.getElementById("master-login-form");
    var loginStatusEl = document.getElementById("master-login-status");
    var logoutButton = document.getElementById("master-logout");
    if (!loginForm && !document.getElementById("master-workspace")) return;
    await refreshMasterAuthUI();

    if (loginForm) {
      loginForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        var nameEl = document.getElementById("master-login-name");
        var codeEl = document.getElementById("master-login-code");
        var name = nameEl && nameEl.value.trim() ? nameEl.value.trim() : "Мастер";
        var code = codeEl ? codeEl.value.trim() : "";
        try {
          var profile = await apiFetch("/master/login", {
            method: "POST",
            body: JSON.stringify({ name: name, code: code })
          });
          saveMasterProfile(profile);
          if (codeEl) codeEl.value = "";
          setStatus(loginStatusEl, "", "ok");
          await refreshMasterAuthUI();
        } catch (error) {
          setStatus(loginStatusEl, error.message, "error");
        }
      });
    }

    if (logoutButton) {
      logoutButton.addEventListener("click", async function () {
        clearMasterProfile();
        await refreshMasterAuthUI();
      });
    }

    var workspace = document.getElementById("master-workspace");
    if (workspace) {
      workspace.addEventListener("click", async function (event) {
        var target = event.target;
        if (!(target instanceof HTMLElement)) return;
        var action = target.dataset.requestAction;
        var id = target.dataset.requestId;
        if (!action || !id) return;
        if (action === "accept") return acceptMasterRequest(id);
        if (action === "master-reply") {
          var card = target.closest(".request-card");
          var textarea = card ? card.querySelector('textarea[data-reply-text="master"]') : null;
          var text = textarea ? textarea.value.trim() : "";
          await sendMasterMessage(id, text);
          if (textarea && text) textarea.value = "";
          return;
        }
        if (action === "done") return markRequestDone(id);
      });
    }
  }

  function wireEstimateForm() {
    var form = document.getElementById("estimate-form");
    if (!form) return;
    var device = document.getElementById("device-type");
    var service = document.getElementById("service-type");
    var brand = document.getElementById("brand-type");
    var result = document.getElementById("estimate-result");
    var note = document.getElementById("estimate-note");
    function calculate() {
      var deviceValue = device ? device.value : "phone";
      var serviceValue = service ? service.value : "display";
      var brandValue = brand ? brand.value : "standard";
      var base = BASE_PRICES[deviceValue] && BASE_PRICES[deviceValue][serviceValue] ? BASE_PRICES[deviceValue][serviceValue] : 990;
      var multiplier = BRAND_MULTIPLIERS[brandValue] || 1;
      var total = base * multiplier;
      safeSetText(result, formatPrice(total));
      safeSetText(note, "Точная сумма зависит от модели, детали и состояния устройства.");
    }
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      calculate();
    });
    [device, service, brand].forEach(function (element) {
      if (element) element.addEventListener("change", calculate);
    });
    calculate();
  }

  document.addEventListener("DOMContentLoaded", async function () {
    loadTheme();
    wireThemeToggle();
    applyRoleVisibility();
    setNavCurrent();
    wireEstimateForm();
    await wireClientProfile();
    await wireMasterProfile();
  });
})();
