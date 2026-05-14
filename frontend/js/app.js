(function () {
  "use strict";

  var API = "/api";
  var THEME_KEY = "servicebox_theme";
  var CLIENT_PROFILE_KEY = "servicebox_client_profile_v3";
  var MASTER_PROFILE_KEY = "servicebox_master_profile_v3";
  var CLIENT_DRAFT_KEY = "servicebox_client_draft_v3";
  var REPAIR_OPTIONS = [];
  var PHONE_PATTERN = /^\+7[\s-]?\(?[0-9]{3}\)?[\s-]?[0-9]{3}[\s-]?[0-9]{2}[\s-]?[0-9]{2}$/;
  var NAME_PATTERN = /^[A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё\s-]{1,79}$/;
  var DEVICE_PATTERN = /^[A-Za-zА-Яа-яЁё0-9][A-Za-zА-Яа-яЁё0-9\s\-+./()]{1,119}$/;
  var SAFE_TEXT_PATTERN = /^[^<>\\{}]{0,2000}$/;

  function $(id) { return document.getElementById(id); }
  function text(el, value) { if (el) el.textContent = value == null || value === "" ? "—" : String(value); }
  function status(el, message, type) { if (!el) return; el.textContent = message || ""; el.classList.remove("is-ok", "is-error"); if (type) el.classList.add(type === "ok" ? "is-ok" : "is-error"); }
  function clean(value) { return String(value || "").trim().replace(/\s+/g, " "); }
  function validPhone(value) { return PHONE_PATTERN.test(clean(value)); }
  function normalizePhone(value) { return validPhone(value) ? clean(value).replace(/\D/g, "") : ""; }
  function validName(value) { return NAME_PATTERN.test(clean(value)); }
  function validDevice(value) { return DEVICE_PATTERN.test(clean(value)); }
  function validText(value) { return SAFE_TEXT_PATTERN.test(clean(value || "")); }
  function storageGet(key) { try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch (_) { return null; } }
  function storageSet(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {} }
  function storageRemove(key) { try { localStorage.removeItem(key); } catch (_) {} }
  function formatDate(value) { var d = value ? new Date(value) : null; if (!d || Number.isNaN(d.getTime())) return "—"; return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  function formatDateOnly(value) { var d = value ? new Date(value + "T00:00:00") : null; if (!d || Number.isNaN(d.getTime())) return value || "—"; return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "long", weekday: "short" }); }
  function pad2(v) { return String(v).padStart(2, "0"); }
  function nowLocalValue() { var d = new Date(); d.setSeconds(0, 0); return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) + "T" + pad2(d.getHours()) + ":" + pad2(d.getMinutes()); }
  function isPast(value) { if (!value) return false; var d = new Date(value); return !Number.isNaN(d.getTime()) && d < new Date(nowLocalValue()); }
  function localToISO(value) { if (!value) return null; var d = new Date(value); return Number.isNaN(d.getTime()) ? value : d.toISOString(); }
  function findOption(id) { return REPAIR_OPTIONS.find(function (x) { return x.id === id; }) || null; }
  function repairTitle(id) { var x = findOption(id); return x ? x.title : "—"; }
  function repairPrice(id) { var x = findOption(id); return x ? "от " + Number(x.priceFrom).toLocaleString("ru-RU") + " ₽" : "—"; }

  async function api(path, options) {
    var response = await fetch(API + path, Object.assign({ headers: { "Content-Type": "application/json" } }, options || {}));
    var data = null;
    try { data = await response.json(); } catch (_) {}
    if (!response.ok) {
      var detail = data && data.detail ? data.detail : "Ошибка сервера";
      if (Array.isArray(detail)) detail = detail.map(function (x) { return x.msg || "Ошибка валидации"; }).join("; ");
      throw new Error(detail);
    }
    return data;
  }

  function setTheme(theme) { document.documentElement.setAttribute("data-theme", theme); try { localStorage.setItem(THEME_KEY, theme); } catch (_) {} }
  function initTheme() {
    var saved = null; try { saved = localStorage.getItem(THEME_KEY); } catch (_) {}
    setTheme(saved === "dark" || saved === "light" ? saved : "light");
    var btn = $("theme-toggle");
    if (!btn) return;
    function label() { var dark = document.documentElement.getAttribute("data-theme") === "dark"; btn.textContent = dark ? "☀" : "☾"; }
    label(); btn.addEventListener("click", function () { setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"); label(); });
  }

  function currentNav() {
    var cur = location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll(".nav a").forEach(function (a) { if (a.getAttribute("href") === cur) a.setAttribute("aria-current", "page"); });
    document.querySelectorAll("[data-master-link]").forEach(function (a) { a.hidden = !storageGet(MASTER_PROFILE_KEY) && cur !== "master.html"; });
  }

  async function loadOptions() {
    try { REPAIR_OPTIONS = await api("/repair-options"); } catch (_) {}
    document.querySelectorAll("select").forEach(function (select) {
      if (!select.id || ["calc-service", "client-repair-type"].indexOf(select.id) === -1) return;
      var value = select.value; select.replaceChildren();
      var ph = document.createElement("option"); ph.value = ""; ph.textContent = "Выберите услугу"; select.appendChild(ph);
      REPAIR_OPTIONS.forEach(function (opt) { var o = document.createElement("option"); o.value = opt.id; o.textContent = opt.title + " — от " + Number(opt.priceFrom).toLocaleString("ru-RU") + " ₽"; select.appendChild(o); });
      if (value) select.value = value;
    });
  }

  function requestStatus(s) { return s === "open" ? "Свободна" : s === "in_progress" ? "В работе" : s === "done" ? "Готова" : s; }
  function makeMeta(label, value) { var d = document.createElement("div"); d.className = "request-meta__item"; var l = document.createElement("span"); l.className = "request-meta__label"; l.textContent = label; var v = document.createElement("strong"); v.className = "request-meta__value"; v.textContent = value || "—"; d.append(l, v); return d; }
  function messageAuthor(msg, context) { if (context === "client") return msg.from === "client" ? "Вы" : "Сервис"; return msg.from === "master" ? "Вы" : "Клиент: " + msg.author; }
  function thread(req, context) { var msgs = Array.isArray(req.messages) ? req.messages : []; if (!msgs.length) return null; var box = document.createElement("div"); box.className = "message-thread"; var t = document.createElement("strong"); t.className = "message-thread__title"; t.textContent = "Переписка"; box.appendChild(t); msgs.forEach(function (m) { var item = document.createElement("div"); item.className = "thread-message thread-message--" + (m.from === "master" ? "master" : "client"); item.innerHTML = ""; var a = document.createElement("span"); a.className = "thread-message__author"; a.textContent = messageAuthor(m, context); var p = document.createElement("p"); p.textContent = m.text; var time = document.createElement("time"); time.className = "thread-message__time"; time.textContent = formatDate(m.createdAt); item.append(a, p, time); box.appendChild(item); }); return box; }
  function replyBox(req, role) { var box = document.createElement("div"); box.className = "reply-box"; var ta = document.createElement("textarea"); ta.maxLength = 1000; ta.rows = 3; ta.placeholder = role === "master" ? "Сообщение клиенту..." : "Ответ мастеру..."; ta.dataset.replyText = role; var actions = document.createElement("div"); actions.className = "request-actions"; var send = document.createElement("button"); send.type = "button"; send.dataset.requestAction = role === "master" ? "master-reply" : "client-reply"; send.dataset.requestId = req.id; send.textContent = "Отправить"; actions.appendChild(send); if (role === "master") { var done = document.createElement("button"); done.type = "button"; done.className = "button button--ghost"; done.dataset.requestAction = "done"; done.dataset.requestId = req.id; done.textContent = "Готово"; actions.appendChild(done); } box.append(ta, actions); return box; }
  function card(req, context) { var c = document.createElement("article"); c.className = "request-card"; c.dataset.requestId = req.id; var top = document.createElement("div"); top.className = "request-card__top"; var title = document.createElement("div"); var small = document.createElement("p"); small.className = "eyebrow"; small.textContent = "REQ-" + req.id; var h = document.createElement("h3"); h.textContent = req.device; title.append(small, h); var st = document.createElement("span"); st.className = "status-pill status-pill--" + req.status; st.textContent = requestStatus(req.status); top.append(title, st); c.appendChild(top); var meta = document.createElement("div"); meta.className = "request-meta"; meta.append(makeMeta("Клиент", req.clientName), makeMeta("Телефон", req.phone), makeMeta("Услуга", req.repairTitle), makeMeta("Цена", req.priceText), makeMeta("Дата", formatDate(req.preferredTime)), makeMeta("Создана", formatDate(req.createdAt))); if (context !== "client" && req.assigneeName) meta.appendChild(makeMeta("Мастер", req.assigneeName)); c.appendChild(meta); if (req.problem) { var prob = document.createElement("p"); prob.className = "request-comment"; prob.textContent = req.problem; c.appendChild(prob); } var th = thread(req, context === "client" ? "client" : "master"); if (th) c.appendChild(th); if (context === "client" && req.status === "in_progress") c.appendChild(replyBox(req, "client")); if (context === "master-open") { var a = document.createElement("div"); a.className = "request-actions"; var b = document.createElement("button"); b.type = "button"; b.dataset.requestAction = "accept"; b.dataset.requestId = req.id; b.textContent = "Взять в работу"; a.appendChild(b); c.appendChild(a); } if (context === "master-mine") c.appendChild(replyBox(req, "master")); return c; }
  function empty(el, msg) { if (!el) return; el.replaceChildren(); var div = document.createElement("div"); div.className = "empty-state"; var b = document.createElement("strong"); b.textContent = "Пока пусто"; var p = document.createElement("p"); p.textContent = msg; div.append(b, p); el.appendChild(div); }

  async function initCalculator() {
    var select = $("calc-service"); if (!select) return;
    var cal = $("price-calendar"); var refresh = $("calendar-refresh"); var resultPrice = $("calc-result-price"); var resultService = $("calc-result-service"); var resultDate = $("calc-result-date"); var resultReason = $("calc-result-reason");
    async function render() {
      var serviceId = select.value;
      cal.replaceChildren(); text(resultPrice, "—"); text(resultService, repairTitle(serviceId)); text(resultDate, "—"); text(resultReason, "—");
      if (!serviceId) return empty(cal, "Выберите услугу, чтобы увидеть календарь цен.");
      try {
        var days = await api("/calculator/prices?serviceId=" + encodeURIComponent(serviceId) + "&days=21");
        cal.replaceChildren();
        days.forEach(function (d, i) { var btn = document.createElement("button"); btn.type = "button"; btn.className = "price-day"; btn.innerHTML = ""; var date = document.createElement("span"); date.className = "price-day__date"; date.textContent = formatDateOnly(d.date); var price = document.createElement("span"); price.className = "price-day__price"; price.textContent = d.priceText; var reason = document.createElement("span"); reason.className = "price-day__reason"; reason.textContent = d.reason; btn.append(date, price, reason); btn.addEventListener("click", function () { document.querySelectorAll(".price-day").forEach(function (x) { x.classList.remove("is-selected"); }); btn.classList.add("is-selected"); text(resultPrice, d.priceText); text(resultService, repairTitle(serviceId)); text(resultDate, formatDateOnly(d.date)); text(resultReason, d.reason); }); cal.appendChild(btn); if (i === 0) btn.click(); });
      } catch (e) { empty(cal, e.message); }
    }
    select.addEventListener("change", render); if (refresh) refresh.addEventListener("click", render); render();
  }

  function clientProfile() { return storageGet(CLIENT_PROFILE_KEY); }
  function masterProfile() { return storageGet(MASTER_PROFILE_KEY); }
  function setMinDate(el) { if (el) el.min = nowLocalValue(); }
  function readClientForm() { return { clientName: clean($("client-name").value), phone: clean($("client-phone").value), device: clean($("client-device").value), repairId: $("client-repair-type").value, preferredTime: $("client-time").value, comment: clean($("client-comment").value) }; }
  function validateClient(data) { if (!validName(data.clientName)) return "Имя: только буквы, пробел или дефис, 2–80 символов."; if (!validPhone(data.phone)) return "Телефон в формате +7 900 000-00-00."; if (!validDevice(data.device)) return "Проверьте название устройства."; if (!data.repairId) return "Выберите услугу."; if (!data.preferredTime || isPast(data.preferredTime)) return "Выберите дату и время не раньше текущего момента."; if (!validText(data.comment)) return "Комментарий не должен содержать < > { } или обратный слеш."; return ""; }
  async function saveClientProfile(name, phone) { var p = await api("/client/profile", { method: "POST", body: JSON.stringify({ name: name, phone: phone }) }); storageSet(CLIENT_PROFILE_KEY, p); return p; }
  function fillClientProfile() { var p = clientProfile(); text($("client-profile-current"), p ? p.name + " · " + p.phone : "Профиль не выбран"); if (p) { if ($("profile-client-name")) $("profile-client-name").value = p.name; if ($("profile-client-phone")) $("profile-client-phone").value = p.phone; if ($("client-name")) $("client-name").value = p.name; if ($("client-phone")) $("client-phone").value = p.phone; } }
  async function renderClientRequests() { var list = $("client-request-list"); if (!list) return; var p = clientProfile(); if (!p) return empty(list, "Сначала сохраните профиль клиента."); try { var data = await api("/requests/client?phone=" + encodeURIComponent(p.phone)); if (!data.length) return empty(list, "Заявок пока нет."); list.replaceChildren(); data.forEach(function (r) { list.appendChild(card(r, "client")); }); } catch (e) { empty(list, e.message); } }
  async function initClient() {
    if (!$("client-profile-form")) return;
    setMinDate($("client-time")); fillClientProfile(); renderClientRequests();
    var draft = storageGet(CLIENT_DRAFT_KEY);
    if (draft) {
      if (draft.clientName && $("client-name")) $("client-name").value = draft.clientName;
      if (draft.phone && $("client-phone")) $("client-phone").value = draft.phone;
      if (draft.device && $("client-device")) $("client-device").value = draft.device;
      if (draft.repairId && $("client-repair-type")) $("client-repair-type").value = draft.repairId;
      if (draft.preferredTime && $("client-time")) $("client-time").value = draft.preferredTime;
      if (draft.comment && $("client-comment")) $("client-comment").value = draft.comment;
    }
    $("client-profile-form").addEventListener("submit", async function (ev) { ev.preventDefault(); var name = clean($("profile-client-name").value); var phone = clean($("profile-client-phone").value); if (!validName(name)) return status($("client-profile-status"), "Некорректное имя.", "error"); if (!validPhone(phone)) return status($("client-profile-status"), "Телефон в формате +7 900 000-00-00.", "error"); try { await saveClientProfile(name, phone); fillClientProfile(); renderClientRequests(); status($("client-profile-status"), "Профиль сохранён.", "ok"); } catch (e) { status($("client-profile-status"), e.message, "error"); } });
    $("client-profile-reset").addEventListener("click", function () { storageRemove(CLIENT_PROFILE_KEY); fillClientProfile(); renderClientRequests(); status($("client-profile-status"), "Профиль очищен.", "ok"); });
    $("client-request-form").addEventListener("input", function () { storageSet(CLIENT_DRAFT_KEY, readClientForm()); });
    $("client-request-form").addEventListener("change", function () { setMinDate($("client-time")); storageSet(CLIENT_DRAFT_KEY, readClientForm()); });
    $("client-request-form").addEventListener("submit", async function (ev) { ev.preventDefault(); setMinDate($("client-time")); var data = readClientForm(); var error = validateClient(data); if (error) return status($("client-status"), error, "error"); try { var p = clientProfile(); if (!p || normalizePhone(p.phone) !== normalizePhone(data.phone)) { p = await saveClientProfile(data.clientName, data.phone); fillClientProfile(); } await api("/requests", { method: "POST", body: JSON.stringify(Object.assign({}, data, { preferredTime: localToISO(data.preferredTime) })) }); storageRemove(CLIENT_DRAFT_KEY); $("client-request-form").reset(); fillClientProfile(); setMinDate($("client-time")); renderClientRequests(); status($("client-status"), "Заявка отправлена.", "ok"); } catch (e) { status($("client-status"), e.message, "error"); } });
    $("client-form-clear").addEventListener("click", function () { $("client-request-form").reset(); fillClientProfile(); setMinDate($("client-time")); storageRemove(CLIENT_DRAFT_KEY); status($("client-status"), "Форма очищена.", "ok"); });
    $("client-refresh").addEventListener("click", renderClientRequests);
    $("client-request-list").addEventListener("click", async function (ev) { var t = ev.target; if (!(t instanceof HTMLElement) || t.dataset.requestAction !== "client-reply") return; var box = t.closest(".request-card"); var ta = box ? box.querySelector('textarea[data-reply-text="client"]') : null; var msg = clean(ta ? ta.value : ""); var p = clientProfile(); if (!validText(msg) || !msg) return status($("client-status"), "Введите корректное сообщение без HTML-символов.", "error"); try { await api("/requests/" + t.dataset.requestId + "/messages", { method: "POST", body: JSON.stringify({ senderRole: "client", author: p.name, phone: p.phone, text: msg }) }); renderClientRequests(); status($("client-status"), "Сообщение отправлено.", "ok"); } catch (e) { status($("client-status"), e.message, "error"); } });
  }

  async function renderMaster() { var open = $("master-open-list"); var mine = $("master-my-list"); if (!open || !mine) return; var p = masterProfile(); if (!p) return; try { var openData = await api("/requests/open"); var mineData = await api("/requests/master?masterId=" + encodeURIComponent(p.id)); open.replaceChildren(); mine.replaceChildren(); if (!openData.length) empty(open, "Свободных заявок нет."); else openData.forEach(function (r) { open.appendChild(card(r, "master-open")); }); if (!mineData.length) empty(mine, "У вас пока нет заявок в работе."); else mineData.forEach(function (r) { mine.appendChild(card(r, "master-mine")); }); } catch (e) { empty(open, e.message); empty(mine, e.message); } }
  async function initMaster() { if (!$("master-login-form")) return; var auth = $("master-auth-card"); var work = $("master-workspace"); async function refresh() { var p = masterProfile(); auth.hidden = !!p; work.hidden = !p; if (p) { text($("master-current-profile"), "Мастер: " + p.name); await renderMaster(); } } await refresh(); $("master-login-form").addEventListener("submit", async function (ev) { ev.preventDefault(); var name = clean($("master-login-name").value); var code = clean($("master-login-code").value); if (!validName(name)) return status($("master-login-status"), "Некорректное имя мастера.", "error"); if (!/^[A-Za-z0-9_-]{4,20}$/.test(code)) return status($("master-login-status"), "Некорректный код.", "error"); try { var p = await api("/master/login", { method: "POST", body: JSON.stringify({ name: name, code: code }) }); storageSet(MASTER_PROFILE_KEY, p); currentNav(); status($("master-login-status"), "", "ok"); await refresh(); } catch (e) { status($("master-login-status"), e.message, "error"); } }); $("master-logout").addEventListener("click", async function () { storageRemove(MASTER_PROFILE_KEY); currentNav(); await refresh(); }); $("master-workspace").addEventListener("click", async function (ev) { var t = ev.target; if (!(t instanceof HTMLElement) || !t.dataset.requestAction) return; var p = masterProfile(); try { if (t.dataset.requestAction === "accept") { await api("/requests/" + t.dataset.requestId + "/accept", { method: "POST", body: JSON.stringify({ masterId: p.id, masterName: p.name }) }); status($("master-status"), "Заявка взята в работу.", "ok"); } if (t.dataset.requestAction === "master-reply") { var box = t.closest(".request-card"); var ta = box ? box.querySelector('textarea[data-reply-text="master"]') : null; var msg = clean(ta ? ta.value : ""); if (!msg || !validText(msg)) throw new Error("Введите корректное сообщение без HTML-символов."); await api("/requests/" + t.dataset.requestId + "/messages", { method: "POST", body: JSON.stringify({ senderRole: "master", author: p.name, masterId: p.id, text: msg }) }); status($("master-status"), "Сообщение отправлено.", "ok"); }
        if (t.dataset.requestAction === "done") { await api("/requests/" + t.dataset.requestId + "/done", { method: "POST", body: JSON.stringify({ masterId: p.id }) }); status($("master-status"), "Заявка завершена.", "ok"); } await renderMaster(); } catch (e) { status($("master-status"), e.message, "error"); await renderMaster(); } }); }

  document.addEventListener("DOMContentLoaded", async function () { initTheme(); currentNav(); await loadOptions(); await initCalculator(); await initClient(); await initMaster(); });
})();
