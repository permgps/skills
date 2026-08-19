// Written by Maestro. Generated file — edit the run, not this.
// Contract: docs/spec/state-contract.md
globalThis.MAESTRO_STATE = {
  "contractVersion": 1,
  "runId": "run-2026-08-19-01",
  "slug": "landing-page",
  "startedAt": "2026-08-19T09:00:00Z",
  "mode": "semi",
  "depth": "normal",
  "polish": false,
  "dialChanges": [],
  "currentStage": "acceptance",
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
      "finishedAt": "2026-08-19T09:09:00Z"
    },
    {
      "id": "briefing",
      "status": "done",
      "startedAt": "2026-08-19T09:09:00Z",
      "finishedAt": "2026-08-19T09:18:00Z"
    },
    {
      "id": "spec",
      "status": "done",
      "startedAt": "2026-08-19T09:18:00Z",
      "finishedAt": "2026-08-19T09:31:00Z"
    },
    {
      "id": "plan",
      "status": "done",
      "startedAt": "2026-08-19T09:31:00Z",
      "finishedAt": "2026-08-19T09:40:00Z"
    },
    {
      "id": "build",
      "status": "done",
      "startedAt": "2026-08-19T09:40:00Z",
      "finishedAt": "2026-08-19T10:22:00Z"
    },
    {
      "id": "review",
      "status": "done",
      "startedAt": "2026-08-19T10:22:00Z",
      "finishedAt": "2026-08-19T10:31:00Z"
    },
    {
      "id": "acceptance",
      "status": "done",
      "startedAt": "2026-08-19T10:31:00Z",
      "finishedAt": "2026-08-19T10:44:00Z"
    }
  ],
  "tasks": [
    {
      "id": "01",
      "title": "Страница и её разметка",
      "requirementIds": [
        "R01",
        "R02"
      ],
      "status": "done",
      "blockedBy": [],
      "startedAt": "2026-08-19T09:40:00Z",
      "finishedAt": "2026-08-19T10:04:00Z"
    },
    {
      "id": "02",
      "title": "Форма заявки",
      "requirementIds": [
        "R03"
      ],
      "status": "done",
      "blockedBy": [],
      "startedAt": "2026-08-19T09:41:00Z",
      "finishedAt": "2026-08-19T10:21:00Z"
    },
    {
      "id": "03",
      "title": "Отправка на почту",
      "requirementIds": [
        "R04"
      ],
      "status": "done",
      "blockedBy": [],
      "startedAt": "2026-08-19T09:41:00Z",
      "finishedAt": "2026-08-19T10:21:00Z"
    },
    {
      "id": "04",
      "title": "Мобильная вёрстка",
      "requirementIds": [
        "R05"
      ],
      "status": "done",
      "blockedBy": [
        "01",
        "02"
      ],
      "startedAt": "2026-08-19T10:05:00Z",
      "finishedAt": "2026-08-19T10:21:00Z"
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
      "status": "deferred",
      "reason": "нужен доступ к CRM"
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
      "status": "passed",
      "findings": []
    }
  ],
  "finishedAt": "2026-08-19T10:44:00Z"
};
