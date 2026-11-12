import { getClient } from "./nremo.js";

// localStorage キー
const LS_ACCESS_TOKEN = "tool:natureapiaccesstoken";

// 要素参照
const tokenEl = document.getElementById("apiAccessToken");
const scanBtn = document.getElementById("scanBtn");
const spinner = document.getElementById("spinner");
const alertEl = document.getElementById("alert");
const alertMsg = document.getElementById("alertMsg");
const appliancesEl = document.getElementById("appliancesList");
const userInfoEl = document.getElementById("userInfo");

scanBtn.addEventListener("click", scanUserInfo);

tokenEl.addEventListener("sl-input", () => {
    displayUserInfo("", []);
    if (tokenEl.value.length > 0) {
        scanBtn.disabled = false;
    } else {
        scanBtn.disabled = true;
        localStorage.removeItem(LS_ACCESS_TOKEN);
    }
});

initialize();

async function initialize() {
    setBusy(false);
    hideError();
    const savedToken = localStorage.getItem(LS_ACCESS_TOKEN);
    if (savedToken) {
        tokenEl.value = savedToken;
        await scanUserInfo();
    }
}

// UIヘルパ
function setBusy(b) {
    document.querySelectorAll("sl-button").forEach(btn => btn.disabled = b);
    spinner.classList.toggle("loading", b);
}
function showError(msg) {
    alertMsg.textContent = msg ?? "";
    alertEl.show();
}
function hideError() {
    alertEl.hide();
}
function withSpinner(asyncFunc) {
    return async () => {

        setBusy(true);
        hideError();

        try {
            await asyncFunc();

        } catch (e) {
            console.error(e);
            showError(e.message);

        } finally {
            setBusy(false);
        }
    }
}

async function scanUserInfo() {
    const scan = async () => {
        const token = tokenEl.value.trim();
        const client = getClient(token);
        const nickname = await client.fetchMe();
        const appliances = await client.fetchAppliances();
        displayUserInfo(`${nickname}さん`, appliances);
        localStorage.setItem(LS_ACCESS_TOKEN, token);
    }
    await withSpinner(scan)();
}


function createApplianceCard(appliance) {
    const card = document.createElement("sl-card");
    const header = document.createElement("div");
    header.slot = "header";
    header.textContent = appliance.name;

    const buttonsGrid = document.createElement("div");
    buttonsGrid.className = "buttons-grid";

    appliance.buttons.forEach(button => {
        buttonsGrid.appendChild(createButtonElement(button));
    });

    card.appendChild(header);
    card.appendChild(buttonsGrid);
    if (appliance.aircon) {
        card.appendChild(createAirconPanel(appliance.aircon));
    }
    return card;
}

function createButtonElement(button) {
    const buttonEl = document.createElement("sl-button");
    buttonEl.textContent = button.name;
    buttonEl.addEventListener("click", withSpinner(button.push));
    return buttonEl;
}

// エアコン操作パネル: モード・温度・風量・風向を選んで送信する。
// 選択肢はモデルが受け付ける範囲（aircon.range）から組み立てる。
const AC_MODE_LABELS = { cool: "冷房", dry: "除湿", warm: "暖房", blow: "送風", auto: "自動" };
const AC_VOL_LABELS = { auto: "自動" };
const AC_DIR_LABELS = { auto: "自動", swing: "スイング" };

