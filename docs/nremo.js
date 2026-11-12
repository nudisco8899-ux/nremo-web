import { createApiClient } from "./nremoapi.js";

export function getClient(token) {
  const api = createApiClient(token);
  const fetchMe = () => getMe(api);
  const fetchAppliances = () => getAppliances(api);

  return { fetchMe, fetchAppliances };
}

async function getMe(api) {
  const data = await api.get("1/users/me");
  return data.nickname;
}

async function getAppliances(api) {
  const data = await api.get("1/appliances");
  return data.map((payload) => createAppliance(api, payload));
}

function createAppliance(api, payload) {
  const name = payload.device
    ? `${payload.device.name} - ${payload.nickname} (${payload.type})`
    : `${payload.nickname} (${payload.type})`;
  const applianceId = payload.id;
  const signals = payload.signals.map((s) => createSignalButton(api, s));
  const lightButtons = payload.light ? payload.light.buttons.map((b) => createLightButton(api, applianceId, b)) : [];
  const tvButtons = payload.tv ? payload.tv.buttons.map((b) => createTvButton(api, applianceId, b)) : [];
  const buttons = [...signals, ...lightButtons, ...tvButtons];
  const aircon = payload.aircon ? createAircon(api, applianceId, payload) : null;
  return { name, buttons, aircon };
}

function createSignalButton(api, signal) {
  const name = signal.name;
  const push = () => api.post(`1/signals/${signal.id}/send`, {});
  return { name, push };
}

function createLightButton(api, applianceId, button) {
  const name = button.label;
  const push = () => api.post(`1/appliances/${applianceId}/light`, `button=${button.name}`);
  return { name, push };
}

function createTvButton(api, applianceId, button) {
  const name = button.label;
  const push = () => api.post(`1/appliances/${applianceId}/tv`, `button=${button.name}`);
  return { name, push };
}

// エアコン: aircon_settings エンドポイントは全フィールド必須。
// range（モデルが受け付けるモード・温度・風量・風向）と現在の settings を返し、
// UI 側が選んだ値を send(params) で送信する。
function createAircon(api, applianceId, payload) {
  const range = payload.aircon.range;
  const settings = payload.settings ?? {};
  const send = (params) => {
    const body = new URLSearchParams(params).toString();
    return api.post(`1/appliances/${applianceId}/aircon_settings`, body);
  };
  return { range, settings, send };
}
