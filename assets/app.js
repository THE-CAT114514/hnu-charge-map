(function () {
  "use strict";

  const DATA = window.HNU_CHARGE_DATA;
  const CONFIG = window.HNU_MAP_CONFIG;
  const state = {
    selectedStationId: null,
    selectedPileId: null,
    live: null,
    liveError: null,
    map: null,
    pileLayer: null,
    pin: null,
    refreshTimer: null
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const PLUG_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3v4M15 3v4M7 7h10v3a5 5 0 0 1-10 0V7Zm5 8v6"/></svg>';

  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);

  const snapshotFormatter = new Intl.DateTimeFormat(CONFIG.dateLocale, {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: CONFIG.timeZone
  });

  function formatSnapshot(iso) {
    if (!iso) return "时间未知";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "时间未知";
    return snapshotFormatter.format(date);
  }

  function getStation(id) {
    return DATA.stations.find((station) => station.id === id);
  }

  function getSelectedStation() {
    return getStation(state.selectedStationId) || DATA.stations[0];
  }

  function getSelectedPile(station) {
    return station.piles.find((pile) => pile.id === state.selectedPileId) || station.piles[0];
  }

  function getPileSlots(pile) {
    if (Array.isArray(pile.slots) && pile.slots.length) return pile.slots;
    if (Array.isArray(pile.snapshotPorts) && pile.snapshotPorts.length) return pile.snapshotPorts;
    return [];
  }

  function pileHasStatus(pile) {
    return getPileSlots(pile).length > 0;
  }

  function stationHasStatus(station) {
    return station.piles.some(pileHasStatus);
  }

  function getPileTotal(pile) {
    return pile.liveTotalPorts || pile.totalPorts || getPileSlots(pile).length;
  }

  function slotIsFree(slot) {
    return Number(slot.status) === CONFIG.freeSlotStatus;
  }

  function getPileAvailable(pile) {
    return getPileSlots(pile).filter(slotIsFree).length;
  }

  function getStationAvailable(station) {
    return station.piles.reduce((sum, pile) => sum + getPileAvailable(pile), 0);
  }

  function getStationTotal(station) {
    return station.piles.reduce((sum, pile) => sum + getPileTotal(pile), 0);
  }

  function getStationState(station) {
    if (!stationHasStatus(station)) return { tone: "unknown", label: "状态未知", color: "var(--muted)" };
    const available = getStationAvailable(station);
    if (available === 0) return { tone: "full", label: "0 空闲", color: "var(--red)" };
    if (available <= 2) return { tone: "low", label: `仅剩 ${available}`, color: "var(--amber)" };
    return { tone: "available", label: `${available} 空闲`, color: "var(--green-500)" };
  }

  function statusDotClass(tone) {
    if (tone === "unknown") return "unknown";
    if (tone === "full") return "full";
    if (tone === "low") return "pending";
    return "available";
  }

  function tagClass(tone) {
    if (tone === "unknown") return "tag--unknown";
    if (tone === "full") return "tag--danger";
    if (tone === "low") return "tag--pending";
    return "tag--available";
  }

  function liveIsFresh() {
    if (!state.live || state.live.stale || state.live.ok === false) return false;
    const updated = new Date(state.live.updatedAt).getTime();
    return Number.isFinite(updated) && Date.now() - updated < CONFIG.staleAfterMs;
  }

  function getMode() {
    if (liveIsFresh()) return "live";
    if (state.live) return "stale";
    return "snapshot";
  }

  function getStatusTime() {
    return state.live && state.live.updatedAt ? state.live.updatedAt : DATA.snapshotAt;
  }

  function modeTag() {
    const mode = getMode();
    if (mode === "live") return '<span class="tag tag--live">实时</span>';
    if (mode === "stale") return '<span class="tag tag--stale">已过期</span>';
    return '<span class="tag tag--snapshot">截图快照</span>';
  }

  function qrUrl(code) {
    return `https://union.zhumanggroup.com/pile?id=${encodeURIComponent(code)}`;
  }

  function renderSnapshotCard() {
    const card = $("#snapshotCard");
    const station = getSelectedStation();
    if (!card || !station) return;

    const hasData = stationHasStatus(station);
    const available = getStationAvailable(station);
    const total = getStationTotal(station);
    const status = getStationState(station);
    const pileCount = station.piles.length;
    const freePercent = total ? (available / total) * 100 : 0;

    card.style.setProperty("--status-color", status.color);
    card.innerHTML = `
      <div class="snapshot-card__head">
        <span class="status-dot status-dot--${statusDotClass(status.tone)}"></span>
        <span class="snapshot-card__name">${escapeHtml(station.name)}</span>
        ${modeTag()}
      </div>
      <div class="snapshot-card__metric">
        <strong>${hasData ? available : "—"}</strong><span>/ ${total} 空闲</span>
      </div>
      <div class="snapshot-card__meta">
        <span>${pileCount} 台桩</span>
        <span>${hasData ? formatSnapshot(getStatusTime()) : "暂无数据"}</span>
        <span>${total} 个充电口</span>
      </div>
      <div class="availability-bar" aria-hidden="true"><span style="width:${hasData ? freePercent : 0}%"></span></div>
      <p class="snapshot-card__note">${hasData
        ? (available === 0
          ? `${total} 个充电口全部显示“不可用”`
          : `${available} 个空闲，${total - available} 个不可用`)
        : "该点位还没有采集到端口状态，接口连通后自动更新"}</p>
    `;
  }

  function renderStationList() {
    const list = $("#stationList");
    if (!list) return;

    list.innerHTML = DATA.stations.map((station) => {
      const status = getStationState(station);
      const available = getStationAvailable(station);
      const total = getStationTotal(station);
      const active = station.id === state.selectedStationId;
      return `
        <button class="station-card ${active ? "is-active" : ""}" type="button"
          data-station-id="${escapeHtml(station.id)}" aria-pressed="${active}">
          <span class="status-dot status-dot--${statusDotClass(status.tone)} station-card__status"></span>
          <span class="station-card__main">
            <span class="station-card__name">${escapeHtml(station.name)}</span>
            <span class="station-card__meta">${station.piles.length} 台桩 · ${total} 个充电口</span>
          </span>
          <span class="station-card__metric" style="--metric-color:${status.color}">
            <strong>${stationHasStatus(station) ? available : "—"}</strong><span>/${total}</span>
          </span>
        </button>
      `;
    }).join("");
  }

  function renderDetail() {
    const detail = $("#detail");
    const station = getSelectedStation();
    if (!detail || !station) return;

    const pile = getSelectedPile(station);
    const stationAvailable = getStationAvailable(station);
    const stationTotal = getStationTotal(station);
    const status = getStationState(station);
    const pileAvailable = getPileAvailable(pile);
    const pileTotal = getPileTotal(pile);
    const time = formatSnapshot(getStatusTime());
    const mode = getMode();

    const tabs = station.piles.map((item) => {
      const active = item.id === pile.id;
      return `
        <button class="pile-tab ${active ? "is-active" : ""}" type="button"
          data-pile-id="${escapeHtml(item.id)}" role="tab" aria-selected="${active}">
          <span class="pile-tab__name">${escapeHtml(item.label)}</span>
          <span class="pile-tab__meta">${escapeHtml(item.code)} · ${pileHasStatus(item) ? `${getPileAvailable(item)} / ${getPileTotal(item)}` : `— / ${getPileTotal(item)}`}</span>
        </button>
      `;
    }).join("");

    const portSlots = getPileSlots(pile);
    const ports = portSlots.map((slot) => {
      const free = slotIsFree(slot);
      return `
        <div class="port ${free ? "port--free" : ""}" aria-label="充电口 ${slot.slotId}，${free ? "空闲" : "不可用"}">
          <span class="port__icon">${PLUG_ICON}</span>
          <span class="port__num">${slot.slotId}</span>
          <span class="port__label">${free ? "空闲" : "不可用"}</span>
        </div>
      `;
    }).join("");

    const note = !pileHasStatus(pile)
      ? "该点位还没有采集到端口状态；接口连通后会自动填充。"
      : mode === "snapshot"
        ? `截图里 ${pileTotal} 个口均为灰色“不可用”，未区分占用或故障；页面不替小程序推断。`
        : `接口返回 ${pileTotal} 个口：${pileAvailable} 个空闲，${pileTotal - pileAvailable} 个不可用。`;

    detail.innerHTML = `
      <article class="detail-card">
        <div class="detail-head">
          <div>
            <p class="eyebrow">当前点位</p>
            <h2>${escapeHtml(station.name)}</h2>
            <p class="detail-code">${station.piles.length} 台桩 · ${stationTotal} 个充电口</p>
          </div>
          <span class="tag ${tagClass(status.tone)}">${stationHasStatus(station) ? `${stationAvailable} / ${stationTotal} 空闲` : "状态未知"}</span>
        </div>

        <div class="pile-tabs" role="tablist" aria-label="选择充电桩">${tabs}</div>

        <div class="detail-facts">
          <div><span>当前桩</span><strong>${escapeHtml(pile.label)}</strong></div>
          <div><span>充电口</span><strong>${pileTotal} 个</strong></div>
          <div><span>最大功率</span><strong>${pile.power}W</strong></div>
          <div><span>状态时间</span><strong>${time}</strong></div>
        </div>

        <div class="ports-head">
          <h3>${escapeHtml(pile.code)} 端口状态</h3>
          <div class="legend" aria-hidden="true">
            <span class="legend__item"><i class="legend__swatch legend__swatch--free"></i>空闲</span>
            <span class="legend__item"><i class="legend__swatch"></i>不可用</span>
          </div>
        </div>

        <div class="port-grid">${ports || '<p class="port-empty">暂无端口数据，接口连通后自动更新</p>'}</div>

        <p class="detail-note">${note}</p>

        <div class="detail-actions">
          <a class="button button--primary" href="${escapeHtml(qrUrl(pile.code))}" target="_blank" rel="noopener">打开街电小程序</a>
          <button class="button button--secondary" type="button" data-action="refresh">刷新状态</button>
        </div>

        <p class="detail-footnote">${escapeHtml(station.locationNote)}</p>
      </article>
    `;
  }

  function pileColor(pile) {
    if (!pileHasStatus(pile)) return "#9aa5a0";
    const available = getPileAvailable(pile);
    if (available === 0) return "#c84b3a";
    if (available <= 2) return "#c58a2b";
    return "#16a36f";
  }

  function buildPileLayer(station) {
    const piles = station.piles.filter((pile) => Number.isFinite(pile.lat) && Number.isFinite(pile.lng));
    if (!piles.length) return null;
    const layer = L.featureGroup();
    if (piles.length > 1) {
      layer.addLayer(L.polyline(piles.map((pile) => [pile.lat, pile.lng]), {
        color: "#0f6b4f",
        weight: 2,
        opacity: 0.45,
        dashArray: "5 6",
        interactive: false
      }));
    }
    piles.forEach((pile) => {
      const available = getPileAvailable(pile);
      const selected = pile.id === state.selectedPileId;
      const dot = L.circleMarker([pile.lat, pile.lng], {
        radius: selected ? 7.5 : 5.5,
        color: selected ? "#0b3d2e" : "#fffdf7",
        weight: selected ? 2.5 : 2,
        fillColor: pileColor(pile),
        fillOpacity: 1
      });
      dot.bindTooltip(
        `<strong>${escapeHtml(pile.label)} · ${escapeHtml(pile.code)}</strong><br>${pileHasStatus(pile) ? `${available} / ${getPileTotal(pile)} 空闲` : "状态未知"} · GPS 近似`,
        { direction: "top", offset: [0, -6], opacity: 1 }
      );
      dot.on("click", () => selectPile(pile));
      layer.addLayer(dot);
    });
    return layer;
  }

  function updatePileLayer(station) {
    if (!state.map) return;
    if (state.pileLayer) state.map.removeLayer(state.pileLayer);
    state.pileLayer = buildPileLayer(station);
    if (state.pileLayer) state.pileLayer.addTo(state.map);
  }

  function pilePinIcon(pile) {
    const available = getPileAvailable(pile);
    const status = pileHasStatus(pile) ? `${available} 空闲` : "状态未知";
    return L.divIcon({
      className: "pile-pin-host",
      html: `<span class="pile-pin">
        <span class="pile-pin__body">${escapeHtml(pile.label)} · ${status}</span>
        <span class="pile-pin__tail"></span>
      </span>`,
      iconSize: [180, 58],
      iconAnchor: [90, 58]
    });
  }

  function updatePin(pile) {
    if (!state.map) return;
    if (state.pin) {
      state.map.removeLayer(state.pin);
      state.pin = null;
    }
    if (!pile || !Number.isFinite(pile.lat) || !Number.isFinite(pile.lng)) return;
    state.pin = L.marker([pile.lat, pile.lng], {
      icon: pilePinIcon(pile),
      interactive: false,
      keyboard: false,
      zIndexOffset: 1200
    }).addTo(state.map);
  }

  function selectPile(pile, zoom = true) {
    if (!pile) return;
    state.selectedPileId = pile.id;
    renderDetail();
    updatePileLayer(getSelectedStation());
    updatePin(pile);
    if (state.map && zoom && Number.isFinite(pile.lat) && Number.isFinite(pile.lng)) {
      state.map.flyTo([pile.lat, pile.lng], Math.min(CONFIG.maxZoom, 19), { duration: 0.5 });
    }
  }

  function updateMap() {
    const station = getSelectedStation();
    if (!state.map || !station) return;
    updatePileLayer(station);
    if (state.pin) {
      const pile = station.piles.find((item) => item.id === state.selectedPileId);
      if (pile) {
        state.pin.setLatLng([pile.lat, pile.lng]);
        state.pin.setIcon(pilePinIcon(pile));
      }
    }
  }

  function updateChrome() {
    const station = getSelectedStation();
    const mode = getMode();
    const livePill = $("#livePill");
    const livePillText = $("#livePillText");
    const headerPill = $("#headerModePill");
    const headerText = $("#headerModeText");
    const footnote = $("#dataFootnote");

    if (station) {
      const title = $("#panelTitle");
      const count = $("#panelPileCount");
      if (title) title.textContent = station.name;
      if (count) count.textContent = `${station.piles.length} 台桩`;
    }

    if (livePill && livePillText) {
      livePill.classList.remove("live-pill--live", "live-pill--stale", "live-pill--snapshot");
      livePill.classList.add(`live-pill--${mode}`);
      livePillText.textContent = mode === "live" ? "实时" : mode === "stale" ? "已过期" : "截图快照";
    }

    if (headerPill && headerText) {
      headerPill.classList.remove("snapshot-pill--live", "snapshot-pill--stale", "snapshot-pill--snapshot");
      headerPill.classList.add(`snapshot-pill--${mode}`);
      headerText.textContent = mode === "live" ? "实时数据" : mode === "stale" ? "数据已过期" : "截图快照";
    }

    if (footnote) {
      if (mode === "live") {
        footnote.textContent = `每 60 秒自动刷新 · 最近 ${formatSnapshot(getStatusTime())}`;
      } else if (mode === "stale") {
        footnote.textContent = `接口暂时不可用，显示最后更新 ${formatSnapshot(getStatusTime())}`;
      } else if (state.liveError) {
        footnote.textContent = `接口不可用：${state.liveError}；当前显示截图快照`;
      } else {
        footnote.textContent = "当前为截图快照；实时接口连通后每 60 秒自动刷新。";
      }
    }

    const dialogTime = $("#dialogSnapshotTime");
    if (dialogTime) dialogTime.textContent = formatSnapshot(getStatusTime());
    const dialogSource = $("#dialogSource");
    if (dialogSource) {
      dialogSource.textContent = state.live ? "街电小程序 scan-code 接口" : "街电充电桩小程序截图";
    }
    const dialogToken = $("#dialogToken");
    if (dialogToken) {
      if (state.live && state.live.tokenExpiresAt) {
        dialogToken.textContent = `有效期至 ${formatSnapshot(state.live.tokenExpiresAt)}`;
      } else if (state.liveError && /token/i.test(state.liveError)) {
        dialogToken.textContent = "已过期，需要重新抓取";
      } else {
        dialogToken.textContent = "未配置";
      }
    }
    const dataModeNotice = $("#dataModeNotice");
    if (dataModeNotice) {
      dataModeNotice.textContent = mode === "live"
        ? "当前显示接口实时数据。"
        : mode === "stale"
          ? "接口暂时不可用，显示最后一次成功数据。"
          : "当前显示截图快照。";
    }
    const dialogStatus = $("#dialogStatusText");
    if (dialogStatus) {
      dialogStatus.textContent = state.live
        ? `接口返回 ${station.piles.length} 台桩，每台 12 个充电口；状态码 0=空闲，1/2=不可用（按小程序端口页颜色反推）。`
        : stationHasStatus(station)
          ? `截图快照里 ${station.piles.length} 台桩的端口均显示为不可用；当前没有模拟数据。`
          : "该点位暂无截图快照，接口连通后自动显示实时状态。";
    }
  }

  function renderAll() {
    renderSnapshotCard();
    renderStationList();
    renderDetail();
    updateChrome();
    updateMap();
  }

  function selectStation(id) {
    const station = getStation(id);
    if (!station) return;
    state.selectedStationId = id;
    if (!station.piles.some((pile) => pile.id === state.selectedPileId)) {
      state.selectedPileId = station.piles[0] ? station.piles[0].id : null;
    }
    updatePin(null);
    renderAll();
    if (state.map && state.pileLayer) {
      const bounds = state.pileLayer.getBounds();
      if (bounds.isValid()) {
        state.map.flyToBounds(bounds, { padding: [56, 56], maxZoom: CONFIG.zoom, duration: 0.6 });
      }
    }
  }

  function applyLive(payload) {
    for (const liveStation of payload.stations || []) {
      const station = getStation(liveStation.id);
      if (!station) continue;
      if (liveStation.name) station.fullName = liveStation.name;
      if (Number.isFinite(liveStation.lat)) station.lat = liveStation.lat;
      if (Number.isFinite(liveStation.lng)) station.lng = liveStation.lng;

      for (const livePile of liveStation.piles || []) {
        const pile = station.piles.find((item) => item.code === livePile.code);
        if (!pile) continue;
        if (Array.isArray(livePile.slots) && livePile.slots.length) {
          pile.slots = livePile.slots;
          pile.liveTotalPorts = livePile.totalPorts || livePile.slots.length;
        }
        if (livePile.power) pile.power = livePile.power;
      }
    }
  }

  async function refreshStatus(force = false) {
    const url = `${CONFIG.liveEndpoint}${force ? "?force=1" : ""}`;
    try {
      const response = await fetch(url, { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload || !payload.ok) {
        throw new Error((payload && payload.message) || `HTTP ${response.status}`);
      }
      state.live = payload;
      state.liveError = payload.error || null;
      applyLive(payload);
      renderAll();
      return true;
    } catch (error) {
      state.liveError = error.message;
      if (force) renderAll();
      return false;
    }
  }

  function initMap() {
    const mapElement = document.getElementById("map");
    const station = getSelectedStation();
    if (!mapElement || !station || typeof L === "undefined") return;

    const map = L.map(mapElement, {
      zoomControl: false,
      minZoom: CONFIG.minZoom,
      maxZoom: CONFIG.maxZoom,
      zoomSnap: 0.5
    }).setView([station.lat, station.lng], CONFIG.zoom);

    L.tileLayer(CONFIG.tileUrl, {
      maxNativeZoom: CONFIG.maxNativeZoom,
      maxZoom: CONFIG.maxZoom,
      attribution: CONFIG.attribution
    }).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);

    state.map = map;
    updatePileLayer(station);

    const recenterButton = document.getElementById("recenterButton");
    if (recenterButton) {
      recenterButton.addEventListener("click", () => {
        const current = getSelectedStation();
        if (!current) return;
        if (state.pileLayer) {
          const bounds = state.pileLayer.getBounds();
          if (bounds.isValid()) {
            map.flyToBounds(bounds, { padding: [56, 56], maxZoom: CONFIG.zoom, duration: 0.6 });
            return;
          }
        }
        map.flyTo([current.lat, current.lng], CONFIG.zoom, { duration: 0.6 });
      });
    }

    if ("ResizeObserver" in window) {
      const observer = new ResizeObserver(() => map.invalidateSize({ pan: false }));
      observer.observe(mapElement);
    }

    window.setTimeout(() => map.invalidateSize(), 120);
    map.on("click", (event) => {
      marker.closePopup();
      showToast(`坐标 ${event.latlng.lat.toFixed(6)}, ${event.latlng.lng.toFixed(6)}`);
    });
  }

  let toastTimer;

  function showToast(message) {
    const toast = $("#toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 3200);
  }

  function bindStationList() {
    const list = $("#stationList");
    if (!list) return;
    list.addEventListener("click", (event) => {
      const card = event.target.closest("[data-station-id]");
      if (!card) return;
      selectStation(card.dataset.stationId);
    });
  }

  function bindDetailActions() {
    const detail = $("#detail");
    if (!detail) return;
    detail.addEventListener("click", async (event) => {
      const pileButton = event.target.closest("[data-pile-id]");
      if (pileButton) {
        const station = getSelectedStation();
        const pile = station && station.piles.find((item) => item.id === pileButton.dataset.pileId);
        if (pile) selectPile(pile);
        return;
      }
      const action = event.target.closest("[data-action]");
      if (!action) return;
      if (action.dataset.action === "refresh") {
        showToast("正在请求接口…");
        const ok = await refreshStatus(true);
        showToast(ok ? "已更新" : `接口不可用：${state.liveError || "未知错误"}`);
      }
    });
  }

  function bindDialog() {
    const dialog = $("#infoDialog");
    if (!dialog) return;

    const open = () => {
      updateChrome();
      if (typeof dialog.showModal === "function") {
        dialog.showModal();
      } else {
        dialog.setAttribute("open", "");
      }
    };

    const close = () => {
      if (typeof dialog.close === "function") {
        dialog.close();
      } else {
        dialog.removeAttribute("open");
      }
    };

    ["infoButton", "footerInfoButton"].forEach((id) => {
      const button = document.getElementById(id);
      if (button) button.addEventListener("click", open);
    });

    ["closeDialogButton", "dialogDoneButton"].forEach((id) => {
      const button = document.getElementById(id);
      if (button) button.addEventListener("click", close);
    });

    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) close();
    });
  }

  function bindTipDialog() {
    const dialog = $("#tipDialog");
    if (!dialog) return;
    const open = () => {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    };
    const close = () => {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    };
    const trigger = document.getElementById("footerTipButton");
    if (trigger) trigger.addEventListener("click", open);
    ["closeTipButton", "tipDoneButton"].forEach((id) => {
      const button = document.getElementById(id);
      if (button) button.addEventListener("click", close);
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) close();
    });
  }

  function init() {
    const station = DATA.stations[0];
    state.selectedStationId = station ? station.id : null;
    state.selectedPileId = station && station.piles[0] ? station.piles[0].id : null;

    bindStationList();
    bindDetailActions();
    bindDialog();
    bindTipDialog();
    renderAll();
    initMap();
    refreshStatus();
    state.refreshTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") refreshStatus();
    }, CONFIG.pollIntervalMs);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
