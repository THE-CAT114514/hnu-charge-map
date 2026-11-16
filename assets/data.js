(function () {
  // 示例数据：为避免公开真实桩位，桩码、坐标、端口状态均为占位值。
  // 线上站点使用真实数据；复现时请按 docs/DEPLOY.md「新增点位」替换本文件。
  const ports = (...statuses) => statuses.map((status, index) => ({ slotId: index + 1, status }));

  const firstFieldPiles = [
    {
      id: "xua10001", label: "1号桩", code: "XUA10001", power: 1200, totalPorts: 12,
      lat: 30.0004000, lng: 120.0000000, wgsLat: 30.0004000, wgsLng: 120.0000000,
      slots: null, snapshotPorts: ports(0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0)
    },
    {
      id: "xua10002", label: "2号桩", code: "XUA10002", power: 1200, totalPorts: 12,
      lat: 30.0003000, lng: 120.0000000, wgsLat: 30.0003000, wgsLng: 120.0000000,
      slots: null, snapshotPorts: ports(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1)
    },
    {
      id: "xua10003", label: "3号桩", code: "XUA10003", power: 1200, totalPorts: 12,
      lat: 30.0002000, lng: 120.0000000, wgsLat: 30.0002000, wgsLng: 120.0000000,
      slots: null, snapshotPorts: ports(0, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1)
    },
    {
      id: "xua10004", label: "4号桩", code: "XUA10004", power: 1200, totalPorts: 12,
      lat: 30.0001000, lng: 120.0000000, wgsLat: 30.0001000, wgsLng: 120.0000000,
      slots: null, snapshotPorts: ports(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
    }
  ];

  const secondFieldPiles = [
    {
      id: "xua10005", label: "1号桩", code: "XUA10005", power: 1200, totalPorts: 12,
      lat: 30.0019500, lng: 119.9990000, wgsLat: 30.0019500, wgsLng: 119.9990000,
      slots: null, snapshotPorts: ports(0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1)
    },
    {
      id: "xua10006", label: "2号桩", code: "XUA10006", power: 1200, totalPorts: 12,
      lat: 30.0018500, lng: 119.9990000, wgsLat: 30.0018500, wgsLng: 119.9990000,
      slots: null, snapshotPorts: ports(0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1)
    },
    {
      id: "xua10007", label: "3号桩", code: "XUA10007", power: 1200, totalPorts: 12,
      lat: 30.0017500, lng: 119.9990000, wgsLat: 30.0017500, wgsLng: 119.9990000,
      slots: null, snapshotPorts: ports(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1)
    },
    {
      id: "xua10008", label: "4号桩", code: "XUA10008", power: 1200, totalPorts: 12,
      lat: 30.0016500, lng: 119.9990000, wgsLat: 30.0016500, wgsLng: 119.9990000,
      slots: null, snapshotPorts: ports(0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1)
    }
  ];

  const gymPiles = [
    {
      id: "xua10009", label: "1号桩", code: "XUA10009", power: 1200, totalPorts: 12,
      lat: 30.0010500, lng: 120.0011000, wgsLat: 30.0010500, wgsLng: 120.0011000,
      slots: null, snapshotPorts: ports(0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1)
    },
    {
      id: "xua10010", label: "2号桩", code: "XUA10010", power: 1200, totalPorts: 12,
      lat: 30.0009500, lng: 120.0011000, wgsLat: 30.0009500, wgsLng: 120.0011000,
      slots: null, snapshotPorts: ports(0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1)
    },
    {
      id: "xua10011", label: "3号桩", code: "XUA10011", power: 1200, totalPorts: 12,
      lat: 30.0008500, lng: 120.0011000, wgsLat: 30.0008500, wgsLng: 120.0011000,
      slots: null, snapshotPorts: ports(0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1)
    },
    {
      id: "xua10012", label: "4号桩", code: "XUA10012", power: 1200, totalPorts: 12,
      lat: 30.0007500, lng: 120.0011000, wgsLat: 30.0007500, wgsLng: 120.0011000,
      slots: null, snapshotPorts: ports(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1)
    }
  ];

  window.HNU_CHARGE_DATA = {
    campus: "海南大学海甸校区",
    brand: "街电",
    source: "街电充电桩微信小程序",
    snapshotAt: "2026-01-01T09:00:00+08:00",
    stations: [
      {
        id: "first-field",
        name: "第一运动场（1期）",
        fullName: "海南大学海甸校区第一运动场（1期）",
        shortName: "第一运动场 1期",
        lat: 30.0002500,
        lng: 120.0000000,
        locationNote: "示例数据：桩码、坐标和端口状态均为占位值，请替换为你采集的点位。",
        piles: firstFieldPiles
      },
      {
        id: "second-field-west",
        name: "第二田径场（西侧）",
        fullName: "海南大学海甸校区第二田径场（西侧）",
        shortName: "第二田径场 西侧",
        lat: 30.0018000,
        lng: 119.9990000,
        locationNote: "示例数据：桩码、坐标和端口状态均为占位值，请替换为你采集的点位。",
        piles: secondFieldPiles
      },
      {
        id: "gym-east",
        name: "体育馆（东侧）",
        fullName: "海南大学海甸校区体育馆东侧",
        shortName: "体育馆 东侧",
        lat: 30.0009000,
        lng: 120.0011000,
        locationNote: "示例数据：桩码、坐标和端口状态均为占位值，请替换为你采集的点位。",
        piles: gymPiles
      }
    ]
  };
})();
