(() => {
  const $ = (id) => document.getElementById(id);
  const config = window.APP_CONFIG || {};
  const configured = config.SUPABASE_URL &&
    config.SUPABASE_PUBLISHABLE_KEY &&
    config.SUPABASE_URL.startsWith("https://") &&
    !config.SUPABASE_URL.includes("DAN_") &&
    !config.SUPABASE_PUBLISHABLE_KEY.includes("DAN_");

  let supabaseClient = null;
  let isSignup = false;
  let currentUser = null;
  let memberships = [];

  const demoAnnouncements = [
    {title:"Chào mừng đến với Số Hóa Đầu Làng", body:"Đây là giao diện mẫu. Sau khi cấu hình cơ sở dữ liệu, thông báo sẽ được tải theo địa bàn và quyền của tài khoản.", category:"Hướng dẫn", created_at:new Date().toISOString()},
    {title:"Giữ an toàn thông tin cá nhân", body:"Không đăng công khai mật khẩu, mã xác minh hoặc giấy tờ cá nhân. Chỉ chia sẻ thông tin cần thiết qua kênh được địa phương phê duyệt.", category:"An toàn", created_at:new Date().toISOString()}
  ];

  function setMessage(id, message, error=false) {
    const el = $(id);
    if (!el) return;
    el.textContent = message || "";
    el.classList.toggle("error", !!error);
  }
  function show(id, yes=true) { $(id).classList.toggle("hidden", !yes); }
  function validConfig() {
    if (!configured || !window.supabase) {
      show("setupNotice", true);
      return false;
    }
    return true;
  }
  function initClient() {
    if (configured && window.supabase && !supabaseClient) {
      supabaseClient = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY);
      show("setupNotice", false);
    }
  }
  function switchAuth(signup) {
    isSignup = signup;
    $("showLogin").classList.toggle("active", !signup);
    $("showSignup").classList.toggle("active", signup);
    show("nameField", signup);
    $("authSubmit").textContent = signup ? "Tạo tài khoản" : "Đăng nhập";
    $("password").autocomplete = signup ? "new-password" : "current-password";
    setMessage("authMessage", "");
  }
  function showView(view) {
    ["community","party","account"].forEach(v => {
      show(v + "View", v === view);
      document.querySelector(`[data-view="${v}"]`).classList.toggle("active", v === view);
    });
  }
  function renderAnnouncements(items) {
    const root = $("communityAnnouncements");
    root.innerHTML = "";
    const list = items && items.length ? items : demoAnnouncements;
    list.forEach(item => {
      const card = document.createElement("article");
      card.className = "info-card announcement-card";
      const meta = document.createElement("div");
      meta.className = "meta";
      const date = item.created_at ? new Date(item.created_at).toLocaleDateString("vi-VN") : "";
      meta.textContent = `${item.category || "Thông báo"}${date ? " • " + date : ""}`;
      const title = document.createElement("h3");
      title.textContent = item.title || "Thông báo";
      const body = document.createElement("p");
      body.textContent = item.body || item.content || "";
      card.append(meta, title, body);
      root.append(card);
    });
  }
  async function loadProfileAndAreas() {
    if (!supabaseClient || !currentUser) return;
    $("userEmail").textContent = currentUser.email || "";
    $("accountEmail").textContent = currentUser.email || "—";
    $("userName").textContent = currentUser.user_metadata?.full_name || (currentUser.email || "bạn").split("@")[0];
    const {data: profile, error: profileError} = await supabaseClient
      .from("profiles").select("full_name, global_role").eq("id", currentUser.id).maybeSingle();
    if (!profileError && profile) {
      $("userName").textContent = profile.full_name || $("userName").textContent;
      $("accountRole").textContent = profile.global_role === "system_admin" ? "Quản trị hệ thống" : "Người dùng";
    } else {
      $("accountRole").textContent = "Người dùng — chờ phân quyền";
    }

    const {data: rows, error} = await supabaseClient
      .from("area_members")
      .select("area_id, role, areas(id, name, area_type, parent_id)")
      .eq("user_id", currentUser.id)
      .eq("status", "active");
    memberships = error ? [] : (rows || []);
    const select = $("areaSelect");
    select.innerHTML = "";
    if (!memberships.length) {
      select.add(new Option("Chưa được gán địa bàn", ""));
      $("accountArea").textContent = "Chưa được gán";
    } else {
      memberships.forEach((m, i) => select.add(new Option(m.areas?.name || "Địa bàn", m.area_id, false, i===0)));
      $("accountArea").textContent = memberships.map(m => m.areas?.name).filter(Boolean).join(", ");
      select.value = memberships[0].area_id;
    }
    select.onchange = loadAreaContent;
    await loadAreaContent();
  }
  async function loadAreaContent() {
    const areaId = $("areaSelect").value;
    if (!supabaseClient || !areaId) {
      renderAnnouncements(demoAnnouncements);
      return;
    }
    const {data, error} = await supabaseClient
      .from("announcements")
      .select("id, title, body, category, created_at")
      .eq("area_id", areaId)
      .eq("is_published", true)
      .order("created_at", {ascending:false})
      .limit(20);
    if (error) {
      renderAnnouncements(demoAnnouncements);
      setMessage("authMessage", "Đã đăng nhập. Chưa tải được thông báo; hãy kiểm tra đã chạy schema.sql và chính sách quyền truy cập chưa.", true);
    } else {
      renderAnnouncements(data || []);
    }
  }
  async function openApp(user) {
    currentUser = user;
    show("authView", false);
    show("appView", true);
    show("logoutBtn", true);
    showView("community");
    renderAnnouncements(demoAnnouncements);
    await loadProfileAndAreas();
  }
  async function handleAuth(event) {
    event.preventDefault();
    if (!validConfig()) return;
    initClient();
    const email = $("email").value.trim();
    const password = $("password").value;
    const button = $("authSubmit");
    button.disabled = true;
    setMessage("authMessage", isSignup ? "Đang tạo tài khoản..." : "Đang đăng nhập...");
    try {
      if (isSignup) {
        const fullName = $("fullName").value.trim();
        const {data, error} = await supabaseClient.auth.signUp({
          email, password,
          options: {data: {full_name: fullName}, emailRedirectTo: window.location.origin}
        });
        if (error) throw error;
        if (data.session) {
          setMessage("authMessage", "Tạo tài khoản thành công.");
          await openApp(data.user);
        } else {
          setMessage("authMessage", "Đã gửi yêu cầu đăng ký. Hãy mở email để xác minh rồi quay lại đăng nhập.");
        }
      } else {
        const {data, error} = await supabaseClient.auth.signInWithPassword({email, password});
        if (error) throw error;
        await openApp(data.user);
      }
    } catch (err) {
      setMessage("authMessage", friendlyError(err), true);
    } finally {
      button.disabled = false;
    }
  }
  function friendlyError(err) {
    const msg = err?.message || "Có lỗi xảy ra. Vui lòng thử lại.";
    if (/Invalid login credentials/i.test(msg)) return "Email hoặc mật khẩu chưa đúng.";
    if (/Email not confirmed/i.test(msg)) return "Bạn cần xác minh email trước khi đăng nhập.";
    if (/already registered/i.test(msg)) return "Email này đã đăng ký. Hãy chuyển sang Đăng nhập.";
    return msg;
  }
  async function resetPassword() {
    if (!validConfig()) return;
    initClient();
    const email = (currentUser?.email || $("email").value).trim();
    if (!email) {
      setMessage(currentUser ? "accountMessage" : "authMessage", "Hãy nhập email trước.");
      return;
    }
    const id = currentUser ? "accountMessage" : "authMessage";
    try {
      const {error} = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin
      });
      if (error) throw error;
      setMessage(id, "Nếu email có tài khoản, hướng dẫn đặt lại mật khẩu sẽ được gửi. Kiểm tra cả thư rác.");
    } catch (err) { setMessage(id, friendlyError(err), true); }
  }
  async function logout() {
    if (supabaseClient) await supabaseClient.auth.signOut();
    currentUser = null; memberships = [];
    show("appView", false); show("authView", true); show("logoutBtn", false);
    $("authForm").reset(); setMessage("authMessage", "");
  }
  function saveFeedbackDraft(event) {
    event.preventDefault();
    const draft = {
      title: $("feedbackTitle").value.trim(),
      body: $("feedbackBody").value.trim(),
      created_at: new Date().toISOString()
    };
    const drafts = JSON.parse(localStorage.getItem("soHoaFeedbackDrafts") || "[]");
    drafts.push(draft);
    localStorage.setItem("soHoaFeedbackDrafts", JSON.stringify(drafts));
    $("feedbackForm").reset();
    setMessage("feedbackMessage", "Đã lưu bản nháp trên thiết bị này. Nội dung chưa được gửi cho cơ quan/địa phương.");
  }
  async function boot() {
    if (!configured) show("setupNotice", true);
    initClient();
    renderAnnouncements(demoAnnouncements);
    $("showLogin").addEventListener("click", () => switchAuth(false));
    $("showSignup").addEventListener("click", () => switchAuth(true));
    $("authForm").addEventListener("submit", handleAuth);
    $("forgotBtn").addEventListener("click", resetPassword);
    $("resetPasswordBtn").addEventListener("click", resetPassword);
    $("logoutBtn").addEventListener("click", logout);
    $("feedbackForm").addEventListener("submit", saveFeedbackDraft);
    document.querySelectorAll("[data-view]").forEach(btn => btn.addEventListener("click", () => showView(btn.dataset.view)));
    if (supabaseClient) {
      const {data:{session}} = await supabaseClient.auth.getSession();
      if (session?.user) await openApp(session.user);
      supabaseClient.auth.onAuthStateChange((_event, session) => {
        if (!session && currentUser) {
          currentUser = null; show("appView", false); show("authView", true); show("logoutBtn", false);
        }
      });
    }
  }
  document.addEventListener("DOMContentLoaded", boot);
})();
