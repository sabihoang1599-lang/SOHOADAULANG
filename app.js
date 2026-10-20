(() => {
  "use strict";

  const config = window.APP_CONFIG || {};
  const hasConfig = () =>
    typeof config.SUPABASE_URL === "string" &&
    /^https:\/\/.+\.supabase\.co\/?$/.test(config.SUPABASE_URL) &&
    typeof config.SUPABASE_PUBLISHABLE_KEY === "string" &&
    config.SUPABASE_PUBLISHABLE_KEY.length > 20 &&
    !config.SUPABASE_URL.includes("DAN_") &&
    !config.SUPABASE_PUBLISHABLE_KEY.includes("DAN_");

  const $ = (id) => document.getElementById(id);
  const state = {
    supabase: null,
    user: null,
    profile: null,
    allAreas: [],
    provinceId: null,
    wardId: null,
    areaId: null,
    mode: "community",
    authMode: "login"
  };

  const viewIds = ["roleView", "authView", "communitySetupView", "appView"];
  const appViewIds = ["communityView", "activitiesView", "feedbackView", "contactsView", "partyView", "accountView"];

  function message(id, text, error = false) {
    const el = $(id);
    if (!el) return;
    el.textContent = text || "";
    el.classList.toggle("error", !!error);
  }

  function showView(id) {
    viewIds.forEach((viewId) => $(viewId)?.classList.toggle("hidden", viewId !== id));
    message("globalMessage", "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showAppTab(name) {
    if (name === "party" && (!state.user || !isPartyMember())) {
      message("globalMessage", "Bạn cần đăng nhập và được cấp quyền Chi bộ để mở khu vực này.", true);
      return;
    }
    appViewIds.forEach((id) => $(id)?.classList.toggle("hidden", id !== `${name}View`));
    document.querySelectorAll(".main-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === name));
  }

  function isPartyMember() {
    const role = String(state.profile?.global_role || "").toLowerCase();
    return ["admin", "party", "party_admin", "staff", "can_bo", "canbo"].includes(role);
  }

  function safeText(value, fallback = "") {
    return value == null || value === "" ? fallback : String(value);
  }

  function formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString("vi-VN", { year: "numeric", month: "2-digit", day: "2-digit" });
  }

  function card(title, body, meta = "", className = "") {
    const article = document.createElement("article");
    article.className = `info-card ${className}`.trim();
    if (meta) {
      const m = document.createElement("div");
      m.className = "meta muted small";
      m.textContent = meta;
      article.appendChild(m);
    }
    const h = document.createElement("h3");
    h.textContent = title || "Thông tin";
    article.appendChild(h);
    const p = document.createElement("p");
    p.textContent = body || "Chưa có nội dung.";
    article.appendChild(p);
    return article;
  }

  function renderEmpty(containerId, text) {
    const container = $(containerId);
    if (!container) return;
    container.replaceChildren(card("Chưa có dữ liệu", text));
  }

  function renderAnnouncements(rows) {
    const container = $("communityAnnouncements");
    container.replaceChildren();
    if (!rows?.length) {
      renderEmpty("communityAnnouncements", "Chưa có thông báo công khai trong khu vực này.");
      return;
    }
    rows.forEach((item) => {
      const node = card(safeText(item.title, "Thông báo"), safeText(item.body, "Chưa có nội dung."), `${safeText(item.category, "Thông báo")} · ${formatDate(item.created_at)}`, "announcement-card");
      container.appendChild(node);
    });
  }

  function populateSelect(select, rows, placeholder) {
    select.replaceChildren();
    const first = document.createElement("option");
    first.value = "";
    first.textContent = placeholder;
    select.appendChild(first);
    rows.forEach((row) => {
      const option = document.createElement("option");
      option.value = row.id;
      option.textContent = row.name;
      select.appendChild(option);
    });
  }

  function normalizeType(area) {
    return String(area.area_type || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function typeMatches(area, terms) {
    const type = normalizeType(area);
    return terms.some((term) => type.includes(term));
  }

  function findChildren(parentId) {
    return state.allAreas.filter((area) => String(area.parent_id || "") === String(parentId));
  }

  function provinceRows() {
    const roots = state.allAreas.filter((a) => !a.parent_id);
    const typed = state.allAreas.filter((a) => typeMatches(a, ["province", "tinh", "thanh_pho", "city"]));
    return typed.length ? typed : roots;
  }

  function wardRows(provinceId) {
    const children = findChildren(provinceId);
    const typed = children.filter((a) => typeMatches(a, ["ward", "commune", "phuong", "xa", "thi_tran"]));
    return typed.length ? typed : children;
  }

  function neighborhoodRows(wardId) {
    const children = findChildren(wardId);
    const typed = children.filter((a) => typeMatches(a, ["village", "hamlet", "neighborhood", "area", "thon", "ap", "to_dan_pho", "khu_vuc"]));
    return typed.length ? typed : children;
  }

  async function loadAreas() {
    const select = $("provinceSelect");
    if (!state.supabase) {
      populateSelect(select, [], "Chưa kết nối Supabase");
      message("areaSetupMessage", "Cần cấu hình Supabase và tạo dữ liệu trong bảng areas.", true);
      return;
    }
    select.disabled = true;
    try {
      const { data, error } = await state.supabase.from("areas").select("id,name,area_type,parent_id").order("name");
      if (error) throw error;
      state.allAreas = data || [];
      if (!state.allAreas.length) {
        populateSelect(select, [], "Chưa có địa phương");
        message("areaSetupMessage", "Bảng areas chưa có dữ liệu địa phương. Hãy thêm dữ liệu địa phương trước.", true);
        return;
      }
      populateSelect(select, provinceRows(), "Chọn tỉnh / thành phố");
      select.disabled = false;
      message("areaSetupMessage", "");
    } catch (error) {
      populateSelect(select, [], "Không tải được địa phương");
      message("areaSetupMessage", `Không tải được danh sách địa phương: ${error.message || "hãy kiểm tra quyền truy cập bảng areas."}`, true);
    }
  }

  function updateWardOptions() {
    const provinceId = $("provinceSelect").value;
    const wardSelect = $("wardSelect");
    const areaSelect = $("communityAreaSelect");
    state.provinceId = provinceId || null;
    state.wardId = null;
    state.areaId = null;
    populateSelect(wardSelect, provinceId ? wardRows(provinceId) : [], provinceId ? "Chọn phường / xã" : "Chọn tỉnh / thành phố trước");
    wardSelect.disabled = !provinceId;
    populateSelect(areaSelect, [], "Chọn phường / xã trước");
    areaSelect.disabled = true;
  }

  function updateNeighborhoodOptions() {
    const wardId = $("wardSelect").value;
    const areaSelect = $("communityAreaSelect");
    state.wardId = wardId || null;
    state.areaId = null;
    populateSelect(areaSelect, wardId ? neighborhoodRows(wardId) : [], wardId ? "Chọn khu vực / thôn / tổ dân phố" : "Chọn phường / xã trước");
    areaSelect.disabled = !wardId;
  }

  async function loadAreaContent(areaId) {
    if (!state.supabase || !areaId) {
      renderEmpty("communityAnnouncements", "Chọn khu vực và kết nối cơ sở dữ liệu để xem thông báo.");
      return;
    }
    renderEmpty("communityAnnouncements", "Đang tải thông báo...");
    try {
      const { data, error } = await state.supabase
        .from("announcements")
        .select("id,title,body,category,created_at")
        .eq("area_id", areaId)
        .eq("is_published", true)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      renderAnnouncements(data || []);
    } catch (error) {
      renderEmpty("communityAnnouncements", `Không tải được thông báo. Kiểm tra cấu trúc bảng announcements và chính sách RLS. (${error.message || "Lỗi truy vấn"})`);
    }
    await loadContacts(areaId);
  }

  async function loadContacts(areaId) {
    const container = $("communityContacts");
    if (!container) return;
    try {
      const { data, error } = await state.supabase.from("contacts").select("*").eq("area_id", areaId).limit(30);
      if (error) throw error;
      container.replaceChildren();
      if (!data?.length) {
        renderEmpty("communityContacts", "Chưa có thông tin liên hệ công khai cho khu vực này.");
        return;
      }
      data.forEach((item) => {
        const title = item.name || item.title || item.contact_name || "Đầu mối liên hệ";
        const details = [item.position, item.phone, item.email, item.address, item.description].filter(Boolean).join("\n");
        container.appendChild(card(title, details || "Liên hệ địa phương", item.category || ""));
      });
    } catch (_) {
      renderEmpty("communityContacts", "Chưa có thông tin liên hệ hoặc bảng contacts chưa được cấp quyền đọc công khai.");
    }
  }

  function setCurrentArea(areaId) {
    state.areaId = areaId || null;
    const area = state.allAreas.find((item) => String(item.id) === String(areaId));
    $("userArea").textContent = area ? area.name : "Chưa chọn khu vực";
    $("areaSelect").replaceChildren();
    const opt = document.createElement("option");
    opt.value = areaId || "";
    opt.textContent = area ? area.name : "Chưa chọn khu vực";
    $("areaSelect").appendChild(opt);
    $("dashboardSubtitle").textContent = area ? `Thông tin khu vực: ${area.name}` : "Cùng xây dựng cộng đồng văn minh, đoàn kết.";
    loadAreaContent(areaId);
  }

  async function enterCommunity(areaId) {
    const area = state.allAreas.find((item) => String(item.id) === String(areaId));
    if (!area) {
      message("areaSetupMessage", "Vui lòng chọn đầy đủ địa phương.", true);
      return;
    }
    state.mode = "community";
    $("dashboardTitle").textContent = "Cộng đồng địa phương";
    $("workspaceLabel").textContent = "KHÔNG GIAN CỘNG ĐỒNG";
    $("userName").textContent = state.user ? (state.profile?.full_name || state.user.email || "Người dùng") : "Khách cộng đồng";
    $("userEmail").textContent = state.user?.email || "Chưa đăng nhập";
    $("userRole").textContent = state.user ? "Tài khoản đã đăng nhập" : "Khách cộng đồng";
    $("logoutBtn").classList.toggle("hidden", !state.user);
    document.querySelectorAll(".party-only").forEach((el) => el.classList.add("hidden"));
    showView("appView");
    showAppTab("community");
    setCurrentArea(areaId);
  }

  async function loadProfile() {
    if (!state.supabase || !state.user) return;
    try {
      const { data, error } = await state.supabase.from("profiles").select("full_name,global_role").eq("id", state.user.id).maybeSingle();
      if (error) throw error;
      state.profile = data || null;
    } catch (error) {
      state.profile = null;
      console.warn("Không đọc được profiles:", error.message);
    }
    $("userName").textContent = state.profile?.full_name || state.user.email || "Người dùng";
    $("userEmail").textContent = state.user.email || "";
    $("userRole").textContent = state.profile?.global_role || "Tài khoản";
    document.querySelectorAll(".party-only").forEach((el) => el.classList.toggle("hidden", !isPartyMember()));
  }

  async function openPartyApp() {
    if (!state.user) {
      state.mode = "party";
      showView("authView");
      return;
    }
    await loadProfile();
    if (!isPartyMember()) {
      message("globalMessage", "Tài khoản này chưa được cấp quyền Chi bộ. Hãy liên hệ quản trị viên để được phân quyền.", true);
      return;
    }
    state.mode = "party";
    $("dashboardTitle").textContent = "Khu vực Chi bộ";
    $("workspaceLabel").textContent = "KHÔNG GIAN NỘI BỘ";
    $("dashboardSubtitle").textContent = "Các chức năng nội bộ phụ thuộc vào quyền được cấp.";
    $("logoutBtn").classList.remove("hidden");
    showView("appView");
    showAppTab("party");
    renderEmpty("partyContent", "Chưa kết nối màn hình quản lý tài liệu, nhiệm vụ và lịch họp. Các dữ liệu nội bộ cần được bảo vệ bằng chính sách RLS.");
  }

  function setAuthMode(mode) {
    state.authMode = mode;
    const signup = mode === "signup";
    $("signupTab").classList.toggle("active", signup);
    $("loginTab").classList.toggle("active", !signup);
    $("fullNameField").classList.toggle("hidden", !signup);
    $("fullName").required = signup;
    $("authSubmitBtn").textContent = signup ? "Tạo tài khoản" : "Đăng nhập";
    $("authHeading").textContent = signup ? "Đăng ký tài khoản" : "Đăng nhập Chi bộ";
    $("forgotPasswordBtn").classList.toggle("hidden", signup);
    $("password").autocomplete = signup ? "new-password" : "current-password";
    message("authMessage", "");
  }

  async function handleAuth(event) {
    event.preventDefault();
    if (!state.supabase) {
      message("authMessage", "Chưa cấu hình Supabase. Hãy cập nhật config.js trước.", true);
      return;
    }
    const email = $("email").value.trim();
    const password = $("password").value;
    const button = $("authSubmitBtn");
    button.disabled = true;
    message("authMessage", state.authMode === "signup" ? "Đang tạo tài khoản..." : "Đang đăng nhập...");
    try {
      if (state.authMode === "signup") {
        const fullName = $("fullName").value.trim();
        const { error } = await state.supabase.auth.signUp({
          email, password, options: { data: { full_name: fullName } }
        });
        if (error) throw error;
        message("authMessage", "Nếu xác minh email được bật, hãy mở email để xác nhận. Việc đăng ký không cấp quyền Chi bộ.");
      } else {
        const { data, error } = await state.supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        state.user = data.user;
        await loadProfile();
        if (!isPartyMember()) {
          await state.supabase.auth.signOut();
          state.user = null;
          message("authMessage", "Đăng nhập thành công nhưng tài khoản chưa được cấp quyền Chi bộ. Hãy liên hệ quản trị viên.", true);
          return;
        }
        await openPartyApp();
      }
    } catch (error) {
      message("authMessage", error.message || "Có lỗi xảy ra. Vui lòng thử lại.", true);
    } finally {
      button.disabled = false;
    }
  }

  async function sendPasswordReset() {
    if (!state.supabase) {
      message("authMessage", "Chưa cấu hình Supabase.", true);
      return;
    }
    const email = $("email").value.trim();
    if (!email) {
      message("authMessage", "Nhập email trước khi yêu cầu đặt lại mật khẩu.", true);
      $("email").focus();
      return;
    }
    try {
      const { error } = await state.supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname });
      if (error) throw error;
      message("authMessage", "Nếu email tồn tại, hệ thống sẽ gửi hướng dẫn đặt lại mật khẩu.");
      message("accountMessage", "Nếu email tồn tại, hệ thống sẽ gửi hướng dẫn đặt lại mật khẩu.");
    } catch (error) {
      message("authMessage", error.message || "Không gửi được email đặt lại mật khẩu.", true);
    }
  }

  async function submitFeedback(event) {
    event.preventDefault();
    const content = $("feedbackContent").value.trim();
    if (content.length < 5) {
      message("feedbackMessage", "Vui lòng nhập nội dung cụ thể hơn.", true);
      return;
    }
    if (!state.supabase) {
      message("feedbackMessage", "Chưa kết nối Supabase; phản ánh chưa được gửi.", true);
      return;
    }
    // Bảng feedback không nằm trong danh sách bảng gốc của dự án.
    // Không giả vờ gửi thành công: yêu cầu thiết lập bảng và RLS trước.
    try {
      const { error } = await state.supabase.from("feedback").insert({
        area_id: state.areaId,
        category: $("feedbackCategory").value,
        content,
        contact: $("feedbackContact").value.trim() || null,
        user_id: state.user?.id || null,
        status: "new"
      });
      if (error) throw error;
      message("feedbackMessage", "Đã gửi phản ánh thành công.");
      $("feedbackForm").reset();
    } catch (error) {
      message("feedbackMessage", `Chưa gửi được phản ánh. Cần tạo bảng feedback và chính sách RLS phù hợp trong Supabase. (${error.message || "Lỗi kết nối"})`, true);
    }
  }

  async function init() {
    if (hasConfig() && window.supabase?.createClient) {
      state.supabase = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY);
      $("setupNotice").classList.add("hidden");
      try {
        const { data } = await state.supabase.auth.getSession();
        state.user = data?.session?.user || null;
      } catch (_) {}
    } else {
      $("setupNotice").classList.remove("hidden");
    }

    $("choosePartyBtn").addEventListener("click", async () => {
      state.mode = "party";
      setAuthMode("login");
      if (state.user) await openPartyApp();
      else showView("authView");
    });
    $("chooseCommunityBtn").addEventListener("click", async () => {
      state.mode = "community";
      showView("communitySetupView");
      await loadAreas();
    });
    $("backToRoleFromAuth").addEventListener("click", () => showView("roleView"));
    $("backToRoleFromCommunity").addEventListener("click", () => showView("roleView"));
    $("returnRoleBtn").addEventListener("click", () => showView("roleView"));
    $("loginTab").addEventListener("click", () => setAuthMode("login"));
    $("signupTab").addEventListener("click", () => setAuthMode("signup"));
    $("authForm").addEventListener("submit", handleAuth);
    $("forgotPasswordBtn").addEventListener("click", sendPasswordReset);
    $("resetPasswordBtn").addEventListener("click", sendPasswordReset);
    $("feedbackForm").addEventListener("submit", submitFeedback);
    $("provinceSelect").addEventListener("change", updateWardOptions);
    $("wardSelect").addEventListener("change", updateNeighborhoodOptions);
    $("areaSetupForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const areaId = $("communityAreaSelect").value;
      if (!areaId) {
        message("areaSetupMessage", "Vui lòng chọn đủ tỉnh/thành phố, phường/xã và khu vực.", true);
        return;
      }
      await enterCommunity(areaId);
    });
    $("areaSelect").addEventListener("change", (event) => setCurrentArea(event.target.value));
    $("mainTabs").addEventListener("click", (event) => {
      const button = event.target.closest("[data-view]");
      if (button) showAppTab(button.dataset.view);
    });
    $("logoutBtn").addEventListener("click", async () => {
      if (state.supabase) {
        try { await state.supabase.auth.signOut(); } catch (_) {}
      }
      state.user = null;
      state.profile = null;
      $("logoutBtn").classList.add("hidden");
      showView("roleView");
    });

    // Nếu đã đăng nhập trước đó vẫn không tự cấp quyền nội bộ.
    if (state.user) await loadProfile();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
