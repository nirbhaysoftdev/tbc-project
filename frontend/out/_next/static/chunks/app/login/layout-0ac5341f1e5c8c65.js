(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [988],
  {
    854: function (e, t, n) {
      Promise.resolve().then(n.bind(n, 4064));
    },
    8222: function (e, t, n) {
      "use strict";
      n.d(t, {
        FZ: function () {
          return l;
        },
        L2: function () {
          return u;
        },
        M5: function () {
          return m;
        },
        Sb: function () {
          return s;
        },
        kv: function () {
          return c;
        },
        lm: function () {
          return p;
        },
        qM: function () {
          return d;
        },
        vD: function () {
          return i;
        },
      });
      var o = n(4829),
        r = n(1490);
      let a = o.Z.create({
        baseURL: "http://209.42.23.150/api",
        headers: { "Content-Type": "application/json" },
      });
      (a.interceptors.request.use((e) => {
        let t =
          r.Z.get("tbc_token") ||
          ("undefined" != typeof localStorage
            ? localStorage.getItem("tbc_token")
            : null);
        return (t && (e.headers.Authorization = "Bearer ".concat(t)), e);
      }),
        a.interceptors.response.use(
          (e) => e,
          (e) => {
            var t;
            return (
              (null === (t = e.response) || void 0 === t
                ? void 0
                : t.status) === 401 &&
                (r.Z.remove("tbc_token"),
                localStorage.removeItem("tbc_token"),
                (window.location.href = "/login")),
              Promise.reject(e)
            );
          },
        ));
      let c = {
          login: (e, t) => a.post("/auth/login", { email: e, password: t }),
          logout: () => a.post("/auth/logout"),
          me: () => a.get("/auth/me"),
        },
        i = {
          getSummary: () => a.get("/dashboard/summary"),
          getChart: function () {
            let e =
              arguments.length > 0 && void 0 !== arguments[0]
                ? arguments[0]
                : "1Y";
            return a.get("/dashboard/chart?period=".concat(e));
          },
        },
        u = {
          getAll: (e) => a.get("/transactions", { params: e }),
          exportPDF: () =>
            a.get("/transactions/export", { responseType: "blob" }),
          exportCSV: () => a.get("/transactions/csv", { responseType: "blob" }),
        },
        s = {
          getStats: () => a.get("/admin/stats"),
          getMembers: (e) => a.get("/admin/members", { params: e }),
          createMember: (e) =>
            a.post("/admin/members", e, {
              headers: { "Content-Type": "multipart/form-data" },
            }),
          updateMember: (e, t) =>
            a.put("/admin/members/".concat(e), t, {
              headers: { "Content-Type": "multipart/form-data" },
            }),
          deleteMember: (e) => a.delete("/admin/members/".concat(e)),
          toggleFreeze: (e) => a.put("/admin/members/".concat(e, "/freeze")),
          updateWallet: (e, t) =>
            a.put("/admin/members/".concat(e, "/wallet"), t),
          addTransaction: (e) => a.post("/admin/transactions", e),
          exportData: () => a.get("/admin/export", { responseType: "blob" }),
        },
        l = {
          update: (e) =>
            a.put("/profile", e, {
              headers: { "Content-Type": "multipart/form-data" },
            }),
        },
        m = {
          getNotice: () => a.get("/system/notice"),
          updateNotice: (e) => a.put("/system/notice", { text: e }),
        },
        d = (e) =>
          "€ ".concat(e.toLocaleString("de-DE", { minimumFractionDigits: 0 })),
        p = (e, t) => {
          let n = window.URL.createObjectURL(e),
            o = document.createElement("a");
          ((o.href = n),
            (o.download = t),
            o.click(),
            window.URL.revokeObjectURL(n));
        };
    },
    4064: function (e, t, n) {
      "use strict";
      (n.r(t),
        n.d(t, {
          AuthProvider: function () {
            return u;
          },
          useAuth: function () {
            return s;
          },
        }));
      var o = n(7437),
        r = n(2265),
        a = n(1490),
        c = n(8222);
      let i = (0, r.createContext)(null);
      function u(e) {
        let { children: t } = e,
          [n, u] = (0, r.useState)(null),
          [s, l] = (0, r.useState)(!0),
          m = async () => {
            try {
              let e = await c.kv.me();
              u(e.data);
            } catch (e) {
              u(null);
            }
          };
        (0, r.useEffect)(() => {
          localStorage.getItem("tbc_token") ? m().finally(() => l(!1)) : l(!1);
        }, []);
        let d = async (e, t) => {
          let { token: n, user: o } = (await c.kv.login(e, t)).data;
          (localStorage.setItem("tbc_token", n),
            a.Z.set("tbc_token", n, { expires: 7 }),
            u(o));
        };
        return (0, o.jsx)(i.Provider, {
          value: {
            user: n,
            loading: s,
            login: d,
            logout: () => {
              (localStorage.removeItem("tbc_token"),
                a.Z.remove("tbc_token"),
                u(null),
                (window.location.href = "/login"));
            },
            refresh: m,
          },
          children: t,
        });
      }
      let s = () => {
        let e = (0, r.useContext)(i);
        if (!e) throw Error("useAuth must be inside AuthProvider");
        return e;
      };
    },
  },
  function (e) {
    (e.O(0, [694, 971, 458, 744], function () {
      return e((e.s = 854));
    }),
      (_N_E = e.O()));
  },
]);
