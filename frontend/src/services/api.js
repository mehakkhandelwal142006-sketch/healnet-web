import axios from "axios";

const API = axios.create({
  baseURL: process.env.REACT_APP_API_URL || "http://localhost:8000/api",
});

// ── Auto-attach token to every request ───────────────────────────
API.interceptors.request.use((config) => {
  const token = localStorage.getItem("healnet_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Auto-logout on 401 ────────────────────────────────────────────
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

// ── AUTH ──────────────────────────────────────────────────────────
export const authAPI = {
  login:  (email, password)              => API.post("/auth/login",  { email, password }),
  signup: (name, email, password, kind)  => API.post("/auth/signup", { name, email, password, kind }),
  me:     ()                             => API.get("/auth/me"),
};

// ── PATIENTS ──────────────────────────────────────────────────────
export const patientsAPI = {
  getAll:  ()           => API.get("/patients/"),
  getOne:  (id)         => API.get(`/patients/${id}`),
  create:  (data)       => API.post("/patients/", data),
  update:  (id, data)   => API.put(`/patients/${id}`, data),
  delete:  (id)         => API.delete(`/patients/${id}`),
  search:  (query)      => API.get(`/patients/search/${query}`),
};

// ── VITALS ────────────────────────────────────────────────────────
export const vitalsAPI = {
  getForPatient: (id, limit = 20) => API.get(`/vitals/${id}?limit=${limit}`),
  getLatest:     (id)             => API.get(`/vitals/${id}/latest`),
  record:        (data)           => API.post("/vitals/", data),
};

// ── ALERTS ────────────────────────────────────────────────────────
export const alertsAPI = {
  getAll:        (unackedOnly = false) => API.get(`/alerts/?unacknowledged_only=${unackedOnly}`),
  getForPatient: (id)                  => API.get(`/alerts/${id}`),
  acknowledge:   (alertId, ackBy)      => API.patch(`/alerts/${alertId}/acknowledge?ack_by=${ackBy}`),
  stats:         ()                    => API.get("/alerts/stats/summary"),
};

// ── AI ────────────────────────────────────────────────────────────
export const aiAPI = {
  analyze:       (patientId) => API.get(`/ai/${patientId}`),
  analyzeCustom: (data)      => API.post("/ai/analyze", data),
};

// ── PUPIL ─────────────────────────────────────────────────────────
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

export default API;
