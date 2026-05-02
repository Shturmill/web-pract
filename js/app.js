(function () {
  "use strict";

  var THEME_KEY = "servicebox_theme";
  var REQUESTS_KEY = "servicebox_requests";
  var CLIENT_DRAFT_KEY = "servicebox_client_draft";
  var CLIENT_PROFILE_COOKIE_KEY = "servicebox_client_profile";
  var CLIENT_PROFILE_STORAGE_KEY = "servicebox_client_profile_fallback";
  var MASTER_PROFILE_COOKIE_KEY = "servicebox_master_profile";
  var MASTER_PROFILE_STORAGE_KEY = "servicebox_master_profile_fallback";
  var MASTER_ACCESS_CODE = "1234";

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
    phone: {
      display: 2490,
      battery: 890,
      connector: 1190,
      water: 1990,
      software: 790,
      cleaning: 990
    },
    tablet: {
      display: 3290,
      battery: 1290,
      connector: 1490,
      water: 2190,
      software: 890,
      cleaning: 1190
    },
    laptop: {
      display: 4290,
      battery: 1490,
      connector: 1890,
      water: 2490,
      software: 990,
      cleaning: 1490
    }
  };

  var BRAND_MULTIPLIERS = {
    standard: 1,
    apple: 1.25
  };

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

  function makeProfileId(prefix, value) {
    var normalized = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-zа-яё0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "");
    return prefix + ":" + (normalized || Date.now());
  }

  function formatPrice(value) {
    if (Number(value) === 0) return "от 0 ₽";
    return "от " + Math.round(Number(value) || 0).toLocaleString("ru-RU") + " ₽";
  }

  function formatDate(value) {
    var date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function toDatetimeLocalValue(date) {
    return [
      date.getFullYear(),
      pad2(date.getMonth() + 1),
      pad2(date.getDate())
    ].join("-") + "T" + [pad2(date.getHours()), pad2(date.getMinutes())].join(":");
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

  function formatPreferredTime(value) {
    if (!value) return "—";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function findRepairOption(id) {
    return REPAIR_OPTIONS.find(function (item) {
      return item.id === id;
    }) || null;
  }

  function getRepairLabel(id) {
    var option = findRepairOption(id);
    return option ? option.title : "—";
  }

  function getRepairPrice(id) {
    var option = findRepairOption(id);
    return option ? formatPrice(option.priceFrom) : "—";
  }

  function setCookie(name, value, maxAgeDays) {
    var maxAge = Math.max(1, maxAgeDays || 30) * 24 * 60 * 60;
    document.cookie = name + "=" + encodeURIComponent(value) + "; max-age=" + maxAge + "; path=/; SameSite=Lax";
  }

  function getCookie(name) {
    var prefix = name + "=";
    var parts = document.cookie ? document.cookie.split("; ") : [];
    for (var i = 0; i < parts.length; i += 1) {
      if (parts[i].indexOf(prefix) === 0) {
        return decodeURIComponent(parts[i].slice(prefix.length));
      }
    }
    return "";
  }

  function deleteCookie(name) {
    document.cookie = name + "=; max-age=0; path=/; SameSite=Lax";
  }

  function readStoredJson(storageKey) {
    try {
      var raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function readCookieJson(cookieKey) {
    var raw = getCookie(cookieKey);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function readProfile(storageKey, cookieKey) {
    return readStoredJson(storageKey) || readCookieJson(cookieKey);
  }

  function saveProfileToBrowser(profile, storageKey, cookieKey) {
    var raw = JSON.stringify(profile);
    try {
      localStorage.setItem(storageKey, raw);
    } catch (_) {}
    try {
      setCookie(cookieKey, raw, 180);
    } catch (_) {}
    applyRoleVisibility();
    return profile;
  }

  function clearProfileFromBrowser(storageKey, cookieKey) {
    try {
      localStorage.removeItem(storageKey);
    } catch (_) {}
    try {
      deleteCookie(cookieKey);
    } catch (_) {}
    applyRoleVisibility();
  }

  function saveClientProfile(profile) {
    var normalized = Object.assign({}, profile, {
      role: "client",
      phoneNormalized: normalizePhone(profile && profile.phone)
    });
    if (!normalized.id) normalized.id = "client:" + normalized.phoneNormalized;
    return saveProfileToBrowser(normalized, CLIENT_PROFILE_STORAGE_KEY, CLIENT_PROFILE_COOKIE_KEY);
  }

  function saveMasterProfile(profile) {
    var normalized = Object.assign({}, profile, {
      role: "master",
      id: profile && profile.id ? profile.id : makeProfileId("master", profile && profile.name)
    });
    return saveProfileToBrowser(normalized, MASTER_PROFILE_STORAGE_KEY, MASTER_PROFILE_COOKIE_KEY);
  }

  function clearClientProfile() {
    clearProfileFromBrowser(CLIENT_PROFILE_STORAGE_KEY, CLIENT_PROFILE_COOKIE_KEY);
  }

  function clearMasterProfile() {
    clearProfileFromBrowser(MASTER_PROFILE_STORAGE_KEY, MASTER_PROFILE_COOKIE_KEY);
  }

  function getClientProfile() {
    var profile = readProfile(CLIENT_PROFILE_STORAGE_KEY, CLIENT_PROFILE_COOKIE_KEY);
    return profile && profile.role === "client" ? profile : null;
  }

  function getMasterProfile() {
    var profile = readProfile(MASTER_PROFILE_STORAGE_KEY, MASTER_PROFILE_COOKIE_KEY);
    return profile && profile.role === "master" ? profile : null;
  }

  function setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (_) {}
  }

  function loadTheme() {
    var saved = null;
    try {
      saved = localStorage.getItem(THEME_KEY);
    } catch (_) {}

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
      if (link.getAttribute("href") === current) {
        link.setAttribute("aria-current", "page");
      }
    });
  }

  function normalizeStatus(status) {
    if (status === "open" || status === "in_progress" || status === "done") return status;
    if (status === "accepted" || status === "message" || status === "client-reply") return "in_progress";
    return "open";
  }

  function normalizeRequest(raw) {
    var status = normalizeStatus(raw && raw.status);
    var id = raw && raw.id != null ? raw.id : Date.now();
    var clientName = raw.clientName || raw.client || raw.ownerName || "Клиент";
    var problem = raw.problem || raw.comment || raw.repairTitle || getRepairLabel(raw.repairId) || "Не указано";
    var assignee = raw.assignee || raw.assigneeId || null;
    var assigneeName = raw.assigneeName || raw.masterName || "";

    if (status === "in_progress" && !assignee && assigneeName) {
      assignee = makeProfileId("master", assigneeName);
    }

    return Object.assign({}, raw, {
      id: id,
      clientName: clientName,
      client: raw.client || clientName,
      problem: problem,
      status: status,
      assignee: status === "open" ? null : assignee,
      assigneeName: status === "open" ? "" : assigneeName
    });
  }

  function loadRequests() {
    var raw = null;
    try {
      raw = localStorage.getItem(REQUESTS_KEY);
    } catch (_) {}

    if (!raw) return [];

    try {
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(normalizeRequest) : [];
    } catch (_) {
      return [];
    }
  }

  function saveRequests(requests) {
    try {
      localStorage.setItem(REQUESTS_KEY, JSON.stringify(requests));
      return true;
    } catch (_) {
      return false;
    }
  }

  function idsEqual(a, b) {
    return String(a) === String(b);
  }

  function appendRequestMessage(id, message, patch) {
    var requests = loadRequests();
    var changed = false;
    requests = requests.map(function (request) {
      if (!idsEqual(request.id, id)) return request;
      changed = true;
      var messages = getRequestMessages(request);
      messages.push(Object.assign({}, message, { createdAt: new Date().toISOString() }));
      return Object.assign({}, request, patch || {}, {
        messages: messages,
        updatedAt: new Date().toISOString()
      });
    });
    return changed && saveRequests(requests);
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
    var messages = Array.isArray(request.messages) ? request.messages.slice() : [];
    if (!messages.length) {
      if (request.masterMessage) {
        messages.push({
          from: "master",
          author: request.assigneeName || request.masterName || "Мастер",
          text: request.masterMessage,
          createdAt: request.updatedAt || request.createdAt
        });
      }
      if (request.clientReply) {
        messages.push({
          from: "client",
          author: request.clientName || request.client || "Клиент",
          text: request.clientReply,
          createdAt: request.updatedAt || request.createdAt
        });
      }
    }
    return messages.filter(function (item) {
      return item && item.text;
    });
  }

  function hasMasterMessage(request) {
    return getRequestMessages(request).some(function (item) {
      return item.from === "master";
    });
  }

  function getMessageAuthor(message, request, context) {
    if (context === "client") {
      return message.from === "client" ? "Вы" : "Сервисный центр";
    }
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

  function createClientReplyForm(request) {
    var box = createElement("div", "reply-box");
    var label = createElement("label", "visually-hidden", "Ответить по заявке " + request.id);
    label.setAttribute("for", "reply-" + request.id);
    var textarea = document.createElement("textarea");
    textarea.id = "reply-" + request.id;
    textarea.rows = 3;
    textarea.maxLength = 1000;
    textarea.placeholder = "Напишите ответ мастеру...";
    textarea.dataset.replyText = "true";
    var button = createElement("button", "", "Ответить мастеру");
    button.type = "button";
    button.dataset.requestAction = "client-reply";
    button.dataset.requestId = request.id;
    box.appendChild(label);
    box.appendChild(textarea);
    box.appendChild(button);
    return box;
  }

  function createMasterReplyForm(request) {
    var box = createElement("div", "reply-box master-reply-box");
    var label = createElement("label", "visually-hidden", "Ответить клиенту по заявке " + request.id);
    label.setAttribute("for", "master-reply-" + request.id);
    var textarea = document.createElement("textarea");
    textarea.id = "master-reply-" + request.id;
    textarea.rows = 3;
    textarea.maxLength = 1000;
    textarea.placeholder = "Напишите сообщение клиенту...";
    textarea.dataset.masterReplyText = "true";
    var actions = createElement("div", "request-actions");
    var send = createElement("button", "", "Отправить клиенту");
    send.type = "button";
    send.dataset.requestAction = "master-reply";
    send.dataset.requestId = request.id;
    var done = createElement("button", "button button--ghost", "Отметить готовой");
    done.type = "button";
    done.dataset.requestAction = "done";
    done.dataset.requestId = request.id;
    actions.appendChild(send);
    actions.appendChild(done);
    box.appendChild(label);
    box.appendChild(textarea);
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
    var status = createElement("span", "status-pill status-pill--" + (request.status || "open"), getStatusText(request.status));
    top.appendChild(titleWrap);
    top.appendChild(status);
    card.appendChild(top);

    var meta = createElement("div", "request-meta");
    meta.appendChild(createMeta("Клиент", request.clientName || request.client));
    meta.appendChild(createMeta("Телефон", request.phone));
    meta.appendChild(createMeta("Запрос", request.repairTitle || getRepairLabel(request.repairId)));
    meta.appendChild(createMeta("Стоимость", request.priceText || getRepairPrice(request.repairId)));
    meta.appendChild(createMeta("Время", formatPreferredTime(request.preferredTime)));
    meta.appendChild(createMeta("Создана", formatDate(request.createdAt)));
    if (context === "master" && request.status !== "open") {
      meta.appendChild(createMeta("Исполнитель", request.assigneeName || "Мастер"));
    }
    card.appendChild(meta);

    if (request.problem || request.comment) {
      var comment = createElement("p", "request-comment");
      safeSetText(comment, request.problem || request.comment);
      card.appendChild(comment);
    }

    var thread = createMessageThread(request, context);
    if (thread) card.appendChild(thread);

    if (context === "client" && request.status === "in_progress" && hasMasterMessage(request)) {
      card.appendChild(createClientReplyForm(request));
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
      card.appendChild(createMasterReplyForm(request));
    }

    return card;
  }

  function renderEmpty(container, text) {
    container.replaceChildren();
    var empty = createElement("div", "empty-state");
    empty.appendChild(createElement("strong", "", "Пока пусто"));
    empty.appendChild(createElement("p", "", text));
    container.appendChild(empty);
  }

  function sortRequests(requests) {
    return requests.slice().sort(function (a, b) {
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });
  }

  function requestBelongsToClient(request, profile) {
    if (!profile || !profile.phoneNormalized) return false;
    var owner = request.ownerPhone || request.phone;
    return normalizePhone(owner) === profile.phoneNormalized;
  }

  function getClientRequestsForProfile(profile) {
    return sortRequests(loadRequests().filter(function (request) {
      return requestBelongsToClient(request, profile);
    }));
  }

  function renderClientRequests() {
    var container = document.getElementById("client-request-list");
    if (!container) return;
    var profile = getClientProfile();

    if (!profile || !profile.phoneNormalized) {
      renderEmpty(container, "Сначала сохраните профиль клиента по телефону. После этого здесь появятся только ваши заявки.");
      return;
    }

    var requests = getClientRequestsForProfile(profile);
    if (!requests.length) {
      renderEmpty(container, "Для этого телефона заявок пока нет. Отправьте первое обращение через форму выше.");
      return;
    }

    container.replaceChildren();
    requests.forEach(function (request) {
      container.appendChild(createRequestCard(request, "client"));
    });
  }

  function renderMasterRequests() {
    var openContainer = document.getElementById("master-open-list");
    var mineContainer = document.getElementById("master-my-list");
    if (!openContainer && !mineContainer) return;
    var profile = getMasterProfile();
    var requests = loadRequests();
    var openRequests = sortRequests(requests.filter(function (request) {
      return request.status === "open";
    }));
    var myRequests = sortRequests(requests.filter(function (request) {
      return profile && request.status === "in_progress" && request.assignee === profile.id;
    }));

    if (openContainer) {
      if (!openRequests.length) {
        renderEmpty(openContainer, "Свободных заявок нет. Если другой мастер уже взял заявку, она пропадает из общей доски после обновления списка.");
      } else {
        openContainer.replaceChildren();
        openRequests.forEach(function (request) {
          openContainer.appendChild(createRequestCard(request, "master-open"));
        });
      }
    }

    if (mineContainer) {
      if (!myRequests.length) {
        renderEmpty(mineContainer, "У вас пока нет заявок в работе. Возьмите свободную заявку из общей доски.");
      } else {
        mineContainer.replaceChildren();
        myRequests.forEach(function (request) {
          mineContainer.appendChild(createRequestCard(request, "master-mine"));
        });
      }
    }
  }

  function populateRepairSelect(select) {
    if (!select) return;
    var current = select.value;
    var firstOption = select.querySelector('option[value=""]');
    select.replaceChildren();
    if (firstOption) {
      select.appendChild(firstOption);
    } else {
      var placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Выберите обращение";
      select.appendChild(placeholder);
    }

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
      client: elements.name ? elements.name.value.trim() : "",
      phone: elements.phone ? elements.phone.value.trim() : "",
      device: elements.device ? elements.device.value.trim() : "",
      repairId: elements.repair ? elements.repair.value : "",
      preferredTime: elements.time ? elements.time.value.trim() : "",
      comment: elements.comment ? elements.comment.value.trim() : ""
    };
  }

  function writeClientForm(elements, data) {
    if (!data || typeof data !== "object") return;
    if (elements.name) elements.name.value = typeof data.client === "string" ? data.client : "";
    if (elements.phone) elements.phone.value = typeof data.phone === "string" ? data.phone : "";
    if (elements.device) elements.device.value = typeof data.device === "string" ? data.device : "";
    if (elements.repair) elements.repair.value = typeof data.repairId === "string" ? data.repairId : "";
    if (elements.time) elements.time.value = typeof data.preferredTime === "string" ? data.preferredTime : "";
    if (elements.comment) elements.comment.value = typeof data.comment === "string" ? data.comment : "";
  }

  function renderClientPreview(elements) {
    var data = readClientForm(elements);
    safeSetText(elements.previewName, data.client);
    safeSetText(elements.previewPhone, data.phone);
    safeSetText(elements.previewDevice, data.device);
    safeSetText(elements.previewRepair, getRepairLabel(data.repairId));
    safeSetText(elements.previewPrice, getRepairPrice(data.repairId));
    safeSetText(elements.previewTime, formatPreferredTime(data.preferredTime));
    safeSetText(elements.previewComment, data.comment);
  }

  function saveClientDraft(elements) {
    try {
      localStorage.setItem(CLIENT_DRAFT_KEY, JSON.stringify(readClientForm(elements)));
    } catch (_) {}
  }

  function loadClientDraft(elements) {
    var raw = null;
    try {
      raw = localStorage.getItem(CLIENT_DRAFT_KEY);
    } catch (_) {}
    if (!raw) return;
    try {
      writeClientForm(elements, JSON.parse(raw));
    } catch (_) {}
  }

  function validateClientRequest(data) {
    if (!data.client) return "Введите имя клиента.";
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

  function saveClientProfileFromFields(elements, name, phone) {
    var profile = saveClientProfile({
      name: name,
      phone: phone
    });
    if (elements.name) elements.name.value = profile.name || "";
    if (elements.phone) elements.phone.value = profile.phone || "";
    if (elements.profileName) elements.profileName.value = profile.name || "";
    if (elements.profilePhone) elements.profilePhone.value = profile.phone || "";
    renderClientProfile(elements);
    renderClientRequests();
    return profile;
  }

  function wireClientReply() {
    var container = document.getElementById("client-request-list");
    var statusEl = document.getElementById("client-status");
    if (!container) return;

    container.addEventListener("click", function (event) {
      var target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.dataset.requestAction !== "client-reply") return;

      var profile = getClientProfile();
      if (!profile) {
        setStatus(statusEl, "Сначала сохраните профиль клиента.", "error");
        return;
      }

      var card = target.closest(".request-card");
      var textarea = card ? card.querySelector("textarea[data-reply-text]") : null;
      var id = target.dataset.requestId;
      var text = textarea ? textarea.value.trim() : "";
      if (!text) {
        setStatus(statusEl, "Введите ответ мастеру.", "error");
        return;
      }

      var request = loadRequests().find(function (item) {
        return idsEqual(item.id, id);
      });
      if (!request || !requestBelongsToClient(request, profile)) {
        setStatus(statusEl, "Эта заявка не относится к текущему профилю клиента.", "error");
        return;
      }
      if (request.status !== "in_progress") {
        setStatus(statusEl, "Ответ доступен только по заявке, которую мастер взял в работу.", "error");
        renderClientRequests();
        return;
      }

      if (appendRequestMessage(id, {
        from: "client",
        author: profile.name || request.clientName || "Клиент",
        text: text
      })) {
        if (textarea) textarea.value = "";
        renderClientRequests();
        setStatus(statusEl, "Ответ отправлен мастеру.", "ok");
      } else {
        setStatus(statusEl, "Не удалось отправить ответ.", "error");
      }
    });
  }

  function wireClientProfile() {
    var elements = getClientElements();
    if (!elements.form && !elements.profileForm) return;

    populateRepairSelect(elements.repair);
    setMinDateTime(elements.time);
    loadClientDraft(elements);
    renderClientProfile(elements);
    renderClientPreview(elements);
    renderClientRequests();
    wireClientReply();

    if (elements.profileForm) {
      elements.profileForm.addEventListener("submit", function (event) {
        event.preventDefault();
        var name = elements.profileName ? elements.profileName.value.trim() : "";
        var phone = elements.profilePhone ? elements.profilePhone.value.trim() : "";
        if (!name) {
          setStatus(elements.profileStatus, "Введите имя клиента.", "error");
          return;
        }
        if (!normalizePhone(phone)) {
          setStatus(elements.profileStatus, "Введите телефон клиента.", "error");
          return;
        }
        saveClientProfileFromFields(elements, name, phone);
        renderClientPreview(elements);
        setStatus(elements.profileStatus, "Профиль клиента сохранён в браузере.", "ok");
      });
    }

    if (elements.profileReset) {
      elements.profileReset.addEventListener("click", function () {
        clearClientProfile();
        if (elements.profileName) elements.profileName.value = "";
        if (elements.profilePhone) elements.profilePhone.value = "";
        renderClientProfile(elements);
        renderClientRequests();
        setStatus(elements.profileStatus, "Профиль клиента очищен. Можно войти под другим телефоном.", "ok");
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

      elements.form.addEventListener("submit", function (event) {
        event.preventDefault();
        setMinDateTime(elements.time);
        var data = readClientForm(elements);
        var error = validateClientRequest(data);
        if (error) {
          setStatus(elements.status, error, "error");
          return;
        }

        var profile = getClientProfile();
        if (!profile || profile.phoneNormalized !== normalizePhone(data.phone)) {
          profile = saveClientProfileFromFields(elements, data.client, data.phone);
          setStatus(elements.profileStatus, "Профиль клиента автоматически сохранён по телефону из заявки.", "ok");
        }

        var repair = findRepairOption(data.repairId);
        var id = Date.now();
        var request = Object.assign({}, data, {
          id: id,
          clientName: data.client,
          ownerPhone: profile.phoneNormalized,
          ownerName: profile.name || data.client,
          problem: data.comment || (repair ? repair.title : data.repairId),
          repairTitle: repair ? repair.title : data.repairId,
          priceFrom: repair ? repair.priceFrom : null,
          priceText: repair ? formatPrice(repair.priceFrom) : "—",
          repairDuration: repair ? repair.duration : "—",
          status: "open",
          assignee: null,
          assigneeName: "",
          messages: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        var requests = loadRequests();
        requests.push(request);
        if (!saveRequests(requests)) {
          setStatus(elements.status, "Не удалось сохранить заявку в localStorage.", "error");
          return;
        }

        try {
          localStorage.removeItem(CLIENT_DRAFT_KEY);
        } catch (_) {}
        elements.form.reset();
        if (elements.name) elements.name.value = profile.name || "";
        if (elements.phone) elements.phone.value = profile.phone || "";
        populateRepairSelect(elements.repair);
        setMinDateTime(elements.time);
        renderClientPreview(elements);
        renderClientRequests();
        setStatus(elements.status, "Заявка отправлена в общую доску мастеров.", "ok");
      });

      if (elements.clear) {
        elements.clear.addEventListener("click", function () {
          var profile = getClientProfile();
          elements.form.reset();
          if (profile) {
            if (elements.name) elements.name.value = profile.name || "";
            if (elements.phone) elements.phone.value = profile.phone || "";
          }
          populateRepairSelect(elements.repair);
          setMinDateTime(elements.time);
          try {
            localStorage.removeItem(CLIENT_DRAFT_KEY);
          } catch (_) {}
          renderClientPreview(elements);
          setStatus(elements.status, "Форма очищена.", "ok");
        });
      }

      if (elements.refresh) {
        elements.refresh.addEventListener("click", function () {
          renderClientRequests();
          setStatus(elements.status, "Список заявок обновлён.", "ok");
        });
      }
    }
  }

  function acceptMasterRequest(id) {
    var profile = getMasterProfile();
    var statusEl = document.getElementById("master-status");
    if (!profile) {
      setStatus(statusEl, "Сначала войдите как мастер.", "error");
      return;
    }
    if (!id) {
      setStatus(statusEl, "Не найдена выбранная заявка.", "error");
      return;
    }

    var requests = loadRequests();
    var request = requests.find(function (item) {
      return idsEqual(item.id, id);
    });

    if (!request) {
      setStatus(statusEl, "Заявка не найдена. Список обновлён.", "error");
      renderMasterRequests();
      return;
    }

    if (request.status !== "open") {
      setStatus(statusEl, "Эту заявку уже забрал другой мастер.", "error");
      renderMasterRequests();
      return;
    }

    requests = requests.map(function (item) {
      if (!idsEqual(item.id, id)) return item;
      return Object.assign({}, item, {
        status: "in_progress",
        assignee: profile.id,
        assigneeName: profile.name || "Мастер",
        updatedAt: new Date().toISOString()
      });
    });

    if (saveRequests(requests)) {
      renderMasterRequests();
      setStatus(statusEl, "Заявка взята в работу и исчезла из общей доски.", "ok");
    } else {
      setStatus(statusEl, "Не удалось принять заявку.", "error");
    }
  }

  function masterCanWorkWithRequest(request, profile) {
    return Boolean(profile && request && request.status === "in_progress" && request.assignee === profile.id);
  }

  function sendMasterMessage(id, text) {
    var profile = getMasterProfile();
    var statusEl = document.getElementById("master-status");
    if (!profile) {
      setStatus(statusEl, "Сначала войдите как мастер.", "error");
      return;
    }
    var request = loadRequests().find(function (item) {
      return idsEqual(item.id, id);
    });
    if (!masterCanWorkWithRequest(request, profile)) {
      setStatus(statusEl, "Эта заявка не находится в вашей работе.", "error");
      renderMasterRequests();
      return;
    }
    if (!text) {
      setStatus(statusEl, "Введите сообщение клиенту.", "error");
      return;
    }
    if (appendRequestMessage(id, {
      from: "master",
      author: profile.name || "Мастер",
      text: text
    }, {
      assigneeName: profile.name || "Мастер"
    })) {
      renderMasterRequests();
      setStatus(statusEl, "Сообщение отправлено клиенту.", "ok");
    } else {
      setStatus(statusEl, "Не удалось отправить сообщение.", "error");
    }
  }

  function markRequestDone(id) {
    var profile = getMasterProfile();
    var statusEl = document.getElementById("master-status");
    var requests = loadRequests();
    var request = requests.find(function (item) {
      return idsEqual(item.id, id);
    });
    if (!masterCanWorkWithRequest(request, profile)) {
      setStatus(statusEl, "Завершить можно только свою заявку в работе.", "error");
      renderMasterRequests();
      return;
    }
    requests = requests.map(function (item) {
      if (!idsEqual(item.id, id)) return item;
      return Object.assign({}, item, {
        status: "done",
        updatedAt: new Date().toISOString()
      });
    });
    if (saveRequests(requests)) {
      renderMasterRequests();
      setStatus(statusEl, "Заявка отмечена готовой.", "ok");
    } else {
      setStatus(statusEl, "Не удалось изменить статус заявки.", "error");
    }
  }

  function refreshMasterAuthUI() {
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
      renderMasterRequests();
    } else {
      if (authCard) authCard.hidden = false;
      if (workspace) workspace.hidden = true;
      if (loginNameEl && !loginNameEl.value) loginNameEl.value = "Алексей";
    }
  }

  function wireMasterProfile() {
    var loginForm = document.getElementById("master-login-form");
    var statusEl = document.getElementById("master-status");
    var loginStatusEl = document.getElementById("master-login-status");
    var logoutButton = document.getElementById("master-logout");
    if (!loginForm && !document.getElementById("master-workspace")) return;

    refreshMasterAuthUI();

    if (loginForm) {
      loginForm.addEventListener("submit", function (event) {
        event.preventDefault();
        var nameEl = document.getElementById("master-login-name");
        var codeEl = document.getElementById("master-login-code");
        var name = nameEl && nameEl.value.trim() ? nameEl.value.trim() : "Мастер";
        var code = codeEl ? codeEl.value.trim() : "";
        if (code !== MASTER_ACCESS_CODE) {
          setStatus(loginStatusEl, "Неверный учебный код мастера.", "error");
          return;
        }
        saveMasterProfile({ name: name });
        if (codeEl) codeEl.value = "";
        setStatus(loginStatusEl, "", "ok");
        refreshMasterAuthUI();
      });
    }

    if (logoutButton) {
      logoutButton.addEventListener("click", function () {
        clearMasterProfile();
        refreshMasterAuthUI();
      });
    }

    var workspace = document.getElementById("master-workspace");
    if (workspace) {
      workspace.addEventListener("click", function (event) {
        var target = event.target;
        if (!(target instanceof HTMLElement)) return;
        var action = target.dataset.requestAction;
        var id = target.dataset.requestId;
        if (!action || !id) return;

        if (action === "accept") {
          acceptMasterRequest(id);
          return;
        }

        if (action === "master-reply") {
          var card = target.closest(".request-card");
          var textarea = card ? card.querySelector("textarea[data-master-reply-text]") : null;
          var text = textarea ? textarea.value.trim() : "";
          sendMasterMessage(id, text);
          if (textarea && text) textarea.value = "";
          return;
        }

        if (action === "done") {
          markRequestDone(id);
        }
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

  document.addEventListener("DOMContentLoaded", function () {
    loadTheme();
    wireThemeToggle();
    applyRoleVisibility();
    setNavCurrent();
    wireEstimateForm();
    wireClientProfile();
    wireMasterProfile();
  });
})();
