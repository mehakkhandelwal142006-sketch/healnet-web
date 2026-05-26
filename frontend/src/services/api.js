import axios from "axios";

const BASE_URL = process.env.REACT_APP_API_URL || "https://healnet-web-production.up.railway.app/api";

const API = axios.create({ baseURL: BASE_URL });

API.interceptors.request.use((config) => {
  const token = localStorage.getItem("healnet_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

API.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("healnet_token");
      localStorage.removeItem("healnet_user");
      window.location.href = "/";
    }
    return Promise.reject(err);
  }
);

export const authAPI = {
  login:  (email, password)             => API.post("/auth/login",  { email, password }),
  signup: (name, email, password, kind) => API.post("/auth/signup", { name, email, password, kind }),
  me:     ()                            => API.get("/auth/me"),
};

export const patientsAPI = {
  getAll:  ()          => API.get("/patients/"),
  getOne:  (id)        => API.get(`/patients/${id}`),
  create:  (data)      => API.post("/patients/", data),
  update:  (id, data)  => API.put(`/patients/${id}`, data),
  delete:  (id)        => API.delete(`/patients/${id}`),
  search:  (query)     => API.get(`/patients/search/${query}`),
};

export const vitalsAPI = {
  getForPatient: (id, limit = 20) => API.get(`/vitals/${id}?limit=${limit}`),
  getLatest:     (id)             => API.get(`/vitals/${id}/latest`),
  record:        (data)           => API.post("/vitals/", data),
};

export const alertsAPI = {
  getAll:        (unackedOnly = false) => API.get(`/alerts/?unacknowledged_only=${unackedOnly}`),
  getForPatient: (id)                  => API.get(`/alerts/${id}`),
  acknowledge:   (alertId, ackBy)      => API.patch(`/alerts/${alertId}/acknowledge?ack_by=${ackBy}`),
  stats:         ()                    => API.get("/alerts/stats/summary"),
};

export const aiAPI = {
  analyze:       (patientId) => API.get(`/ai/${patientId}`),
  analyzeCustom: (data)      => API.post("/ai/analyze", data),
};

export const pupilAPI = {
  analyzeSingle: (file) => {
    const form = new FormData();
    form.append("file", file);
    return API.post("/pupil/analyze", form);
  },
  analyzeBoth: (leftFile, rightFile) => {
    const form = new FormData();
    if (leftFile)  form.append("left",  leftFile);
    if (rightFile) form.append("right", rightFile);
    return API.post("/pupil/analyze-both", form);
  },
};

export const smartwatchAPI = {
  uploadCSV:         (file)         => { const f = new FormData(); f.append("file", file); return API.post("/smartwatch/upload-csv", f); },
  googleFitStatus:   ()             => API.get("/smartwatch/google-fit/status"),
  googleFitAuthUrl:  ()             => API.get("/smartwatch/google-fit/auth-url"),
  googleFitExchange: (code)         => API.post("/smartwatch/google-fit/exchange", { code }),
  googleFitData:     (token, days)  => API.post("/smartwatch/google-fit/data", { token, days }),
};

// ── APPLE HEALTH ──────────────────────────────────────────────────
export const appleHealthAPI = {
  getData: (userId, days = 30) => API.get(`/apple-health/data?user_id=${userId}&days=${days}`),
};

export const reportsAPI = {
  generate: (patientId) => API.get(`/reports/${patientId}`, { responseType: "blob" }),
};

export const emailAPI = {
  sendAlert: (patientId, recipient, patientName) =>
    API.post("/email/send", { patient_id: patientId, recipient, patient_name: patientName }),
  testEmail: (email) => API.post("/email/test", { email }),
};

export default API;
