// Written by Maestro. Generated file — edit the run, not this.
// Contract: docs/spec/state-contract.md
globalThis.MAESTRO_STATE = {
  "contractVersion": 2,
  "runId": "run-2026-08-19-01",
  "slug": "landing-page",
  "startedAt": "2026-08-19T09:00:00Z",
  "updatedAt": "2026-08-19T10:12:00Z",
  "mode": "semi",
  "depth": "normal",
  "polish": false,
  "dialChanges": [],
  "currentStage": "build",
  "stages": [
    {
      "id": "preflight",
      "status": "done",
      "startedAt": "2026-08-19T09:00:00Z",
      "finishedAt": "2026-08-19T09:02:00Z"
    },
    {
      "id": "manifest",
      "status": "done",
      "startedAt": "2026-08-19T09:02:00Z",
      "finishedAt": "2026-08-19T09:09:00Z",
      "note": "20 требований"
    },
    {
      "id": "briefing",
      "status": "done",
      "startedAt": "2026-08-19T09:09:00Z",
      "finishedAt": "2026-08-19T09:18:00Z",
      "note": "4 вопроса"
    },
    {
      "id": "spec",
      "status": "done",
      "startedAt": "2026-08-19T09:18:00Z",
      "finishedAt": "2026-08-19T09:34:00Z"
    },
    {
      "id": "plan",
      "status": "done",
      "startedAt": "2026-08-19T09:34:00Z",
      "finishedAt": "2026-08-19T09:41:00Z",
      "note": "6 тасков в 4 волны"
    },
    {
      "id": "build",
      "status": "active",
      "startedAt": "2026-08-19T09:41:00Z",
      "note": "3 из 6 тасков готовы"
    },
    {
      "id": "review",
      "status": "active",
      "startedAt": "2026-08-19T10:02:00Z",
      "note": "проверено 3 из 6"
    },
    {
      "id": "acceptance",
      "status": "pending"
    }
  ],
  "tasks": [
    {
      "id": "01",
      "title": "Каркас страницы и сетка",
      "requirementIds": [
        "R01",
        "R02"
      ],
      "status": "done",
      "blockedBy": [],
      "wave": 1,
      "zone": [
        "src/layout/"
      ],
      "retries": 0,
      "repairs": 0,
      "handoffs": 0,
      "files": [
        "src/layout/page.tsx",
        "src/layout/grid.css"
      ],
      "startedAt": "2026-08-19T09:41:00Z",
      "finishedAt": "2026-08-19T09:52:00Z",
      "tests": {
        "passed": 12,
        "failed": 0
      },
      "commit": "a1b2c3d"
    },
    {
      "id": "02",
      "title": "Первый экран и заголовок",
      "requirementIds": [
        "R03",
        "R04"
      ],
      "status": "done",
      "blockedBy": [
        "01"
      ],
      "wave": 2,
      "zone": [
        "src/hero/"
      ],
      "retries": 0,
      "repairs": 0,
      "handoffs": 0,
      "files": [
        "src/hero/hero.tsx"
      ],
      "startedAt": "2026-08-19T09:52:00Z",
      "finishedAt": "2026-08-19T10:04:00Z",
      "tests": {
        "passed": 19,
        "failed": 0
      },
      "commit": "b2c3d4e"
    },
    {
      "id": "03",
      "title": "Блок с ценами",
      "requirementIds": [
        "R05",
        "R06"
      ],
      "status": "done",
      "blockedBy": [
        "01"
      ],
      "wave": 2,
      "zone": [
        "src/pricing/"
      ],
      "retries": 1,
      "repairs": 0,
      "handoffs": 0,
      "files": [
        "src/pricing/table.tsx"
      ],
      "startedAt": "2026-08-19T09:53:00Z",
      "finishedAt": "2026-08-19T10:08:00Z",
      "tests": {
        "passed": 41,
        "failed": 0
      },
      "commit": "c3d4e5f"
    },
    {
      "id": "04",
      "title": "Форма обратной связи",
      "requirementIds": [
        "R07",
        "R14"
      ],
      "status": "running",
      "blockedBy": [
        "02"
      ],
      "wave": 3,
      "zone": [
        "src/contact/"
      ],
      "retries": 0,
      "repairs": 0,
      "handoffs": 0,
      "files": [],
      "startedAt": "2026-08-19T10:05:00Z"
    },
    {
      "id": "05",
      "title": "Аналитика и события",
      "requirementIds": [
        "R08"
      ],
      "status": "review",
      "blockedBy": [
        "02",
        "03"
      ],
      "wave": 3,
      "zone": [
        "src/analytics/"
      ],
      "retries": 0,
      "repairs": 1,
      "handoffs": 0,
      "files": [],
      "startedAt": "2026-08-19T10:06:00Z"
    },
    {
      "id": "06",
      "title": "Мобильная вёрстка",
      "requirementIds": [
        "R09",
        "R10"
      ],
      "status": "queued",
      "blockedBy": [
        "04"
      ],
      "wave": 4,
      "zone": [
        "src/layout/",
        "src/hero/"
      ],
      "retries": 0,
      "repairs": 0,
      "handoffs": 0,
      "files": []
    }
  ],
  "requirements": [
    {
      "id": "R01",
      "status": "in-spec"
    },
    {
      "id": "R02",
      "status": "in-spec"
    },
    {
      "id": "R03",
      "status": "in-spec"
    },
    {
      "id": "R04",
      "status": "in-spec"
    },
    {
      "id": "R05",
      "status": "in-spec"
    },
    {
      "id": "R06",
      "status": "in-spec"
    },
    {
      "id": "R07",
      "status": "in-spec"
    },
    {
      "id": "R08",
      "status": "in-spec"
    },
    {
      "id": "R09",
      "status": "in-spec"
    },
    {
      "id": "R10",
      "status": "in-spec"
    },
    {
      "id": "R11",
      "status": "in-spec"
    },
    {
      "id": "R12",
      "status": "in-spec"
    },
    {
      "id": "R13",
      "status": "placeholder",
      "reason": "brand colours not supplied"
    },
    {
      "id": "R14",
      "status": "placeholder",
      "reason": "the copy for the contact form"
    },
    {
      "id": "R15",
      "status": "deferred",
      "reason": "the blog needs a CMS decision first"
    },
    {
      "id": "R16",
      "status": "deferred",
      "reason": "multi-language, after the first release"
    },
    {
      "id": "R17",
      "status": "dropped",
      "reason": "the user removed the newsletter"
    },
    {
      "id": "R18",
      "status": "dropped",
      "reason": "the user removed the chat widget"
    },
    {
      "id": "R19",
      "status": "dropped",
      "reason": "duplicate of R04"
    },
    {
      "id": "R20",
      "status": "open",
      "reason": "waiting for the domain to be chosen"
    }
  ],
  "gates": [
    {
      "id": "G1",
      "status": "passed",
      "findings": []
    },
    {
      "id": "G2",
      "status": "passed",
      "findings": []
    },
    {
      "id": "G3",
      "status": "passed",
      "findings": []
    },
    {
      "id": "G4",
      "status": "pending",
      "findings": []
    }
  ],
  "debt": {
    "placeholders": [
      "R13 — фирменные цвета",
      "R14 — текст формы обратной связи"
    ],
    "assumptions": [
      "Статическая сборка вместо CMS — контента мало",
      "Шрифты системные, чтобы не тянуть CDN"
    ],
    "emptyEnv": [
      "ANALYTICS_ID",
      "CONTACT_FORM_ENDPOINT"
    ]
  },
  "additions": [
    "Скелет загрузки для блока цен — ради R05"
  ],
  "tests": {
    "passed": 41,
    "failed": 0
  }
};
