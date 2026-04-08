/*
  BrainDev — "segundo cérebro" local (LocalStorage)
  -------------------------------------------------
  Stack: HTML + CSS + JS (vanilla) + LocalStorage
*/

(() => {
  "use strict";

  const STORAGE_PREFIX = "braindev:v3";
  const SESSION_KEY = "braindev:session";
  const SESSION_EMAIL_KEY = "braindev:session:email";
  const LEGACY_STORAGE_KEY = "braindev:v1";

  // -------------------------
  // Credenciais fixas de acesso
  // -------------------------
  const CREDENTIALS = {
    "joaorobertofilho77@gmail.com":    { userId: "joao",    password: "janjao2015" },
    "eduarda@email.com": { userId: "eduarda", password: "123456" },
  };

  const USERS = {
    joao: {
      id: "joao",
      name: "João",
      welcome: "Bem-vindo, João",
      allowedSections: ["prompts", "clients", "income", "programs", "tools", "projects", "ideas", "vault"],
    },
    eduarda: {
      id: "eduarda",
      name: "Eduarda",
      welcome: "Bem-vinda, Eduarda",
      allowedSections: ["clients", "income", "passwords", "projects", "ideas"],
    },
  };

  let activeUserId = "";
  let activeUserEmail = "";
  let storageKey = "";
  /** @type {Array<{id:string,label:string,icon:string,desc:string}>} */
  let sections = [];
  let dashboardEventsBound = false;
  let cloudState = createCloudState();
  const LOCAL_MODAL_ACTIONS = new Set([
    "clientTab",
    "addClientSocialOther",
    "editClientSocialOther",
    "copyClientSocialPass",
    "copyClientOtherPass",
    "deleteClientSocialOther",
    "editIncomeDirect",
    "deleteIncomeDirect",
  ]);

  /** @type {ReturnType<typeof normalizeDB>} */
  let db = normalizeDB(defaultDB());

  const uiState = {
    section: "prompts",
    filters: {
      tag: "",
      promptFolder: "",
      incomeMonth: "",
      projectStatus: "",
      siteStatus: "",
      toolCategory: "",
      ideaCategory: "",
    },
    mobileSidebarOpen: false,
    revealMap: new Map(),
    authUntil: 0,
    afterClientSaveSection: "",
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const el = {
    html: document.documentElement,
    body: document.body,
    loginRoot: $("#loginRoot"),
    loginForm: $("#loginForm"),
    loginError: $("#loginError"),
    loginSubmit: $("#loginSubmit"),
    syncStatus: $("#syncStatus"),
    userPill: $("#userPill"),
    logoutBtn: $("#logoutBtn"),
    nav: $("#nav"),
    main: $("#main"),
    sidebar: $("#sidebar"),
    sidebarToggle: $("#sidebarToggle"),
    mobileMenuBtn: $("#mobileMenuBtn"),
    goHome: $("#goHome"),
    themeToggle: $("#themeToggle"),
    quickAddBtn: $("#quickAddBtn"),
    modalRoot: $("#modalRoot"),
    toastRoot: $("#toastRoot"),
    exportBtn: $("#exportBtn"),
    importFile: $("#importFile"),
    globalSearch: $("#globalSearch"),
    searchResults: $("#searchResults"),
    searchBox: $("#searchBox"),
  };

  boot();

  function boot() {
    bindLoginEvents();
    updateSyncStatus("Modo local", "local");
    showLogin();
  }

  function storageKeyForUser(userId) {
    return `${STORAGE_PREFIX}:${String(userId || "").toLowerCase()}`;
  }

  function buildSectionsForUser(userId) {
    const u = USERS[userId] || USERS.joao;
    const isEdu = u.id === "eduarda";

    const all = [
      { id: "prompts", label: "Prompt de IA", icon: "✨", desc: "Biblioteca de prompts (ver e copiar)." },
      {
        id: "clients",
        label: isEdu ? "Aulas (Clientes)" : "Clientes",
        icon: "👥",
        desc: isEdu ? "Aulas Particulares — cadastro de alunos." : "Cadastro de clientes + redes sociais (opcional).",
      },
      {
        id: "income",
        label: "Renda",
        icon: "💰",
        desc: "Renda automática com base nos clientes ativos (sem inserção manual).",
      },
      { id: "programs", label: "Programas", icon: "🧩", desc: "Softwares utilizados no trabalho." },
      { id: "tools", label: "Ferramentas", icon: "🧰", desc: "Ferramentas online úteis com link." },
      { id: "projects", label: "Projetos", icon: "📁", desc: "Projetos/trabalhos relacionados." },
      { id: "ideas", label: "Ideias", icon: "💡", desc: "Ideias de negócios, sistemas ou melhorias." },
      { id: "vault", label: "Senhas de Acesso", icon: "🔐", desc: "Gerenciador de senhas (autenticação ao revelar)." },
      { id: "passwords", label: "Senhas", icon: "🔑", desc: "Salve senhas de serviços pessoais." },
    ];

    return all.filter((s) => u.allowedSections.includes(s.id));
  }

  function showLogin() {
    activeUserId = "";
    activeUserEmail = "";
    storageKey = "";
    sections = [];

    uiState.section = "prompts";
    uiState.filters.tag = "";
    uiState.filters.promptFolder = "";
    uiState.filters.incomeMonth = "";
    uiState.filters.projectStatus = "";
    uiState.filters.toolCategory = "";
    uiState.filters.ideaCategory = "";
    uiState.revealMap.clear();
    uiState.authUntil = 0;

    teardownCloudSync({ signOutUser: true });
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_EMAIL_KEY);

    el.nav.innerHTML = "";
    el.main.innerHTML = "";
    updateSyncStatus("Modo local", "local");
    el.userPill.hidden = true;
    el.logoutBtn.hidden = true;
    el.body.dataset.view = "login";
    closeModal();

    // Limpa os campos do formulário ao voltar para o login
    if (el.loginForm) {
      el.loginForm.reset();
    }
    if (el.loginError) {
      el.loginError.hidden = true;
    }
    setLoginPending(false);
  }

  async function startSession(userId, options = {}) {
    const u = USERS[userId];
    if (!u) return toast("Usuário inválido", "danger");

    activeUserId = u.id;
    activeUserEmail = String(options.email || "").trim().toLowerCase();
    storageKey = storageKeyForUser(activeUserId);
    db = loadDBForUser(activeUserId);
    sections = buildSectionsForUser(activeUserId);

    applyTheme(db.settings?.theme || "light");

    if (!dashboardEventsBound) {
      bindGlobalEvents();
      dashboardEventsBound = true;
    }

    el.userPill.textContent = u.name;
    el.userPill.hidden = false;
    el.logoutBtn.hidden = false;
    el.body.dataset.view = "app";

    localStorage.setItem(SESSION_KEY, activeUserId);
    if (activeUserEmail) {
      localStorage.setItem(SESSION_EMAIL_KEY, activeUserEmail);
    }

    renderNav();
    navigate(db.settings?.lastSection || sections[0]?.id || "prompts");
    toast(u.welcome, "success");

    if (!options.skipCloud) {
      connectCloudSync({
        email: activeUserEmail,
        authUser: options.authUser || null,
      }).catch((err) => {
        console.warn("Falha ao conectar com o Firebase", err);
        updateSyncStatus("Modo local", "warning");
      });
    } else {
      updateSyncStatus("Modo local", "local");
    }
  }

  function bindLoginEvents() {
    el.loginForm?.addEventListener("submit", async (e) => {
      e.preventDefault();

      const fd = new FormData(el.loginForm);
      const email    = String(fd.get("email")    || "").trim().toLowerCase();
      const password = String(fd.get("password") || "");

      // Esconde erro anterior
      if (el.loginError) el.loginError.hidden = true;
      setLoginPending(true);

      try {
        const match = CREDENTIALS[email];

        if (!match) {
          if (el.loginError) {
            el.loginError.hidden = false;
          } else {
            toast("Email ou senha incorretos.", "danger");
          }
          return;
        }

        let authUser = null;

        if (isFirebaseConfigured()) {
          try {
            authUser = await signInFirebaseUser(email, password);
          } catch (err) {
            console.warn("Falha no login do Firebase, usando fallback local.", err);
            if (match.password !== password) {
              if (el.loginError) {
                el.loginError.hidden = false;
              } else {
                toast("Email ou senha incorretos.", "danger");
              }
              return;
            }

            toast("Firebase indisponivel agora. Entrando em modo local.", "warning");
          }
        } else if (match.password !== password) {
          if (el.loginError) {
            el.loginError.hidden = false;
          } else {
            toast("Email ou senha incorretos.", "danger");
          }
          return;
        }

        await startSession(match.userId, { email, authUser, skipCloud: !authUser });
      } finally {
        setLoginPending(false);
      }
    });
  }

  function bindGlobalEvents() {
    el.sidebarToggle?.addEventListener("click", () => toggleMobileSidebar());
    el.mobileMenuBtn?.addEventListener("click", () => toggleMobileSidebar(true));

    el.goHome?.addEventListener("click", () => navigate("prompts"));
    el.goHome?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") navigate("prompts");
    });

    el.themeToggle.addEventListener("click", () => {
      db.settings.theme = db.settings.theme === "dark" ? "light" : "dark";
      saveDB();
      applyTheme(db.settings.theme);
      toast(db.settings.theme === "dark" ? "Modo escuro ativado" : "Modo claro ativado", "success");
    });

    el.quickAddBtn.addEventListener("click", () => openQuickAdd());

    el.nav.addEventListener("click", (e) => {
      const navBtn = e.target.closest("[data-section]:not([data-action])");
      if (!navBtn || !el.nav.contains(navBtn)) return;
      e.preventDefault();
      try {
        navigate(navBtn.dataset.section);
      } catch (err) {
        handleUiError("abrir a secao", err);
      }
    });

    const routeActionClick = (e, root) => {
      const actionEl = e.target.closest("[data-action]");
      if (!actionEl || !root.contains(actionEl)) return;

      const action = String(actionEl.dataset.action || "").trim();
      if (!action || LOCAL_MODAL_ACTIONS.has(action)) return;

      e.preventDefault();

      try {
        handleAction({
          action,
          id: actionEl.dataset.id || "",
          section: actionEl.dataset.section || uiState.section,
          target: actionEl,
        });
      } catch (err) {
        handleUiError(`executar a acao "${action}"`, err);
      }
    };

    el.main.addEventListener("click", (e) => routeActionClick(e, el.main));
    el.modalRoot.addEventListener("click", (e) => routeActionClick(e, el.modalRoot));
    el.searchResults.addEventListener("click", (e) => routeActionClick(e, el.searchResults));

    el.main.addEventListener("change", (e) => {
      const select = e.target.closest("[data-filter]");
      if (!select) return;
      uiState.filters[select.dataset.filter] = select.value;
      renderSection();
    });

    el.modalRoot.addEventListener("submit", (e) => {
      if (e.defaultPrevented) return;
      const form = e.target.closest("form");
      if (!form) return;
      e.preventDefault();
      toast(`Formulario sem acao configurada: ${form.id || "sem-id"}`, "danger");
    });

    // Busca global
    el.globalSearch.addEventListener("input", () => {
      const q = el.globalSearch.value.trim();
      if (!q) {
        el.searchResults.hidden = true;
        el.searchResults.innerHTML = "";
        return;
      }
      renderSearchDropdown(globalSearch(q, 8));
    });

    el.globalSearch.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        el.searchResults.hidden = true;
        el.searchResults.innerHTML = "";
        el.globalSearch.blur();
      }
    });

    document.addEventListener("click", (e) => {
      if (!el.searchBox.contains(e.target)) el.searchResults.hidden = true;
      if (uiState.mobileSidebarOpen && !el.sidebar.contains(e.target) && !el.mobileMenuBtn.contains(e.target)) {
        toggleMobileSidebar(false);
      }
    });

    el.exportBtn.addEventListener("click", () => exportJSON());
    el.importFile.addEventListener("change", async () => {
      const file = el.importFile.files?.[0];
      if (!file) return;
      try {
        db = normalizeDB(JSON.parse(await file.text()));
        saveDB();
        applyTheme(db.settings.theme);
        toast("Backup importado com sucesso", "success");
        navigate(db.settings.lastSection || uiState.section);
      } catch {
        toast("Falha ao importar JSON", "danger");
      } finally {
        el.importFile.value = "";
      }
    });

    el.logoutBtn.addEventListener("click", () => showLogin());
  }

  function toggleMobileSidebar(force) {
    const next = typeof force === "boolean" ? force : !uiState.mobileSidebarOpen;
    uiState.mobileSidebarOpen = next;
    el.sidebar.classList.toggle("is-open", next);
  }

  function handleUiError(context, err) {
    console.error(`Falha ao ${context}`, err);
    toast(`Falha ao ${context}.`, "danger");
  }

  function bindActionButtons(root, options = {}) {
    if (!root) return;

    const skipLocalActions = Boolean(options.skipLocalActions);
    $$("[data-action]", root).forEach((node) => {
      if (node.dataset.actionBound === "1") return;
      node.dataset.actionBound = "1";

      node.addEventListener("click", (e) => {
        const action = String(node.dataset.action || "").trim();
        if (!action) return;
        if (skipLocalActions && LOCAL_MODAL_ACTIONS.has(action)) return;

        e.preventDefault();
        e.stopPropagation();

        try {
          handleAction({
            action,
            id: node.dataset.id || "",
            section: node.dataset.section || uiState.section,
            target: node,
          });
        } catch (err) {
          handleUiError(`executar a acao "${action}"`, err);
        }
      });
    });
  }

  function applyTheme(theme) {
    el.html.dataset.theme = theme === "dark" ? "dark" : "light";
  }

  function navigate(sectionId) {
    const mapped = sectionId === "sites" ? "programs" : sectionId;
    uiState.section = getSections().some((s) => s.id === mapped) ? mapped : "prompts";
    db.settings.lastSection = uiState.section;
    saveDB();
    syncNavCurrent();
    renderSection();
    el.main.focus();
    toggleMobileSidebar(false);
  }

  function renderNav() {
    el.nav.innerHTML = getSections().map((s) => {
      return `
        <button class="nav__item" type="button" data-section="${escapeAttr(s.id)}" aria-current="false">
          <span class="nav__left">
            <span class="nav__icon" aria-hidden="true">${s.icon}</span>
            <span class="nav__label">${escapeHTML(s.label)}</span>
          </span>
          <span class="nav__badge" title="Itens">${sectionCount(s.id)}</span>
        </button>
      `;
    }).join("");
    syncNavCurrent();
  }

  function syncNavCurrent() {
    $$(".nav__item", el.nav).forEach((btn) => {
      btn.setAttribute("aria-current", btn.dataset.section === uiState.section ? "page" : "false");
    });
  }

  function renderSection() {
    ensureFinanceCurrentMonth();
    const availableSections = getSections();
    if (availableSections.length === 0) {
      el.main.innerHTML = emptyState("Nenhuma secao disponivel.", "Faca login novamente para carregar o painel.");
      return;
    }

    const section = availableSections.find((s) => s.id === uiState.section) || availableSections[0];
    el.main.innerHTML = `
      <div class="section">
        ${renderSectionHead(section)}
        ${renderSectionBody(section.id)}
      </div>
    `;
    bindActionButtons(el.main);
    renderNav();
  }

  function renderSectionHead(section) {
    return `
      <div class="section__head">
        <div class="section__title">
          <h1>${escapeHTML(section.label)}</h1>
          <p>${escapeHTML(section.desc)}</p>
        </div>
        <div class="section__actions">
          ${section.id === "income" ? "" : renderSectionFilters(section.id)}
          ${renderSectionActions(section.id)}
        </div>
      </div>
    `;
  }

  function renderSectionActions(sectionId) {
    const isEduSection = activeUserId === "eduarda";
    if (sectionId === "income") {
      return `
        <button class="btn btn--primary" type="button" data-action="incomeAddClient">
          ➕ Cliente
        </button>
      `;
    }
    const labels = {
      prompts: "➕ Adicionar Prompt",
      clients: isEduSection ? "➕ Adicionar Aluno" : "➕ Adicionar Cliente",
      income: "➕ Cliente",
      programs: "➕ Adicionar Programa",
      projects: "➕ Adicionar Projeto",
      tools: "➕ Adicionar Ferramenta",
      ideas: "➕ Adicionar Ideia",
      vault: "➕ Adicionar Senha",
      passwords: "➕ Adicionar Senha",
    };
    return `
      <button class="btn btn--primary" type="button" data-action="add" data-section="${escapeAttr(sectionId)}">
        ${labels[sectionId] || "➕ Adicionar"}
      </button>
    `;
  }

  function renderSectionFilters(sectionId) {
    const tags = collectTagsForSection(sectionId);
    if (uiState.filters.tag && !tags.includes(uiState.filters.tag)) uiState.filters.tag = "";

    const tagSelect = `
      <select class="select" data-filter="tag" aria-label="Filtrar por tag">
        <option value="">Todas as tags</option>
        ${tags
          .map(
            (t) => `<option value="${escapeAttr(t)}" ${t === uiState.filters.tag ? "selected" : ""}>#${escapeHTML(t)}</option>`,
          )
          .join("")}
      </select>
    `;

    if (sectionId === "prompts") {
      const folders = db.prompts.folders;
      if (uiState.filters.promptFolder && !folders.includes(uiState.filters.promptFolder)) uiState.filters.promptFolder = "";
      const folderSelect = `
        <select class="select" data-filter="promptFolder" aria-label="Filtrar por pasta">
          <option value="">Todas as pastas</option>
          ${folders
            .map(
              (f) =>
                `<option value="${escapeAttr(f)}" ${f === uiState.filters.promptFolder ? "selected" : ""}>${escapeHTML(f)}</option>`,
            )
            .join("")}
        </select>
      `;
      return `<div class="filters">${folderSelect}${tagSelect}</div>`;
    }

    if (sectionId === "income") {
      const months = uniqueStrings(db.income.map((i) => String(i.paidAt || "").slice(0, 7)))
        .filter((m) => /^\d{4}-\d{2}$/.test(m))
        .sort((a, b) => b.localeCompare(a));
      if (uiState.filters.incomeMonth && !months.includes(uiState.filters.incomeMonth)) uiState.filters.incomeMonth = "";

      const monthSelect = `
        <select class="select" data-filter="incomeMonth" aria-label="Filtrar por mês">
          <option value="">Todos os meses</option>
          ${months
            .map(
              (m) =>
                `<option value="${escapeAttr(m)}" ${m === uiState.filters.incomeMonth ? "selected" : ""}>${escapeHTML(
                  formatMonthKey(m),
                )}</option>`,
            )
            .join("")}
        </select>
      `;

      return `<div class="filters">${monthSelect}${tagSelect}</div>`;
    }

    if (sectionId === "projects") {
      const opts = ["Em andamento", "Concluído"];
      if (uiState.filters.projectStatus && !opts.includes(uiState.filters.projectStatus)) uiState.filters.projectStatus = "";
      const status = `
        <select class="select" data-filter="projectStatus" aria-label="Filtrar por status">
          <option value="">Todos os status</option>
          ${opts
            .map(
              (s) =>
                `<option value="${escapeAttr(s)}" ${s === uiState.filters.projectStatus ? "selected" : ""}>${escapeHTML(s)}</option>`,
            )
            .join("")}
        </select>
      `;
      return `<div class="filters">${status}${tagSelect}</div>`;
    }

    if (sectionId === "tools") {
      const categories = uniqueStrings(db.tools.map((t) => t.category)).filter(Boolean);
      if (uiState.filters.toolCategory && !categories.includes(uiState.filters.toolCategory)) uiState.filters.toolCategory = "";
      const catSelect = `
        <select class="select" data-filter="toolCategory" aria-label="Filtrar por categoria">
          <option value="">Todas as categorias</option>
          ${categories
            .map(
              (c) =>
                `<option value="${escapeAttr(c)}" ${c === uiState.filters.toolCategory ? "selected" : ""}>${escapeHTML(c)}</option>`,
            )
            .join("")}
        </select>
      `;
      return `<div class="filters">${catSelect}${tagSelect}</div>`;
    }

    if (sectionId === "ideas") {
      const categories = uniqueStrings(db.ideas.map((i) => i.category)).filter(Boolean);
      if (uiState.filters.ideaCategory && !categories.includes(uiState.filters.ideaCategory)) uiState.filters.ideaCategory = "";
      const catSelect = `
        <select class="select" data-filter="ideaCategory" aria-label="Filtrar por categoria">
          <option value="">Todas as categorias</option>
          ${categories
            .map(
              (c) =>
                `<option value="${escapeAttr(c)}" ${c === uiState.filters.ideaCategory ? "selected" : ""}>${escapeHTML(c)}</option>`,
            )
            .join("")}
        </select>
      `;
      return `<div class="filters">${catSelect}${tagSelect}</div>`;
    }

    return `<div class="filters">${tagSelect}</div>`;
  }

  function renderSectionBody(sectionId) {
    switch (sectionId) {
      case "prompts":
        return renderPrompts();
      case "clients":
        return renderClients();
      case "income":
        return renderIncome();
      case "programs":
        return renderPrograms();
      case "projects":
        return renderProjects();
      case "tools":
        return renderTools();
      case "ideas":
        return renderIdeas();
      case "vault":
        return renderVault();
      case "passwords":
        return renderPasswords();
      default:
        return emptyState("Seção inválida", "Algo deu errado ao renderizar.");
    }
  }

  function handleAction({ action, id, section, target }) {
    if (action === "closeModal") return closeModal();
    if (action === "add") return openAdd(section);
    if (action === "view") return openView(section, id);
    if (action === "edit") return openEdit(section, id);
    if (action === "delete") return deleteItem(section, id);
    if (action === "quickAddGo") {
      closeModal();
      navigate(section);
      openAdd(section);
      return;
    }
    if (action === "jumpTo") {
      el.searchResults.hidden = true;
      el.globalSearch.value = "";
      el.globalSearch.blur();
      navigate(section);
      setTimeout(() => openView(section, id), 0);
      return;
    }

    if (action === "financeSettings") return openFinanceSettingsModal();
    if (action === "financeAddExpense") return openFinanceExpenseModal();
    if (action === "financeEditExpense") {
      const fin = getFinanceiro();
      const g = (fin.gastos || []).find((x) => x.id === id);
      if (g) openFinanceExpenseModal(g);
      return;
    }
    if (action === "financeDeleteExpense") {
      const fin = getFinanceiro();
      const g = (fin.gastos || []).find((x) => x.id === id);
      if (!g) return;
      confirmDelete("Excluir gasto?", "Essa acao nao pode ser desfeita.", () => {
        fin.gastos = (fin.gastos || []).filter((x) => x.id !== id);
        db.financeiro = fin;
        saveDB({ immediateCloud: true });
        renderSection();
        toast("Gasto excluido", "success");
      });
      return;
    }
    if (action === "financeTogglePaid") {
      const fin = getFinanceiro();
      const g = (fin.gastos || []).find((x) => x.id === id);
      if (!g) return;
      g.pago = Boolean(target?.checked);
      db.financeiro = fin;
      saveDB();
      renderSection();
      return;
    }

    if (action === "incomeAddClient") {
      uiState.afterClientSaveSection = "income";
      navigate("clients");
      openClientForm();
      return;
    }

    if (action === "toggleClientActive") {
      const idx = db.clients.findIndex((c) => c.id === id);
      if (idx < 0) return;
      db.clients[idx].ativo = !Boolean(db.clients[idx].ativo);
      db.clients[idx].updatedAt = Date.now();
      saveDB();
      renderSection();
      toast(db.clients[idx].ativo ? "Cliente ativado" : "Cliente desativado", "success");
      return;
    }

    if (action === "editClientFromIncome") {
      const c = db.clients.find((x) => x.id === id);
      if (c) openClientForm(c);
      return;
    }

    if (action === "deleteClientFromIncome") {
      deleteItem("clients", id);
      return;
    }

    if (action === "copyPrompt") {
      const p = db.prompts.items.find((x) => x.id === id);
      if (!p) return;
      return copy(p.text);
    }

    if (action === "copyPass") {
      const v = db.vault.find((x) => x.id === id);
      if (!v?.password) return toast("Sem senha para copiar", "danger");
      ensureDeviceAuth("copiar senha").then((ok) => {
        if (!ok) return;
        copy(v.password);
      });
      return;
    }

    if (action === "copyPwd") {
      const p = db.passwords.find((x) => x.id === id);
      if (!p?.password) return toast("Sem senha para copiar", "danger");
      copy(p.password);
      return;
    }

    if (action === "toggleReveal") {
      const next = !uiState.revealMap.get(id);
      const fromModal = Boolean(target && el.modalRoot.contains(target));

      const apply = () => {
        renderSection();
        if (section === "vault" && fromModal) {
          closeModal();
          openVaultView(id);
        }
      };

      if (next) {
        ensureDeviceAuth("revelar senha").then((ok) => {
          if (!ok) return;
          uiState.revealMap.set(id, true);
          apply();
        });
        return;
      }

      uiState.revealMap.set(id, false);
      apply();
      return;
    }

    if (action === "incomeClient") return openIncomeClientModal(id);

    if (action === "togglePayStatus") {
      const entry = db.income.find((x) => x.id === id);
      if (!entry) return;
      entry.status = entry.status === "paid" ? "pending" : "paid";
      if (entry.status === "paid" && !entry.paidAt) {
        entry.paidAt = new Date().toISOString().slice(0, 10);
      }
      entry.updatedAt = Date.now();
      saveDB();
      renderSection();
      toast(entry.status === "paid" ? "Marcado como Pago ✅" : "Marcado como Pendente", "success");
      return;
    }

    if (action === "editIncomeExtra") {
      const ex = db.incomeExtras.find((x) => x.id === id);
      if (ex) openIncomeExtraForm(ex);
      return;
    }
    if (action === "deleteIncomeExtra") {
      confirmDelete("Excluir renda extra?", "Essa ação não pode ser desfeita.", () => {
        db.incomeExtras = db.incomeExtras.filter((x) => x.id !== id);
        saveDB({ immediateCloud: true }); renderSection(); toast("Renda extra excluída", "success");
      });
      return;
    }

    if (action === "markPaidEdu" || action === "markPendingEdu") {
      const clientId = target?.dataset.clientid || id;
      const month    = target?.dataset.month || "";
      const isPaid   = action === "markPaidEdu";
      const client   = db.clients.find((x) => x.id === clientId);
      if (!client) return;

      let entry = db.income.find(
        (i) => (i.clientId === clientId || i.clientName === client.name) &&
               String(i.paidAt || "").slice(0, 7) === month
      );

      if (!entry && isPaid) {
        // Criar entrada automática com mensalidade salva ou 0
        entry = {
          id: uid(),
          clientId: client.id,
          clientName: client.name,
          mensality: client.mensality || 0,
          amount: client.mensality || 0,
          paidAt: new Date().toISOString().slice(0, 10),
          status: "paid",
          notes: "",
          tags: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        db.income.push(entry);
      } else if (entry) {
        entry.status = isPaid ? "paid" : "pending";
        if (isPaid && !entry.paidAt) entry.paidAt = new Date().toISOString().slice(0, 10);
        entry.updatedAt = Date.now();
      }
      saveDB(); renderSection();
      toast(isPaid ? "✅ Marcado como Pago" : "↩️ Marcado como Pendente", "success");
      return;
    }

    if (action === "setMensality") {
      const clientId = target?.dataset.clientid || id;
      const client   = db.clients.find((x) => x.id === clientId);
      if (!client) return;
      openModal({
        title: `Valor da mensalidade — ${client.name}`,
        subtitle: "Define o valor padrão para novos registros de pagamento.",
        body: `
          <form class="form" id="mensalityForm">
            <div class="field">
              <label for="mensVal">Valor da mensalidade (R$)</label>
              <input class="input" id="mensVal" name="mensality" type="number" min="0" step="0.01"
                inputmode="decimal" value="${escapeAttr(client.mensality || 0)}" placeholder="Ex: 300" />
            </div>
            <div class="form__footer">
              <button class="btn btn--ghost" type="button" data-action="closeModal">Cancelar</button>
              <button class="btn btn--primary" type="submit">Salvar</button>
            </div>
          </form>
        `,
        onMount(modalEl) {
          modalEl.querySelector("#mensalityForm").addEventListener("submit", (e) => {
            e.preventDefault();
            const val = Number(new FormData(e.currentTarget).get("mensality"));
            const idx = db.clients.findIndex((x) => x.id === clientId);
            if (idx >= 0) { db.clients[idx].mensality = Number.isFinite(val) ? val : 0; db.clients[idx].updatedAt = Date.now(); }
            saveDB(); closeModal(); renderSection();
            toast("Mensalidade atualizada", "success");
          });
        },
      });
      return;
    }

    if (action === "addIncomeExtra") {
      openIncomeExtraForm();
      return;
    }

    if (action === "copyField") return copy(target?.dataset.payload || "");
    if (action === "openLink") {
      const url = target?.dataset.payload || "";
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    if (action === "clientTab") return;
    if (action === "addClientSocialOther") return;
    if (action === "editClientSocialOther") return;
    if (action === "copyClientSocialPass") return;
    if (action === "copyClientOtherPass") return;
    if (action === "deleteClientSocialOther") return;
    if (action === "editIncomeDirect") return;
    if (action === "deleteIncomeDirect") return;

    toast(`Botao sem acao configurada: ${action}`, "warning");
  }

  function openAdd(section) {
    if (section === "prompts") return openPromptForm();
    if (section === "clients") return openClientForm();
    if (section === "income") {
      uiState.afterClientSaveSection = uiState.afterClientSaveSection || "income";
      navigate("clients");
      return openClientForm();
    }
    if (section === "programs") return openProgramForm();
    if (section === "projects") return openProjectForm();
    if (section === "tools") return openToolForm();
    if (section === "ideas") return openIdeaForm();
    if (section === "vault") return openVaultForm();
    if (section === "passwords") return openPasswordForm();
  }

  function openView(section, id) {
    if (section === "prompts") return openPromptView(id);
    if (section === "clients") return openClientView(id);
    if (section === "income") return openIncomeView(id);
    if (section === "programs") return openProgramView(id);
    if (section === "vault") return openVaultView(id);
    return openGenericView(section, id);
  }

  function openEdit(section, id) {
    if (section === "prompts") return openPromptForm(db.prompts.items.find((x) => x.id === id));
    if (section === "clients") return openClientForm(db.clients.find((x) => x.id === id));
    if (section === "income") return openIncomeForm(db.income.find((x) => x.id === id));
    if (section === "programs") return openProgramForm(db.programs.find((x) => x.id === id));
    if (section === "projects") return openProjectForm(db.projects.find((x) => x.id === id));
    if (section === "tools") return openToolForm(db.tools.find((x) => x.id === id));
    if (section === "ideas") return openIdeaForm(db.ideas.find((x) => x.id === id));
    if (section === "vault") return openVaultForm(db.vault.find((x) => x.id === id));
    if (section === "passwords") return openPasswordForm(db.passwords.find((x) => x.id === id));
    if (section === "incomeExtra") return openIncomeExtraForm(db.incomeExtras.find((x) => x.id === id));
  }

  function deleteItem(sectionId, id) {
    const labelMap = {
      prompts: "prompt",
      clients: "cliente",
      income: "renda",
      programs: "programa",
      projects: "projeto",
      tools: "ferramenta",
      ideas: "ideia",
      vault: "senha",
    };

    confirmDelete(`Excluir ${labelMap[sectionId] || "item"}?`, "Essa ação não pode ser desfeita.", () => {
      if (sectionId === "prompts") db.prompts.items = db.prompts.items.filter((x) => x.id !== id);
      if (sectionId === "clients") db.clients = db.clients.filter((x) => x.id !== id);
      if (sectionId === "income") db.income = db.income.filter((x) => x.id !== id);
      if (sectionId === "incomeExtra") db.incomeExtras = db.incomeExtras.filter((x) => x.id !== id);
      if (sectionId === "programs") db.programs = db.programs.filter((x) => x.id !== id);
      if (sectionId === "projects") db.projects = db.projects.filter((x) => x.id !== id);
      if (sectionId === "tools") db.tools = db.tools.filter((x) => x.id !== id);
      if (sectionId === "ideas") db.ideas = db.ideas.filter((x) => x.id !== id);
      if (sectionId === "vault") db.vault = db.vault.filter((x) => x.id !== id);
      if (sectionId === "passwords") db.passwords = db.passwords.filter((x) => x.id !== id);

      saveDB({ immediateCloud: true });
      closeModal();
      renderSection();
      toast("Item excluído", "success");
    });
  }

  function createCloudState() {
    return {
      settings: null,
      app: null,
      auth: null,
      firestore: null,
      authApi: null,
      dbApi: null,
      docRef: null,
      unsubscribe: null,
      saveTimer: 0,
      connected: false,
      applyingRemote: false,
      lastLocalRevision: "",
      lastAppliedRevision: "",
    };
  }

  function setLoginPending(pending) {
    if (!el.loginSubmit) return;
    el.loginSubmit.disabled = Boolean(pending);
    el.loginSubmit.textContent = pending ? "Entrando..." : "Entrar";
  }

  function updateSyncStatus(message, tone = "local") {
    if (!el.syncStatus) return;

    const text = String(message || "").trim() || "Modo local";
    el.syncStatus.hidden = false;
    el.syncStatus.textContent = text;
    el.syncStatus.dataset.state = tone;
  }

  function getFirebaseSettings() {
    const raw = window.BRAINDEV_FIREBASE && typeof window.BRAINDEV_FIREBASE === "object" ? window.BRAINDEV_FIREBASE : {};
    const config = raw.config && typeof raw.config === "object" ? raw.config : {};
    const required = ["apiKey", "authDomain", "projectId", "appId"];
    const hasConfig = required.every((key) => String(config[key] || "").trim());

    return {
      enabled: Boolean(raw.enabled) && hasConfig,
      config,
      collection: String(raw.collection || "braindevUsers"),
      sdkVersion: String(raw.sdkVersion || "12.7.0"),
    };
  }

  function isFirebaseConfigured() {
    return getFirebaseSettings().enabled;
  }

  async function ensureFirebaseRuntime() {
    const settings = getFirebaseSettings();
    if (!settings.enabled) return null;

    if (cloudState.app && cloudState.auth && cloudState.firestore && cloudState.authApi && cloudState.dbApi) {
      cloudState.settings = settings;
      return cloudState;
    }

    const baseUrl = `https://www.gstatic.com/firebasejs/${settings.sdkVersion}`;
    const [appApi, authApi, dbApi] = await Promise.all([
      import(`${baseUrl}/firebase-app.js`),
      import(`${baseUrl}/firebase-auth.js`),
      import(`${baseUrl}/firebase-firestore.js`),
    ]);

    const existingApp =
      appApi.getApps().find((candidate) => candidate.options?.projectId === settings.config.projectId) || null;
    const app = existingApp || appApi.initializeApp(settings.config, `braindev-${settings.config.projectId}`);
    const auth = authApi.getAuth(app);
    await authApi.setPersistence(auth, authApi.browserLocalPersistence);

    cloudState.settings = settings;
    cloudState.app = app;
    cloudState.auth = auth;
    cloudState.firestore = dbApi.getFirestore(app);
    cloudState.authApi = authApi;
    cloudState.dbApi = dbApi;

    return cloudState;
  }

  async function signInFirebaseUser(email, password) {
    const runtime = await ensureFirebaseRuntime();
    if (!runtime) return null;
    const result = await runtime.authApi.signInWithEmailAndPassword(runtime.auth, email, password);
    return result.user || null;
  }

  async function connectCloudSync({ email = "", authUser = null } = {}) {
    teardownCloudSync();

    if (!isFirebaseConfigured()) {
      updateSyncStatus("Modo local", "local");
      return;
    }

    updateSyncStatus("Conectando Firebase...", "syncing");

    const runtime = await ensureFirebaseRuntime();
    if (!runtime) {
      updateSyncStatus("Modo local", "local");
      return;
    }

    const user = authUser || runtime.auth.currentUser;
    if (!user) {
      updateSyncStatus("Firebase sem login", "warning");
      return;
    }

    cloudState.docRef = runtime.dbApi.doc(runtime.firestore, runtime.settings.collection, user.uid);
    cloudState.connected = true;

    try {
      const initialSnapshot = await runtime.dbApi.getDoc(cloudState.docRef);
      if (initialSnapshot.exists()) {
        const remotePayload = initialSnapshot.data();
        const remoteData = remotePayload?.data && typeof remotePayload.data === "object" ? remotePayload.data : remotePayload;
        const localStats = getDbStats(db);
        const remoteStats = getDbStats(remoteData);
        const remoteUpdatedAt = Math.max(Number(remotePayload?.updatedAt || 0), remoteStats.updatedAt);

        if (remoteStats.count > 0 && (localStats.count === 0 || remoteUpdatedAt > localStats.updatedAt)) {
          applyCloudPayload(remotePayload, { preserveSection: false });
          updateSyncStatus("Sincronizado com Firebase", "cloud");
        } else {
          await persistCloudSaveNow();
          updateSyncStatus("Firebase atualizado", "cloud");
        }
      } else {
        await persistCloudSaveNow();
        updateSyncStatus("Firebase pronto", "cloud");
      }
    } catch (err) {
      fallbackToLocalMode("Firebase indisponivel. Salvando so neste aparelho.", err);
      return;
    }

    cloudState.unsubscribe = runtime.dbApi.onSnapshot(
      cloudState.docRef,
      (snapshot) => {
        if (!snapshot.exists()) return;
        if (snapshot.metadata?.hasPendingWrites) {
          updateSyncStatus("Sincronizando...", "syncing");
          return;
        }

        applyCloudPayload(snapshot.data(), { preserveSection: true });
        updateSyncStatus("Sincronizado com Firebase", "cloud");
      },
      (err) => {
        fallbackToLocalMode("Modo local. Erro de sincronizacao no Firebase.", err);
      },
    );

    if (email && !activeUserEmail) activeUserEmail = String(email).trim().toLowerCase();
  }

  function teardownCloudSync(options = {}) {
    clearTimeout(cloudState.saveTimer);
    cloudState.saveTimer = 0;

    if (typeof cloudState.unsubscribe === "function") {
      cloudState.unsubscribe();
    }

    cloudState.unsubscribe = null;
    cloudState.docRef = null;
    cloudState.connected = false;
    cloudState.applyingRemote = false;
    cloudState.lastLocalRevision = "";
    cloudState.lastAppliedRevision = "";

    if (options.signOutUser && cloudState.auth && cloudState.auth.currentUser && cloudState.authApi?.signOut) {
      cloudState.authApi.signOut(cloudState.auth).catch((err) => {
        console.warn("Falha ao encerrar a sessao do Firebase", err);
      });
    }
  }

  function fallbackToLocalMode(message, err) {
    if (err) console.error("Firebase desativado temporariamente", err);

    clearTimeout(cloudState.saveTimer);
    cloudState.saveTimer = 0;

    if (typeof cloudState.unsubscribe === "function") {
      cloudState.unsubscribe();
    }

    cloudState.unsubscribe = null;
    cloudState.docRef = null;
    cloudState.connected = false;
    cloudState.applyingRemote = false;
    cloudState.lastLocalRevision = "";
    cloudState.lastAppliedRevision = "";
    updateSyncStatus(message || "Modo local", "warning");
  }

  function buildCloudPayload() {
    return {
      ownerEmail: activeUserEmail || "",
      profileId: activeUserId || "",
      revisionId: uid(),
      updatedAt: Date.now(),
      data: JSON.parse(JSON.stringify(db)),
    };
  }

  function getDbStats(source) {
    const lists = [
      Array.isArray(source?.prompts?.items) ? source.prompts.items : [],
      Array.isArray(source?.clients) ? source.clients : [],
      Array.isArray(source?.income) ? source.income : [],
      Array.isArray(source?.incomeExtras) ? source.incomeExtras : [],
      Array.isArray(source?.passwords) ? source.passwords : [],
      Array.isArray(source?.programs) ? source.programs : [],
      Array.isArray(source?.projects) ? source.projects : [],
      Array.isArray(source?.sites) ? source.sites : [],
      Array.isArray(source?.tools) ? source.tools : [],
      Array.isArray(source?.ideas) ? source.ideas : [],
      Array.isArray(source?.vault) ? source.vault : [],
      Array.isArray(source?.financeiro?.gastos) ? source.financeiro.gastos : [],
    ];

    let count = 0;
    let updatedAt = Number(source?.settings?.lastSavedAt || 0);

    lists.forEach((list) => {
      count += list.length;
      list.forEach((item) => {
        updatedAt = Math.max(updatedAt, Number(item?.updatedAt || item?.createdAt || 0));
      });
    });

    return { count, updatedAt };
  }

  function applyCloudPayload(payload, options = {}) {
    if (!payload || typeof payload !== "object") return false;

    const revisionId = String(payload.revisionId || "");
    if (revisionId && (revisionId === cloudState.lastLocalRevision || revisionId === cloudState.lastAppliedRevision)) {
      return false;
    }

    cloudState.applyingRemote = true;

    try {
      db = normalizeDB(payload.data && typeof payload.data === "object" ? payload.data : payload);
      saveLocalDB();
      applyTheme(db.settings?.theme || "light");
      renderNav();

      const preferredSection = options.preserveSection
        ? uiState.section
        : db.settings?.lastSection || uiState.section || sections[0]?.id || "prompts";

      uiState.section = getSections().some((section) => section.id === preferredSection)
        ? preferredSection
        : sections[0]?.id || "prompts";

      syncNavCurrent();
      renderSection();
    } finally {
      cloudState.applyingRemote = false;
      cloudState.lastAppliedRevision = revisionId;
    }

    return true;
  }

  function saveLocalDB() {
    if (!storageKey) return;

    try {
      localStorage.setItem(storageKey, JSON.stringify(db));
    } catch (err) {
      console.error("Falha ao salvar DB", err);
      toast("Falha ao salvar no navegador", "danger");
    }
  }

  function queueCloudSave() {
    if (!cloudState.connected || cloudState.applyingRemote || !cloudState.docRef) return;

    clearTimeout(cloudState.saveTimer);
    cloudState.saveTimer = setTimeout(() => {
      persistCloudSaveNow().catch((err) => {
        fallbackToLocalMode("Modo local. Nao foi possivel salvar no Firebase.", err);
      });
    }, 350);
  }

  async function persistCloudSaveNow() {
    if (!cloudState.connected || cloudState.applyingRemote || !cloudState.docRef) return;

    const payload = buildCloudPayload();
    cloudState.lastLocalRevision = payload.revisionId;
    updateSyncStatus("Sincronizando...", "syncing");
    await cloudState.dbApi.setDoc(cloudState.docRef, payload, { merge: true });
    updateSyncStatus("Sincronizado com Firebase", "cloud");
  }

  // -------------------------
  // UI (mínimo)
  // -------------------------
  function emptyState(title, subtitle) {
    return `
      <div class="card" style="cursor: default;">
        <h3 class="card__title">${escapeHTML(title)}</h3>
        <div class="card__meta"><span class="muted">${escapeHTML(subtitle)}</span></div>
      </div>
    `;
  }

  function renderTags(tags = []) {
    const list = (tags || []).filter(Boolean).slice(0, 4);
    if (list.length === 0) return "";
    return list.map((t) => `<span class="chip">#${escapeHTML(t)}</span>`).join("");
  }

  function parseTags(input) {
    return uniqueStrings(
      String(input || "")
        .split(",")
        .map((t) => t.trim().replace(/^#/, ""))
        .filter(Boolean),
    );
  }

  function snippet(text, max) {
    const s = String(text || "").replace(/\s+/g, " ").trim();
    if (s.length <= max) return s;
    return s.slice(0, Math.max(0, max - 1)) + "…";
  }

  function mask(text) {
    const s = String(text || "");
    if (s.length <= 2) return "••";
    return "•".repeat(Math.min(12, Math.max(6, s.length - 2))) + s.slice(-2);
  }

  function formatDate(iso) {
    const s = String(iso || "");
    if (!s) return "";
    try {
      const [y, m, d] = s.split("-").map((x) => Number(x));
      const dt = new Date(y, (m || 1) - 1, d || 1);
      return dt.toLocaleDateString("pt-BR");
    } catch {
      return s;
    }
  }

  const moneyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const numberFormatter = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

  function formatMoney(value) {
    const num = Number(value);
    return moneyFormatter.format(Number.isFinite(num) ? num : 0);
  }

  function formatNumber(value) {
    const num = Number(value);
    return numberFormatter.format(Number.isFinite(num) ? num : 0);
  }

  function formatMonthKey(key) {
    const s = String(key || "");
    if (!/^\d{4}-\d{2}$/.test(s)) return s;
    const [y, m] = s.split("-");
    return `${m}/${y}`;
  }

  function trimUrl(url) {
    try {
      const u = new URL(url);
      return (u.host + u.pathname).replace(/\/$/, "");
    } catch {
      return url;
    }
  }

  function byDateDesc(a, b) {
    const da = a?.updatedAt || a?.createdAt || 0;
    const dbb = b?.updatedAt || b?.createdAt || 0;
    return dbb - da;
  }

  function kvRow(key, valueHTML) {
    const val = valueHTML ?? "—";
    return `
      <div class="kv__row">
        <div class="kv__k">${escapeHTML(key)}</div>
        <div class="kv__v">${typeof val === "string" ? val : String(val)}</div>
      </div>
    `;
  }

  function withCopy(value, openLabel) {
    const v = String(value || "").trim();
    if (!v) return "—";
    const isUrl = /^https?:\/\//i.test(v);
    const openBtn = isUrl
      ? `<button class="btn" type="button" data-action="openLink" data-payload="${escapeAttr(v)}">${escapeHTML(
          openLabel || "Abrir",
        )}</button>`
      : "";
    return `
      <span class="mono" style="min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width: 520px;">${escapeHTML(
        v,
      )}</span>
      ${openBtn}
      <button class="btn" type="button" data-action="copyField" data-payload="${escapeAttr(v)}">Copiar</button>
    `;
  }

  function toast(message, variant = "info") {
    const node = document.createElement("div");
    node.className = `toast toast--${variant}`;
    node.innerHTML = `
      <span class="toast__dot" aria-hidden="true"></span>
      <div>${escapeHTML(message)}</div>
    `;
    el.toastRoot.appendChild(node);
    setTimeout(() => node.remove(), 2200);
  }

  function openQuickAdd() {
    openModal({
      title: "Adicionar novo item",
      subtitle: "Escolha a área para criar rapidamente.",
      body: `
        <div class="grid" style="grid-template-columns: repeat(2, minmax(0, 1fr));">
          ${getSections().map(
            (s) => `
              <button class="card" type="button" data-action="quickAddGo" data-section="${escapeAttr(s.id)}" style="text-align:left;">
                <h3 class="card__title">${escapeHTML(s.icon)} ${escapeHTML(s.label)}</h3>
                <div class="card__meta"><span class="muted">${escapeHTML(s.desc)}</span></div>
              </button>
            `,
          ).join("")}
        </div>
      `,
    });
  }

  function openModal({ title, subtitle, body, onMount }) {
    closeModal();

    const overlay = document.createElement("div");
    overlay.className = "modal__overlay";
    overlay.addEventListener("click", closeModal);

    const modal = document.createElement("div");
    modal.className = "modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.innerHTML = `
      <div class="modal__head">
        <div class="modal__title">
          <h2>${escapeHTML(title || "BrainDev")}</h2>
          ${subtitle ? `<p>${escapeHTML(subtitle)}</p>` : ""}
        </div>
        <button class="icon-btn" type="button" aria-label="Fechar" data-action="closeModal"><span aria-hidden="true">✕</span></button>
      </div>
      <div class="modal__body">${body || ""}</div>
    `;

    const onKey = (e) => {
      if (e.key === "Escape") closeModal();
    };
    document.addEventListener("keydown", onKey);
    modal.__cleanup = () => document.removeEventListener("keydown", onKey);

    el.modalRoot.appendChild(overlay);
    el.modalRoot.appendChild(modal);
    if (typeof onMount === "function") {
      try {
        onMount(modal);
      } catch (err) {
        handleUiError("abrir esta janela", err);
        closeModal();
      }
    }
  }

  function closeModal() {
    const modal = $(".modal", el.modalRoot);
    const overlay = $(".modal__overlay", el.modalRoot);
    if (modal?.__cleanup) modal.__cleanup();
    overlay?.remove();
    modal?.remove();
  }

  function confirmDelete(title, subtitle, onConfirm) {
    const parts = [title, subtitle].map((value) => String(value || "").trim()).filter(Boolean);
    const confirmed = window.confirm(parts.join("\n\n") || "Confirmar exclusao?");
    if (confirmed && typeof onConfirm === "function") onConfirm();
  }

  // -------------------------
  // Autenticação (revelar/copiar senhas)
  // -------------------------
  const AUTH_TTL_MS = 60_000;

  function isAuthFresh() {
    return Date.now() < uiState.authUntil;
  }

  function markAuthed() {
    uiState.authUntil = Date.now() + AUTH_TTL_MS;
  }

  function isWebAuthnAvailable() {
    return (
      window.isSecureContext &&
      typeof PublicKeyCredential !== "undefined" &&
      typeof navigator.credentials?.create === "function" &&
      typeof navigator.credentials?.get === "function"
    );
  }

  function randomBytes(len) {
    const bytes = new Uint8Array(len);
    globalThis.crypto.getRandomValues(bytes);
    return bytes;
  }

  function bytesToBase64url(bytes) {
    let bin = "";
    bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  }

  function base64urlToBytes(b64url) {
    const s = String(b64url || "").replaceAll("-", "+").replaceAll("_", "/");
    const pad = "=".repeat((4 - (s.length % 4)) % 4);
    const bin = atob(s + pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function timingSafeEqual(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
  }

  function openModalAsync({ title, subtitle, body, onMount }) {
    return new Promise((resolve) => {
      let settled = false;
      let modalEl = null;

      const finish = (value) => {
        if (settled) return;
        settled = true;
        observer.disconnect();
        resolve(Boolean(value));
      };

      const observer = new MutationObserver(() => {
        if (!modalEl) return;
        if (!el.modalRoot.contains(modalEl)) finish(false);
      });
      observer.observe(el.modalRoot, { childList: true });

      openModal({
        title,
        subtitle,
        body,
        onMount(m) {
          modalEl = m;
          if (typeof onMount === "function") onMount(m, finish);
        },
      });
    });
  }

  async function ensureDeviceAuth(reason) {
    if (isAuthFresh()) return true;

    const why = String(reason || "revelar senhas");

    if (isWebAuthnAvailable()) {
      const ok = await ensureWebAuthn(why);
      if (ok) {
        markAuthed();
        return true;
      }
    }

    const okMaster = await ensureMasterPassword(why);
    if (okMaster) {
      markAuthed();
      return true;
    }

    toast("Autenticação necessária para esta ação", "warning");
    return false;
  }

  async function ensureWebAuthn(why) {
    try {
      if (!db.security?.webauthn?.credentialId) {
        const setupOk = await openModalAsync({
          title: "Autenticação do dispositivo",
          subtitle: "Use biometria/PIN do dispositivo para revelar senhas.",
          body: `
            <div class="pre">
              Para cumprir a segurança ao ${escapeHTML(why)}, o BrainDev pode usar WebAuthn (Windows Hello / Face ID / biometria).

              Requisito: abrir em um contexto seguro (https ou http://localhost).
            </div>
            <div class="form__footer" style="margin-top: 12px;">
              <button class="btn btn--ghost" type="button" data-action="closeModal">Cancelar</button>
              <button class="btn btn--primary" type="button" id="enableWebAuthnBtn">Ativar agora</button>
            </div>
          `,
          onMount(modalEl, finish) {
            $("#enableWebAuthnBtn", modalEl).addEventListener("click", async () => {
              try {
                $("#enableWebAuthnBtn", modalEl).disabled = true;
                await webauthnRegister();
                closeModal();
                finish(true);
              } catch (err) {
                console.warn("Falha ao ativar WebAuthn", err);
                toast("Falha ao ativar autenticação do dispositivo", "danger");
                $("#enableWebAuthnBtn", modalEl).disabled = false;
              }
            });
          },
        });

        if (!setupOk) return false;
      }

      await webauthnVerify();
      return true;
    } catch (err) {
      console.warn("Falha no WebAuthn", err);
      toast("Autenticação do dispositivo falhou", "danger");
      return false;
    }
  }

  async function webauthnRegister() {
    if (!isWebAuthnAvailable()) throw new Error("WebAuthn indisponível");

    const userId = db.security.webauthn.userId ? base64urlToBytes(db.security.webauthn.userId) : randomBytes(16);
    const challenge = randomBytes(32);

    const cred = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: "BrainDev" },
        user: { id: userId, name: "braindev-local", displayName: "BrainDev" },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 }, // ES256
          { type: "public-key", alg: -257 }, // RS256
        ],
        authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
        timeout: 60_000,
        attestation: "none",
      },
    });

    if (!cred || !cred.rawId) throw new Error("Credencial inválida");

    db.security.webauthn.credentialId = bytesToBase64url(new Uint8Array(cred.rawId));
    db.security.webauthn.userId = bytesToBase64url(new Uint8Array(userId));
    db.security.webauthn.createdAt = Date.now();
    saveDB();
  }

  async function webauthnVerify() {
    if (!isWebAuthnAvailable()) throw new Error("WebAuthn indisponível");
    const credId = String(db.security?.webauthn?.credentialId || "");
    if (!credId) throw new Error("Sem credencial registrada");

    const challenge = randomBytes(32);
    const allowCredentials = [{ type: "public-key", id: base64urlToBytes(credId) }];

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials,
        userVerification: "required",
        timeout: 60_000,
      },
    });

    if (!assertion) throw new Error("Sem asserção");
  }

  async function ensureMasterPassword(why) {
    if (!globalThis.crypto?.subtle) {
      toast("Abra via http://localhost para usar autenticação", "warning");
      return false;
    }

    const hasMaster = Boolean(db.security?.master?.hash);
    if (!hasMaster) {
      const ok = await openModalAsync({
        title: "Criar senha mestre",
        subtitle: `Fallback para ${why} (quando o dispositivo não estiver disponível).`,
        body: `
          <form class="form" id="masterSetForm">
            <div class="field">
              <label for="master1">Senha mestre</label>
              <input class="input" id="master1" name="p1" type="password" required placeholder="Mín. 6 caracteres" />
            </div>
            <div class="field">
              <label for="master2">Confirmar senha</label>
              <input class="input" id="master2" name="p2" type="password" required />
            </div>
            <div class="form__footer">
              <button class="btn btn--ghost" type="button" data-action="closeModal">Cancelar</button>
              <button class="btn btn--primary" type="submit">Salvar</button>
            </div>
          </form>
        `,
        onMount(modalEl, finish) {
          const form = $("#masterSetForm", modalEl);
          form.addEventListener("submit", async (e) => {
            e.preventDefault();
            const fd = new FormData(form);
            const p1 = String(fd.get("p1") || "");
            const p2 = String(fd.get("p2") || "");
            if (p1.length < 6) return toast("Use pelo menos 6 caracteres", "danger");
            if (p1 !== p2) return toast("As senhas não conferem", "danger");
            try {
              await setMasterPassword(p1);
              closeModal();
              finish(true);
            } catch (err) {
              console.warn("Falha ao salvar senha mestre", err);
              toast("Falha ao configurar senha mestre", "danger");
            }
          });
        },
      });

      return ok;
    }

    const ok = await openModalAsync({
      title: "Autenticação necessária",
      subtitle: `Digite a senha mestre para ${why}.`,
      body: `
        <form class="form" id="masterVerifyForm">
          <div class="field">
            <label for="masterPwd">Senha mestre</label>
            <input class="input" id="masterPwd" name="p" type="password" required autofocus />
          </div>
          <div class="form__footer">
            <button class="btn btn--ghost" type="button" data-action="closeModal">Cancelar</button>
            <button class="btn btn--primary" type="submit">Verificar</button>
          </div>
        </form>
      `,
      onMount(modalEl, finish) {
        const form = $("#masterVerifyForm", modalEl);
        const pwd = $("#masterPwd", modalEl);
        form.addEventListener("submit", async (e) => {
          e.preventDefault();
          const okPass = await verifyMasterPassword(String(pwd.value || ""));
          if (!okPass) return toast("Senha mestre incorreta", "danger");
          closeModal();
          finish(true);
        });
      },
    });

    return ok;
  }

  async function setMasterPassword(password) {
    const salt = randomBytes(16);
    const iterations = Number(db.security?.master?.iterations || 150000);
    const hashBytes = await deriveMasterHash(password, salt, iterations);

    db.security.master.salt = bytesToBase64url(salt);
    db.security.master.hash = bytesToBase64url(hashBytes);
    db.security.master.iterations = iterations;
    db.security.master.createdAt = Date.now();
    saveDB();
  }

  async function verifyMasterPassword(password) {
    const saltB64 = String(db.security?.master?.salt || "");
    const hashB64 = String(db.security?.master?.hash || "");
    const iterations = Number(db.security?.master?.iterations || 150000);
    if (!saltB64 || !hashB64) return false;

    const salt = base64urlToBytes(saltB64);
    const expected = base64urlToBytes(hashB64);
    const actual = await deriveMasterHash(password, salt, iterations);
    return timingSafeEqual(expected, actual);
  }

  async function deriveMasterHash(password, saltBytes, iterations) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(String(password || "")), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: saltBytes, iterations: Number(iterations || 150000), hash: "SHA-256" },
      keyMaterial,
      256,
    );
    return new Uint8Array(bits);
  }

  async function copy(text) {
    const value = String(text || "");
    if (!value) return toast("Nada para copiar", "danger");
    try {
      await navigator.clipboard.writeText(value);
      toast("Copiado!", "success");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      toast("Copiado!", "success");
    }
  }

  // -------------------------
  // Export / Import (mínimo)
  // -------------------------
  function exportJSON() {
    const payload = JSON.stringify(db, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `braindev-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("Backup exportado", "success");
  }

  // -------------------------
  // DB (LocalStorage) — por usuário
  // -------------------------
  function loadDBForUser(userId) {
    const key = storageKeyForUser(userId);
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return normalizeDB(defaultDB());
      return normalizeDB(JSON.parse(raw));
    } catch (err) {
      console.warn("Falha ao carregar DB, reiniciando.", err);
      return normalizeDB(defaultDB());
    }
  }

  function saveDB(options = {}) {
    if (!db.settings || typeof db.settings !== "object") db.settings = {};
    db.settings.lastSavedAt = Date.now();
    saveLocalDB();
    if (options.immediateCloud) {
      clearTimeout(cloudState.saveTimer);
      persistCloudSaveNow().catch((err) => {
        fallbackToLocalMode("Modo local. Nao foi possivel salvar no Firebase.", err);
      });
      return;
    }

    queueCloudSave();
  }

  function defaultDB() {
    return {
      version: 2,
      settings: { theme: "light", lastSection: "prompts", lastSavedAt: 0 },
      security: {
        webauthn: { credentialId: "", userId: "", createdAt: 0 },
        master: { salt: "", hash: "", iterations: 150000, createdAt: 0 },
      },
      prompts: {
        folders: ["Melhorar fotos", "Desenhos", "Copywriting", "Código", "Redes sociais"],
        items: [],
      },
      clients: [],
      income: [],
      incomeExtras: [],
      passwords: [],
      programs: [],
      projects: [],
      sites: [],
      tools: [],
      ideas: [],
      vault: [],
      financeiro: defaultFinanceiro(),
    };
  }

  function currentMonthKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  function defaultFinanceiro(monthKey = currentMonthKey()) {
    return {
      monthKey,
      rendaPrevista: 0,
      rendaRecebida: 0,
      metaEconomia: 0,
      gastos: [],
    };
  }

  function normalizeFinanceiro(input) {
    const base = defaultFinanceiro();
    const src = input && typeof input === "object" ? input : {};

    const toNum = (v) => {
      const n = Number(String(v ?? "").replace(",", "."));
      return Number.isFinite(n) ? n : 0;
    };

    const gastosSrc = Array.isArray(src.gastos) ? src.gastos : [];
    const gastos = gastosSrc.map((g) => {
      const tipo = g?.tipo === "fixo" ? "fixo" : "variavel";
      return {
        id: g?.id || uid(),
        nome: String(g?.nome || "").trim() || "Gasto",
        valor: Math.max(0, toNum(g?.valor)),
        tipo,
        pago: Boolean(g?.pago),
      };
    });

    const out = {
      ...base,
      ...src,
      monthKey: /^\d{4}-\d{2}$/.test(String(src.monthKey || "")) ? String(src.monthKey) : base.monthKey,
      rendaPrevista: Math.max(0, toNum(src.rendaPrevista)),
      rendaRecebida: Math.max(0, toNum(src.rendaRecebida)),
      metaEconomia: Math.max(0, toNum(src.metaEconomia)),
      gastos,
    };

    applyFinanceMonthlyReset(out);
    return out;
  }

  function applyFinanceMonthlyReset(financeiro) {
    if (!financeiro || typeof financeiro !== "object") return false;
    const sysMonth = currentMonthKey();
    if (financeiro.monthKey === sysMonth) return false;

    financeiro.monthKey = sysMonth;
    financeiro.rendaRecebida = 0;
    if (Array.isArray(financeiro.gastos)) {
      financeiro.gastos = financeiro.gastos.map((g) => ({ ...g, pago: false }));
    } else {
      financeiro.gastos = [];
    }
    return true;
  }

  function ensureFinanceCurrentMonth() {
    if (!db || typeof db !== "object") return;
    if (!db.financeiro || typeof db.financeiro !== "object") db.financeiro = defaultFinanceiro();
    let changed = applyFinanceMonthlyReset(db.financeiro);
    // Renda do mês agora é derivada dos clientes; limpa valores manuais antigos.
    if (Number(db.financeiro.rendaPrevista || 0) !== 0 || Number(db.financeiro.rendaRecebida || 0) !== 0) {
      db.financeiro.rendaPrevista = 0;
      db.financeiro.rendaRecebida = 0;
      changed = true;
    }
    if (changed && storageKey) saveDB();
  }

  function normalizeDB(input) {
    const base = defaultDB();
    const src = input && typeof input === "object" ? input : {};

    const out = {
      ...base,
      ...src,
      settings: { ...base.settings, ...(src.settings || {}) },
      financeiro: normalizeFinanceiro(src.financeiro),
      security: {
        ...base.security,
        ...(src.security && typeof src.security === "object" ? src.security : {}),
        webauthn: {
          ...base.security.webauthn,
          ...(src.security?.webauthn && typeof src.security.webauthn === "object" ? src.security.webauthn : {}),
        },
        master: {
          ...base.security.master,
          ...(src.security?.master && typeof src.security.master === "object" ? src.security.master : {}),
        },
      },
      prompts: {
        ...base.prompts,
        ...(src.prompts || {}),
        folders: Array.isArray(src?.prompts?.folders) ? uniqueStrings(src.prompts.folders) : base.prompts.folders.slice(),
        items: Array.isArray(src?.prompts?.items) ? src.prompts.items : [],
      },
      clients: Array.isArray(src.clients) ? src.clients : [],
      income: Array.isArray(src.income) ? src.income : [],
      incomeExtras: Array.isArray(src.incomeExtras) ? src.incomeExtras : [],
      passwords: Array.isArray(src.passwords) ? src.passwords : [],
      programs: Array.isArray(src.programs) ? src.programs : [],
      projects: Array.isArray(src.projects) ? src.projects : [],
      sites: Array.isArray(src.sites) ? src.sites : [],
      tools: Array.isArray(src.tools) ? src.tools : [],
      ideas: Array.isArray(src.ideas) ? src.ideas : [],
      vault: Array.isArray(src.vault) ? src.vault : [],
    };

    // Prompts
    out.prompts.items = out.prompts.items.map((p) => ({
      id: p?.id || uid(),
      folder: p?.folder || "Geral",
      title: p?.title || "Sem título",
      description: p?.description || "",
      text: p?.text || "",
      tags: Array.isArray(p?.tags) ? uniqueStrings(p.tags) : [],
      createdAt: Number(p?.createdAt || Date.now()),
      updatedAt: Number(p?.updatedAt || p?.createdAt || Date.now()),
    }));

    out.prompts.items.forEach((p) => {
      if (p.folder && !out.prompts.folders.includes(p.folder)) out.prompts.folders.push(p.folder);
    });

    out.clients = out.clients.map((c) => {
      const legacyAccesses = Array.isArray(c?.accesses)
        ? c.accesses.map((a) => ({
            id: a?.id || uid(),
            platform: a?.platform || "",
            loginLink: a?.loginLink || "",
            email: a?.email || "",
            password: a?.password || "",
            notes: a?.notes || "",
            createdAt: Number(a?.createdAt || Date.now()),
            updatedAt: Number(a?.updatedAt || a?.createdAt || Date.now()),
          }))
        : [];

      const socialSrc = c?.social && typeof c.social === "object" ? c.social : {};
      const cred = (x) => ({ email: x?.email || "", password: x?.password || "" });

      const othersSrc = Array.isArray(socialSrc.others) ? socialSrc.others : [];
      const othersList = (othersSrc.length ? othersSrc : legacyAccesses).map((o) => ({
        id: o?.id || uid(),
        platform: o?.platform || "",
        link: o?.link || o?.loginLink || "",
        email: o?.email || "",
        password: o?.password || "",
        notes: o?.notes || "",
        createdAt: Number(o?.createdAt || Date.now()),
        updatedAt: Number(o?.updatedAt || o?.createdAt || Date.now()),
      }));

      return {
        id: c?.id || uid(),
        name: c?.name || c?.nome || "Sem nome",
        nome: c?.name || c?.nome || "Sem nome",
        company: c?.company || "",
        notes: c?.notes || "",
        valor: Number.isFinite(Number(c?.valor)) ? Number(c.valor) : (Number.isFinite(Number(c?.mensality)) ? Number(c.mensality) : 0),
        mensality: Number.isFinite(Number(c?.valor)) ? Number(c.valor) : (Number.isFinite(Number(c?.mensality)) ? Number(c.mensality) : 0),
        ativo: c?.ativo === false ? false : true,
        tags: Array.isArray(c?.tags) ? uniqueStrings(c.tags) : [],
        social: {
          instagram: cred(socialSrc.instagram),
          youtube: cred(socialSrc.youtube),
          tiktok: cred(socialSrc.tiktok),
          twitter: cred(socialSrc.twitter),
          others: othersList,
        },
        phone: c?.phone || "",
        email: c?.email || "",
        serviceType: c?.serviceType || "",
        accesses: legacyAccesses,
        // Campos extras para Eduarda (alunos)
        address: c?.address || "",
        startDate: c?.startDate || "",
        classTime: c?.classTime || "",
        classDays: c?.classDays || "",
        createdAt: Number(c?.createdAt || Date.now()),
        updatedAt: Number(c?.updatedAt || c?.createdAt || Date.now()),
      };
    });

    const normalizeSimple = (arr, extra) =>
      arr.map((x) => ({
        id: x?.id || uid(),
        tags: Array.isArray(x?.tags) ? uniqueStrings(x.tags) : [],
        createdAt: Number(x?.createdAt || Date.now()),
        updatedAt: Number(x?.updatedAt || x?.createdAt || Date.now()),
        ...extra(x || {}),
      }));

    out.income = normalizeSimple(out.income, (i) => ({
      clientId: i.clientId || "",
      clientName: i.clientName || "",
      amount: Number.isFinite(Number(i.amount)) ? Number(i.amount) : 0,
      mensality: Number.isFinite(Number(i.mensality)) ? Number(i.mensality) : 0,
      paidAt: i.paidAt || "",
      status: i.status === "paid" ? "paid" : "pending",
      notes: i.notes || "",
    }));

    out.incomeExtras = normalizeSimple(out.incomeExtras, (e) => ({
      description: e.description || "",
      amount: Number.isFinite(Number(e.amount)) ? Number(e.amount) : 0,
      month: e.month || "",
      notes: e.notes || "",
    }));

    out.passwords = normalizeSimple(out.passwords, (p) => ({
      service: p.service || "",
      username: p.username || "",
      password: p.password || "",
      notes: p.notes || "",
    }));

    out.programs = normalizeSimple(out.programs, (p) => ({
      name: p.name || "Sem nome",
      description: p.description || "",
      link: p.link || "",
      notes: p.notes || "",
    }));

    out.projects = normalizeSimple(out.projects, (p) => ({
      name: p.name || "Sem nome",
      clientId: p.clientId || "",
      clientName: p.clientName || "",
      status: p.status === "Finalizado" ? "Concluído" : p.status || "Em andamento",
      description: p.description || p.notes || "",
      resources: Array.isArray(p.resources)
        ? uniqueStrings(p.resources.map((x) => String(x || "").trim())).filter(Boolean)
        : uniqueStrings([p.siteLink, p.githubLink].map((x) => String(x || "").trim())).filter(Boolean),
      dueDate: p.dueDate || "",
    }));

    out.sites = normalizeSimple(out.sites, (s) => ({
      name: s.name || "Sem nome",
      clientId: s.clientId || "",
      clientName: s.clientName || "",
      domain: s.domain || "",
      hosting: s.hosting || "",
      panelLink: s.panelLink || "",
      repoLink: s.repoLink || "",
      technologies: s.technologies || "",
      status: s.status || "Em desenvolvimento",
      notes: s.notes || "",
    }));

    out.tools = normalizeSimple(out.tools, (t) => ({
      name: t.name || "Sem nome",
      category: t.category || "",
      link: t.link || "",
      description: t.description || "",
    }));

    out.ideas = normalizeSimple(out.ideas, (i) => {
      const created = Number(i?.createdAt);
      const date =
        String(i?.date || "").trim() ||
        (Number.isFinite(created) ? new Date(created).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));

      return {
        title: i.title || i.name || "Sem título",
        category: i.category || "",
        description: i.description || "",
        date,
        status: i.status || "",
        monetization: i.monetization || "",
      };
    });

    out.vault = normalizeSimple(out.vault, (v) => ({
      platform: v.platform || "Plataforma",
      email: v.email || "",
      password: v.password || "",
      link: v.link || "",
      notes: v.notes || "",
    }));

    base.prompts.folders.forEach((f) => {
      if (!out.prompts.folders.includes(f)) out.prompts.folders.push(f);
    });

    out.settings.theme = out.settings.theme === "dark" ? "dark" : "light";

    out.security = out.security && typeof out.security === "object" ? out.security : base.security;
    out.security.webauthn = out.security.webauthn && typeof out.security.webauthn === "object" ? out.security.webauthn : base.security.webauthn;
    out.security.master = out.security.master && typeof out.security.master === "object" ? out.security.master : base.security.master;

    out.security.webauthn.credentialId = String(out.security.webauthn.credentialId || "");
    out.security.webauthn.userId = String(out.security.webauthn.userId || "");
    out.security.webauthn.createdAt = Number(out.security.webauthn.createdAt || 0);

    out.security.master.salt = String(out.security.master.salt || "");
    out.security.master.hash = String(out.security.master.hash || "");
    out.security.master.iterations = Number(out.security.master.iterations || base.security.master.iterations);
    out.security.master.createdAt = Number(out.security.master.createdAt || 0);

    out.version = base.version;

    return out;
  }

  // -------------------------
  // Helpers
  // -------------------------
  function uid() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `id_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
  }

  function normalizeSearch(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  function sectionCount(sectionId) {
    if (sectionId === "prompts") return db.prompts.items.length;
    if (sectionId === "clients") return db.clients.length;
    if (sectionId === "income") return (db.clients || []).filter((c) => Boolean(c?.ativo)).length;
    if (sectionId === "programs") return db.programs.length;
    if (sectionId === "projects") return db.projects.length;
    if (sectionId === "tools") return db.tools.length;
    if (sectionId === "ideas") return db.ideas.length;
    if (sectionId === "vault") return db.vault.length;
    if (sectionId === "passwords") return (db.passwords || []).length;
    return 0;
  }

  function collectTagsForSection(sectionId) {
    const set = new Set();
    const add = (arr) => (arr || []).forEach((t) => set.add(String(t)));

    if (sectionId === "prompts") db.prompts.items.forEach((p) => add(p.tags));
    if (sectionId === "clients") db.clients.forEach((c) => add(c.tags));
    if (sectionId === "income") db.income.forEach((i) => add(i.tags));
    if (sectionId === "programs") db.programs.forEach((p) => add(p.tags));
    if (sectionId === "projects") db.projects.forEach((p) => add(p.tags));
    if (sectionId === "tools") db.tools.forEach((t) => add(t.tags));
    if (sectionId === "ideas") db.ideas.forEach((i) => add(i.tags));
    if (sectionId === "vault") db.vault.forEach((v) => add(v.tags));

    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }

  function globalSearch(query, limit = 8) {
    const q = normalizeSearch(query);
    const results = [];

    const push = (sectionId, itemId, title, detail) => {
      const hay = normalizeSearch(`${title} ${detail}`);
      if (!hay.includes(q)) return;
      results.push({ sectionId, itemId, title, detail });
    };

    db.prompts.items.forEach((p) =>
      push("prompts", p.id, p.title, `${p.folder} ${(p.tags || []).join(" ")} ${p.description} ${p.text}`),
    );
    db.clients.forEach((c) => {
      const s = c.social || {};
      const fixedEmails = [
        s.instagram?.email || "",
        s.youtube?.email || "",
        s.tiktok?.email || "",
        s.twitter?.email || "",
      ]
        .filter(Boolean)
        .join(" ");

      const otherText = (s.others || []).map((o) => `${o.platform} ${o.email} ${o.link} ${o.notes}`).join(" ");
      push("clients", c.id, c.name, `${c.company} ${c.notes} ${(c.tags || []).join(" ")} ${fixedEmails} ${otherText}`);
    });
    db.income.forEach((i) =>
      push(
        "income",
        i.id,
        i.clientName || "Renda",
        `${i.amount} ${i.hours} ${i.hourlyRate} ${i.paidAt} ${i.notes} ${(i.tags || []).join(" ")}`,
      ),
    );
    db.programs.forEach((p) =>
      push("programs", p.id, p.name, `${p.description} ${p.link} ${p.notes} ${(p.tags || []).join(" ")}`),
    );
    db.projects.forEach((p) =>
      push(
        "projects",
        p.id,
        p.name,
        `${p.clientName} ${p.status} ${p.description} ${(p.tags || []).join(" ")} ${(p.resources || []).join(" ")}`,
      ),
    );
    db.tools.forEach((t) => push("tools", t.id, t.name, `${t.category} ${t.description} ${(t.tags || []).join(" ")} ${t.link}`));
    db.ideas.forEach((i) => push("ideas", i.id, i.title || "Ideia", `${i.category} ${i.date} ${i.description} ${(i.tags || []).join(" ")}`));
    db.vault.forEach((v) => push("vault", v.id, v.platform, `${v.email} ${v.link} ${v.notes} ${(v.tags || []).join(" ")}`));

    results.sort((a, b) => scoreResult(b, q) - scoreResult(a, q));
    return results.slice(0, limit);
  }

  function scoreResult(r, q) {
    const t = normalizeSearch(r.title);
    const d = normalizeSearch(r.detail);
    let score = 0;
    if (t.startsWith(q)) score += 8;
    if (t.includes(q)) score += 5;
    if (d.includes(q)) score += 2;
    return score;
  }

  function renderSearchDropdown(results) {
    if (results.length === 0) {
      el.searchResults.hidden = false;
      el.searchResults.innerHTML = `
        <div class="search__item" style="cursor: default;">
          <div>
            <div class="search__title">Nenhum resultado</div>
            <div class="search__meta">Tente outro termo.</div>
          </div>
        </div>
      `;
      return;
    }

    el.searchResults.hidden = false;
    el.searchResults.innerHTML = results
      .map((r) => {
        const sectionLabel = getSections().find((s) => s.id === r.sectionId)?.label || r.sectionId;
        return `
          <div class="search__item" data-action="jumpTo" data-section="${escapeAttr(r.sectionId)}" data-id="${escapeAttr(
          r.itemId,
        )}">
            <div>
              <div class="search__title">${escapeHTML(r.title)}</div>
              <div class="search__meta">${escapeHTML(snippet(r.detail, 90))}</div>
            </div>
            <div class="search__pill">${escapeHTML(sectionLabel)}</div>
          </div>
        `;
      })
      .join("");

  }

  function uniqueStrings(arr) {
    return Array.from(new Set((arr || []).map((s) => String(s || "").trim()).filter(Boolean)));
  }

  function escapeHTML(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function escapeAttr(str) {
    return escapeHTML(str).replaceAll("\n", " ").replaceAll("\r", " ");
  }

  // -------------------------
  // getSections() (referência dinâmica ao usuário logado)
  // -------------------------
  function getSections() {
    return sections;
  }

  // -------------------------
  // Seções
  // -------------------------
  function renderPrompts() {
    const folder = uiState.filters.promptFolder;
    const tag = uiState.filters.tag;

    let items = [...db.prompts.items];
    if (folder) items = items.filter((p) => p.folder === folder);
    if (tag) items = items.filter((p) => (p.tags || []).includes(tag));

    items.sort((a, b) => byDateDesc(a, b));

    if (items.length === 0) return emptyState('Sem prompts aqui ainda.', 'Clique em "Adicionar Prompt" para criar o seu primeiro.');

    return `<div class="grid">${items.map((p) => promptCard(p)).join("")}</div>`;
  }

  function promptCard(p) {
    const desc = p.description || snippet(p.text, 140);
    return `
      <article class="card" data-action="view" data-section="prompts" data-id="${escapeAttr(p.id)}" title="Abrir prompt">
        <h3 class="card__title">${escapeHTML(p.title)}</h3>
        <div class="card__meta">
          <span class="chip chip--primary">${escapeHTML(p.folder)}</span>
          ${renderTags(p.tags)}
        </div>
        <div class="card__footer">
          <span class="card__small">${escapeHTML(snippet(desc, 80))}</span>
          <span class="chips">
            <button class="btn" type="button" data-action="view" data-section="prompts" data-id="${escapeAttr(p.id)}">Ver</button>
            <button class="btn" type="button" data-action="copyPrompt" data-section="prompts" data-id="${escapeAttr(p.id)}">Copiar</button>
            <button class="btn" type="button" data-action="edit" data-section="prompts" data-id="${escapeAttr(p.id)}">Editar</button>
            <button class="btn btn--danger" type="button" data-action="delete" data-section="prompts" data-id="${escapeAttr(p.id)}">Excluir</button>
          </span>
        </div>
      </article>
    `;
  }

  function openPromptView(id) {
    const p = db.prompts.items.find((x) => x.id === id);
    if (!p) return;

    openModal({
      title: p.title,
      subtitle: `Pasta: ${p.folder}${p.tags?.length ? ` • Tags: ${p.tags.map((t) => `#${t}`).join(" ")}` : ""}`,
      body: `
        ${p.description ? `<div class="muted" style="margin-bottom: 10px;">${escapeHTML(p.description)}</div>` : ""}
        <div class="pre mono">${escapeHTML(p.text)}</div>
        <div class="form__footer" style="margin-top: 12px;">
          <button class="btn btn--primary" type="button" data-action="copyField" data-payload="${escapeAttr(p.text)}">Copiar</button>
          <button class="btn" type="button" data-action="edit" data-section="prompts" data-id="${escapeAttr(p.id)}">Editar</button>
          <button class="btn btn--danger" type="button" data-action="delete" data-section="prompts" data-id="${escapeAttr(p.id)}">Excluir</button>
        </div>
      `,
    });
  }

  function openPromptForm(existing) {
    const isEdit = Boolean(existing);
    const folders = db.prompts.folders;
    const p = existing || { folder: folders[0] || "Geral", title: "", description: "", text: "", tags: [] };

    openModal({
      title: isEdit ? "Editar Prompt" : "Adicionar Prompt",
      subtitle: "Organize por pasta, tags e copie rápido.",
      body: `
        <form class="form" id="promptForm">
          <div class="row">
            <div class="field">
              <label for="promptFolder">Pasta</label>
              <select class="input" id="promptFolder" name="folder" required>
                ${folders
                  .map((f) => `<option value="${escapeAttr(f)}" ${f === p.folder ? "selected" : ""}>${escapeHTML(f)}</option>`)
                  .join("")}
                <option value="__new__">+ Nova pasta…</option>
              </select>
            </div>
            <div class="field" id="newFolderWrap" style="display:none;">
              <label for="newFolder">Nova pasta</label>
              <input class="input" id="newFolder" name="newFolder" type="text" placeholder="Ex: Copywriting" />
            </div>
          </div>
          <div class="field">
            <label for="promptTitle">Título</label>
            <input class="input" id="promptTitle" name="title" type="text" required value="${escapeAttr(p.title)}" placeholder="Ex: Melhorar foto 8K cinematográfica" />
          </div>
          <div class="field">
            <label for="promptDesc">Pequena descrição</label>
            <input class="input" id="promptDesc" name="description" type="text" value="${escapeAttr(p.description || "")}" placeholder="Ex: Melhora a foto com look cinematográfico e mais detalhes" />
          </div>
          <div class="field">
            <label for="promptText">Prompt completo</label>
            <textarea class="textarea" id="promptText" name="text" required placeholder="Cole aqui o prompt completo…">${escapeHTML(p.text)}</textarea>
          </div>
          <div class="field">
            <label for="promptTags">Tags (opcional)</label>
            <input class="input" id="promptTags" name="tags" type="text" value="${escapeAttr((p.tags || []).join(", "))}" placeholder="Ex: imagem, 8k, cinematic (separe por vírgula)" />
          </div>
          <div class="form__footer">
            <button class="btn btn--ghost" type="button" data-action="closeModal">Cancelar</button>
            <button class="btn btn--primary" type="submit">${isEdit ? "Salvar" : "Adicionar"}</button>
          </div>
        </form>
      `,
      onMount(modalEl) {
        const form = $("#promptForm", modalEl);
        const folderSel = $("#promptFolder", modalEl);
        const newWrap = $("#newFolderWrap", modalEl);
        const newFolder = $("#newFolder", modalEl);

        folderSel.addEventListener("change", () => {
          const isNew = folderSel.value === "__new__";
          newWrap.style.display = isNew ? "" : "none";
          if (isNew) newFolder.focus();
        });

        form.addEventListener("submit", (e) => {
          e.preventDefault();
          const fd = new FormData(form);
          let folder = String(fd.get("folder") || "").trim();
          const title = String(fd.get("title") || "").trim();
          const description = String(fd.get("description") || "").trim();
          const text = String(fd.get("text") || "").trim();
          const tags = parseTags(String(fd.get("tags") || ""));

          if (folder === "__new__") {
            const nf = String(fd.get("newFolder") || "").trim();
            if (!nf) return toast("Informe o nome da nova pasta", "danger");
            folder = nf;
            if (!db.prompts.folders.includes(nf)) db.prompts.folders.push(nf);
          }

          if (!folder || !title || !text) return toast("Preencha os campos obrigatórios", "danger");

          if (isEdit) {
            const idx = db.prompts.items.findIndex((x) => x.id === existing.id);
            if (idx >= 0) {
              db.prompts.items[idx] = { ...db.prompts.items[idx], folder, title, description, text, tags, updatedAt: Date.now() };
            }
          } else {
            db.prompts.items.push({ id: uid(), folder, title, description, text, tags, createdAt: Date.now(), updatedAt: Date.now() });
          }

          saveDB();
          closeModal();
          renderSection();
          toast(isEdit ? "Prompt atualizado" : "Prompt adicionado", "success");
        });
      },
    });
  }

  function renderClients() {
    const tag = uiState.filters.tag;
    let items = [...db.clients];
    if (tag) items = items.filter((c) => (c.tags || []).includes(tag));
    items.sort((a, b) => byDateDesc(a, b));

    if (items.length === 0) return emptyState("Sem clientes cadastrados.", "Adicione clientes e guarde redes sociais por cliente.");

    return `<div class="grid">${items.map((c) => clientCard(c)).join("")}</div>`;
  }

  function clientCard(c) {
    const isEdu = activeUserId === "eduarda";

    if (isEdu) {
      const clientTotal = db.income
        .filter((i) => i.clientId === c.id || i.clientName === c.name)
        .reduce((acc, i) => acc + (Number(i.amount) || 0), 0);
      return `
        <article class="card" data-action="view" data-section="clients" data-id="${escapeAttr(c.id)}" title="Abrir aluno">
          <h3 class="card__title">${escapeHTML(c.name)}</h3>
          <div class="card__meta">
            ${c.classDays ? `<span class="chip chip--primary">${escapeHTML(c.classDays)}</span>` : ""}
            ${c.classTime ? `<span class="chip">${escapeHTML(c.classTime)}</span>` : ""}
            ${clientTotal > 0 ? `<span class="chip">${escapeHTML(formatMoney(clientTotal))}</span>` : ""}
            ${renderTags(c.tags)}
          </div>
          <div class="card__footer">
            <span class="card__small">${escapeHTML(c.startDate ? "Início: " + formatDate(c.startDate) : (c.notes ? snippet(c.notes, 60) : "—"))}</span>
            <span class="chips">
              <button class="btn" type="button" data-action="view" data-section="clients" data-id="${escapeAttr(c.id)}">Ver</button>
              <button class="btn btn--primary" type="button" data-action="incomeClient" data-id="${escapeAttr(c.id)}">💰</button>
              <button class="btn" type="button" data-action="edit" data-section="clients" data-id="${escapeAttr(c.id)}">Editar</button>
              <button class="btn btn--danger" type="button" data-action="delete" data-section="clients" data-id="${escapeAttr(c.id)}">Excluir</button>
            </span>
          </div>
        </article>
      `;
    }

    const hasCred = (cred) => Boolean(String(cred?.email || "").trim() || String(cred?.password || "").trim());
    const social = c.social || {};
    const fixed = [
      hasCred(social.instagram) ? "Instagram" : "",
      hasCred(social.youtube) ? "YouTube" : "",
      hasCred(social.tiktok) ? "TikTok" : "",
      hasCred(social.twitter) ? "Twitter/X" : "",
    ].filter(Boolean);
    const otherCount = (social.others || []).length;
    const fixedChips = fixed.slice(0, 2).map((n) => `<span class="chip">${escapeHTML(n)}</span>`).join("");
    const moreChip = fixed.length > 2 ? `<span class="chip">+${fixed.length - 2}</span>` : "";
    return `
      <article class="card" data-action="view" data-section="clients" data-id="${escapeAttr(c.id)}" title="Abrir cliente">
        <h3 class="card__title">${escapeHTML(c.name)}</h3>
        <div class="card__meta">
          ${c.company ? `<span class="chip chip--primary">${escapeHTML(c.company)}</span>` : `<span class="chip chip--primary">Cliente</span>`}
          ${fixedChips}${moreChip}
          ${otherCount ? `<span class="chip">${escapeHTML(otherCount)} outras</span>` : ""}
          ${renderTags(c.tags)}
        </div>
        <div class="card__footer">
          <span class="card__small">${escapeHTML(c.notes ? snippet(c.notes, 70) : "—")}</span>
          <span class="chips">
            <button class="btn" type="button" data-action="edit" data-section="clients" data-id="${escapeAttr(c.id)}">Editar</button>
            <button class="btn btn--danger" type="button" data-action="delete" data-section="clients" data-id="${escapeAttr(c.id)}">Excluir</button>
          </span>
        </div>
      </article>
    `;
  }

  function openClientView(id) {
    const c = db.clients.find((x) => x.id === id);
    if (!c) return;

    openModal({
      title: c.name,
      subtitle: c.company ? c.company : "Cliente",
      body: `
        <div class="tabs" role="tablist" aria-label="Abas do cliente">
          <button class="tab" type="button" role="tab" aria-selected="true" data-action="clientTab" data-tab="details">Detalhes</button>
          <button class="tab" type="button" role="tab" aria-selected="false" data-action="clientTab" data-tab="social">Redes sociais</button>
        </div>
        <div style="height: 12px;"></div>
        <div id="clientTabBody"></div>
      `,
      onMount(modalEl) {
        const tabBody = $("#clientTabBody", modalEl);

        const renderTab = (tabId) => {
          if (tabId === "social") tabBody.innerHTML = renderClientSocialTab(c);
          else tabBody.innerHTML = renderClientDetailsTab(c);
        };

        renderTab("details");

        modalEl.addEventListener("click", (e) => {
          const tabBtn = e.target.closest('[data-action="clientTab"]');
          if (tabBtn) {
            const tabId = tabBtn.dataset.tab;
            $$(".tab", modalEl).forEach((b) => b.setAttribute("aria-selected", b === tabBtn ? "true" : "false"));
            renderTab(tabId);
            return;
          }

          const actionEl = e.target.closest("[data-action]");
          if (!actionEl) return;

          if (actionEl.dataset.action === "addClientSocialOther") return openClientSocialOtherForm(c.id);
          if (actionEl.dataset.action === "editClientSocialOther") return openClientSocialOtherForm(c.id, actionEl.dataset.id);

          if (actionEl.dataset.action === "copyClientSocialPass") {
            const net = String(actionEl.dataset.network || "").trim();
            const pass = c.social?.[net]?.password || "";
            ensureDeviceAuth("copiar senha").then((ok) => {
              if (!ok) return;
              copy(pass);
            });
            return;
          }

          if (actionEl.dataset.action === "copyClientOtherPass") {
            const otherId = actionEl.dataset.id;
            const other = c.social?.others?.find((x) => x.id === otherId);
            ensureDeviceAuth("copiar senha").then((ok) => {
              if (!ok) return;
              copy(other?.password || "");
            });
            return;
          }

          if (actionEl.dataset.action === "toggleReveal") {
            const revealId = actionEl.dataset.id;
            const next = !uiState.revealMap.get(revealId);

            if (next) {
              ensureDeviceAuth("revelar senha").then((ok) => {
                if (!ok) return;
                uiState.revealMap.set(revealId, true);
                if (el.modalRoot.contains(modalEl)) renderTab("social");
              });
              return;
            }

            uiState.revealMap.set(revealId, false);
            renderTab("social");
            return;
          }

          if (actionEl.dataset.action === "deleteClientSocialOther") {
            const accId = actionEl.dataset.id;
            confirmDelete("Excluir rede social?", "Isso remove este registro de rede social do cliente.", () => {
              const client = db.clients.find((x) => x.id === c.id);
              if (!client) return;
              client.social = client.social || {};
              client.social.others = (client.social.others || []).filter((a) => a.id !== accId);
              client.updatedAt = Date.now();
              saveDB({ immediateCloud: true });
              toast("Registro excluído", "success");
              renderTab("social");
              renderNav();
            });
          }
        });
      },
    });
  }

  function renderClientDetailsTab(c) {
    const isEdu = activeUserId === "eduarda";
    return `
      <div class="kv">
        ${kvRow(isEdu ? "Nome do aluno" : "Nome", escapeHTML(c.name))}
        ${isEdu ? `
          ${kvRow("Endereço",      escapeHTML(c.address   || "—"))}
          ${kvRow("Data de início", c.startDate ? escapeHTML(formatDate(c.startDate)) : "—")}
          ${kvRow("Horário da aula", c.classTime ? escapeHTML(c.classTime) : "—")}
          ${kvRow("Dias da semana",  escapeHTML(c.classDays || "—"))}
        ` : `
          ${kvRow("Empresa", escapeHTML(c.company || "—"))}
        `}
        ${kvRow("Observações", c.notes ? `<div class="pre">${escapeHTML(c.notes)}</div>` : "—")}
        ${kvRow("Tags", c.tags?.length ? c.tags.map((t) => `<span class="chip">#${escapeHTML(t)}</span>`).join(" ") : "—")}
      </div>
      <div class="form__footer" style="margin-top: 12px;">
        ${isEdu ? `<button class="btn btn--primary" type="button" data-action="incomeClient" data-id="${escapeAttr(c.id)}">💰 Registrar pagamento</button>` : ""}
        <button class="btn" type="button" data-action="edit" data-section="clients" data-id="${escapeAttr(c.id)}">Editar</button>
      </div>
    `;
  }

  function renderClientSocialTab(c) {
    const social = c.social || {};
    const fixed = [
      { key: "instagram", label: "Instagram" },
      { key: "youtube", label: "YouTube" },
      { key: "tiktok", label: "TikTok" },
      { key: "twitter", label: "Twitter/X" },
    ];

    const others = (social.others || []).slice().sort((a, b) => byDateDesc(a, b));

    return `
      <div class="grid">
        ${fixed.map((n) => renderClientFixedNetworkCard(c, n.key, n.label)).join("")}
      </div>
      <div style="height: 12px;"></div>
      <div class="form__footer" style="justify-content: space-between; margin: 4px 0 10px;">
        <div class="muted" style="font-weight: 700;">Outras redes sociais</div>
        <button class="btn btn--primary" type="button" data-action="addClientSocialOther">➕ Adicionar outra rede</button>
      </div>
      ${
        others.length
          ? `<div class="grid">${others.map((o) => renderClientOtherSocialCard(c, o)).join("")}</div>`
          : emptyState('Sem outras redes cadastradas.', 'Use "Adicionar outra rede" para guardar mais acessos (opcional).')
      }
      <div class="form__footer" style="margin-top: 12px;">
        <button class="btn" type="button" data-action="edit" data-section="clients" data-id="${escapeAttr(c.id)}">Editar cliente</button>
      </div>
    `;
  }

  function renderClientFixedNetworkCard(c, key, label) {
    const cred = c.social?.[key] || { email: "", password: "" };
    const email = String(cred.email || "").trim();
    const password = String(cred.password || "").trim();
    const revealId = `${c.id}:net:${key}`;
    const revealed = uiState.revealMap.get(revealId) === true;

    return `
      <div class="card" style="cursor: default;">
        <h3 class="card__title">${escapeHTML(label)}</h3>
        <div class="kv" style="margin-top: 10px;">
          ${kvRow("Email", email ? withCopy(email) : "—")}
          ${kvRow(
            "Senha",
            password
              ? `
                <span class="mono">${escapeHTML(revealed ? password : mask(password))}</span>
                <button class="btn" type="button" data-action="toggleReveal" data-id="${escapeAttr(revealId)}">${revealed ? "👁 Ocultar" : "👁 Mostrar"}</button>
                <button class="btn" type="button" data-action="copyClientSocialPass" data-network="${escapeAttr(key)}">Copiar</button>
              `
              : "—",
          )}
        </div>
      </div>
    `;
  }

  function renderClientOtherSocialCard(c, o) {
    const revealed = uiState.revealMap.get(o.id) === true;
    return `
      <div class="card" style="cursor: default;">
        <h3 class="card__title">${escapeHTML(o.platform || "Rede social")}</h3>
        <div class="card__meta">
          ${o.link ? `<span class="chip chip--primary">${escapeHTML(trimUrl(o.link))}</span>` : ""}
          ${o.email ? `<span class="chip">Email</span>` : ""}
          ${o.password ? `<span class="chip">Senha</span>` : ""}
        </div>
        <div class="kv" style="margin-top: 10px;">
          ${kvRow("Link", o.link ? withCopy(o.link, "Abrir") : "—")}
          ${kvRow("Email", o.email ? withCopy(o.email) : "—")}
          ${kvRow(
            "Senha",
            o.password
              ? `
                <span class="mono">${escapeHTML(revealed ? o.password : mask(o.password))}</span>
                <button class="btn" type="button" data-action="toggleReveal" data-id="${escapeAttr(o.id)}">${revealed ? "👁 Ocultar" : "👁 Mostrar"}</button>
                <button class="btn" type="button" data-action="copyClientOtherPass" data-id="${escapeAttr(o.id)}">Copiar</button>
              `
              : "—",
          )}
          ${kvRow("Observação", o.notes ? `<div class="pre">${escapeHTML(o.notes)}</div>` : "—")}
        </div>
        <div class="form__footer" style="margin-top: 12px;">
          <button class="btn" type="button" data-action="editClientSocialOther" data-id="${escapeAttr(o.id)}">Editar</button>
          <button class="btn btn--danger" type="button" data-action="deleteClientSocialOther" data-id="${escapeAttr(o.id)}">Excluir</button>
        </div>
      </div>
    `;
  }

  function openClientSocialOtherForm(clientId, otherId) {
    const client = db.clients.find((x) => x.id === clientId);
    if (!client) return;

    client.social = client.social || {};
    client.social.others = client.social.others || [];

    const existing = (client.social.others || []).find((o) => o.id === otherId);
    const isEdit = Boolean(existing);
    const o = existing || { platform: "", link: "", email: "", password: "", notes: "" };

    openModal({
      title: isEdit ? "Editar Rede Social" : "Adicionar Rede Social",
      subtitle: `Cliente: ${client.name}`,
      body: `
        <form class="form" id="clientSocialOtherForm">
          <div class="row">
            <div class="field">
              <label for="otherPlatform">Rede / Plataforma</label>
              <input class="input" id="otherPlatform" name="platform" type="text" required value="${escapeAttr(o.platform || "")}" placeholder="Ex: Pinterest, LinkedIn, Meta Ads" />
            </div>
            <div class="field">
              <label for="otherLink">Link (opcional)</label>
              <input class="input" id="otherLink" name="link" type="url" value="${escapeAttr(o.link || "")}" placeholder="https://…" />
            </div>
          </div>
          <div class="row">
            <div class="field">
              <label for="otherEmail">Email (opcional)</label>
              <input class="input" id="otherEmail" name="email" type="email" value="${escapeAttr(o.email || "")}" />
            </div>
            <div class="field">
              <label for="otherPass">Senha (opcional)</label>
              <input class="input" id="otherPass" name="password" type="password" value="${escapeAttr(o.password || "")}" placeholder="(guardado no navegador)" />
            </div>
          </div>
          <div class="field">
            <label for="otherNotes">Observação</label>
            <textarea class="textarea" id="otherNotes" name="notes" placeholder="2FA, usuário, dicas…">${escapeHTML(o.notes || "")}</textarea>
          </div>
          <div class="form__footer">
            <button class="btn btn--ghost" type="button" data-action="closeModal">Cancelar</button>
            <button class="btn btn--primary" type="submit">${isEdit ? "Salvar" : "Adicionar"}</button>
          </div>
        </form>
      `,
      onMount(modalEl) {
        const form = $("#clientSocialOtherForm", modalEl);
        form.addEventListener("submit", (e) => {
          e.preventDefault();
          const fd = new FormData(form);
          const platform = String(fd.get("platform") || "").trim();
          if (!platform) return toast("Rede / plataforma é obrigatória", "danger");

          const payload = {
            platform,
            link: String(fd.get("link") || "").trim(),
            email: String(fd.get("email") || "").trim(),
            password: String(fd.get("password") || "").trim(),
            notes: String(fd.get("notes") || "").trim(),
            updatedAt: Date.now(),
          };

          const freshClient = db.clients.find((x) => x.id === clientId);
          if (!freshClient) return;
          freshClient.social = freshClient.social || {};
          freshClient.social.others = freshClient.social.others || [];

          if (isEdit) {
            const idx = freshClient.social.others.findIndex((x) => x.id === existing.id);
            if (idx >= 0) freshClient.social.others[idx] = { ...freshClient.social.others[idx], ...payload };
          } else {
            freshClient.social.others.push({ id: uid(), ...payload, createdAt: Date.now() });
          }

          freshClient.updatedAt = Date.now();
          saveDB();
          closeModal();
          toast(isEdit ? "Rede social atualizada" : "Rede social adicionada", "success");

          openClientView(clientId);
          setTimeout(() => {
            const modal = $(".modal", el.modalRoot);
            const tab = modal?.querySelector('[data-action="clientTab"][data-tab="social"]');
            tab?.click();
          }, 0);
        });
      },
    });
  }

  function openClientForm(existing) {
    const isEdit  = Boolean(existing);
    const isEdu   = activeUserId === "eduarda";
    const c = existing || ({
      name: "", company: "", notes: "", tags: [],
      valor: 0, ativo: true,
      address: "", startDate: "", classTime: "", classDays: "",
      social: {
        instagram: { email: "", password: "" },
        youtube: { email: "", password: "" },
        tiktok: { email: "", password: "" },
        twitter: { email: "", password: "" },
        others: [],
      },
    });

    openModal({
      title: isEdit ? (isEdu ? "Editar Aluno" : "Editar Cliente") : (isEdu ? "Adicionar Aluno" : "Adicionar Cliente"),
      subtitle: isEdu ? "Dados do aluno de aulas particulares." : "Cadastro do cliente + redes sociais (opcional).",
      body: `
        <form class="form" id="clientForm">
          <div class="field">
            <label for="clientName">${isEdu ? "Nome do aluno" : "Nome"}</label>
            <input class="input" id="clientName" name="name" type="text" required value="${escapeAttr(c.name)}"
              placeholder="${isEdu ? "Nome completo do aluno" : "Nome do cliente"}" />
          </div>

          <div class="row">
            <div class="field">
              <label for="clientValor">${isEdu ? "Mensalidade (R$)" : "Valor (R$)"}</label>
              <input class="input" id="clientValor" name="valor" type="number" min="0" step="0.01"
                inputmode="decimal" value="${escapeAttr(Number.isFinite(Number(c.valor)) ? Number(c.valor) : (Number(c.mensality) || 0))}" placeholder="Ex: 300" />
            </div>
            <div class="field">
              <label>Status</label>
              <label style="display:flex; align-items:center; gap:10px; user-select:none; height:40px;">
                <input type="checkbox" name="ativo" ${c.ativo === false ? "" : "checked"} />
                <span>${c.ativo === false ? "Inativo" : "Ativo"}</span>
              </label>
            </div>
          </div>

          ${isEdu ? `
          <div class="field">
            <label for="clientAddress">Endereço</label>
            <input class="input" id="clientAddress" name="address" type="text"
              value="${escapeAttr(c.address || "")}" placeholder="Rua, número, bairro, cidade" />
          </div>
          <div class="row">
            <div class="field">
              <label for="clientStartDate">Data de início</label>
              <input class="input" id="clientStartDate" name="startDate" type="date"
                value="${escapeAttr(c.startDate || "")}" />
            </div>
            <div class="field">
              <label for="clientClassTime">Horário da aula</label>
              <input class="input" id="clientClassTime" name="classTime" type="time"
                value="${escapeAttr(c.classTime || "")}" placeholder="Ex: 14:00" />
            </div>
          </div>
          <div class="field">
            <label for="clientClassDays">Dias da semana</label>
            <input class="input" id="clientClassDays" name="classDays" type="text"
              value="${escapeAttr(c.classDays || "")}" placeholder="Ex: segunda, quarta e sexta" />
          </div>
          ` : `
          <div class="field">
            <label for="clientCompany">Empresa</label>
            <input class="input" id="clientCompany" name="company" type="text" value="${escapeAttr(c.company || "")}" />
          </div>
          `}

          <div class="field">
            <label for="clientNotes">Observações</label>
            <textarea class="textarea" id="clientNotes" name="notes"
              placeholder="${isEdu ? "Nível do aluno, disciplina, observações…" : "Briefing, contexto, preferências…"}">${escapeHTML(c.notes || "")}</textarea>
          </div>
          <div class="field">
            <label for="clientTags">Tags (opcional)</label>
            <input class="input" id="clientTags" name="tags" type="text"
              value="${escapeAttr((c.tags || []).join(", "))}"
              placeholder="${isEdu ? "Ex: reposição, mensal, online" : "Ex: recorrente, urgência, vip"}" />
          </div>

          ${!isEdu ? `
          <div class="card" style="cursor: default;">
            <h3 class="card__title">Redes sociais (opcional)</h3>
            <div class="card__meta"><span class="muted">As senhas ficam salvas localmente no navegador.</span></div>
            <div style="height: 10px;"></div>
            <div class="row">
              <div class="field"><label for="igEmail">Instagram (email)</label><input class="input" id="igEmail" name="igEmail" type="email" value="${escapeAttr(c.social?.instagram?.email || "")}" /></div>
              <div class="field"><label for="igPass">Instagram (senha)</label><input class="input" id="igPass" name="igPass" type="password" value="${escapeAttr(c.social?.instagram?.password || "")}" /></div>
            </div>
            <div class="row">
              <div class="field"><label for="ytEmail">YouTube (email)</label><input class="input" id="ytEmail" name="ytEmail" type="email" value="${escapeAttr(c.social?.youtube?.email || "")}" /></div>
              <div class="field"><label for="ytPass">YouTube (senha)</label><input class="input" id="ytPass" name="ytPass" type="password" value="${escapeAttr(c.social?.youtube?.password || "")}" /></div>
            </div>
            <div class="row">
              <div class="field"><label for="ttEmail">TikTok (email)</label><input class="input" id="ttEmail" name="ttEmail" type="email" value="${escapeAttr(c.social?.tiktok?.email || "")}" /></div>
              <div class="field"><label for="ttPass">TikTok (senha)</label><input class="input" id="ttPass" name="ttPass" type="password" value="${escapeAttr(c.social?.tiktok?.password || "")}" /></div>
            </div>
            <div class="row">
              <div class="field"><label for="xEmail">Twitter/X (email)</label><input class="input" id="xEmail" name="xEmail" type="email" value="${escapeAttr(c.social?.twitter?.email || "")}" /></div>
              <div class="field"><label for="xPass">Twitter/X (senha)</label><input class="input" id="xPass" name="xPass" type="password" value="${escapeAttr(c.social?.twitter?.password || "")}" /></div>
            </div>
          </div>
          ` : ""}

          <div class="form__footer">
            <button class="btn btn--ghost" type="button" data-action="closeModal">Cancelar</button>
            <button class="btn btn--primary" type="submit">${isEdit ? "Salvar" : (isEdu ? "Cadastrar aluno" : "Adicionar")}</button>
          </div>
        </form>
      `,
      onMount(modalEl) {
        const form = $("#clientForm", modalEl);
        form.addEventListener("submit", (e) => {
          e.preventDefault();
          const fd = new FormData(form);
          const name = String(fd.get("name") || "").trim();
          if (!name) return toast("Nome é obrigatório", "danger");
          const toNum = (v) => { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };
          const valor = Math.max(0, toNum(fd.get("valor")));
          const ativo = Boolean(fd.get("ativo"));

          const keepOthers = (existing?.social?.others || c.social?.others || []).slice();

          const payload = isEdu ? {
            name,
            nome: name,
            valor,
            mensality: valor,
            ativo,
            address:    String(fd.get("address")    || "").trim(),
            startDate:  String(fd.get("startDate")  || "").trim(),
            classTime:  String(fd.get("classTime")  || "").trim(),
            classDays:  String(fd.get("classDays")  || "").trim(),
            notes:      String(fd.get("notes")      || "").trim(),
            tags:       parseTags(String(fd.get("tags") || "")),
            company: "", social: { instagram:{email:"",password:""}, youtube:{email:"",password:""}, tiktok:{email:"",password:""}, twitter:{email:"",password:""}, others: keepOthers },
            updatedAt: Date.now(),
          } : {
            name,
            nome: name,
            valor,
            mensality: valor,
            ativo,
            company: String(fd.get("company") || "").trim(),
            notes:   String(fd.get("notes")   || "").trim(),
            tags:    parseTags(String(fd.get("tags") || "")),
            social: {
              instagram: { email: String(fd.get("igEmail") || "").trim(), password: String(fd.get("igPass") || "").trim() },
              youtube:   { email: String(fd.get("ytEmail") || "").trim(), password: String(fd.get("ytPass") || "").trim() },
              tiktok:    { email: String(fd.get("ttEmail") || "").trim(), password: String(fd.get("ttPass") || "").trim() },
              twitter:   { email: String(fd.get("xEmail")  || "").trim(), password: String(fd.get("xPass")  || "").trim() },
              others: keepOthers,
            },
            updatedAt: Date.now(),
          };

          if (isEdit) {
            const idx = db.clients.findIndex((x) => x.id === existing.id);
            if (idx >= 0) db.clients[idx] = { ...db.clients[idx], ...payload };
          } else {
            db.clients.push({ id: uid(), ...payload, createdAt: Date.now(), accesses: [] });
          }

          saveDB();
          closeModal();
          const backTo = String(uiState.afterClientSaveSection || "");
          uiState.afterClientSaveSection = "";
          if (backTo) navigate(backTo);
          else renderSection();
          toast(isEdit ? (isEdu ? "Aluno atualizado" : "Cliente atualizado") : (isEdu ? "Aluno cadastrado" : "Cliente adicionado"), "success");
        });
      },
    });
  }

  function renderIncome() {
    const financePanel = renderFinanceiroPanel();
    return financePanel + renderIncomeFromClients();
  }

  // ── João: controle financeiro por cliente, mesmo modelo da Eduarda ──
  function clientValor(c) {
    const raw = Number.isFinite(Number(c?.valor)) ? Number(c.valor) : Number(c?.mensality);
    const v = Number(raw);
    return Number.isFinite(v) ? Math.max(0, v) : 0;
  }

  function calcRendaClientes() {
    return (db.clients || [])
      .filter((c) => Boolean(c?.ativo))
      .reduce((acc, c) => acc + clientValor(c), 0);
  }

  function renderIncomeFromClients() {
    const clients = (db.clients || []).slice().sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"));
    const ativos = clients.filter((c) => Boolean(c?.ativo));
    const inativos = clients.filter((c) => !Boolean(c?.ativo));
    const total = ativos.reduce((acc, c) => acc + clientValor(c), 0);

    const stats = `
      <div class="stats">
        <div class="stat">
          <div class="stat__label">Renda do mês (clientes ativos)</div>
          <div class="stat__value">${escapeHTML(formatMoney(total))}</div>
        </div>
        <div class="stat">
          <div class="stat__label">Clientes ativos</div>
          <div class="stat__value">${escapeHTML(String(ativos.length))}</div>
        </div>
        <div class="stat">
          <div class="stat__label">Clientes inativos</div>
          <div class="stat__value">${escapeHTML(String(inativos.length))}</div>
        </div>
      </div>
    `;

    const cards = clients.length
      ? `<div class="grid income-cards">
          ${clients.map((c) => {
            const ativo = Boolean(c?.ativo);
            const valor = clientValor(c);
            const statusBadge = ativo
              ? `<span class="chip" style="background:var(--success-bg,#dcfce7);color:var(--success,#16a34a);font-weight:700;">Ativo</span>`
              : `<span class="chip" style="background:var(--warning-bg,#fef9c3);color:var(--warning-text,#a16207);font-weight:700;">Inativo</span>`;

            return `
              <article class="card income-client-card" style="cursor:default;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                  <h3 class="card__title" style="margin:0;">${escapeHTML(c.name || "Sem nome")}</h3>
                  ${statusBadge}
                </div>
                <div class="card__meta" style="margin-top:8px;">
                  <span class="chip chip--primary">${escapeHTML(formatMoney(valor))}</span>
                </div>
                <div class="card__footer" style="margin-top:10px;">
                  <span></span>
                  <span class="chips">
                    <button class="btn" type="button" data-action="toggleClientActive" data-id="${escapeAttr(c.id)}">${ativo ? "Desativar" : "Ativar"}</button>
                    <button class="btn" type="button" data-action="editClientFromIncome" data-id="${escapeAttr(c.id)}">Editar</button>
                    <button class="btn btn--danger" type="button" data-action="deleteClientFromIncome" data-id="${escapeAttr(c.id)}">Excluir</button>
                  </span>
                </div>
              </article>
            `;
          }).join("")}
        </div>`
      : emptyState("Nenhum cliente cadastrado.", "Adicione um cliente para a renda aparecer automaticamente.");

    return `
      ${stats}
      ${cards}
      <button class="fab" type="button" data-action="incomeAddClient" aria-label="Adicionar cliente">+ Cliente</button>
    `;
  }

  function getFinanceiro() {
    if (!db.financeiro || typeof db.financeiro !== "object") db.financeiro = defaultFinanceiro();
    db.financeiro = normalizeFinanceiro(db.financeiro);
    return db.financeiro;
  }

  function calcFinanceiroTotals(fin) {
    const metaEconomia = Number(fin?.metaEconomia || 0);
    const gastosPagos = Array.isArray(fin?.gastos)
      ? fin.gastos.reduce((acc, g) => acc + (g?.pago ? (Number(g?.valor) || 0) : 0), 0)
      : 0;

    const totalRecebido = calcRendaClientes();
    const totalGasto = Number.isFinite(gastosPagos) ? gastosPagos : 0;
    const saldoAtual = totalRecebido - totalGasto;
    const valorDisponivel = totalRecebido - (Number.isFinite(metaEconomia) ? metaEconomia : 0) - totalGasto;

    return { totalRecebido, totalGasto, saldoAtual, valorDisponivel };
  }

  function renderFinanceiroPanel() {
    const fin = getFinanceiro();
    const totals = calcFinanceiroTotals(fin);

    const spendingLimit = Math.max(0, totals.totalRecebido - (Number(fin.metaEconomia) || 0));
    const usedPct = spendingLimit > 0 ? Math.min(100, Math.max(0, (totals.totalGasto / spendingLimit) * 100)) : 0;
    const overBudget = spendingLimit > 0 ? totals.totalGasto > spendingLimit : totals.totalGasto > 0;

    const gastos = Array.isArray(fin.gastos) ? fin.gastos.slice() : [];
    gastos.sort((a, b) => (a.pago === b.pago ? String(a.nome).localeCompare(String(b.nome), "pt-BR") : a.pago ? 1 : -1));

    const gastosHtml = gastos.length
      ? `
        <div class="finance__list">
          ${gastos.map((g) => `
            <div class="finance__row">
              <label class="finance__check">
                <input type="checkbox" ${g.pago ? "checked" : ""} data-action="financeTogglePaid" data-id="${escapeAttr(g.id)}" />
                <span class="finance__name">${escapeHTML(g.nome)}</span>
              </label>
              <span class="chip ${g.tipo === "fixo" ? "chip--primary" : ""}">${escapeHTML(g.tipo)}</span>
              <span class="mono finance__value">${escapeHTML(formatMoney(g.valor))}</span>
              <span class="chips">
                <button class="btn" type="button" data-action="financeEditExpense" data-id="${escapeAttr(g.id)}">Editar</button>
                <button class="btn btn--danger" type="button" data-action="financeDeleteExpense" data-id="${escapeAttr(g.id)}">Excluir</button>
              </span>
            </div>
          `).join("")}
        </div>
      `
      : `<div class="muted" style="padding:8px 0; font-size:13px;">Nenhum gasto cadastrado ainda.</div>`;

    return `
      <div class="card finance" style="cursor:default; margin-bottom:16px;">
        <div class="finance__head">
          <div>
            <div class="finance__title">Controle financeiro do mes</div>
            <div class="muted" style="font-size:12px;">Mes: ${escapeHTML(formatMonthKey(fin.monthKey || currentMonthKey()))}</div>
          </div>
          <div class="chips">
            <button class="btn" type="button" data-action="financeSettings">Configurar</button>
            <button class="btn" type="button" data-action="financeAddExpense">+ Gasto</button>
          </div>
        </div>

        <div class="stats" style="margin-top:12px;">
          <div class="stat">
            <div class="stat__label">Renda do mes (clientes ativos)</div>
            <div class="stat__value">${escapeHTML(formatMoney(totals.totalRecebido))}</div>
          </div>
          <div class="stat">
            <div class="stat__label">Total gasto (pagos)</div>
            <div class="stat__value" style="color:var(--warning,#f59e0b)">${escapeHTML(formatMoney(totals.totalGasto))}</div>
          </div>
          <div class="stat">
            <div class="stat__label">Saldo atual</div>
            <div class="stat__value">${escapeHTML(formatMoney(totals.saldoAtual))}</div>
            ${fin.metaEconomia ? `<div class="stat__sub">Meta economia: ${escapeHTML(formatMoney(fin.metaEconomia))}</div>` : ""}
          </div>
          <div class="stat">
            <div class="stat__label">Quanto ainda pode gastar</div>
            <div class="stat__value" style="color:${totals.valorDisponivel >= 0 ? "var(--success,#22c55e)" : "var(--danger,#ef4444)"}">
              ${escapeHTML(formatMoney(totals.valorDisponivel))}
            </div>
          </div>
        </div>

        <div class="finance__progress">
          <div class="finance__progress-head">
            <span class="muted" style="font-size:12px;">
              Limite de gastos: ${escapeHTML(formatMoney(spendingLimit))} • Usado: ${escapeHTML(formatMoney(totals.totalGasto))}
            </span>
            <span class="mono" style="font-size:12px;">${escapeHTML(formatNumber(usedPct))}%</span>
          </div>
          <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${escapeAttr(usedPct)}">
            <div class="progress__bar ${overBudget ? "is-over" : ""}" style="width:${escapeAttr(usedPct)}%"></div>
          </div>
        </div>

        <div class="finance__section">
          <div class="finance__section-title">Gastos (fixos e variaveis)</div>
          ${gastosHtml}
        </div>
      </div>
    `;
  }

  function openFinanceSettingsModal() {
    const fin = getFinanceiro();
    openModal({
      title: "Configurar financeiro",
      subtitle: "A renda do mes vem automaticamente dos clientes ativos. Aqui voce define apenas sua meta de economia.",
      body: `
        <form class="form" id="financeSettingsForm">
          <div class="field">
            <label for="finMeta">Meta de economia</label>
            <input class="input" id="finMeta" name="metaEconomia" type="number" min="0" step="0.01"
              inputmode="decimal" value="${escapeAttr(fin.metaEconomia || 0)}" placeholder="Ex: 800" />
          </div>
          <div class="form__footer">
            <button class="btn btn--ghost" type="button" data-action="closeModal">Cancelar</button>
            <button class="btn btn--primary" type="submit">Salvar</button>
          </div>
        </form>
      `,
      onMount(modalEl) {
        const form = $("#financeSettingsForm", modalEl);
        const toNum = (v) => {
          const n = Number(String(v ?? "").replace(",", "."));
          return Number.isFinite(n) ? n : 0;
        };
        form.addEventListener("submit", (e) => {
          e.preventDefault();
          const fd = new FormData(form);
          fin.metaEconomia = Math.max(0, toNum(fd.get("metaEconomia")));
          db.financeiro = fin;
          saveDB();
          closeModal();
          renderSection();
          toast("Configuracoes salvas", "success");
        });
      },
    });
  }

  function openFinanceExpenseModal(existing) {
    const fin = getFinanceiro();
    const isEdit = Boolean(existing);
    const g = existing || { id: "", nome: "", valor: "", tipo: "variavel", pago: false };

    openModal({
      title: isEdit ? "Editar gasto" : "Adicionar gasto",
      subtitle: "Cadastre gasto fixo ou variavel e marque como pago quando quitar.",
      body: `
        <form class="form" id="financeExpenseForm">
          <div class="field">
            <label for="finNome">Nome</label>
            <input class="input" id="finNome" name="nome" type="text" required value="${escapeAttr(g.nome || "")}" placeholder="Ex: Internet, Mercado, Aluguel..." />
          </div>
          <div class="row">
            <div class="field">
              <label for="finValor">Valor (R$)</label>
              <input class="input" id="finValor" name="valor" type="number" min="0" step="0.01"
                inputmode="decimal" required value="${escapeAttr(g.valor)}" placeholder="Ex: 250" />
            </div>
            <div class="field">
              <label for="finTipo">Tipo</label>
              <select class="select" id="finTipo" name="tipo">
                <option value="fixo" ${g.tipo === "fixo" ? "selected" : ""}>fixo</option>
                <option value="variavel" ${g.tipo !== "fixo" ? "selected" : ""}>variavel</option>
              </select>
            </div>
          </div>
          <div class="field" style="margin-top:2px;">
            <label style="display:flex; align-items:center; gap:10px; user-select:none;">
              <input type="checkbox" name="pago" ${g.pago ? "checked" : ""} />
              <span>Ja esta pago</span>
            </label>
          </div>
          <div class="form__footer">
            <button class="btn btn--ghost" type="button" data-action="closeModal">Cancelar</button>
            <button class="btn btn--primary" type="submit">${isEdit ? "Salvar" : "Adicionar"}</button>
          </div>
        </form>
      `,
      onMount(modalEl) {
        const form = $("#financeExpenseForm", modalEl);
        const toNum = (v) => {
          const n = Number(String(v ?? "").replace(",", "."));
          return Number.isFinite(n) ? n : 0;
        };
        form.addEventListener("submit", (e) => {
          e.preventDefault();
          const fd = new FormData(form);
          const nome = String(fd.get("nome") || "").trim();
          const valor = Math.max(0, toNum(fd.get("valor")));
          const tipo = String(fd.get("tipo") || "variavel") === "fixo" ? "fixo" : "variavel";
          const pago = Boolean(fd.get("pago"));

          if (!nome) return toast("Nome e obrigatorio", "danger");
          if (!(valor > 0)) return toast("Informe um valor valido", "danger");

          const payload = { nome, valor, tipo, pago };
          fin.gastos = Array.isArray(fin.gastos) ? fin.gastos : [];

          if (isEdit) {
            const idx = fin.gastos.findIndex((x) => x.id === existing.id);
            if (idx >= 0) fin.gastos[idx] = { ...fin.gastos[idx], ...payload };
          } else {
            fin.gastos.push({ id: uid(), ...payload });
          }

          db.financeiro = fin;
          saveDB();
          closeModal();
          renderSection();
          toast(isEdit ? "Gasto atualizado" : "Gasto adicionado", "success");
        });
      },
    });
  }

  function renderIncomeJoao() {
    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthFilter = uiState.filters.incomeMonth || currentMonthKey;

    const clients = db.clients.slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

    const sum = (list, pick) => list.reduce((acc, x) => { const n = Number(pick(x)); return acc + (Number.isFinite(n) ? n : 0); }, 0);

    const getMonthEntry = (client) =>
      db.income.find(
        (i) => (i.clientId === client.id || i.clientName === client.name) &&
               String(i.paidAt || "").slice(0, 7) === monthFilter
      ) || null;

    // ── Totais ──
    const monthEntries = db.income.filter((i) => String(i.paidAt || "").slice(0, 7) === monthFilter);
    const paidTotal    = sum(monthEntries.filter((i) => i.status === "paid"),    (i) => i.amount);
    const pendingTotal = sum(monthEntries.filter((i) => i.status !== "paid"),    (i) => i.amount);
    const extrasMonth  = sum((db.incomeExtras || []).filter((e) => (e.month || "").slice(0, 7) === monthFilter), (e) => e.amount);
    const totalMonth   = paidTotal + extrasMonth;
    const totalAll     = sum(db.income.filter((i) => i.status === "paid"), (i) => i.amount)
                       + sum(db.incomeExtras || [], (e) => e.amount);

    const stats = `
      <div class="stats">
        <div class="stat">
          <div class="stat__label">✅ Recebido em ${escapeHTML(formatMonthKey(monthFilter))}</div>
          <div class="stat__value">${escapeHTML(formatMoney(totalMonth))}</div>
        </div>
        <div class="stat">
          <div class="stat__label">⏳ Pendente no mês</div>
          <div class="stat__value" style="color:var(--warning,#f59e0b)">${escapeHTML(formatMoney(pendingTotal))}</div>
        </div>
        <div class="stat">
          <div class="stat__label">💰 Total geral recebido</div>
          <div class="stat__value">${escapeHTML(formatMoney(totalAll))}</div>
        </div>
      </div>
    `;

    // ── Cards de clientes com status de pagamento ──
    const clientCards = clients.length === 0
      ? emptyState("Nenhum cliente cadastrado.", "Cadastre clientes para controlar pagamentos por aqui.")
      : clients.map((c) => {
          const entry  = getMonthEntry(c);
          const isPaid = entry?.status === "paid";
          const amount = entry?.amount || c.mensality || 0;
          const paidAt = entry?.paidAt || "";

          const statusBadge = isPaid
            ? `<span class="chip" style="background:var(--success-bg,#dcfce7);color:var(--success,#16a34a);font-weight:700;">✅ Pago</span>`
            : `<span class="chip" style="background:var(--warning-bg,#fef9c3);color:var(--warning-text,#a16207);font-weight:700;">⏳ Pendente</span>`;

          return `
            <article class="card income-student-card ${isPaid ? "income-paid" : "income-pending"}" style="cursor:default;">
              <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                <h3 class="card__title" style="margin:0;">${escapeHTML(c.name)}</h3>
                ${statusBadge}
              </div>
              <div class="card__meta" style="margin-top:8px;">
                ${amount > 0 ? `<span class="chip chip--primary">${escapeHTML(formatMoney(amount))}</span>` : `<span class="chip">Sem valor definido</span>`}
                ${paidAt ? `<span class="chip">Pago em ${escapeHTML(formatDate(paidAt))}</span>` : ""}
                ${c.company ? `<span class="chip">${escapeHTML(c.company)}</span>` : ""}
              </div>
              <div class="card__footer" style="margin-top:10px;">
                <span></span>
                <span class="chips">
                  ${!isPaid ? `
                    <button class="btn btn--primary" type="button"
                      data-action="markPaidEdu" data-clientid="${escapeAttr(c.id)}" data-month="${escapeAttr(monthFilter)}">
                      ✅ Marcar como Pago
                    </button>` : `
                    <button class="btn" type="button"
                      data-action="markPendingEdu" data-clientid="${escapeAttr(c.id)}" data-month="${escapeAttr(monthFilter)}">
                      ↩️ Desfazer
                    </button>`}
                  <button class="btn" type="button" data-action="incomeClient" data-id="${escapeAttr(c.id)}">
                    Detalhes
                  </button>
                  <button class="btn" type="button" data-action="setMensality" data-clientid="${escapeAttr(c.id)}">
                    💲
                  </button>
                </span>
              </div>
            </article>
          `;
        }).join("");

    // ── Extras do mês ──
    const extrasThisMonth = (db.incomeExtras || []).filter((e) => (e.month || "").slice(0, 7) === monthFilter);
    const extrasHtml = `
      <div style="margin:22px 0 8px; display:flex; justify-content:space-between; align-items:center;">
        <div style="font-weight:700; color:var(--text-muted);">💵 Outros valores recebidos no mês</div>
        <button class="btn btn--primary" type="button" data-action="addIncomeExtra">➕ Adicionar</button>
      </div>
      ${extrasThisMonth.length ? `<div class="grid">
        ${extrasThisMonth.map((e) => `
          <article class="card" style="cursor:default;">
            <h3 class="card__title">${escapeHTML(e.description || "Renda extra")}</h3>
            <div class="card__meta"><span class="chip chip--primary">${escapeHTML(formatMoney(e.amount))}</span>${e.notes ? `<span class="chip">${escapeHTML(snippet(e.notes,40))}</span>` : ""}</div>
            <div class="card__footer"><span></span><span class="chips">
              <button class="btn" type="button" data-action="editIncomeExtra" data-id="${escapeAttr(e.id)}">Editar</button>
              <button class="btn btn--danger" type="button" data-action="deleteIncomeExtra" data-id="${escapeAttr(e.id)}">Excluir</button>
            </span></div>
          </article>
        `).join("")}
      </div>` : `<div class="muted" style="font-size:13px;padding:8px 0;">Nenhum valor extra neste mês.</div>`}
    `;

    return `${stats}<div class="grid" style="margin-top:16px;">${clientCards}</div>${extrasHtml}`;
  }

  // ── Eduarda: controle mensal de mensalidades por aluno ──
  function renderIncomeEdu() {
    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthFilter = uiState.filters.incomeMonth || currentMonthKey;

    const clients = db.clients.slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

    if (clients.length === 0) {
      return emptyState("Nenhum aluno cadastrado.", "Cadastre alunos em Aulas (Clientes) para usar o controle de renda.");
    }

    // Para cada aluno, pegar ou criar entrada de renda no mês filtrado
    const getOrCreateMonthEntry = (client) => {
      const existing = db.income.find(
        (i) => (i.clientId === client.id || i.clientName === client.name) &&
               String(i.paidAt || i.month || "").slice(0, 7) === monthFilter
      );
      return existing || null;
    };

    const sum = (list, pick) => list.reduce((acc, x) => { const n = Number(pick(x)); return acc + (Number.isFinite(n) ? n : 0); }, 0);

    // Calcular totais do mês
    const monthEntries = db.income.filter((i) => String(i.paidAt || "").slice(0, 7) === monthFilter);
    const paidTotal = sum(monthEntries.filter((i) => i.status === "paid"), (i) => i.amount || i.mensality || 0);
    const pendingClients = clients.filter((c) => {
      const e = getOrCreateMonthEntry(c);
      return !e || e.status !== "paid";
    });
    const pendingTotal = sum(pendingClients, (c) => {
      const e = getOrCreateMonthEntry(c);
      return e ? (e.mensality || e.amount || 0) : (c.mensality || 0);
    });
    const extrasMonth = sum(
      (db.incomeExtras || []).filter((e) => (e.month || "").slice(0, 7) === monthFilter),
      (e) => e.amount
    );
    const totalMonth = paidTotal + extrasMonth;

    const stats = `
      <div class="stats">
        <div class="stat">
          <div class="stat__label">✅ Recebido em ${escapeHTML(formatMonthKey(monthFilter))}</div>
          <div class="stat__value">${escapeHTML(formatMoney(totalMonth))}</div>
        </div>
        <div class="stat">
          <div class="stat__label">⏳ Pendente no mês</div>
          <div class="stat__value" style="color:var(--warning,#f59e0b)">${escapeHTML(formatMoney(pendingTotal))}</div>
        </div>
        <div class="stat">
          <div class="stat__label">👥 Alunos</div>
          <div class="stat__value">${clients.length}</div>
        </div>
      </div>
    `;

    // Cards de alunos com status de pagamento
    const clientCards = clients.map((c) => {
      const entry = getOrCreateMonthEntry(c);
      const isPaid = entry?.status === "paid";
      const mensality = entry?.mensality || entry?.amount || c.mensality || 0;
      const paidAt = entry?.paidAt || "";

      const statusBadge = isPaid
        ? `<span class="chip" style="background:var(--success-bg,#dcfce7);color:var(--success,#16a34a);font-weight:700;">✅ Pago</span>`
        : `<span class="chip" style="background:var(--warning-bg,#fef9c3);color:var(--warning-text,#a16207);font-weight:700;">⏳ Pendente</span>`;

      return `
        <article class="card income-student-card ${isPaid ? "income-paid" : "income-pending"}" style="cursor:default;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <h3 class="card__title" style="margin:0;">${escapeHTML(c.name)}</h3>
            ${statusBadge}
          </div>
          <div class="card__meta" style="margin-top:8px;">
            ${mensality > 0 ? `<span class="chip chip--primary">${escapeHTML(formatMoney(mensality))}</span>` : `<span class="chip">Sem valor definido</span>`}
            ${paidAt ? `<span class="chip">Pago em ${escapeHTML(formatDate(paidAt))}</span>` : ""}
            ${c.classDays ? `<span class="chip">${escapeHTML(c.classDays)}</span>` : ""}
          </div>
          <div class="card__footer" style="margin-top:10px;">
            <span></span>
            <span class="chips">
              ${!isPaid ? `
                <button class="btn btn--primary" type="button"
                  data-action="markPaidEdu" data-clientid="${escapeAttr(c.id)}" data-month="${escapeAttr(monthFilter)}">
                  ✅ Marcar como Pago
                </button>` : `
                <button class="btn" type="button"
                  data-action="markPendingEdu" data-clientid="${escapeAttr(c.id)}" data-month="${escapeAttr(monthFilter)}">
                  ↩️ Desfazer
                </button>`}
              <button class="btn" type="button" data-action="incomeClient" data-id="${escapeAttr(c.id)}">
                Detalhes
              </button>
              <button class="btn" type="button" data-action="setMensality" data-clientid="${escapeAttr(c.id)}">
                💲
              </button>
            </span>
          </div>
        </article>
      `;
    }).join("");

    // Extras do mês
    const extrasThisMonth = (db.incomeExtras || []).filter((e) => (e.month || "").slice(0, 7) === monthFilter);
    const extrasHtml = `
      <div style="margin:22px 0 8px; display:flex; justify-content:space-between; align-items:center;">
        <div style="font-weight:700; color:var(--text-muted);">💵 Outros valores recebidos no mês</div>
        <button class="btn btn--primary" type="button" data-action="addIncomeExtra">➕ Adicionar</button>
      </div>
      ${extrasThisMonth.length ? `<div class="grid">
        ${extrasThisMonth.map((e) => `
          <article class="card" style="cursor:default;">
            <h3 class="card__title">${escapeHTML(e.description || "Renda extra")}</h3>
            <div class="card__meta"><span class="chip chip--primary">${escapeHTML(formatMoney(e.amount))}</span>${e.notes ? `<span class="chip">${escapeHTML(snippet(e.notes,40))}</span>` : ""}</div>
            <div class="card__footer"><span></span><span class="chips">
              <button class="btn" type="button" data-action="editIncomeExtra" data-id="${escapeAttr(e.id)}">Editar</button>
              <button class="btn btn--danger" type="button" data-action="deleteIncomeExtra" data-id="${escapeAttr(e.id)}">Excluir</button>
            </span></div>
          </article>
        `).join("")}
      </div>` : `<div class="muted" style="font-size:13px; padding:8px 0;">Nenhum valor extra registrado neste mês.</div>`}
    `;

    return `${stats}<div class="grid" style="margin-top:16px;">${clientCards}</div>${extrasHtml}`;
  }

  function openIncomeClientModal(clientId) {
    const client = db.clients.find((x) => x.id === clientId);
    if (!client) return;

    const entries = db.income
      .filter((i) => i.clientId === clientId || i.clientName === client.name)
      .sort((a, b) => (b.paidAt || "").localeCompare(a.paidAt || ""));

    const total = entries.reduce((acc, i) => acc + (Number(i.amount) || 0), 0);

    const entriesList = entries.length
      ? entries.map((e) => `
          <div class="kv__row" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <div>
              <div style="font-weight:700;">${escapeHTML(formatMoney(e.amount))}</div>
              <div class="muted" style="font-size:12px;">${escapeHTML(e.paidAt ? formatDate(e.paidAt) : "—")}${e.notes ? " · " + escapeHTML(snippet(e.notes, 50)) : ""}</div>
            </div>
            <span class="chips">
              <button class="btn" type="button" data-action="editIncomeDirect" data-id="${escapeAttr(e.id)}">Editar</button>
              <button class="btn btn--danger" type="button" data-action="deleteIncomeDirect" data-id="${escapeAttr(e.id)}">Excluir</button>
            </span>
          </div>
        `).join("")
      : `<div class="muted" style="padding:10px 0;">Nenhum pagamento registrado ainda.</div>`;

    openModal({
      title: client.name,
      subtitle: `Total recebido: ${formatMoney(total)}`,
      body: `
        <div style="margin-bottom:14px;">
          <button class="btn btn--primary" type="button" id="addIncomeForClient">➕ Registrar pagamento</button>
        </div>
        <div class="kv">${entriesList}</div>
      `,
      onMount(modalEl) {
        modalEl.querySelector("#addIncomeForClient").addEventListener("click", () => {
          closeModal();
          openIncomeFormForClient(client);
        });

        modalEl.addEventListener("click", (e) => {
          const editBtn = e.target.closest('[data-action="editIncomeDirect"]');
          if (editBtn) {
            const entry = db.income.find((x) => x.id === editBtn.dataset.id);
            if (!entry) return;
            closeModal();
            openIncomeFormForClient(client, entry);
            return;
          }
          const delBtn = e.target.closest('[data-action="deleteIncomeDirect"]');
          if (delBtn) {
            confirmDelete("Excluir pagamento?", "Essa ação não pode ser desfeita.", () => {
              db.income = db.income.filter((x) => x.id !== delBtn.dataset.id);
              saveDB({ immediateCloud: true });
              renderSection();
              openIncomeClientModal(clientId);
            });
          }
        });
      },
    });
  }

  function openIncomeFormForClient(client, existing) {
    const isEdit = Boolean(existing);
    const now = new Date().toISOString().slice(0, 10);
    const i = existing || { clientId: client.id, clientName: client.name, amount: "", paidAt: now, notes: "" };

    openModal({
      title: isEdit ? "Editar Pagamento" : "Registrar Pagamento",
      subtitle: `Aluno: ${client.name}`,
      body: `
        <form class="form" id="incomeClientForm">
          <div class="field">
            <label for="icAmount">Valor recebido</label>
            <input class="input" id="icAmount" name="amount" type="number" min="0" step="0.01"
              inputmode="decimal" required value="${escapeAttr(i.amount)}" placeholder="Ex: 200" />
          </div>
          <div class="field">
            <label for="icDate">Data do pagamento</label>
            <input class="input" id="icDate" name="paidAt" type="date" required value="${escapeAttr(i.paidAt || now)}" />
          </div>
          <div class="field">
            <label for="icNotes">Observação (opcional)</label>
            <textarea class="textarea" id="icNotes" name="notes" placeholder="Ex: aula de reposição, mês de março…">${escapeHTML(i.notes || "")}</textarea>
          </div>
          <div class="form__footer">
            <button class="btn btn--ghost" type="button" data-action="closeModal">Cancelar</button>
            <button class="btn btn--primary" type="submit">${isEdit ? "Salvar" : "Registrar"}</button>
          </div>
        </form>
      `,
      onMount(modalEl) {
        const form = modalEl.querySelector("#incomeClientForm");
        form.addEventListener("submit", (e) => {
          e.preventDefault();
          const fd = new FormData(form);
          const amount = Number(String(fd.get("amount") || "").replace(",", "."));
          if (!(amount > 0)) return toast("Informe um valor válido", "danger");
          const payload = {
            clientId: client.id,
            clientName: client.name,
            amount,
            paidAt: String(fd.get("paidAt") || "").trim(),
            notes: String(fd.get("notes") || "").trim(),
            tags: [],
            updatedAt: Date.now(),
          };
          if (isEdit) {
            const idx = db.income.findIndex((x) => x.id === existing.id);
            if (idx >= 0) db.income[idx] = { ...db.income[idx], ...payload };
          } else {
            db.income.push({ id: uid(), ...payload, createdAt: Date.now() });
          }
          saveDB();
          closeModal();
          renderSection();
          toast(isEdit ? "Pagamento atualizado" : "Pagamento registrado", "success");
        });
      },
    });
  }

  function incomeCard(i) {
    const isPaid = i.status === "paid";
    const statusBadge = isPaid
      ? `<span class="chip" style="background:var(--success-bg,#dcfce7);color:var(--success,#16a34a);font-weight:700;">✅ Pago</span>`
      : `<span class="chip" style="background:var(--warning-bg,#fef9c3);color:var(--warning-text,#a16207);font-weight:700;">⏳ Pendente</span>`;
    return `
      <article class="card" style="cursor:default; ${!isPaid ? "border-left:3px solid var(--warning,#f59e0b);" : ""}">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <h3 class="card__title" style="margin:0;">${escapeHTML(i.clientName || "Renda")}</h3>
          ${statusBadge}
        </div>
        <div class="card__meta" style="margin-top:8px;">
          <span class="chip chip--primary">${escapeHTML(formatMoney(i.amount))}</span>
          ${i.paidAt ? `<span class="chip">${escapeHTML(formatDate(i.paidAt))}</span>` : ""}
          ${renderTags(i.tags)}
        </div>
        <div class="card__footer">
          <span class="card__small">${escapeHTML(i.notes ? snippet(i.notes, 60) : "—")}</span>
          <span class="chips">
            <button class="btn ${isPaid ? "" : "btn--primary"}" type="button" data-action="togglePayStatus" data-id="${escapeAttr(i.id)}">
              ${isPaid ? "↩️ Desfazer" : "✅ Marcar pago"}
            </button>
            <button class="btn" type="button" data-action="edit" data-section="income" data-id="${escapeAttr(i.id)}">Editar</button>
            <button class="btn btn--danger" type="button" data-action="delete" data-section="income" data-id="${escapeAttr(i.id)}">Excluir</button>
          </span>
        </div>
      </article>
    `;
  }

  function openIncomeView(id) {
    const i = db.income.find((x) => x.id === id);
    if (!i) return;
    openModal({
      title: `${i.clientName || "Renda"} • ${formatMoney(i.amount)}`,
      subtitle: i.paidAt ? `Pago em ${formatDate(i.paidAt)}` : "Registro de renda",
      body: `
        <div class="kv">
          ${kvRow("Cliente", escapeHTML(i.clientName || "—"))}
          ${kvRow("Valor recebido", `<span class="mono">${escapeHTML(formatMoney(i.amount))}</span>`)}
          ${kvRow("Data do pagamento", i.paidAt ? escapeHTML(formatDate(i.paidAt)) : "—")}
          ${kvRow("Observações", i.notes ? `<div class="pre">${escapeHTML(i.notes)}</div>` : "—")}
          ${kvRow("Tags", i.tags?.length ? i.tags.map((t) => `<span class="chip">#${escapeHTML(t)}</span>`).join(" ") : "—")}
        </div>
        <div class="form__footer" style="margin-top: 12px;">
          <button class="btn" type="button" data-action="edit" data-section="income" data-id="${escapeAttr(i.id)}">Editar</button>
        </div>
      `,
    });
  }

  function openIncomeForm(existing) {
    const isEdit = Boolean(existing);
    const now = new Date().toISOString().slice(0, 10);
    const i = existing || { clientId: "", clientName: "", amount: "", paidAt: now, notes: "", tags: [] };

    const clientOptions = db.clients.slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
      .map((c) => `<option value="${escapeAttr(c.name)}"></option>`).join("");

    openModal({
      title: isEdit ? "Editar Renda" : "Adicionar Renda",
      subtitle: "Registre recebimentos por cliente.",
      body: `
        <form class="form" id="incomeForm">
          <div class="row">
            <div class="field">
              <label for="incClient">Cliente</label>
              <input class="input" id="incClient" name="clientName" type="text" list="clientsList" required
                value="${escapeAttr(i.clientName || "")}" placeholder="Ex: João / Empresa X" />
              <datalist id="clientsList">${clientOptions}</datalist>
            </div>
            <div class="field">
              <label for="incDate">Data do pagamento</label>
              <input class="input" id="incDate" name="paidAt" type="date" value="${escapeAttr(i.paidAt || now)}" />
            </div>
          </div>
          <div class="row">
            <div class="field">
              <label for="incAmount">Valor</label>
              <input class="input" id="incAmount" name="amount" type="number" min="0" step="0.01"
                inputmode="decimal" required value="${escapeAttr(i.amount)}" placeholder="Ex: 1500" />
            </div>
            <div class="field">
              <label for="incStatus">Status</label>
              <select class="select" id="incStatus" name="status">
                <option value="pending" ${(i.status || "pending") === "pending" ? "selected" : ""}>⏳ Pendente</option>
                <option value="paid" ${(i.status || "") === "paid" ? "selected" : ""}>✅ Pago</option>
              </select>
            </div>
          </div>
          <div class="field">
            <label for="incNotes">Observações (opcional)</label>
            <textarea class="textarea" id="incNotes" name="notes"
              placeholder="Detalhes do pagamento, etc.">${escapeHTML(i.notes || "")}</textarea>
          </div>
          <div class="field">
            <label for="incTags">Tags (opcional)</label>
            <input class="input" id="incTags" name="tags" type="text"
              value="${escapeAttr((i.tags || []).join(", "))}" placeholder="Ex: mensalidade, freela, fixo" />
          </div>
          <div class="form__footer">
            <button class="btn btn--ghost" type="button" data-action="closeModal">Cancelar</button>
            <button class="btn btn--primary" type="submit">${isEdit ? "Salvar" : "Adicionar"}</button>
          </div>
        </form>
      `,
      onMount(modalEl) {
        const form = $("#incomeForm", modalEl);
        const toNum = (v) => { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };
        form.addEventListener("submit", (e) => {
          e.preventDefault();
          const fd = new FormData(form);
          const clientName = String(fd.get("clientName") || "").trim();
          const paidAt     = String(fd.get("paidAt") || "").trim();
          const amount     = toNum(fd.get("amount"));
          const notes      = String(fd.get("notes") || "").trim();
          const tags       = parseTags(String(fd.get("tags") || ""));

          if (!clientName) return toast("Cliente é obrigatório", "danger");
          if (!paidAt)     return toast("Data do pagamento é obrigatória", "danger");
          if (!(amount > 0)) return toast("Informe um valor recebido válido", "danger");

          const status = String(fd.get("status") || "pending");
          const match = db.clients.find((c) => String(c.name || "").trim() === clientName);
          const payload = { clientId: match?.id || "", clientName, amount, paidAt, status, notes, tags, updatedAt: Date.now() };

          if (isEdit) {
            const idx = db.income.findIndex((x) => x.id === existing.id);
            if (idx >= 0) db.income[idx] = { ...db.income[idx], ...payload };
          } else {
            db.income.push({ id: uid(), ...payload, createdAt: Date.now() });
          }
          saveDB(); closeModal(); renderSection();
          toast(isEdit ? "Renda atualizada" : "Renda adicionada", "success");
        });
      },
    });
  }

  // ── Renda extra (para ambos os usuários) ──
  function openIncomeExtraForm(existing) {
    const isEdit = Boolean(existing);
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const e = existing || { description: "", amount: "", month: currentMonth, notes: "" };

    openModal({
      title: isEdit ? "Editar Renda Extra" : "Adicionar Renda Extra",
      subtitle: "Cheque, dinheiro, PIX ou qualquer outro valor recebido.",
      body: `
        <form class="form" id="incomeExtraForm">
          <div class="field">
            <label for="exDesc">Descrição</label>
            <input class="input" id="exDesc" name="description" type="text" required
              value="${escapeAttr(e.description || "")}" placeholder="Ex: Cheque, dinheiro, PIX extra…" />
          </div>
          <div class="row">
            <div class="field">
              <label for="exAmount">Valor (R$)</label>
              <input class="input" id="exAmount" name="amount" type="number" min="0" step="0.01"
                inputmode="decimal" required value="${escapeAttr(e.amount)}" placeholder="Ex: 150" />
            </div>
            <div class="field">
              <label for="exMonth">Mês de referência</label>
              <input class="input" id="exMonth" name="month" type="month"
                value="${escapeAttr(e.month || currentMonth)}" />
            </div>
          </div>
          <div class="field">
            <label for="exNotes">Observação (opcional)</label>
            <textarea class="textarea" id="exNotes" name="notes"
              placeholder="Detalhes…">${escapeHTML(e.notes || "")}</textarea>
          </div>
          <div class="form__footer">
            <button class="btn btn--ghost" type="button" data-action="closeModal">Cancelar</button>
            <button class="btn btn--primary" type="submit">${isEdit ? "Salvar" : "Adicionar"}</button>
          </div>
        </form>
      `,
      onMount(modalEl) {
        modalEl.querySelector("#incomeExtraForm").addEventListener("submit", (ev) => {
          ev.preventDefault();
          const fd = new FormData(ev.currentTarget);
          const description = String(fd.get("description") || "").trim();
          const amount = Number(String(fd.get("amount") || "").replace(",", "."));
          const month  = String(fd.get("month") || currentMonth).trim();
          const notes  = String(fd.get("notes") || "").trim();

          if (!description) return toast("Descrição é obrigatória", "danger");
          if (!(amount > 0)) return toast("Informe um valor válido", "danger");

          const payload = { description, amount, month, notes, updatedAt: Date.now() };

          if (isEdit) {
            const idx = db.incomeExtras.findIndex((x) => x.id === existing.id);
            if (idx >= 0) db.incomeExtras[idx] = { ...db.incomeExtras[idx], ...payload };
          } else {
            db.incomeExtras.push({ id: uid(), ...payload, createdAt: Date.now() });
          }
          saveDB(); closeModal(); renderSection();
          toast(isEdit ? "Renda extra atualizada" : "Renda extra adicionada", "success");
        });
      },
    });
  }

  function renderPrograms() {
    const tag = uiState.filters.tag;
    let items = [...db.programs];
    if (tag) items = items.filter((p) => (p.tags || []).includes(tag));
    items.sort((a, b) => byDateDesc(a, b));
    if (items.length === 0) return emptyState("Sem programas.", "Adicione softwares, links de acesso/download e observações.");
    return `<div class="grid">${items.map((p) => programCard(p)).join("")}</div>`;
  }

  function programCard(p) {
    const hint = p.description || p.notes || "";
    return `
      <article class="card" data-action="view" data-section="programs" data-id="${escapeAttr(p.id)}" title="Abrir programa">
        <h3 class="card__title">${escapeHTML(p.name || "Programa")}</h3>
        <div class="card__meta">
          ${p.link ? `<span class="chip chip--primary">${escapeHTML(trimUrl(p.link))}</span>` : `<span class="chip">Sem link</span>`}
          ${renderTags(p.tags)}
        </div>
        <div class="card__footer">
          <span class="card__small">${escapeHTML(hint ? snippet(hint, 72) : "—")}</span>
          <span class="chips">
            <button class="btn" type="button" data-action="view" data-section="programs" data-id="${escapeAttr(p.id)}">Ver</button>
            <button class="btn" type="button" data-action="edit" data-section="programs" data-id="${escapeAttr(p.id)}">Editar</button>
            <button class="btn btn--danger" type="button" data-action="delete" data-section="programs" data-id="${escapeAttr(p.id)}">Excluir</button>
          </span>
        </div>
      </article>
    `;
  }

  function openProgramView(id) {
    const p = db.programs.find((x) => x.id === id);
    if (!p) return;
    openModal({
      title: p.name || "Programa",
      subtitle: p.tags?.length ? p.tags.map((t) => `#${t}`).join(" ") : "Programa",
      body: `
        <div class="kv">
          ${kvRow("Nome", escapeHTML(p.name || "—"))}
          ${kvRow("Link", p.link ? withCopy(p.link, "Abrir") : "—")}
          ${kvRow("Descrição", p.description ? `<div class="pre">${escapeHTML(p.description)}</div>` : "—")}
          ${kvRow("Observações", p.notes ? `<div class="pre">${escapeHTML(p.notes)}</div>` : "—")}
          ${kvRow("Tags", p.tags?.length ? p.tags.map((t) => `<span class="chip">#${escapeHTML(t)}</span>`).join(" ") : "—")}
        </div>
        <div class="form__footer" style="margin-top: 12px;">
          <button class="btn" type="button" data-action="edit" data-section="programs" data-id="${escapeAttr(p.id)}">Editar</button>
        </div>
      `,
    });
  }

  function openProgramForm(existing) {
    const isEdit = Boolean(existing);
    const p = existing || { name: "", description: "", link: "", notes: "", tags: [] };
    openModal({
      title: isEdit ? "Editar Programa" : "Adicionar Programa",
      subtitle: "Liste softwares e links de acesso/download.",
      body: `
        <form class="form" id="programForm">
          <div class="field"><label for="progName">Nome do programa</label><input class="input" id="progName" name="name" type="text" required value="${escapeAttr(p.name || "")}" placeholder="Ex: VS Code, Figma, Postman" /></div>
          <div class="field"><label for="progLink">Link (acesso ou download)</label><input class="input" id="progLink" name="link" type="url" value="${escapeAttr(p.link || "")}" placeholder="https://…" /></div>
          <div class="field"><label for="progDesc">Descrição</label><textarea class="textarea" id="progDesc" name="description" placeholder="Para que serve, como você usa, etc.">${escapeHTML(p.description || "")}</textarea></div>
          <div class="field"><label for="progNotes">Observações</label><textarea class="textarea" id="progNotes" name="notes" placeholder="Licença, conta usada, atalhos, etc.">${escapeHTML(p.notes || "")}</textarea></div>
          <div class="field"><label for="progTags">Tags (opcional)</label><input class="input" id="progTags" name="tags" type="text" value="${escapeAttr((p.tags || []).join(", "))}" placeholder="Ex: design, dev, produtividade" /></div>
          <div class="form__footer">
            <button class="btn btn--ghost" type="button" data-action="closeModal">Cancelar</button>
            <button class="btn btn--primary" type="submit">${isEdit ? "Salvar" : "Adicionar"}</button>
          </div>
        </form>
      `,
      onMount(modalEl) {
        const form = $("#programForm", modalEl);
        form.addEventListener("submit", (e) => {
          e.preventDefault();
          const fd = new FormData(form);
          const name = String(fd.get("name") || "").trim();
          if (!name) return toast("Nome do programa é obrigatório", "danger");
          const payload = { name, link: String(fd.get("link") || "").trim(), description: String(fd.get("description") || "").trim(), notes: String(fd.get("notes") || "").trim(), tags: parseTags(String(fd.get("tags") || "")), updatedAt: Date.now() };
          if (isEdit) { const idx = db.programs.findIndex((x) => x.id === existing.id); if (idx >= 0) db.programs[idx] = { ...db.programs[idx], ...payload }; }
          else { db.programs.push({ id: uid(), ...payload, createdAt: Date.now() }); }
          saveDB(); closeModal(); renderSection();
          toast(isEdit ? "Programa atualizado" : "Programa adicionado", "success");
        });
      },
    });
  }

  function renderProjects() {
    const tag = uiState.filters.tag;
    const status = uiState.filters.projectStatus;
    let items = [...db.projects];
    if (status) items = items.filter((p) => p.status === status);
    if (tag) items = items.filter((p) => (p.tags || []).includes(tag));
    items.sort((a, b) => byDateDesc(a, b));
    if (items.length === 0) return emptyState("Sem projetos.", "Adicione projetos e guarde descrição e links/arquivos relacionados.");
    return `<div class="grid">${items.map((p) => genericCard("projects", p)).join("")}</div>`;
  }

  function openProjectForm(existing) {
    const isEdit = Boolean(existing);
    const p = existing || ({ name: "", clientId: "", clientName: "", status: "Em andamento", description: "", resources: [], tags: [] });
    const clientOptions = db.clients.slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR")).map((c) => `<option value="${escapeAttr(c.name)}"></option>`).join("");

    openModal({
      title: isEdit ? "Editar Projeto" : "Adicionar Projeto",
      subtitle: "Projetos por cliente, status e recursos relacionados.",
      body: `
        <form class="form" id="projectForm">
          <div class="field"><label for="projName">Nome do projeto</label><input class="input" id="projName" name="name" type="text" required value="${escapeAttr(p.name)}" /></div>
          <div class="row">
            <div class="field"><label for="projClient">Cliente</label><input class="input" id="projClient" name="clientName" type="text" list="clientsList" value="${escapeAttr(p.clientName || "")}" placeholder="(opcional)" /><datalist id="clientsList">${clientOptions}</datalist></div>
            <div class="field"><label for="projStatus">Status</label><select class="input" id="projStatus" name="status" required>${["Em andamento", "Concluído"].map((s) => `<option value="${escapeAttr(s)}" ${s === p.status ? "selected" : ""}>${escapeHTML(s)}</option>`).join("")}</select></div>
          </div>
          <div class="field"><label for="projDesc">Descrição</label><textarea class="textarea" id="projDesc" name="description" placeholder="Escopo, entregáveis, pontos importantes…">${escapeHTML(p.description || "")}</textarea></div>
          <div class="field"><label for="projResources">Links / arquivos relacionados</label><textarea class="textarea" id="projResources" name="resources" placeholder="Um por linha (URLs, paths, docs)…">${escapeHTML((p.resources || []).join("\n"))}</textarea></div>
          <div class="field"><label for="projTags">Tags (opcional)</label><input class="input" id="projTags" name="tags" type="text" value="${escapeAttr((p.tags || []).join(", "))}" placeholder="Ex: landing, sprint1, seo" /></div>
          <div class="form__footer">
            <button class="btn btn--ghost" type="button" data-action="closeModal">Cancelar</button>
            <button class="btn btn--primary" type="submit">${isEdit ? "Salvar" : "Adicionar"}</button>
          </div>
        </form>
      `,
      onMount(modalEl) {
        const form = $("#projectForm", modalEl);
        form.addEventListener("submit", (e) => {
          e.preventDefault();
          const fd = new FormData(form);
          const name = String(fd.get("name") || "").trim();
          if (!name) return toast("Nome do projeto é obrigatório", "danger");
          const resources = uniqueStrings(String(fd.get("resources") || "").split("\n").map((x) => x.trim()).filter(Boolean));
          const payload = { name, clientId: "", clientName: String(fd.get("clientName") || "").trim(), status: String(fd.get("status") || "").trim() || "Em andamento", description: String(fd.get("description") || "").trim(), resources, tags: parseTags(String(fd.get("tags") || "")), updatedAt: Date.now() };
          if (isEdit) { const idx = db.projects.findIndex((x) => x.id === existing.id); if (idx >= 0) db.projects[idx] = { ...db.projects[idx], ...payload }; }
          else { db.projects.push({ id: uid(), ...payload, createdAt: Date.now() }); }
          saveDB(); closeModal(); renderSection();
          toast(isEdit ? "Projeto atualizado" : "Projeto adicionado", "success");
        });
      },
    });
  }

  function renderTools() {
    const tag = uiState.filters.tag;
    const cat = uiState.filters.toolCategory;
    let items = [...db.tools];
    if (cat) items = items.filter((t) => t.category === cat);
    if (tag) items = items.filter((t) => (t.tags || []).includes(tag));
    items.sort((a, b) => byDateDesc(a, b));
    if (items.length === 0) return emptyState("Sem ferramentas.", "Guarde links úteis por categoria.");
    return `<div class="grid">${items.map((t) => genericCard("tools", t)).join("")}</div>`;
  }

  function openToolForm(existing) {
    const isEdit = Boolean(existing);
    const t = existing || { name: "", category: "", link: "", description: "", tags: [] };
    openModal({
      title: isEdit ? "Editar Ferramenta" : "Adicionar Ferramenta",
      subtitle: "Links úteis para acelerar seu fluxo.",
      body: `
        <form class="form" id="toolForm">
          <div class="row">
            <div class="field"><label for="toolName">Nome</label><input class="input" id="toolName" name="name" type="text" required value="${escapeAttr(t.name)}" placeholder="Ex: Netlify" /></div>
            <div class="field"><label for="toolCat">Categoria</label><input class="input" id="toolCat" name="category" type="text" value="${escapeAttr(t.category || "")}" placeholder="Ex: Hospedagem" /></div>
          </div>
          <div class="field"><label for="toolLink">Link</label><input class="input" id="toolLink" name="link" type="url" value="${escapeAttr(t.link || "")}" placeholder="https://…" /></div>
          <div class="field"><label for="toolDesc">Descrição</label><textarea class="textarea" id="toolDesc" name="description" placeholder="O que ela faz?">${escapeHTML(t.description || "")}</textarea></div>
          <div class="field"><label for="toolTags">Tags (opcional)</label><input class="input" id="toolTags" name="tags" type="text" value="${escapeAttr((t.tags || []).join(", "))}" placeholder="Ex: deploy, free, dns" /></div>
          <div class="form__footer">
            <button class="btn btn--ghost" type="button" data-action="closeModal">Cancelar</button>
            <button class="btn btn--primary" type="submit">${isEdit ? "Salvar" : "Adicionar"}</button>
          </div>
        </form>
      `,
      onMount(modalEl) {
        const form = $("#toolForm", modalEl);
        form.addEventListener("submit", (e) => {
          e.preventDefault();
          const fd = new FormData(form);
          const name = String(fd.get("name") || "").trim();
          if (!name) return toast("Nome é obrigatório", "danger");
          const payload = { name, category: String(fd.get("category") || "").trim(), link: String(fd.get("link") || "").trim(), description: String(fd.get("description") || "").trim(), tags: parseTags(String(fd.get("tags") || "")), updatedAt: Date.now() };
          if (isEdit) { const idx = db.tools.findIndex((x) => x.id === existing.id); if (idx >= 0) db.tools[idx] = { ...db.tools[idx], ...payload }; }
          else { db.tools.push({ id: uid(), ...payload, createdAt: Date.now() }); }
          saveDB(); closeModal(); renderSection();
          toast(isEdit ? "Ferramenta atualizada" : "Ferramenta adicionada", "success");
        });
      },
    });
  }

  function renderIdeas() {
    const tag = uiState.filters.tag;
    const category = uiState.filters.ideaCategory;
    let items = [...db.ideas];
    if (category) items = items.filter((i) => i.category === category);
    if (tag) items = items.filter((i) => (i.tags || []).includes(tag));
    items.sort((a, b) => byDateDesc(a, b));
    if (items.length === 0) return emptyState("Sem ideias.", "Registre ideias de negócios, melhorias ou novos sistemas.");
    return `<div class="grid">${items.map((i) => genericCard("ideas", i)).join("")}</div>`;
  }

  function openIdeaForm(existing) {
    const isEdit = Boolean(existing);
    const now = new Date().toISOString().slice(0, 10);
    const idea = existing || { title: "", category: "", date: now, description: "", tags: [] };
    openModal({
      title: isEdit ? "Editar Ideia" : "Adicionar Ideia",
      subtitle: "Capture ideias com categoria e data.",
      body: `
        <form class="form" id="ideaForm">
          <div class="row">
            <div class="field"><label for="ideaTitle">Título</label><input class="input" id="ideaTitle" name="title" type="text" required value="${escapeAttr(idea.title || "")}" placeholder="Ex: SaaS de checklist de deploy" /></div>
            <div class="field"><label for="ideaCat">Categoria</label><input class="input" id="ideaCat" name="category" type="text" value="${escapeAttr(idea.category || "")}" placeholder="Ex: Produtividade, IA, Financeiro…" /></div>
          </div>
          <div class="field"><label for="ideaDate">Data</label><input class="input" id="ideaDate" name="date" type="date" value="${escapeAttr(idea.date || now)}" /></div>
          <div class="field"><label for="ideaDesc">Descrição</label><textarea class="textarea" id="ideaDesc" name="description" placeholder="Explique a ideia, para quem é, dor que resolve…">${escapeHTML(idea.description || "")}</textarea></div>
          <div class="field"><label for="ideaTags">Tags (opcional)</label><input class="input" id="ideaTags" name="tags" type="text" value="${escapeAttr((idea.tags || []).join(", "))}" placeholder="Ex: b2b, mvp, nocode" /></div>
          <div class="form__footer">
            <button class="btn btn--ghost" type="button" data-action="closeModal">Cancelar</button>
            <button class="btn btn--primary" type="submit">${isEdit ? "Salvar" : "Adicionar"}</button>
          </div>
        </form>
      `,
      onMount(modalEl) {
        const form = $("#ideaForm", modalEl);
        form.addEventListener("submit", (e) => {
          e.preventDefault();
          const fd = new FormData(form);
          const title = String(fd.get("title") || "").trim();
          if (!title) return toast("Título é obrigatório", "danger");
          const payload = { title, category: String(fd.get("category") || "").trim(), date: String(fd.get("date") || "").trim() || now, description: String(fd.get("description") || "").trim(), tags: parseTags(String(fd.get("tags") || "")), updatedAt: Date.now() };
          if (isEdit) { const idx = db.ideas.findIndex((x) => x.id === existing.id); if (idx >= 0) db.ideas[idx] = { ...db.ideas[idx], ...payload }; }
          else { db.ideas.push({ id: uid(), ...payload, createdAt: Date.now() }); }
          saveDB(); closeModal(); renderSection();
          toast(isEdit ? "Ideia atualizada" : "Ideia adicionada", "success");
        });
      },
    });
  }

  // ── Aba de Senhas simples (Eduarda) ──
  function renderPasswords() {
    let items = [...(db.passwords || [])].sort((a, b) => byDateDesc(a, b));
    if (items.length === 0) {
      return emptyState("Nenhuma senha salva.", "Adicione senhas de serviços importantes para ter tudo em um lugar.");
    }
    return `<div class="grid">${items.map((p) => passwordCard(p)).join("")}</div>`;
  }

  function passwordCard(p) {
    const revId = `pwd:${p.id}`;
    const revealed = uiState.revealMap.get(revId) === true;
    return `
      <article class="card" style="cursor:default;">
        <h3 class="card__title">${escapeHTML(p.service || "Serviço")}</h3>
        <div class="card__meta">
          ${p.username ? `<span class="chip">${escapeHTML(p.username)}</span>` : ""}
          ${p.password ? `<span class="chip">🔒 Senha</span>` : ""}
        </div>
        <div class="kv" style="margin-top:10px;">
          ${p.username ? kvRow("Usuário / Email", `<span class="mono">${escapeHTML(p.username)}</span>
            <button class="btn" type="button" data-action="copyField" data-payload="${escapeAttr(p.username)}">Copiar</button>`) : ""}
          ${p.password ? kvRow("Senha", `
            <span class="mono">${escapeHTML(revealed ? p.password : mask(p.password))}</span>
            <button class="btn" type="button" data-action="toggleReveal" data-section="passwords" data-id="${escapeAttr(revId)}">${revealed ? "👁 Ocultar" : "👁 Mostrar"}</button>
            <button class="btn" type="button" data-action="copyPwd" data-id="${escapeAttr(p.id)}">Copiar</button>
          `) : ""}
          ${p.notes ? kvRow("Obs", `<span>${escapeHTML(snippet(p.notes, 80))}</span>`) : ""}
        </div>
        <div class="card__footer" style="margin-top:10px;">
          <span></span>
          <span class="chips">
            <button class="btn" type="button" data-action="edit" data-section="passwords" data-id="${escapeAttr(p.id)}">Editar</button>
            <button class="btn btn--danger" type="button" data-action="delete" data-section="passwords" data-id="${escapeAttr(p.id)}">Excluir</button>
          </span>
        </div>
      </article>
    `;
  }

  function openPasswordForm(existing) {
    const isEdit = Boolean(existing);
    const p = existing || { service: "", username: "", password: "", notes: "" };
    openModal({
      title: isEdit ? "Editar Senha" : "Adicionar Senha",
      subtitle: "Organização pessoal de senhas e acessos.",
      body: `
        <form class="form" id="pwdForm">
          <div class="field">
            <label for="pwdService">Nome do serviço</label>
            <input class="input" id="pwdService" name="service" type="text" required
              value="${escapeAttr(p.service || "")}" placeholder="Ex: Gmail, Instagram, Netflix…" />
          </div>
          <div class="field">
            <label for="pwdUser">Usuário ou email</label>
            <input class="input" id="pwdUser" name="username" type="text"
              value="${escapeAttr(p.username || "")}" placeholder="Ex: seuemail@gmail.com" />
          </div>
          <div class="field">
            <label for="pwdPass">Senha</label>
            <input class="input" id="pwdPass" name="password" type="password"
              value="${escapeAttr(p.password || "")}" placeholder="Sua senha" />
          </div>
          <div class="field">
            <label for="pwdNotes">Observações (opcional)</label>
            <textarea class="textarea" id="pwdNotes" name="notes"
              placeholder="Dicas, código 2FA, etc.">${escapeHTML(p.notes || "")}</textarea>
          </div>
          <div class="form__footer">
            <button class="btn btn--ghost" type="button" data-action="closeModal">Cancelar</button>
            <button class="btn btn--primary" type="submit">${isEdit ? "Salvar" : "Adicionar"}</button>
          </div>
        </form>
      `,
      onMount(modalEl) {
        modalEl.querySelector("#pwdForm").addEventListener("submit", (ev) => {
          ev.preventDefault();
          const fd = new FormData(ev.currentTarget);
          const service = String(fd.get("service") || "").trim();
          if (!service) return toast("Nome do serviço é obrigatório", "danger");
          const payload = {
            service,
            username: String(fd.get("username") || "").trim(),
            password: String(fd.get("password") || "").trim(),
            notes:    String(fd.get("notes") || "").trim(),
            updatedAt: Date.now(),
          };
          if (isEdit) {
            const idx = db.passwords.findIndex((x) => x.id === existing.id);
            if (idx >= 0) db.passwords[idx] = { ...db.passwords[idx], ...payload };
          } else {
            db.passwords.push({ id: uid(), ...payload, createdAt: Date.now() });
          }
          saveDB(); closeModal(); renderSection();
          toast(isEdit ? "Senha atualizada" : "Senha adicionada", "success");
        });
      },
    });
  }

  function renderVault() {
    const tag = uiState.filters.tag;
    let items = [...db.vault];
    if (tag) items = items.filter((v) => (v.tags || []).includes(tag));
    items.sort((a, b) => byDateDesc(a, b));
    if (items.length === 0) return emptyState("Sem senhas salvas.", "Adicione plataformas com login/senha e copie rápido.");
    return `<div class="grid">${items.map((v) => vaultCard(v)).join("")}</div>`;
  }

  function vaultCard(v) {
    const revealed = uiState.revealMap.get(v.id) === true;
    return `
      <article class="card" data-action="view" data-section="vault" data-id="${escapeAttr(v.id)}" title="Abrir senha">
        <h3 class="card__title">${escapeHTML(v.platform)}</h3>
        <div class="card__meta">
          ${v.email ? `<span class="chip">Login</span>` : ""}
          ${v.password ? `<span class="chip">Senha</span>` : ""}
          ${v.link ? `<span class="chip chip--primary">Link</span>` : ""}
          ${renderTags(v.tags)}
        </div>
        <div class="card__footer">
          <span class="card__small">${escapeHTML(v.email || "—")} • <span class="mono">${escapeHTML(v.password ? (revealed ? v.password : mask(v.password)) : "—")}</span></span>
          <span class="chips">
            <button class="btn" type="button" data-action="toggleReveal" data-section="vault" data-id="${escapeAttr(v.id)}">${revealed ? "👁 Ocultar" : "👁 Mostrar"}</button>
            <button class="btn" type="button" data-action="copyPass" data-section="vault" data-id="${escapeAttr(v.id)}">Copiar senha</button>
            <button class="btn" type="button" data-action="edit" data-section="vault" data-id="${escapeAttr(v.id)}">Editar</button>
            <button class="btn btn--danger" type="button" data-action="delete" data-section="vault" data-id="${escapeAttr(v.id)}">Excluir</button>
          </span>
        </div>
      </article>
    `;
  }

  function openVaultView(id) {
    const v = db.vault.find((x) => x.id === id);
    if (!v) return;
    const revealed = uiState.revealMap.get(v.id) === true;
    openModal({
      title: v.platform,
      subtitle: v.tags?.length ? v.tags.map((t) => `#${t}`).join(" ") : "Senha",
      body: `
        <div class="kv">
          ${kvRow("Plataforma", escapeHTML(v.platform))}
          ${kvRow("Link", v.link ? withCopy(v.link, "Abrir") : "—")}
          ${kvRow("Email / Login", withCopy(v.email))}
          ${kvRow("Senha", v.password ? `
            <span class="mono">${escapeHTML(revealed ? v.password : mask(v.password))}</span>
            <button class="btn" type="button" data-action="toggleReveal" data-section="vault" data-id="${escapeAttr(v.id)}">${revealed ? "👁 Ocultar" : "👁 Mostrar"}</button>
            <button class="btn" type="button" data-action="copyPass" data-section="vault" data-id="${escapeAttr(v.id)}">Copiar</button>
          ` : "—")}
          ${kvRow("Observação", v.notes ? `<div class="pre">${escapeHTML(v.notes)}</div>` : "—")}
          ${kvRow("Tags", v.tags?.length ? v.tags.map((t) => `<span class="chip">#${escapeHTML(t)}</span>`).join(" ") : "—")}
        </div>
        <div class="form__footer" style="margin-top: 12px;">
          <button class="btn" type="button" data-action="edit" data-section="vault" data-id="${escapeAttr(v.id)}">Editar</button>
        </div>
      `,
    });
  }

  function openVaultForm(existing) {
    const isEdit = Boolean(existing);
    const v = existing || { platform: "", email: "", password: "", link: "", notes: "", tags: [] };
    openModal({
      title: isEdit ? "Editar Senha" : "Adicionar Senha",
      subtitle: "Cofre simples local (não criptografado).",
      body: `
        <form class="form" id="vaultForm">
          <div class="field"><label for="vPlatform">Plataforma</label><input class="input" id="vPlatform" name="platform" type="text" required value="${escapeAttr(v.platform)}" placeholder="Ex: GitHub, Google, Hostinger" /></div>
          <div class="row">
            <div class="field"><label for="vEmail">Email / Login</label><input class="input" id="vEmail" name="email" type="text" value="${escapeAttr(v.email || "")}" /></div>
            <div class="field"><label for="vPass">Senha</label><input class="input" id="vPass" name="password" type="password" value="${escapeAttr(v.password || "")}" placeholder="(guardado no navegador)" /></div>
          </div>
          <div class="field"><label for="vLink">Link</label><input class="input" id="vLink" name="link" type="url" value="${escapeAttr(v.link || "")}" placeholder="https://…" /></div>
          <div class="field"><label for="vNotes">Observação</label><textarea class="textarea" id="vNotes" name="notes" placeholder="Dicas, 2FA, conta, etc.">${escapeHTML(v.notes || "")}</textarea></div>
          <div class="field"><label for="vTags">Tags (opcional)</label><input class="input" id="vTags" name="tags" type="text" value="${escapeAttr((v.tags || []).join(", "))}" placeholder="Ex: clienteX, pessoal, trabalho" /></div>
          <div class="form__footer">
            <button class="btn btn--ghost" type="button" data-action="closeModal">Cancelar</button>
            <button class="btn btn--primary" type="submit">${isEdit ? "Salvar" : "Adicionar"}</button>
          </div>
        </form>
      `,
      onMount(modalEl) {
        const form = $("#vaultForm", modalEl);
        form.addEventListener("submit", (e) => {
          e.preventDefault();
          const fd = new FormData(form);
          const platform = String(fd.get("platform") || "").trim();
          if (!platform) return toast("Plataforma é obrigatória", "danger");
          const payload = { platform, email: String(fd.get("email") || "").trim(), password: String(fd.get("password") || "").trim(), link: String(fd.get("link") || "").trim(), notes: String(fd.get("notes") || "").trim(), tags: parseTags(String(fd.get("tags") || "")), updatedAt: Date.now() };
          if (isEdit) { const idx = db.vault.findIndex((x) => x.id === existing.id); if (idx >= 0) db.vault[idx] = { ...db.vault[idx], ...payload }; }
          else { db.vault.push({ id: uid(), ...payload, createdAt: Date.now() }); }
          saveDB(); closeModal(); renderSection();
          toast(isEdit ? "Senha atualizada" : "Senha adicionada", "success");
        });
      },
    });
  }

  // -------------------------
  // Cards genéricos
  // -------------------------
  function genericCard(sectionId, item) {
    return `
      <article class="card" data-action="view" data-section="${escapeAttr(sectionId)}" data-id="${escapeAttr(item.id)}" title="Abrir">
        <h3 class="card__title">${escapeHTML(genericTitle(sectionId, item))}</h3>
        <div class="card__meta">
          ${genericMeta(sectionId, item)}
          ${renderTags(item.tags)}
        </div>
        <div class="card__footer">
          <span class="card__small">${escapeHTML(genericSub(sectionId, item))}</span>
          <span class="chips">
            <button class="btn" type="button" data-action="edit" data-section="${escapeAttr(sectionId)}" data-id="${escapeAttr(item.id)}">Editar</button>
            <button class="btn btn--danger" type="button" data-action="delete" data-section="${escapeAttr(sectionId)}" data-id="${escapeAttr(item.id)}">Excluir</button>
          </span>
        </div>
      </article>
    `;
  }

  function genericTitle(sectionId, item) {
    if (sectionId === "tools") return item.name;
    return item.name || item.title || "Item";
  }

  function genericSub(sectionId, item) {
    if (sectionId === "projects") return `${item.clientName || "Sem cliente"} • ${item.status || "—"}${item.resources?.length ? ` • ${item.resources.length} links` : ""}`;
    if (sectionId === "tools") return `${item.category || "Sem categoria"}${item.link ? ` • ${trimUrl(item.link)}` : ""}`;
    if (sectionId === "ideas") return `${item.category || "Sem categoria"}${item.date ? ` • ${formatDate(item.date)}` : ""}`;
    return "—";
  }

  function genericMeta(sectionId, item) {
    const chip = (t, klass = "") => `<span class="chip ${klass}">${escapeHTML(String(t || "—"))}</span>`;
    const chips = [];
    if (sectionId === "projects") {
      chips.push(chip(item.status || "—", item.status === "Em andamento" ? "chip--primary" : ""));
      if (item.resources?.length) chips.push(chip(`${item.resources.length} links`));
      if (item.clientName) chips.push(chip(item.clientName));
    } else if (sectionId === "tools") {
      if (item.category) chips.push(chip(item.category, "chip--primary"));
      if (item.link) chips.push(chip(trimUrl(item.link)));
    } else if (sectionId === "ideas") {
      if (item.category) chips.push(chip(item.category, "chip--primary"));
      if (item.date) chips.push(chip(formatDate(item.date)));
    }
    return chips.join("");
  }

  function openGenericView(sectionId, id) {
    const lists = { projects: db.projects, tools: db.tools, ideas: db.ideas };
    const list = lists[sectionId];
    if (!list) return;
    const item = list.find((x) => x.id === id);
    if (!item) return;
    openModal({
      title: genericTitle(sectionId, item),
      subtitle: genericSub(sectionId, item),
      body: `
        <div class="kv">${genericKV(sectionId, item)}</div>
        <div class="form__footer" style="margin-top: 12px;">
          <button class="btn" type="button" data-action="edit" data-section="${escapeAttr(sectionId)}" data-id="${escapeAttr(id)}">Editar</button>
        </div>
      `,
    });
  }

  function genericKV(sectionId, item) {
    if (sectionId === "projects") {
      return [
        kvRow("Nome do projeto", escapeHTML(item.name)),
        kvRow("Cliente", escapeHTML(item.clientName || "—")),
        kvRow("Status", escapeHTML(item.status || "—")),
        kvRow("Data de entrega (legado)", item.dueDate ? escapeHTML(formatDate(item.dueDate)) : "—"),
        kvRow("Descrição", item.description ? `<div class="pre">${escapeHTML(item.description)}</div>` : "—"),
        kvRow("Links / arquivos", item.resources?.length ? item.resources.map((r) => `<div class="chips" style="margin-top: 6px;">${withCopy(r, "Abrir")}</div>`).join("") : "—"),
        kvRow("Tags", item.tags?.length ? item.tags.map((t) => `<span class="chip">#${escapeHTML(t)}</span>`).join(" ") : "—"),
      ].join("");
    }
    if (sectionId === "tools") {
      return [
        kvRow("Nome", escapeHTML(item.name)),
        kvRow("Categoria", escapeHTML(item.category || "—")),
        kvRow("Link", item.link ? withCopy(item.link, "Abrir") : "—"),
        kvRow("Descrição", item.description ? `<div class="pre">${escapeHTML(item.description)}</div>` : "—"),
        kvRow("Tags", item.tags?.length ? item.tags.map((t) => `<span class="chip">#${escapeHTML(t)}</span>`).join(" ") : "—"),
      ].join("");
    }
    if (sectionId === "ideas") {
      return [
        kvRow("Título", escapeHTML(item.title || "—")),
        kvRow("Categoria", escapeHTML(item.category || "—")),
        kvRow("Data", item.date ? escapeHTML(formatDate(item.date)) : "—"),
        kvRow("Descrição", item.description ? `<div class="pre">${escapeHTML(item.description)}</div>` : "—"),
        kvRow("Tags", item.tags?.length ? item.tags.map((t) => `<span class="chip">#${escapeHTML(t)}</span>`).join(" ") : "—"),
      ].join("");
    }
    return kvRow("Item", `<div class="pre mono">${escapeHTML(JSON.stringify(item, null, 2))}</div>`);
  }
})();