function createAirconPanel(aircon) {
    const { range, settings } = aircon;
    const modes = Object.keys(range.modes ?? {});
    const panel = document.createElement("div");
    panel.className = "aircon-panel";

    const makeSelect = (labelText) => {
        const sel = document.createElement("sl-select");
        sel.label = labelText;
        return sel;
    };
    const fillOptions = (sel, values, labels, current) => {
        sel.innerHTML = "";
        values.forEach(v => {
            const opt = document.createElement("sl-option");
            opt.value = v;
            opt.textContent = labels[v] ?? v;
            sel.appendChild(opt);
        });
        sel.value = values.includes(current) ? current : (values[0] ?? "");
        sel.disabled = values.length === 0;
    };

    const modeSel = makeSelect("運転モード");
    modes.forEach(m => {
        const opt = document.createElement("sl-option");
        opt.value = m;
        opt.textContent = AC_MODE_LABELS[m] ?? m;
        modeSel.appendChild(opt);
    });
    modeSel.value = modes.includes(settings.mode) ? settings.mode : modes[0];

    const tempSel = makeSelect("温度");
    const volSel = makeSelect("風量");
    const dirSel = makeSelect("風向");

    // 温度の −/＋ ステッパー: セレクトの選択肢を1つずつ移動する
    const tempMinusBtn = document.createElement("sl-button");
    tempMinusBtn.textContent = "−";
    const tempPlusBtn = document.createElement("sl-button");
    tempPlusBtn.textContent = "＋";
    const stepTemp = (delta) => {
        const values = [...tempSel.children].map(o => o.value);
        const idx = values.indexOf(tempSel.value);
        if (idx < 0) return;
        const next = Math.min(values.length - 1, Math.max(0, idx + delta));
        tempSel.value = values[next];
    };
    tempMinusBtn.addEventListener("click", () => stepTemp(-1));
    tempPlusBtn.addEventListener("click", () => stepTemp(1));

    const refreshModeOptions = (keepCurrent) => {
        const modeRange = range.modes[modeSel.value] ?? { temp: [], vol: [], dir: [] };
        const temps = (modeRange.temp ?? []).filter(t => t !== "");
        fillOptions(tempSel, temps, {}, keepCurrent ? tempSel.value : (settings.temp ?? ""));
        tempSel.disabled = temps.length === 0;
        tempMinusBtn.disabled = tempSel.disabled || temps.length <= 1;
        tempPlusBtn.disabled = tempSel.disabled || temps.length <= 1;
        fillOptions(volSel, modeRange.vol ?? [], AC_VOL_LABELS, keepCurrent ? volSel.value : (settings.vol ?? ""));
        fillOptions(dirSel, modeRange.dir ?? [], AC_DIR_LABELS, keepCurrent ? dirSel.value : (settings.dir ?? ""));
    };
    refreshModeOptions(false);
    modeSel.addEventListener("sl-change", () => refreshModeOptions(true));

    const collectParams = (button) => ({
        temperature: tempSel.disabled ? "" : (tempSel.value ?? ""),
        temperature_unit: settings.temp_unit ?? "c",
        operation_mode: modeSel.value,
        air_volume: volSel.value ?? "",
        air_direction: dirSel.value ?? "",
        air_direction_h: settings.dirh ?? "",
        button: button,
    });

    const onBtn = document.createElement("sl-button");
    onBtn.textContent = "設定を送信（電源ON）";
    onBtn.variant = "primary";
    onBtn.addEventListener("click", withSpinner(async () => { await aircon.send(collectParams("")); }));

    const offBtn = document.createElement("sl-button");
    offBtn.textContent = "電源オフ";
    offBtn.addEventListener("click", withSpinner(async () => { await aircon.send(collectParams("power-off")); }));

    const tempWrap = document.createElement("div");
    tempWrap.className = "aircon-temp";
    tempWrap.append(tempMinusBtn, tempSel, tempPlusBtn);

    const selectsRow = document.createElement("div");
    selectsRow.className = "aircon-selects";
    selectsRow.append(modeSel, tempWrap, volSel, dirSel);

    const btnRow = document.createElement("div");
    btnRow.className = "buttons-grid";
    btnRow.append(onBtn, offBtn);

    panel.append(selectsRow, btnRow);
    return panel;
}

function displayUserInfo(userName, appliances) {
    userInfoEl.textContent = userName;
    appliancesEl.innerHTML = "";
    appliances.forEach(appliance => {
        appliancesEl.appendChild(createApplianceCard(appliance));
    });
}
