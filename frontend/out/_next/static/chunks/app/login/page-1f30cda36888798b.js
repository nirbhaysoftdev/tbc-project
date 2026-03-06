(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [626],
  {
    1630: function (e, t, n) {
      Promise.resolve().then(n.bind(n, 378));
    },
    378: function (e, t, n) {
      "use strict";
      (n.r(t),
        n.d(t, {
          default: function () {
            return s;
          },
        }));
      var r = n(7437),
        a = n(2265),
        o = n(4033),
        i = n(4064);
      function s() {
        let [e, t] = (0, a.useState)(""),
          [n, s] = (0, a.useState)(""),
          [l, c] = (0, a.useState)(""),
          [u, d] = (0, a.useState)(!1),
          { login: m } = (0, i.useAuth)(),
          p = (0, o.useRouter)(),
          g = async (t) => {
            (t.preventDefault(), c(""), d(!0));
            try {
              (await m(e, n), p.push("/dashboard"));
            } catch (e) {
              var r, a;
              c(
                (null === (a = e.response) || void 0 === a
                  ? void 0
                  : null === (r = a.data) || void 0 === r
                    ? void 0
                    : r.error) || "Login failed. Please try again.",
              );
            } finally {
              d(!1);
            }
          };
        return (0, r.jsx)("div", {
          className: "login-page",
          children: (0, r.jsxs)("div", {
            className: "login-card",
            children: [
              (0, r.jsxs)("div", {
                className: "login-logo",
                children: [
                  (0, r.jsx)("div", {
                    style: {
                      width: 56,
                      height: 56,
                      borderRadius: "50%",
                      margin: "0 auto 16px",
                      background: "linear-gradient(135deg,#1a2550,#0d173a)",
                      border: "2px solid #c8a84b",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 18,
                      fontWeight: 800,
                      color: "#c8a84b",
                    },
                    children: "TBC",
                  }),
                  (0, r.jsx)("p", {
                    className: "login-brand",
                    children: "TRILLION",
                  }),
                  (0, r.jsx)("p", {
                    className: "login-sub",
                    children: "BUSINESS COMMUNITY",
                  }),
                ],
              }),
              (0, r.jsx)("h1", {
                className: "login-title",
                children: "Welcome back",
              }),
              (0, r.jsx)("p", {
                className: "login-desc",
                children: "Sign in to your member dashboard",
              }),
              (0, r.jsxs)("form", {
                onSubmit: g,
                children: [
                  (0, r.jsxs)("div", {
                    className: "form-group",
                    children: [
                      (0, r.jsx)("label", {
                        className: "form-label",
                        children: "EMAIL ADDRESS",
                      }),
                      (0, r.jsx)("input", {
                        type: "email",
                        className: "form-input",
                        placeholder: "you@trillionbc.com",
                        value: e,
                        onChange: (e) => t(e.target.value),
                        required: !0,
                      }),
                    ],
                  }),
                  (0, r.jsxs)("div", {
                    className: "form-group",
                    children: [
                      (0, r.jsx)("label", {
                        className: "form-label",
                        children: "PASSWORD",
                      }),
                      (0, r.jsx)("input", {
                        type: "password",
                        className: "form-input",
                        placeholder: "••••••••",
                        value: n,
                        onChange: (e) => s(e.target.value),
                        required: !0,
                      }),
                    ],
                  }),
                  l &&
                    (0, r.jsx)("p", { className: "form-error", children: l }),
                  (0, r.jsx)("button", {
                    type: "submit",
                    className: "btn-primary",
                    disabled: u,
                    children: u ? "Signing in..." : "Sign In",
                  }),
                ],
              }),
              (0, r.jsx)("p", {
                style: {
                  textAlign: "center",
                  marginTop: 20,
                  fontSize: 11,
                  color: "var(--text-muted)",
                },
                children: "Demo: antonino@trillionbc.com / Member@123",
              }),
            ],
          }),
        });
      }
    },
    8222: function (e, t, n) {
      "use strict";
      n.d(t, {
        FZ: function () {
          return u;
        },
        L2: function () {
          return l;
        },
        M5: function () {
          return d;
        },
        Sb: function () {
          return c;
        },
        kv: function () {
          return i;
        },
        lm: function () {
          return p;
        },
        qM: function () {
          return m;
        },
        vD: function () {
          return s;
        },
      });
      var r = n(4829),
        a = n(1490);
      let o = r.Z.create({
        baseURL: "http://209.42.23.150/api",
        headers: { "Content-Type": "application/json" },
      });
      (o.interceptors.request.use((e) => {
        let t =
          a.Z.get("tbc_token") ||
          ("undefined" != typeof localStorage
            ? localStorage.getItem("tbc_token")
            : null);
        return (t && (e.headers.Authorization = "Bearer ".concat(t)), e);
      }),
        o.interceptors.response.use(
          (e) => e,
          (e) => {
            var t;
            return (
              (null === (t = e.response) || void 0 === t
                ? void 0
                : t.status) === 401 &&
                (a.Z.remove("tbc_token"),
                localStorage.removeItem("tbc_token"),
                (window.location.href = "/login")),
              Promise.reject(e)
            );
          },
        ));
      let i = {
          login: (e, t) => o.post("/auth/login", { email: e, password: t }),
          logout: () => o.post("/auth/logout"),
          me: () => o.get("/auth/me"),
        },
        s = {
          getSummary: () => o.get("/dashboard/summary"),
          getChart: function () {
            let e =
              arguments.length > 0 && void 0 !== arguments[0]
                ? arguments[0]
                : "1Y";
            return o.get("/dashboard/chart?period=".concat(e));
          },
        },
        l = {
          getAll: (e) => o.get("/transactions", { params: e }),
          exportPDF: () =>
            o.get("/transactions/export", { responseType: "blob" }),
          exportCSV: () => o.get("/transactions/csv", { responseType: "blob" }),
        },
        c = {
          getStats: () => o.get("/admin/stats"),
          getMembers: (e) => o.get("/admin/members", { params: e }),
          createMember: (e) =>
            o.post("/admin/members", e, {
              headers: { "Content-Type": "multipart/form-data" },
            }),
          updateMember: (e, t) =>
            o.put("/admin/members/".concat(e), t, {
              headers: { "Content-Type": "multipart/form-data" },
            }),
          deleteMember: (e) => o.delete("/admin/members/".concat(e)),
          toggleFreeze: (e) => o.put("/admin/members/".concat(e, "/freeze")),
          updateWallet: (e, t) =>
            o.put("/admin/members/".concat(e, "/wallet"), t),
          addTransaction: (e) => o.post("/admin/transactions", e),
          exportData: () => o.get("/admin/export", { responseType: "blob" }),
        },
        u = {
          update: (e) =>
            o.put("/profile", e, {
              headers: { "Content-Type": "multipart/form-data" },
            }),
        },
        d = {
          getNotice: () => o.get("/system/notice"),
          updateNotice: (e) => o.put("/system/notice", { text: e }),
        },
        m = (e) =>
          "€ ".concat(e.toLocaleString("de-DE", { minimumFractionDigits: 0 })),
        p = (e, t) => {
          let n = window.URL.createObjectURL(e),
            r = document.createElement("a");
          ((r.href = n),
            (r.download = t),
            r.click(),
            window.URL.revokeObjectURL(n));
        };
    },
    4064: function (e, t, n) {
      "use strict";
      (n.r(t),
        n.d(t, {
          AuthProvider: function () {
            return l;
          },
          useAuth: function () {
            return c;
          },
        }));
      var r = n(7437),
        a = n(2265),
        o = n(1490),
        i = n(8222);
      let s = (0, a.createContext)(null);
      function l(e) {
        let { children: t } = e,
          [n, l] = (0, a.useState)(null),
          [c, u] = (0, a.useState)(!0),
          d = async () => {
            try {
              let e = await i.kv.me();
              l(e.data);
            } catch (e) {
              l(null);
            }
          };
        (0, a.useEffect)(() => {
          localStorage.getItem("tbc_token") ? d().finally(() => u(!1)) : u(!1);
        }, []);
        let m = async (e, t) => {
          let { token: n, user: r } = (await i.kv.login(e, t)).data;
          (localStorage.setItem("tbc_token", n),
            o.Z.set("tbc_token", n, { expires: 7 }),
            l(r));
        };
        return (0, r.jsx)(s.Provider, {
          value: {
            user: n,
            loading: c,
            login: m,
            logout: () => {
              (localStorage.removeItem("tbc_token"),
                o.Z.remove("tbc_token"),
                l(null),
                (window.location.href = "/login"));
            },
            refresh: d,
          },
          children: t,
        });
      }
      let c = () => {
        let e = (0, a.useContext)(s);
        if (!e) throw Error("useAuth must be inside AuthProvider");
        return e;
      };
    },
    4033: function (e, t, n) {
      e.exports = n(5313);
    },
  },
  function (e) {
    (e.O(0, [694, 971, 458, 744], function () {
      return e((e.s = 1630));
    }),
      (_N_E = e.O()));
  },
]);
